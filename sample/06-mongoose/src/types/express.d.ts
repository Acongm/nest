/// <reference types="express" />

import { CurrentUserData } from '../auth/decorators/current-user.decorator';

// 扩展 Express 的 Request 接口
declare global {
  namespace Express {
    interface Request {
      user?: CurrentUserData;
    }
  }
}

// 确保这个文件被当作模块处理
export {};
