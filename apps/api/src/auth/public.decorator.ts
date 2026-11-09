import { SetMetadata } from '@nestjs/common';

/**
 * Marca um endpoint como público — o JwtAuthGuard pula a validação.
 * Use com parcimônia: `/health`, `/auth/login` e similares.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata('isPublic', true);
