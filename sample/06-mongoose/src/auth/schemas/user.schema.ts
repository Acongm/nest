import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

/**
 * 用户角色枚举
 */
export enum UserRole {
  ADMIN = 'admin', // 管理员
  USER = 'user', // 普通用户
}

@Schema({ _id: false, timestamps: true })
export class User {
  // _id 字段，使用 String 类型而不是默认的 ObjectId
  _id: string;
  @Prop({ required: true, unique: true })
  username: string;

  @Prop()
  password?: string; // 存储加密后的密码（可选，普通用户可以不设置，管理员必须设置）

  // 注意：userId 作为 MongoDB 的 _id 存储，注册时由用户提供

  @Prop({ required: true })
  tenantId: string; // 租户ID

  @Prop({ required: true })
  companyId: string; // 公司ID

  /**
   * 用户角色列表
   * 默认值为 ['user']（普通用户）
   * 管理员角色为 ['admin']
   */
  @Prop({
    type: [String],
    enum: Object.values(UserRole),
    default: [UserRole.USER],
  })
  roles: UserRole[];

  @Prop({ default: true })
  isActive: boolean; // 是否激活

  @Prop()
  email?: string; // 邮箱（可选）

  @Prop()
  phone?: string; // 手机号（可选）

  @Prop()
  realName?: string; // 真实姓名（可选）

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// 将 _id 设置为 String 类型，而不是默认的 ObjectId
// 这样可以使用自定义的字符串作为用户ID（如 "z77743"）
UserSchema.add({
  _id: { type: String, required: true, unique: true },
});

// 添加索引
UserSchema.index({ username: 1, tenantId: 1 }); // 支持普通用户登录：username + _id + tenantId
UserSchema.index({ tenantId: 1 });

