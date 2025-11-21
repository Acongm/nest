import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserData {
  userId: string; // 用户ID（实际上是 MongoDB _id）
  tenantId: string;
  companyId: string;
  username: string;
  roles?: string[]; // 用户角色列表
  id: string; // MongoDB _id
}

// 类型守卫函数，帮助 TypeScript 识别类型
export function isCurrentUserData(user: any): user is CurrentUserData {
  return user && typeof user === 'object' && 'userId' in user && 'tenantId' in user;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

