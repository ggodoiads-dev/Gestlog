import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    ctx: { tenantId: string },
    opts: { page: number; pageSize: number },
  ): Promise<{
    items: { id: string; email: string; fullName: string; status: string }[];
    total: number;
  }> {
    return this.prisma.withTenantFromCtx(ctx, async (tx) => {
      const [items, total] = await Promise.all([
        tx.user.findMany({
          orderBy: { createdAt: 'asc' },
          skip: (opts.page - 1) * opts.pageSize,
          take: opts.pageSize,
          select: { id: true, email: true, fullName: true, status: true },
        }),
        tx.user.count(),
      ]);
      return { items, total };
    });
  }
}
