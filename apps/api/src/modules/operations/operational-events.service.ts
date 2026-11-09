import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}
import type { OperationalEventType, SubmitEventDto } from './operational-events.dto';

interface SubmittedEvent {
  id: string;
  type: OperationalEventType;
  serverTimestamp: Date;
  tripExecutionId: string;
  tripExecutionState: string;
  wasDeduped: boolean;
}

/**
 * Serviço de domínio para eventos operacionais do motorista.
 *
 * Invariantes (AT-11 e §8 do adendo):
 *
 *   1. **Idempotência**. O mesmo `Idempotency-Key` com o mesmo payload
 *      retorna o fato original (sem duplicação). Chave igual com payload
 *      diferente é 409 — a aplicação não aceita sobrescrever eventos.
 *
 *   2. **GPS pode mentir**. `deviceTimestamp`, `latitude`, `longitude` e
 *      `precisionSeconds` são armazenados como RECEBIDOS; o motor
 *      distingue-os do `serverTimestamp` oficial. Nada aqui "infere"
 *      chegada/custódia por geofence.
 *
 *   3. **Criação preguiçosa de TripExecution**. O primeiro evento
 *      operacional de um trip cria sua execução. Eventos subsequentes
 *      atualizam o estado conforme a tabela de transições (abaixo).
 *
 *   4. **Mudanças de estado observáveis**. Cada tipo de evento tenta
 *      transicionar a `TripExecution.state` — mas nunca para trás. Idas
 *      ilegais (ex.: TRIP_COMPLETED sem TRIP_STARTED) são aceitas como
 *      fatos, mas não movem o estado agregado (regra de ouro: fato ≠
 *      inferência).
 */
@Injectable()
export class OperationalEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(
    ctx: { tenantId: string },
    scheduledTripId: string,
    idempotencyKey: string,
    dto: SubmitEventDto,
  ): Promise<SubmittedEvent> {
    if (!idempotencyKey || idempotencyKey.length < 16) {
      throw new BadRequestException(
        'header Idempotency-Key obrigatório (mín. 16 caracteres)',
      );
    }

    // 1. Dedupe upfront em transação curta e isolada. Se já existe, retorna.
    const existing = await this.lookupByKey(ctx, idempotencyKey);
    if (existing) {
      if (
        existing.tripExecution.scheduledTripId !== scheduledTripId ||
        existing.type !== dto.type
      ) {
        throw new ConflictException(
          'Idempotency-Key já usada para outro evento (trip ou type divergem)',
        );
      }
      return {
        id: existing.id,
        type: existing.type as OperationalEventType,
        serverTimestamp: existing.serverTimestamp,
        tripExecutionId: existing.tripExecutionId,
        tripExecutionState: existing.tripExecution.state,
        wasDeduped: true,
      };
    }

    // 2. Tenta criar o fato. Se perder corrida (P2002), relê fora da tx abortada.
    try {
      return await this.prisma.withTenantFromCtx(ctx, async (tx) => {
        const trip = await tx.scheduledTrip.findUnique({
          where: { id: scheduledTripId },
        });
        if (!trip) throw new NotFoundException('viagem programada não encontrada');
        if (trip.state === 'CANCELLED') {
          throw new ConflictException('viagem cancelada não recebe eventos');
        }

        const execution = await tx.tripExecution.upsert({
          where: { scheduledTripId },
          update: {},
          create: {
            tenantId: ctx.tenantId,
            scheduledTripId,
            state: 'NOT_STARTED',
          },
        });

        const event = await tx.operationalEvent.create({
          data: {
            tenantId: ctx.tenantId,
            tripExecutionId: execution.id,
            type: dto.type,
            ...(dto.deviceTimestamp
              ? { deviceTimestamp: new Date(dto.deviceTimestamp) }
              : {}),
            source: 'DRIVER_APP',
            confidence: dto.confidence,
            ...(dto.precisionSeconds !== undefined
              ? { precisionSeconds: dto.precisionSeconds }
              : {}),
            ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
            ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
            idempotencyKey,
            ...(dto.payload !== undefined
              ? { payload: dto.payload as Prisma.InputJsonValue }
              : {}),
          },
        });

        const nextState = this.nextExecutionState(execution.state, dto.type);
        if (nextState !== execution.state) {
          await tx.tripExecution.update({
            where: { id: execution.id },
            data: this.executionPatch(dto.type, event.serverTimestamp),
          });
        }
        if (dto.type === 'TRIP_STARTED' && trip.state !== 'IN_PROGRESS') {
          await tx.scheduledTrip.update({
            where: { id: trip.id },
            data: { state: 'IN_PROGRESS' },
          });
        } else if (dto.type === 'TRIP_COMPLETED' && trip.state !== 'COMPLETED') {
          await tx.scheduledTrip.update({
            where: { id: trip.id },
            data: { state: 'COMPLETED' },
          });
        }

        return {
          id: event.id,
          type: event.type as OperationalEventType,
          serverTimestamp: event.serverTimestamp,
          tripExecutionId: event.tripExecutionId,
          tripExecutionState: nextState,
          wasDeduped: false,
        };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Outro request venceu a corrida. Busca o evento em NOVA transação.
        const now = await this.lookupByKey(ctx, idempotencyKey);
        if (!now) throw err;
        if (
          now.tripExecution.scheduledTripId !== scheduledTripId ||
          now.type !== dto.type
        ) {
          throw new ConflictException(
            'Idempotency-Key já usada para outro evento (trip ou type divergem)',
          );
        }
        return {
          id: now.id,
          type: now.type as OperationalEventType,
          serverTimestamp: now.serverTimestamp,
          tripExecutionId: now.tripExecutionId,
          tripExecutionState: now.tripExecution.state,
          wasDeduped: true,
        };
      }
      throw err;
    }
  }

  private async lookupByKey(
    ctx: { tenantId: string },
    idempotencyKey: string,
  ): Promise<
    | (NonNullable<Awaited<ReturnType<PrismaClient['operationalEvent']['findUnique']>>> & {
        tripExecution: { scheduledTripId: string; state: string };
      })
    | null
  > {
    return this.prisma.withTenantFromCtx(ctx, async (tx) =>
      tx.operationalEvent.findUnique({
        where: {
          tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey },
        },
        include: { tripExecution: true },
      }),
    ) as never;
  }

  private nextExecutionState(
    current: string,
    eventType: OperationalEventType,
  ): string {
    // Nunca retrocede. Transições válidas:
    const order: Record<string, number> = {
      NOT_STARTED: 0,
      DRIVER_PRESENTED: 1,
      POSITIONING: 2,
      IN_TRIP: 3,
      ARRIVED: 4,
      COMPLETED: 5,
      RETURNED: 6,
    };
    const byEvent: Partial<Record<OperationalEventType, string>> = {
      DRIVER_PRESENTED: 'DRIVER_PRESENTED',
      VEHICLE_POSITIONING: 'POSITIONING',
      TRIP_STARTED: 'IN_TRIP',
      TRIP_ARRIVED: 'ARRIVED',
      TRIP_COMPLETED: 'COMPLETED',
      RETURNED_TO_GARAGE: 'RETURNED',
    };
    const candidate = byEvent[eventType];
    if (!candidate) return current;
    if ((order[candidate] ?? -1) > (order[current] ?? -1)) {
      return candidate;
    }
    return current;
  }

  private executionPatch(
    type: OperationalEventType,
    serverTs: Date,
  ): Record<string, unknown> {
    switch (type) {
      case 'DRIVER_PRESENTED':
        return { state: 'DRIVER_PRESENTED' };
      case 'VEHICLE_POSITIONING':
        return { state: 'POSITIONING' };
      case 'TRIP_STARTED':
        return { state: 'IN_TRIP', startedAt: serverTs };
      case 'TRIP_ARRIVED':
        return { state: 'ARRIVED', arrivedAt: serverTs };
      case 'TRIP_COMPLETED':
        return { state: 'COMPLETED', completedAt: serverTs };
      case 'RETURNED_TO_GARAGE':
        return { state: 'RETURNED', returnedAt: serverTs };
      default:
        return {};
    }
  }
}
