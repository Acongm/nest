import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AuthService } from '../auth.service';

export interface JwtPayload {
  userId: string; // 用户ID（实际上是 _id）
  tenantId: string;
  companyId: string;
  username: string;
  roles: string[]; // 用户角色列表
  sub: string; // user id (MongoDB _id)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    super({
      // 从 cookie 中提取 token
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.token || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'your-secret-key-change-in-production'),
    });
  }

  async validate(payload: JwtPayload) {
    // 验证用户是否仍然存在且激活
    const user = await this.authService.validateUser(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('用户不存在或已被禁用');
    }

    // 返回的用户信息会被附加到 request.user
    return {
      userId: payload.userId, // 使用 _id 作为 userId
      tenantId: payload.tenantId,
      companyId: payload.companyId,
      username: payload.username,
      roles: payload.roles || [], // 用户角色
      id: payload.sub, // MongoDB _id
    };
  }
}

