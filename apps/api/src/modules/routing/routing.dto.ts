import { z } from 'zod';

export const createRouteSchema = z.object({
  contractId: z.string().uuid(),
  clientUnitId: z.string().uuid().optional(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  direction: z.enum(['IDA', 'VOLTA', 'ROUND_TRIP']),
});

export type CreateRouteDto = z.infer<typeof createRouteSchema>;

export const stopSchema = z.object({
  sequence: z.number().int().positive(),
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  /** Minutos relativos ao início do turno (negativo = antes). */
  offsetMinutes: z.number().int(),
});

export const turnSchema = z.object({
  label: z.string().min(1).max(50),
  targetArrivalTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm'),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
});

export const createRouteVersionSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  /** Opcional — até quando vigora. Quando ausente, vigora até nova versão. */
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  targetArrivalOffsetMin: z.number().int().min(0).max(120).default(10),
  maxWalkMeters: z.number().int().min(50).max(5000).default(500),
  capacityMin: z.number().int().positive().optional(),
  stops: z.array(stopSchema).min(2, 'rota precisa de pelo menos 2 pontos'),
  turns: z.array(turnSchema).min(1, 'rota precisa de pelo menos 1 turno'),
});

export type CreateRouteVersionDto = z.infer<typeof createRouteVersionSchema>;
