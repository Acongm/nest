import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserData {
  userId: string;
  tenantId: string;
  companyId: string;
  username: string;
  id: string;
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

