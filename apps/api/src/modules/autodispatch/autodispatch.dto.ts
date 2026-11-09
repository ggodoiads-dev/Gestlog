import { z } from 'zod';

export const createAssignmentSchema = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  /** Categoria exigida da habilitação, p.ex. 'D' para ônibus. Opcional por ora. */
  requiredLicenseCategories: z.array(z.string().regex(/^[A-E]{1,2}$/)).optional(),
  /** Motivo opcional registrado na trilha de auditoria. */
  reason: z.string().max(500).optional(),
});

export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;
