import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Serviço de domínio que recomputa a `VehicleEligibilityProjection`.
 *
 * Nesta primeira fatia, a elegibilidade é governada apenas pelo
 * `operationalStatus` do veículo:
 *   - AVAILABLE, RESERVED → elegível
 *   - demais → NÃO elegível, motivo explícito
 *
 * Nas próximas iterações adicionamos:
 *   - documentos vencidos (VehicleDocument)
 *   - defeitos críticos em aberto (Defect severity=CRITICAL)
 *   - checklist pendente para nova custódia
 *   - OS aberta bloqueante
 *
 * O contrato público não muda: AutoDispatch e Operations lêem esta projeção
 * como fonte única.
 */
@Injectable()
export class EligibilityService {
  async recomputeInTx(
    tx: PrismaClient,
    tenantId: string,
    vehicleId: string,
  ): Promise<void> {
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return;

    const reasons: { code: string; message: string; severity: 'info' | 'warn' | 'block' }[] = [];
    let isEligible = true;

    switch (vehicle.operationalStatus) {
      case 'AVAILABLE':
      case 'RESERVED':
        break;
      case 'IN_OPERATION':
        isEligible = false;
        reasons.push({ code: 'in_operation', message: 'veículo em operação', severity: 'info' });
        break;
      case 'IN_MAINTENANCE':
        isEligible = false;
        reasons.push({ code: 'maintenance', message: 'veículo em manutenção', severity: 'block' });
        break;
      case 'BLOCKED':
        isEligible = false;
        reasons.push({ code: 'blocked', message: 'veículo bloqueado administrativamente', severity: 'block' });
        break;
      case 'INACTIVE':
      case 'ALIENATED':
        isEligible = false;
        reasons.push({ code: 'not_active', message: 'veículo não ativo', severity: 'block' });
        break;
    }

    await tx.vehicleEligibilityProjection.upsert({
      where: { vehicleId },
      update: { isEligible, reasons, computedAt: new Date() },
      create: { vehicleId, tenantId, isEligible, reasons, computedAt: new Date() },
    });
  }
}
