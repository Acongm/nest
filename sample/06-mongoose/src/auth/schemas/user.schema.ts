import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  password: string; // 存储加密后的密码

  @Prop({ required: true })
  userId: string; // 用户ID

  @Prop({ required: true })
  tenantId: string; // 租户ID

  @Prop({ required: true })
  companyId: string; // 公司ID

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

