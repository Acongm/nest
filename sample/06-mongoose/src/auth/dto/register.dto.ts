import { IsNotEmpty, IsString, MinLength, IsOptional, IsArray, IsEnum } from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class RegisterDto {
  @IsNotEmpty({ message: '用户名不能为空' })
  @IsString({ message: '用户名必须是字符串' })
  username: string;

  /**
   * 用户ID（必填）
   * 将作为 MongoDB 的 _id 存储
   */
  @IsNotEmpty({ message: '用户ID不能为空' })
  @IsString({ message: '用户ID必须是字符串' })
  userId: string;

  @IsNotEmpty({ message: '租户ID不能为空' })
  @IsString({ message: '租户ID必须是字符串' })
  tenantId: string;

  @IsNotEmpty({ message: '公司ID不能为空' })
  @IsString({ message: '公司ID必须是字符串' })
  companyId: string;

  /**
   * 密码（可选，普通用户可以不设置密码）
   * 管理员用户必须设置密码
   */
  @IsOptional()
  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码长度不能少于6位' })
  password?: string;

  /**
   * 用户角色列表（可选）
   * 如果不提供，默认为 ['user']
   * 只有管理员可以创建管理员账户
   */
  @IsOptional()
  @IsArray({ message: 'roles 必须是数组' })
  @IsEnum(UserRole, { each: true, message: 'roles 中的每个元素必须是有效的角色' })
  roles?: UserRole[];

  @IsOptional()
  @IsString({ message: '邮箱必须是字符串' })
  email?: string;

  @IsOptional()
  @IsString({ message: '手机号必须是字符串' })
  phone?: string;

  @IsOptional()
  @IsString({ message: '真实姓名必须是字符串' })
  realName?: string;
}

