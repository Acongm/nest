# NestJS 参数装饰器工作原理说明

## 为什么可以在方法参数中使用 `@Req() reqRequest: Request`？

### 1. NestJS 的依赖注入机制

NestJS 使用**装饰器（Decorators）**和**反射（Reflection）**来实现依赖注入。当你使用参数装饰器时，NestJS 会在运行时识别这些装饰器，并自动注入相应的值。

### 2. 参数装饰器的工作原理

```typescript
@Get()
async findAll(@Req() reqRequest: Request) {
  // ...
}
```

**执行流程：**

1. **编译时**：TypeScript 编译器会保留装饰器信息到元数据中
2. **运行时**：NestJS 框架会：
   - 扫描方法参数上的装饰器
   - 识别 `@Req()` 装饰器
   - 从当前的 HTTP 请求上下文中获取 Request 对象
   - 将 Request 对象注入到 `reqRequest` 参数中

### 3. `@Req()` 装饰器的实现

`@Req()` 是 NestJS 内置的参数装饰器，它的实现类似于：

```typescript
// NestJS 内部的简化实现
export const Req = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest();
  },
);
```

### 4. 完整的请求处理流程

```
HTTP 请求
  ↓
NestJS 路由匹配
  ↓
创建 ExecutionContext（执行上下文）
  ↓
扫描 Controller 方法的参数装饰器
  ↓
根据装饰器类型注入相应的值：
  - @Req() → 注入 Request 对象
  - @Body() → 注入请求体数据
  - @Param() → 注入路径参数
  - @Query() → 注入查询参数
  - @CurrentUser() → 注入用户信息（自定义装饰器）
  ↓
调用 Controller 方法
  ↓
返回响应
```

### 5. 在哪里配置的？

**不需要手动配置！** 这是 NestJS 框架的核心功能：

1. **框架内置**：`@Req()`, `@Body()`, `@Param()`, `@Query()` 等都是 NestJS 内置的装饰器
2. **自动识别**：NestJS 在运行时自动识别这些装饰器
3. **自动注入**：框架会自动从请求上下文中提取相应的值并注入

### 6. 自定义装饰器示例

我们也可以创建自定义装饰器：

```typescript
// 自定义装饰器
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest();
    return request.user; // 从 request.user 获取
  },
);

// 使用
@Get()
async findAll(@CurrentUser() user: CurrentUserData) {
  // user 会被自动注入
}
```

### 7. 为什么需要装饰器？

**不使用装饰器的情况：**
```typescript
// ❌ 这样不行，NestJS 不知道要注入什么
async findAll(reqRequest: Request) {
  // reqRequest 会是 undefined
}
```

**使用装饰器：**
```typescript
// ✅ 正确，NestJS 知道要注入 Request 对象
async findAll(@Req() reqRequest: Request) {
  // reqRequest 是完整的 Request 对象
}
```

### 8. 装饰器的元数据

NestJS 使用 `reflect-metadata` 库来存储装饰器的元数据：

```typescript
// 编译后的代码（简化）
Reflect.defineMetadata('design:paramtypes', [Request], MyController, 'findAll');
Reflect.defineMetadata('__param:0', Req(), MyController, 'findAll');
```

运行时，NestJS 会读取这些元数据，知道：
- 第一个参数的类型是 `Request`
- 第一个参数需要使用 `@Req()` 装饰器注入

### 9. 总结

- **不需要配置**：这是 NestJS 框架的核心功能，开箱即用
- **装饰器是必需的**：必须使用装饰器告诉 NestJS 要注入什么
- **自动注入**：框架会在运行时自动识别装饰器并注入相应的值
- **类型安全**：TypeScript 提供类型检查，但运行时注入由 NestJS 处理

### 10. 相关文件位置

- **NestJS 源码**：`node_modules/@nestjs/common/decorators/http/`
- **我们的自定义装饰器**：`src/auth/decorators/current-user.decorator.ts`
- **类型扩展**：`src/types/express.d.ts`（我们刚创建的）

