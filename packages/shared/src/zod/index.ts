import { z } from 'zod';

/**
 * Esquema de chave de idempotência aceitado em rotas mutadoras expostas a
 * sistemas externos (driver app, webhooks, importações).
 */
export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(255)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Caracteres inválidos em Idempotency-Key');

/** Paginação padrão. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Representação de dinheiro na API (string + moeda). */
export const moneyDtoSchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Valor monetário inválido'),
  currency: z.enum(['BRL', 'USD', 'EUR']),
});

export type MoneyDto = z.infer<typeof moneyDtoSchema>;
