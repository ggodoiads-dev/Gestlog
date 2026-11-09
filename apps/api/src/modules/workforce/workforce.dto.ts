import { z } from 'zod';

export const createDriverSchema = z.object({
  fullName: z.string().min(2).max(200),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve conter 11 dígitos'),
  phone: z.string().max(20).optional(),
  license: z.object({
    category: z.string().regex(/^[A-E]{1,2}$/, 'categoria inválida'),
    number: z.string().min(5).max(20),
    issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  }),
});

export type CreateDriverDto = z.infer<typeof createDriverSchema>;
