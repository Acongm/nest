# TypeScript 全局类型扩展最佳实践

## 问题

在之前的实现中，我们在每个控制器文件中使用 `import '../types/express'` 来扩展 Express 的 Request 类型，这种方式不够优雅。

## 更优雅的解决方案

### 方案一：使用 typeRoots（推荐）⭐

这是最优雅的方式，TypeScript 会自动发现类型定义文件。

#### 1. 确保类型定义文件正确

`src/types/express.d.ts`:

```typescript
import { CurrentUserData } from '../auth/decorators/current-user.decorator';

declare global {
  namespace Express {
    interface Request {
      user?: CurrentUserData;
    }
  }
}

// 确保这个文件被当作模块处理
export {};
```

**关键点**：
- 使用 `declare global` 扩展全局命名空间
- 使用 `export {}` 确保文件被当作模块处理（这样 `import` 语句才能工作）

#### 2. 配置 tsconfig.json

```json
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@types", "./src/types"]
  },
  "include": ["src/**/*"]
}
```

**关键点**：
- `typeRoots` 告诉 TypeScript 在哪里查找类型定义
- `include` 确保类型定义文件被包含在编译中

#### 3. 移除所有 `import '../types/express'` 语句

类型定义会自动生效，无需手动导入。

### 方案二：使用三斜线指令

如果方案一不工作，可以在类型定义文件中使用三斜线指令：

`src/types/express.d.ts`:

```typescript
/// <reference types="express" />

import { CurrentUserData } from '../auth/decorators/current-user.decorator';

declare global {
  namespace Express {
    interface Request {
      user?: CurrentUserData;
    }
  }
}

export {};
```

### 方案三：在入口文件中导入一次

如果上述方案都不工作，可以在 `main.ts` 中导入一次：

`src/main.ts`:

```typescript
import './types/express'; // 在入口文件导入一次即可

// ... 其他代码
```

这样所有文件都能使用扩展的类型。

## 为什么之前的方案不够优雅？

### 问题 1：重复导入

每个控制器文件都需要：
```typescript
import '../types/express';
```

这违反了 DRY（Don't Repeat Yourself）原则。

### 问题 2：路径不一致

不同深度的文件需要使用不同的相对路径：
- `src/auth/auth.controller.ts` → `import '../types/express'`
- `src/report-export/report-export.controller.ts` → `import '../types/express'`
- `src/cats/cats.controller.ts` → `import '../types/express'`

### 问题 3：容易遗漏

如果忘记导入，TypeScript 不会报错，但类型不会生效。

## 推荐方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| typeRoots | ✅ 自动发现<br>✅ 无需导入<br>✅ 最优雅 | 需要正确配置 | ⭐⭐⭐⭐⭐ |
| 三斜线指令 | ✅ 明确引用<br>✅ 兼容性好 | 需要手动引用 | ⭐⭐⭐⭐ |
| 入口文件导入 | ✅ 简单<br>✅ 只需一次 | 需要记住导入 | ⭐⭐⭐ |
| 每个文件导入 | ❌ 重复代码<br>❌ 容易遗漏 | 简单直接 | ⭐⭐ |

## 实施步骤

### 1. 更新类型定义文件

确保 `src/types/express.d.ts` 使用 `declare global` 和 `export {}`。

### 2. 检查 tsconfig.json

确保配置了 `typeRoots` 和 `include`。

### 3. 移除所有导入语句

搜索并删除所有 `import '../types/express'` 或 `import './types/express'` 语句。

### 4. 验证

在控制器中使用 `reqRequest.user`，应该能自动识别类型，无需导入。

## 常见问题

### Q1: 为什么需要 `export {}`？

**A**: TypeScript 需要区分脚本文件和模块文件。如果文件中有 `import` 或 `export` 语句，它就是模块。使用 `export {}` 确保文件被当作模块处理，这样 `declare global` 才能正确工作。

### Q2: typeRoots 不工作怎么办？

**A**: 
1. 检查 `tsconfig.json` 的 `include` 是否包含类型定义文件
2. 确保类型定义文件以 `.d.ts` 结尾
3. 尝试重启 TypeScript 服务器（VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"）

### Q3: 可以在多个文件中扩展同一个类型吗？

**A**: 可以，TypeScript 会自动合并同名的类型声明。但建议集中在一个文件中管理。

## 总结

**推荐使用方案一（typeRoots）**，这是最优雅和标准的做法：
- ✅ 自动发现类型定义
- ✅ 无需手动导入
- ✅ 符合 TypeScript 最佳实践
- ✅ 代码更简洁

