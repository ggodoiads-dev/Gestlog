import { z } from 'zod';

export const tenantIdSchema = z.string().uuid().brand<'TenantId'>();
export type TenantId = z.infer<typeof tenantIdSchema>;

export const legalEntityIdSchema = z.string().uuid().brand<'LegalEntityId'>();
export type LegalEntityId = z.infer<typeof legalEntityIdSchema>;

export const garageIdSchema = z.string().uuid().brand<'GarageId'>();
export type GarageId = z.infer<typeof garageIdSchema>;

export const userIdSchema = z.string().uuid().brand<'UserId'>();
export type UserId = z.infer<typeof userIdSchema>;

/** Contexto que acompanha toda requisição autenticada. */
export interface TenantContext {
  tenantId: TenantId;
  userId: UserId;
  roles: string[];
  legalEntityId?: LegalEntityId;
  garageId?: GarageId;
  /** `actedAsUserId` presente quando houver delegação ativa. */
  actedAsUserId?: UserId;
  correlationId: string;
  requestId: string;
  ip?: string;
  userAgent?: string;
}
