import {
  Body, Controller, ExecutionContext, Global, HttpCode, Injectable, Module, Post, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportModule, PassportStrategy } from '@nestjs/passport';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    return super.canActivate(ctx);
  }
}

@Injectable()
class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: config.getOrThrow<string>('JWT_SECRET') });
  }
  validate(p: { sub: number; email: string; name: string }) {
    return { id: p.sub, email: p.email, name: p.name };
  }
}

class LoginDto {
  @ApiProperty({ example: 'admin@supervision.local' }) @IsEmail() email!: string;
  @ApiProperty({ example: 'Admin123!' }) @IsString() password!: string;
}

@ApiTags('auth')
@Controller('auth')
class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Identifiants invalides');
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email, name: user.name }),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ secret: c.getOrThrow<string>('JWT_SECRET'), signOptions: { expiresIn: '12h' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
