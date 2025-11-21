import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, UserRole } from './schemas/user.schema';
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
   * 使用用户提供的 userId 作为 MongoDB 的 _id
   */
  async register(registerDto: RegisterDto): Promise<{ message: string; user: Partial<User> & { userId: string } }> {
    // 检查 userId 是否已存在（作为 _id）
    const existingUserId = await this.userModel.findById(registerDto.userId);
    if (existingUserId) {
      throw new ConflictException('用户ID已存在');
    }

    // 检查用户名是否已存在（在同一租户下）
    const existingUser = await this.userModel.findOne({
      username: registerDto.username,
      tenantId: registerDto.tenantId,
    });
    if (existingUser) {
      throw new ConflictException('该租户下用户名已存在');
    }

    // 设置默认角色（如果没有提供）
    const roles = registerDto.roles && registerDto.roles.length > 0
      ? registerDto.roles
      : [UserRole.USER];

    // 如果提供了密码，则加密（管理员用户必须提供密码）
    let hashedPassword: string | undefined;
    if (registerDto.password) {
      const saltRounds = 10;
      hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);
    } else if (roles.includes(UserRole.ADMIN)) {
      // 管理员必须设置密码
      throw new ConflictException('管理员用户必须设置密码');
    }

    // 创建用户，使用 userId 作为 _id
    const userData: any = {
      _id: registerDto.userId, // 使用用户提供的 userId 作为 _id
      username: registerDto.username,
      tenantId: registerDto.tenantId,
      companyId: registerDto.companyId,
      roles,
      email: registerDto.email,
      phone: registerDto.phone,
      realName: registerDto.realName,
    };

    if (hashedPassword) {
      userData.password = hashedPassword;
    }

    const user = await this.userModel.create(userData);

    logger.info('用户注册成功', {
      username: user.username,
      userId: user._id.toString(), // userId 就是 _id
      tenantId: user.tenantId,
      roles: user.roles,
      hasPassword: !!hashedPassword,
    });

    // 返回用户信息（不包含密码）
    const userObj = user.toObject();
    delete userObj.password;
    return {
      message: '注册成功',
      user: {
        ...userObj,
        userId: user._id.toString(), // 返回 _id 作为 userId
      } as any, // 类型断言：userId 不在 User 类型中，但我们需要返回它
    };
  }

  /**
   * 用户登录
   * 支持两种登录方式：
   * 1. 管理员登录：username + password（密码必填）
   * 2. 普通用户登录：username + userId + tenantId（不需要密码）
   */
  async login(loginDto: LoginDto): Promise<{ access_token: string; user: Partial<User> & { userId: string } }> {
    let user: UserDocument | null = null;

    // 判断登录方式
    if (loginDto.userId && loginDto.tenantId) {
      // 普通用户登录：username + userId + tenantId（不需要密码）
      try {
        user = await this.userModel.findById(loginDto.userId);
        if (!user) {
          throw new UnauthorizedException('用户ID不存在');
        }

        // 验证用户名、租户ID是否匹配
        if (user.username !== loginDto.username) {
          throw new UnauthorizedException('用户名不匹配');
        }
        if (user.tenantId !== loginDto.tenantId) {
          throw new UnauthorizedException('租户ID不匹配');
        }

        logger.info('普通用户登录尝试', {
          username: loginDto.username,
          userId: loginDto.userId,
          tenantId: loginDto.tenantId,
        });
      } catch (error: any) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        // 如果 _id 格式不正确，抛出错误
        throw new UnauthorizedException('用户ID格式不正确');
      }
    } else {
      // 管理员登录：username + password（密码必填）
      if (!loginDto.password) {
        throw new UnauthorizedException('管理员登录需要提供密码');
      }

      // 查找用户（可能在同一租户下有多个同名用户，但管理员通常只有一个）
      user = await this.userModel.findOne({ username: loginDto.username });
      if (!user) {
        throw new UnauthorizedException('用户名或密码错误');
      }

      // 检查是否为管理员
      if (!user.roles.includes(UserRole.ADMIN)) {
        throw new UnauthorizedException('该用户不是管理员，请使用普通用户登录方式（提供 userId 和 tenantId）');
      }

      logger.info('管理员登录尝试', {
        username: loginDto.username,
      });
    }

    // 检查用户是否激活
    if (!user.isActive) {
      throw new UnauthorizedException('用户已被禁用');
    }

    // 管理员登录需要验证密码，普通用户登录不需要密码
    if (!loginDto.userId && loginDto.password) {
      // 管理员登录：验证密码
      if (!user.password) {
        throw new UnauthorizedException('该管理员账户未设置密码');
      }
      const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('用户名或密码错误');
      }
    }

    // 生成 JWT token
    // 使用 _id 作为 userId
    const payload: JwtPayload = {
      userId: user._id.toString(), // 使用 _id 作为 userId
      tenantId: user.tenantId,
      companyId: user.companyId,
      username: user.username,
      roles: user.roles,
      sub: user._id.toString(),
    };

    const access_token = this.jwtService.sign(payload);

    logger.info('用户登录成功', {
      username: user.username,
      userId: user._id.toString(),
      tenantId: user.tenantId,
      roles: user.roles,
      loginType: loginDto.userId ? '普通用户' : '管理员',
    });

    // 返回 token 和用户信息（不包含密码）
    const { password, ...userWithoutPassword } = user.toObject();
    return {
      access_token,
      user: {
        ...userWithoutPassword,
        userId: user._id.toString(), // 返回 _id 作为 userId
      } as any, // 类型断言：userId 不在 User 类型中，但我们需要返回它
    };
  }

  /**
   * 验证用户（用于 JWT 策略）
   * @param userId 用户ID（实际上是 _id）
   */
  async validateUser(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId).exec();
  }

  /**
   * 获取当前用户信息
   * @param userId 用户ID（实际上是 _id）
   */
  async getCurrentUser(userId: string): Promise<Partial<User> & { userId: string }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const { password, ...userWithoutPassword } = user.toObject();
    return {
      ...userWithoutPassword,
      userId: user._id.toString(), // 返回 _id 作为 userId
    } as Partial<User> & { userId: string };
  }
}

