# NestJS Controller 参数装饰器说明

## 1. `reqRequest: Request` 的说明

在 NestJS 中，如果要注入 Express 的 Request 对象，需要使用 `@Req()` 装饰器：

```typescript
import { Request } from 'express';
import { Req } from '@nestjs/common';

@Get()
async findAll(@Req() reqRequest: Request) {
  // reqRequest 是完整的 Express Request 对象
  console.log(reqRequest.headers);
  console.log(reqRequest.cookies);
  console.log(reqRequest.query);
  console.log(reqRequest.params);
}
```

**注意**：如果只是写 `reqRequest: Request` 而不加 `@Req()` 装饰器，NestJS 不会自动注入 Request 对象。

## 2. `@Body()` 装饰器

`@Body()` 是 NestJS 的参数装饰器，用于从 HTTP 请求体中提取数据：

```typescript
@Post()
async create(@Body() data: CreateDto) {
  // data 是从请求体中提取并验证后的数据
  // NestJS 会自动使用 ValidationPipe 进行验证
}
```

**功能**：
- 从请求体中提取 JSON 数据
- 自动进行类型转换
- 配合 `ValidationPipe` 进行数据验证
- 支持 DTO 类验证

## 3. `@CurrentUser()` 自定义装饰器

`@CurrentUser()` 是我们创建的自定义装饰器，它从 `request.user` 中获取用户信息：

```typescript
// 装饰器实现
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest();
    return request.user; // 从 request.user 获取
  },
);

// 使用方式
@Get()
async findAll(@CurrentUser() user: CurrentUserData) {
  console.log(user.tenantId);
  console.log(user.userId);
}
```

## 4. 从 `reqRequest` 直接获取用户信息

**可以！** 因为 JWT 策略在验证 token 后会将用户信息附加到 `request.user`：

```typescript
import { Request } from 'express';
import { Req } from '@nestjs/common';

@Get()
async findAll(@Req() reqRequest: Request) {
  // 直接从 reqRequest.user 获取用户信息
  const user = reqRequest.user as CurrentUserData;
  console.log(user.tenantId);
  console.log(user.userId);
}
```

## 5. 完整的参数装饰器列表

NestJS 提供的常用参数装饰器：

- `@Req()` / `@Request()` - Express Request 对象
- `@Res()` / `@Response()` - Express Response 对象
- `@Body()` - 请求体数据
- `@Query()` - 查询参数
- `@Param()` - 路径参数
- `@Headers()` - 请求头
- `@Ip()` - 客户端 IP
- `@Session()` - Session 数据
- `@HostParam()` - 主机参数

## 6. 推荐的使用方式

### 方式一：使用装饰器（推荐）
```typescript
@Post()
async create(
  @Req() reqRequest: Request,
  @Body() data: CreateDto,
  @CurrentUser() user: CurrentUserData,
) {
  // 清晰明了，类型安全
}
```

### 方式二：从 reqRequest 直接获取
```typescript
@Post()
async create(
  @Req() reqRequest: Request,
  @Body() data: CreateDto,
) {
  const user = reqRequest.user as CurrentUserData;
  // 需要手动类型断言
}
```

**推荐使用方式一**，因为：
- 类型安全
- 代码更清晰
- 如果 user 不存在，装饰器可以提前处理

