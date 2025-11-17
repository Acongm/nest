import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { logger } from '../common/logger';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  /**
   * 用户注册
   */
  async register(registerDto: RegisterDto): Promise<{ message: string; user: Partial<User> }> {
    // 检查用户名是否已存在
    const existingUser = await this.userModel.findOne({ username: registerDto.username });
    if (existingUser) {
      throw new ConflictException('用户名已存在');
    }

    // 检查 userId 是否已存在
    const existingUserId = await this.userModel.findOne({ userId: registerDto.userId });
    if (existingUserId) {
      throw new ConflictException('用户ID已存在');
    }

    // 加密密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);

    // 创建用户
    const user = await this.userModel.create({
      ...registerDto,
      password: hashedPassword,
    });

    logger.info('用户注册成功', {
      username: user.username,
      userId: user.userId,
      tenantId: user.tenantId,
    });

    // 返回用户信息（不包含密码）
    const { password, ...userWithoutPassword } = user.toObject();
    return {
      message: '注册成功',
      user: userWithoutPassword,
    };
  }

  /**
   * 用户登录
   */
  async login(loginDto: LoginDto): Promise<{ access_token: string; user: Partial<User> }> {
    // 查找用户
    const user = await this.userModel.findOne({ username: loginDto.username });
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 检查用户是否激活
    if (!user.isActive) {
      throw new UnauthorizedException('用户已被禁用');
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 生成 JWT token
    const payload: JwtPayload = {
      userId: user.userId,
      tenantId: user.tenantId,
      companyId: user.companyId,
      username: user.username,
      sub: user._id.toString(),
    };

    const access_token = this.jwtService.sign(payload);

    logger.info('用户登录成功', {
      username: user.username,
      userId: user.userId,
      tenantId: user.tenantId,
    });

    // 返回 token 和用户信息（不包含密码）
    const { password, ...userWithoutPassword } = user.toObject();
    return {
      access_token,
      user: userWithoutPassword,
    };
  }

  /**
   * 验证用户（用于 JWT 策略）
   */
  async validateUser(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId).exec();
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(userId: string): Promise<Partial<User>> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const { password, ...userWithoutPassword } = user.toObject();
    return userWithoutPassword;
  }
}

