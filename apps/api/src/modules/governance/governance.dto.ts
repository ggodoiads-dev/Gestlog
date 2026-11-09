import { z } from 'zod';

export const createApprovalSchema = z.object({
  subjectType: z.string().min(2).max(60),
  subjectId: z.string().uuid(),
  subjectVersion: z.number().int().positive().default(1),
  reason: z.string().min(3).max(1000),
  amountCents: z.coerce.bigint().positive().optional(),
  currency: z.string().length(3).optional(),
  requiredApprovals: z.number().int().positive().max(5).default(1),
  // AT-05: SLA em minutos. Default 1440 (24h). Mínimo 1 para testes;
  // em produção, policy do tenant define pisos maiores por categoria.
  slaMinutes: z.number().int().positive().max(43200).default(1440).optional(),
  snapshot: z.record(z.unknown()),
});

export type CreateApprovalDto = z.infer<typeof createApprovalSchema>;

export const decisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'RETURN']),
  comment: z.string().max(1000).optional(),
});

export type DecisionDto = z.infer<typeof decisionSchema>;
