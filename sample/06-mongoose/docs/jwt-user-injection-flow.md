# JWT 用户信息注入流程详解

## 问题：`Request.user.tenantId` 是怎么被设置进去的？

## 完整流程

### 1. 用户登录 - 生成 JWT Token

**位置**：`src/auth/auth.service.ts` - `login()` 方法

```typescript
async login(loginDto: LoginDto): Promise<{ access_token: string; user: Partial<User> }> {
  // 1. 查找用户
  const user = await this.userModel.findOne({ username: loginDto.username });
  
  // 2. 验证密码
  const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
  
  // 3. 生成 JWT payload（包含 tenantId）
  const payload: JwtPayload = {
    userId: user.userId,
    tenantId: user.tenantId,    // ← tenantId 在这里被放入 token
    companyId: user.companyId,
    username: user.username,
    sub: user._id.toString(),
  };
  
  // 4. 签名生成 token
  const access_token = this.jwtService.sign(payload);
  
  return { access_token, user: userWithoutPassword };
}
```

**关键点**：`tenantId` 被编码到 JWT token 的 payload 中。

### 2. Token 存储到 Cookie

**位置**：`src/auth/auth.controller.ts` - `login()` 方法

```typescript
@Post('login')
async login(@Req() reqRequest: Request, @Body() data: LoginDto, @Res() res: Response) {
  const result = await this.authService.login(data);
  
  // Token 存储到 cookie
  res.cookie('token', result.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
    path: '/',
  });
  
  return { message: '登录成功', user: result.user };
}
```

**关键点**：Token 被存储在浏览器的 cookie 中，后续请求会自动携带。

### 3. 请求到达 - JWT Guard 拦截

**位置**：`src/app.module.ts` - 全局守卫配置

```typescript
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,  // ← 全局守卫，所有请求都会经过
    },
  ],
})
export class AppModule { }
```

**关键点**：所有请求（除了 `@Public()` 标记的）都会经过 `JwtAuthGuard`。

### 4. JWT Guard 调用 Passport 策略

**位置**：`src/auth/guards/jwt-auth.guard.ts`

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // 继承自 AuthGuard('jwt')
  // 'jwt' 对应 JwtStrategy 的名称
}
```

**关键点**：`AuthGuard('jwt')` 会调用名为 `'jwt'` 的策略（即 `JwtStrategy`）。

### 5. JWT 策略提取和验证 Token

**位置**：`src/auth/strategies/jwt.strategy.ts`

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      // 从 cookie 中提取 token
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.token || null;  // ← 从 cookie 提取 token
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    });
  }
}
```

**关键点**：
1. Passport 从 `request.cookies.token` 提取 token
2. 使用 `secretOrKey` 验证 token 签名
3. 解析 token 得到 payload（包含 `tenantId`）

### 6. JWT 策略的 validate() 方法

**位置**：`src/auth/strategies/jwt.strategy.ts` - `validate()` 方法

```typescript
async validate(payload: JwtPayload) {
  // payload 是从 token 中解析出来的，包含：
  // {
  //   userId: string,
  //   tenantId: string,    // ← 从 token payload 中获取
  //   companyId: string,
  //   username: string,
  //   sub: string
  // }
  
  // 验证用户是否仍然存在且激活
  const user = await this.authService.validateUser(payload.sub);
  if (!user || !user.isActive) {
    throw new UnauthorizedException('用户不存在或已被禁用');
  }

  // ⭐ 关键：返回的对象会被 Passport 自动附加到 request.user
  return {
    userId: payload.userId,
    tenantId: payload.tenantId,    // ← tenantId 在这里被返回
    companyId: payload.companyId,
    username: payload.username,
    id: payload.sub,
  };
}
```

**关键点**：`validate()` 方法返回的对象会被 **Passport 自动附加到 `request.user`**。

### 7. Passport 自动注入到 request.user

**这是 Passport 框架的自动行为**：

```typescript
// Passport 内部实现（简化）
// 当 validate() 返回对象时，Passport 会：
request.user = validate(payload);  // ← 自动设置 request.user
```

**关键点**：
- Passport 框架会自动将 `validate()` 的返回值赋值给 `request.user`
- 这是 Passport 的标准行为，不需要手动设置

### 8. Controller 中使用

**位置**：任何 Controller 方法

```typescript
@Get()
async findAll(@Req() reqRequest: Request) {
  // reqRequest.user 已经被 Passport 设置好了
  const tenantId = reqRequest.user!.tenantId;  // ← 直接使用
}
```

## 完整流程图

```
1. 用户登录
   ↓
2. AuthService.login() 生成 JWT token（包含 tenantId）
   ↓
3. Token 存储到 cookie
   ↓
4. 后续请求携带 cookie
   ↓
5. JwtAuthGuard 拦截请求
   ↓
6. 调用 JwtStrategy
   ↓
7. 从 cookie 提取 token
   ↓
8. 验证 token 并解析 payload（包含 tenantId）
   ↓
9. 调用 validate() 方法
   ↓
10. validate() 返回用户信息对象（包含 tenantId）
    ↓
11. Passport 自动将返回值附加到 request.user
    ↓
12. Controller 中可以通过 reqRequest.user.tenantId 访问
```

## 关键代码位置

### 1. Token 生成（包含 tenantId）
- **文件**：`src/auth/auth.service.ts`
- **方法**：`login()`
- **代码**：
  ```typescript
  const payload: JwtPayload = {
    tenantId: user.tenantId,  // ← 放入 token
    // ...
  };
  const access_token = this.jwtService.sign(payload);
  ```

### 2. Token 验证和用户信息提取
- **文件**：`src/auth/strategies/jwt.strategy.ts`
- **方法**：`validate()`
- **代码**：
  ```typescript
  async validate(payload: JwtPayload) {
    // payload.tenantId 来自 token
    return {
      tenantId: payload.tenantId,  // ← 返回给 Passport
      // ...
    };
  }
  ```

### 3. Passport 自动注入
- **框架行为**：Passport 自动将 `validate()` 返回值赋值给 `request.user`
- **位置**：Passport 内部实现（`node_modules/passport/lib/middleware/authenticate.js`）

### 4. Controller 使用
- **文件**：所有 Controller
- **代码**：
  ```typescript
  @Get()
  async findAll(@Req() reqRequest: Request) {
    const tenantId = reqRequest.user!.tenantId;  // ← 直接使用
  }
  ```

## 总结

1. **登录时**：`tenantId` 被编码到 JWT token 的 payload 中
2. **请求时**：JWT Guard 从 cookie 提取 token
3. **验证时**：JWT Strategy 解析 token，得到包含 `tenantId` 的 payload
4. **注入时**：`validate()` 方法返回包含 `tenantId` 的对象
5. **自动设置**：**Passport 框架自动将返回值赋值给 `request.user`**
6. **使用时**：Controller 中可以直接通过 `reqRequest.user.tenantId` 访问

**关键点**：`request.user` 的设置是 **Passport 框架的自动行为**，当 JWT 策略的 `validate()` 方法返回对象时，Passport 会自动将其赋值给 `request.user`。

