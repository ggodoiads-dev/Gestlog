import { z } from 'zod';

export const operationalEventTypeSchema = z.enum([
  'DRIVER_PRESENTED',
  'VEHICLE_POSITIONING',
  'TRIP_STARTED',
  'TRIP_ARRIVED',
  'TRIP_COMPLETED',
  'RETURNED_TO_GARAGE',
  'SHIFT_ENDED',
  'INCIDENT_REPORTED',
]);

export type OperationalEventType = z.infer<typeof operationalEventTypeSchema>;

export const submitEventSchema = z.object({
  type: operationalEventTypeSchema,
  /** Timestamp do RELÓGIO DO DISPOSITIVO (pode estar atrasado/adiantado). */
  deviceTimestamp: z.string().datetime().optional(),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
  /** Precisão da posição em segundos (o quão fresca é). */
  precisionSeconds: z.number().int().positive().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']).default('HIGH'),
  /** Payload livre (fotos/avarias viram IDs de Document). */
  payload: z.record(z.unknown()).optional(),
});

export type SubmitEventDto = z.infer<typeof submitEventSchema>;
