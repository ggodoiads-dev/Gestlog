import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

import { AuthService } from './auth.service';
import { Public } from './public.decorator';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar usuário e receber token de sessão' })
  @ApiBody({ type: LoginDto })
  async login(@Body() dto: LoginDto): Promise<{
    accessToken: string;
    tenantId: string;
    userId: string;
    roles: string[];
    permissions: string[];
  }> {
    const { accessToken, payload } = await this.auth.login(dto.email, dto.password);
    return {
      accessToken,
      tenantId: payload.tenantId,
      userId: payload.sub,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
