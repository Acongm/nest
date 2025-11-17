import { Controller, Post, Body, Res, Get, UseGuards, Req } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 用户注册
   */
  @Public()
  @Post('register')
  async register(@Req() reqRequest: Request, @Body() data: RegisterDto) {
    // @Body() 装饰器：从请求体中提取并验证数据
    // @Req() 装饰器：注入 Express Request 对象
    return this.authService.register(data);
  }

  /**
   * 用户登录
   */
  @Public()
  @Post('login')
  async login(@Req() reqRequest: Request, @Body() data: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(data);

    // 将 token 存储到 cookie
    res.cookie('token', result.access_token, {
      httpOnly: true, // 防止 XSS 攻击
      secure: process.env.NODE_ENV === 'production', // 生产环境使用 HTTPS
      sameSite: 'strict', // 防止 CSRF 攻击
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
      path: '/',
    });

    return {
      message: '登录成功',
      user: result.user,
    };
  }

  /**
   * 用户登出
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() reqRequest: Request, @Res({ passthrough: true }) res: Response) {
    // 清除 cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return {
      message: '登出成功',
    };
  }

  /**
   * 获取当前用户信息
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() reqRequest: Request) {
    // 从 reqRequest.user 获取用户信息（类型已通过 express.d.ts 扩展定义）
    const user = reqRequest.user!;

    return {
      userId: user.userId,
      tenantId: user.tenantId,
      companyId: user.companyId,
      username: user.username,
    };
  }
}

