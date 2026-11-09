import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { v4 as uuid } from 'uuid';

import { PrismaService } from '../prisma/prisma.service';

export interface SessionPayload {
  sub: string; // userId
  tenantId: string;
  roles: string[];
  // Permissões efetivas (achatadas) já calculadas na hora do login — simplifica
  // o guard RBAC. Troca de papéis exige novo login ou refresh explícito.
  permissions: string[];
  // Correlação para logs distribuídos.
  correlationId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 1 << 16,
      timeCost: 3,
      parallelism: 1,
    });
  }

  async login(email: string, password: string): Promise<{ accessToken: string; payload: SessionPayload }> {
    // Login é uma operação GLOBAL: ainda não sabemos o tenant. Procuramos
    // o usuário pelo e-mail (podem existir homônimos em tenants diferentes;
    // o protocolo de produção receberia o slug do tenant junto, mas no
    // MVP mantemos simples e usamos uniqueness por email dentro do tenant).
    // Login é operação GLOBAL (sem tenant conhecido ainda): a role
    // `gestlog_app` não enxerga `users` sem `app.current_tenant`.
    // Usamos a role `gestlog_admin` (BYPASSRLS) apenas aqui — ato
    // auditável, delimitado e explícito. Fora deste trecho, o
    // adminClient NUNCA é usado.
    const user = await this.prisma.adminClient.user.findFirst({
      where: { email: email.toLowerCase().trim() },
      include: {
        tenant: true,
        roles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      // Mensagem genérica — não revela se o e-mail existe.
      throw new UnauthorizedException('credenciais inválidas');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('conta inativa');
    }
    if (user.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('tenant inativo');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('credenciais inválidas');
    }

    const roles = Array.from(new Set(user.roles.map((ur) => ur.role.code)));
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.code)),
      ),
    );

    const payload: SessionPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      roles,
      permissions,
      correlationId: uuid(),
    };

    await this.prisma.adminClient.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { accessToken: await this.jwt.signAsync(payload), payload };
  }

  async verifyToken(token: string): Promise<SessionPayload> {
    try {
      return await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException('token inválido ou expirado');
    }
  }
}
