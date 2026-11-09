import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { DriversService } from '../workforce/drivers.service';
import type { CreateAssignmentDto } from './autodispatch.dto';

/**
 * Serviço de designação oficial (AT-08).
 *
 * Invariante DURA (garantida por índice único parcial no banco):
 *   no máximo 1 Assignment "vivo" (state !∈ {CANCELLED, SUPERSEDED})
 *   por ScheduledTrip.
 *
 * Duas requisições concorrentes tentando designar o mesmo trip → o
 * Postgres aborta a segunda com `23505 unique_violation`, que
 * traduzimos para 409 Conflict. Sem race condition possível.
 *
 * Elegibilidade:
 *   - Veículo: VehicleEligibilityProjection.isEligible = true
 *   - Motorista: habilitação válida para a data da viagem; categoria
 *     obrigatória respeitada (quando informada)
 *   - Veículo deve pertencer ao tenant (RLS)
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drivers: DriversService,
    private readonly compliance: ComplianceService,
  ) {}

  async propose(
    ctx: { tenantId: string; userId: string },
    scheduledTripId: string,
    dto: CreateAssignmentDto,
  ): Promise<{
    id: string;
    state: string;
    scheduledTripId: string;
    vehicleId: string;
    driverId: string;
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const trip = await tx.scheduledTrip.findUnique({
        where: { id: scheduledTripId },
        include: { routeVersion: { include: { route: true } } },
      });
      if (!trip) throw new NotFoundException('viagem programada não encontrada');
      if (trip.state === 'CANCELLED') {
        throw new ConflictException('viagem cancelada não pode ser designada');
      }

      const vehicleElig = await tx.vehicleEligibilityProjection.findUnique({
        where: { vehicleId: dto.vehicleId },
      });
      if (!vehicleElig) {
        throw new NotFoundException('veículo não encontrado ou sem projeção de elegibilidade');
      }
      if (!vehicleElig.isEligible) {
        throw new ForbiddenException(
          `veículo não elegível: ${JSON.stringify(vehicleElig.reasons)}`,
        );
      }

      const driverCheck = await this.drivers.checkEligibilityInTx(
        tx,
        dto.driverId,
        trip.plannedDeparture,
        dto.requiredLicenseCategories,
      );
      if (!driverCheck.eligible) {
        throw new ForbiddenException(`motorista não elegível: ${driverCheck.reason}`);
      }

      // AT-04 — jornada do motorista. Checagem ANTES do insert para que uma
      // designação ilegal nem chegue a existir.
      const compliance = await this.compliance.checkJourneyInTx(tx, ctx.tenantId, {
        driverId: dto.driverId,
        startAt: trip.plannedDeparture,
        endAt: trip.plannedArrival,
      });
      if (!compliance.ok) {
        const first = compliance.violations[0];
        throw new ForbiddenException({
          message: `motorista violaria ${first?.code}`,
          code: first?.code,
          violations: compliance.violations,
        });
      }

      try {
        const assignment = await tx.assignment.create({
          data: {
            tenantId: ctx.tenantId,
            scheduledTripId,
            vehicleId: dto.vehicleId,
            driverId: dto.driverId,
            state: 'PROPOSED',
            ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
          },
        });

        // Atualiza o estado da viagem para ASSIGNED (planejado -> designado).
        if (trip.state === 'PLANNED') {
          await tx.scheduledTrip.update({
            where: { id: scheduledTripId },
            data: { state: 'ASSIGNED' },
          });
        }

        return {
          id: assignment.id,
          state: assignment.state,
          scheduledTripId: assignment.scheduledTripId,
          vehicleId: assignment.vehicleId,
          driverId: assignment.driverId,
        };
      } catch (err) {
        // Prisma encapsula unique_violation (P2002).
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === 'P2002') {
          throw new ConflictException(
            'viagem já possui uma designação ativa — substitua pelo supersede endpoint',
          );
        }
        throw err;
      }
    });
  }

  async cancel(
    ctx: { tenantId: string; userId: string },
    assignmentId: string,
    reason: string,
  ): Promise<{ id: string; state: string }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const current = await tx.assignment.findUnique({ where: { id: assignmentId } });
      if (!current) throw new NotFoundException('designação não encontrada');
      if (current.state === 'CANCELLED' || current.state === 'SUPERSEDED') {
        throw new ConflictException('designação já encerrada');
      }
      const updated = await tx.assignment.update({
        where: { id: assignmentId },
        data: {
          state: 'CANCELLED',
          reason,
          version: { increment: 1 },
        },
      });
      return { id: updated.id, state: updated.state };
    });
  }
}
