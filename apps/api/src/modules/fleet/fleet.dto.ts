import { z } from 'zod';

export const createVehicleSchema = z.object({
  internalCode: z.string().min(1).max(32),
  licensePlate: z.string().regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/, 'placa inválida'),
  chassis: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/).optional(),
  renavam: z.string().regex(/^\d{11}$/).optional(),
  category: z.enum(['BUS', 'MINIBUS', 'VAN', 'CAR']),
  seats: z.number().int().positive().optional(),
  modelName: z.string().max(100).optional(),
  modelYear: z.number().int().min(1990).max(2100).optional(),
  garageId: z.string().uuid().optional(),
});

export type CreateVehicleDto = z.infer<typeof createVehicleSchema>;
