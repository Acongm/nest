import { IsNotEmpty, IsString, MinLength, IsOptional, ValidateIf } from 'class-validator';

/**
 * 登录 DTO
 * 支持两种登录方式：
 * 1. 管理员登录：username + password（密码必填）
 * 2. 普通用户登录：username + userId + tenantId（密码不需要）
 */
export class LoginDto {
  @IsNotEmpty({ message: '用户名不能为空' })
  @IsString({ message: '用户名必须是字符串' })
  username: string;

  /**
   * 密码（管理员登录时必填，普通用户登录时不需要）
   */
  @ValidateIf((o) => !o.userId)
  @IsNotEmpty({ message: '密码不能为空（管理员登录时）' })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码长度不能少于6位' })
  password?: string;

  /**
   * 用户ID（普通用户登录时必填）
   * 管理员登录时不需要此字段
   */
  @IsOptional()
  @IsString({ message: '用户ID必须是字符串' })
  userId?: string;

  /**
   * 租户ID（普通用户登录时必填）
   * 管理员登录时不需要此字段
   */
  @ValidateIf((o) => o.userId !== undefined)
  @IsNotEmpty({ message: '租户ID不能为空（当提供 userId 时）' })
  @IsString({ message: '租户ID必须是字符串' })
  tenantId?: string;
}

