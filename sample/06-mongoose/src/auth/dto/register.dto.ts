import { IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: '用户名不能为空' })
  @IsString({ message: '用户名必须是字符串' })
  username: string;

  @IsNotEmpty({ message: '密码不能为空' })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码长度不能少于6位' })
  password: string;

  @IsNotEmpty({ message: '用户ID不能为空' })
  @IsString({ message: '用户ID必须是字符串' })
  userId: string;

  @IsNotEmpty({ message: '租户ID不能为空' })
  @IsString({ message: '租户ID必须是字符串' })
  tenantId: string;

  @IsNotEmpty({ message: '公司ID不能为空' })
  @IsString({ message: '公司ID必须是字符串' })
  companyId: string;

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

