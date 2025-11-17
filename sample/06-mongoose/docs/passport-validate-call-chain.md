# Passport validate() 调用链和 request.user 注入详解

## 问题 1：validate() 方法在哪里被调用？

## 问题 2：request.user 是怎么被设置的？

## 完整调用链

### 1. 请求到达 - JwtAuthGuard.canActivate()

**位置**：`node_modules/@nestjs/passport/dist/auth.guard.js`

```javascript
async canActivate(context) {
    const options = { ... };
    const [request, response] = [
        this.getRequest(context),
        this.getResponse(context)
    ];
    
    // ⭐ 关键：调用 passport.authenticate()
    const passportFn = createPassportContext(request, response);
    const user = await passportFn(
        type || this.options.defaultStrategy,  // 'jwt'
        options,
        (err, user, info, status) => this.handleRequest(err, user, info, context, status)
    );
    
    // ⭐ 关键：将 user 设置到 request 上
    request[options.property || 'user'] = user;  // 默认是 'user'
    return true;
}
```

**关键点**：
- `passportFn` 实际上是 `passport.authenticate('jwt', ...)`
- 返回的 `user` 会被设置到 `request.user`

### 2. createPassportContext - 包装 passport.authenticate()

**位置**：`node_modules/@nestjs/passport/dist/auth.guard.js`

```javascript
const createPassportContext = (request, response) => 
    (type, options, callback) => 
        new Promise((resolve, reject) => 
            passport.authenticate(type, options, (err, user, info, status) => {
                try {
                    request.authInfo = info;
                    return resolve(callback(err, user, info, status));
                } catch (err) {
                    reject(err);
                }
            })(request, response, (err) => (err ? reject(err) : resolve()))
        );
```

**关键点**：这里调用了 `passport.authenticate('jwt', ...)`，这是 Passport 框架的核心方法。

### 3. Passport.authenticate() - 调用策略

**位置**：`node_modules/passport/lib/middleware/authenticate.js`

```javascript
module.exports = function authenticate(passport, name, options, callback) {
    // name = 'jwt'
    // ...
    
    return function authenticate(req, res, next) {
        // 获取名为 'jwt' 的策略
        var strategy = strategies[name];  // 这就是我们的 JwtStrategy
        
        // 调用策略的 authenticate 方法
        strategy.authenticate(req, options);
    };
};
```

**关键点**：Passport 会找到名为 `'jwt'` 的策略（即我们的 `JwtStrategy`），然后调用它的 `authenticate()` 方法。

### 4. JwtStrategy.authenticate() - 提取和验证 Token

**位置**：`node_modules/passport-jwt/lib/strategy.js`

```javascript
JwtStrategy.prototype.authenticate = function(req, options) {
    var self = this;
    
    // 1. 从请求中提取 token（使用我们配置的 jwtFromRequest）
    var token = self._jwtFromRequest(req);  // 从 cookie 提取
    
    if (!token) {
        return self.fail(new Error("No auth token"));
    }
    
    // 2. 验证 JWT token
    JwtStrategy.JwtVerifier(token, secretOrKey, self._verifOpts, function(jwt_err, payload) {
        if (jwt_err) {
            return self.fail(jwt_err);
        } else {
            // 3. ⭐ 关键：调用 verify 回调（这就是我们的 validate() 方法）
            var verified = function(err, user, info) {
                if(err) {
                    return self.error(err);
                } else if (!user) {
                    return self.fail(info);
                } else {
                    // ⭐ 关键：调用 self.success(user, info)
                    // 这里会将 user 传递给 Passport
                    return self.success(user, info);
                }
            };
            
            // ⭐ 关键：调用 _verify，也就是我们的 validate() 方法
            if (self._passReqToCallback) {
                self._verify(req, payload, verified);  // validate(req, payload, done)
            } else {
                self._verify(payload, verified);       // validate(payload, done)
            }
        }
    });
};
```

**关键点**：
- `self._verify` 就是我们传入的 verify 回调
- 在 NestJS 中，这个 verify 回调被 `PassportStrategy` 包装，会调用我们的 `validate()` 方法

### 5. PassportStrategy 包装 - 调用 validate()

**位置**：`node_modules/@nestjs/passport/dist/passport/passport.strategy.js`

```javascript
function PassportStrategy(Strategy, name, callbackArity) {
    class StrategyWithMixin extends Strategy {
        constructor(...args) {
            // ⭐ 关键：创建一个 callback，这个 callback 会调用 validate()
            const callback = async (...params) => {
                const done = params[params.length - 1];  // done 回调
                try {
                    // ⭐ 关键：调用我们的 validate() 方法
                    const validateResult = await this.validate(...params);
                    
                    if (Array.isArray(validateResult)) {
                        done(null, ...validateResult);
                    } else {
                        // ⭐ 关键：将 validate() 的返回值传递给 done 回调
                        done(null, validateResult);  // done(null, { tenantId, ... })
                    }
                } catch (err) {
                    done(err, null);
                }
            };
            
            // 将这个 callback 传递给原始 Strategy 的构造函数
            super(...args, callback);  // 传递给 passport-jwt 的 JwtStrategy
            
            // 注册策略到 Passport
            const passportInstance = this.getPassportInstance();
            if (name) {
                passportInstance.use(name, this);  // passport.use('jwt', this)
            } else {
                passportInstance.use(this);
            }
        }
    }
    return StrategyWithMixin;
}
```

**关键点**：
- `PassportStrategy` 创建了一个包装的 callback
- 这个 callback 会调用我们的 `validate()` 方法
- `validate()` 的返回值通过 `done(null, validateResult)` 传递给 Passport

### 6. 我们的 validate() 方法

**位置**：`src/auth/strategies/jwt.strategy.ts`

```typescript
async validate(payload: JwtPayload) {
    // payload 是从 token 解析出来的
    const user = await this.authService.validateUser(payload.sub);
    
    // ⭐ 关键：返回的对象会被传递给 done 回调
    return {
        userId: payload.userId,
        tenantId: payload.tenantId,  // ← 返回 tenantId
        companyId: payload.companyId,
        username: payload.username,
        id: payload.sub,
    };
}
```

**关键点**：返回的对象会被传递给 `done(null, user)`，然后传递给 Passport。

### 7. Passport Strategy.success() - 设置 request.user

**位置**：`node_modules/passport/lib/middleware/authenticate.js`（第 220 行）

```javascript
// 在 authenticate 中间件中，为每个策略创建 success 函数
strategy.success = function(user, info) {
    // 如果提供了 callback（NestJS 提供了）
    if (callback) {
        return callback(null, user, info);  // ← 直接调用 callback
    }
    
    // 如果没有 callback，使用默认行为
    // ...
    
    // ⭐ 关键：调用 req.logIn()，它会设置 req.user
    req.logIn(user, options, function(err) {
        if (err) { return next(err); }
        // ...
        next();
    });
};
```

**关键点**：
- 如果提供了 `callback`（NestJS 的 `AuthGuard` 提供了），会直接调用 `callback(null, user, info)`
- 如果没有 `callback`，会调用 `req.logIn(user, ...)`，它也会设置 `req.user`

### 7.1. req.logIn() - 设置 request.user

**位置**：`node_modules/passport/lib/http/request.js`（第 24 行）

```javascript
req.logIn = function(user, options, done) {
    var property = this._userProperty || 'user';  // 默认是 'user'
    
    // ⭐ 关键：设置 request.user
    this[property] = user;  // this['user'] = user，即 req.user = user
    
    // 如果有 session，保存到 session
    if (session && this._sessionManager) {
        this._sessionManager.logIn(this, user, options, function(err) {
            // ...
        });
    } else {
        done && done();
    }
};
```

**关键点**：`req.logIn(user, ...)` 会设置 `req.user = user`。

### 8. 回到 AuthGuard - 最终设置

**位置**：`node_modules/@nestjs/passport/dist/auth.guard.js`（第 44-45 行）

```javascript
// createPassportContext 返回的 passportFn
const passportFn = createPassportContext(request, response);

// ⭐ 关键：调用 passport.authenticate()，传入 callback
const user = await passportFn(
    'jwt',  // 策略名称
    options,
    (err, user, info, status) => this.handleRequest(err, user, info, context, status)  // callback
);

// ⭐ 关键：再次确保 user 被设置到 request 上
request[options.property || 'user'] = user;  // request.user = user
```

**关键点**：
1. `passportFn` 内部调用 `passport.authenticate('jwt', options, callback)`
2. 当 `strategy.success(user, info)` 被调用时，会调用我们传入的 `callback(null, user, info)`
3. `callback` 返回后，`passportFn` 返回 `user`
4. NestJS 的 `AuthGuard` 再次设置 `request.user = user`，确保一致性

**注意**：在 NestJS 中，由于提供了 `callback`，`strategy.success()` 会直接调用 `callback`，不会调用 `req.logIn()`。但 `AuthGuard` 会手动设置 `request.user`。

## 完整调用链图

```
HTTP 请求
  ↓
JwtAuthGuard.canActivate()
  ↓
createPassportContext() → passport.authenticate('jwt', ...)
  ↓
Passport 找到 'jwt' 策略（JwtStrategy）
  ↓
JwtStrategy.authenticate(req, options)
  ↓
1. 从 cookie 提取 token
2. 验证 token，解析 payload
3. 调用 self._verify(payload, done)  ← 这里！
  ↓
PassportStrategy 包装的 callback
  ↓
this.validate(payload)  ← 我们的 validate() 方法被调用！
  ↓
validate() 返回 { tenantId, ... }
  ↓
done(null, { tenantId, ... })  ← 传递给 done 回调
  ↓
JwtStrategy 的 verified 回调
  ↓
self.success(user, info)  ← 调用 success
  ↓
Passport authenticate 中间件
  ↓
req.user = user  ← 设置 request.user！
  ↓
AuthGuard 的 callback(err, user, info, status)
  ↓
request.user = user  ← 再次确保设置
  ↓
Controller 可以使用 reqRequest.user.tenantId
```

## 关键代码位置总结

### 1. validate() 被调用的位置

**文件**：`node_modules/@nestjs/passport/dist/passport/passport.strategy.js`
**行数**：第 13 行

```javascript
const validateResult = await this.validate(...params);  // ← 这里调用！
```

**调用路径**：
1. `JwtStrategy.authenticate()` → 调用 `self._verify(payload, done)`
2. `_verify` 是 `PassportStrategy` 包装的 callback
3. callback 内部调用 `this.validate(...params)`

### 2. request.user 被设置的位置

**位置 1**：`node_modules/passport/lib/middleware/authenticate.js`
**行数**：约 200+ 行（在 `strategy.success` 回调中）

```javascript
req.user = user;  // ← Passport 自动设置
```

**位置 2**：`node_modules/@nestjs/passport/dist/auth.guard.js`
**行数**：第 45 行

```javascript
request[options.property || 'user'] = user;  // ← NestJS 再次确保设置
```

## 验证方法

你可以在 `validate()` 方法中添加日志来验证：

```typescript
async validate(payload: JwtPayload) {
    console.log('✅ validate() 被调用了！', payload);
    
    const user = await this.authService.validateUser(payload.sub);
    
    const result = {
        userId: payload.userId,
        tenantId: payload.tenantId,
        // ...
    };
    
    console.log('✅ validate() 返回：', result);
    return result;
}
```

然后在 Controller 中：

```typescript
@Get()
async findAll(@Req() reqRequest: Request) {
    console.log('✅ Controller 中的 request.user：', reqRequest.user);
    const tenantId = reqRequest.user!.tenantId;
}
```

你会看到调用顺序：
1. `validate() 被调用了！`
2. `validate() 返回：{ tenantId: ... }`
3. `Controller 中的 request.user：{ tenantId: ... }`

## 总结

### 问题 1：validate() 在哪里被调用？

**答案**：在 `PassportStrategy` 包装的 callback 中被调用。

**调用路径**：
1. `JwtStrategy.authenticate()` 验证 JWT token 成功后
2. 调用 `self._verify(payload, done)`（这是 `PassportStrategy` 包装的 callback）
3. callback 内部调用 `this.validate(payload)` ← **这里！**

**关键代码位置**：
- `node_modules/@nestjs/passport/dist/passport/passport.strategy.js` 第 13 行
- `node_modules/passport-jwt/lib/strategy.js` 第 123 行

### 问题 2：request.user 是怎么被设置的？

**答案**：在 NestJS 的 `AuthGuard` 中手动设置。

**设置路径**：
1. `validate()` 返回 `{ tenantId, ... }`
2. 通过 `done(null, user)` 传递给 Passport
3. Passport 调用 `strategy.success(user, info)`
4. `strategy.success()` 调用 NestJS 提供的 `callback(null, user, info)`
5. `callback` 返回后，`AuthGuard.canActivate()` 得到 `user`
6. `AuthGuard` 执行 `request.user = user` ← **这里！**

**关键代码位置**：
- `node_modules/@nestjs/passport/dist/auth.guard.js` 第 45 行：`request[options.property || 'user'] = user;`

**注意**：
- 在 NestJS 中，由于 `AuthGuard` 提供了 `callback`，`strategy.success()` 会直接调用 `callback`，不会调用 `req.logIn()`
- 但 `AuthGuard` 会手动设置 `request.user = user`，确保一致性

### 核心要点

1. **validate() 的调用**：由 `PassportStrategy` 包装的 callback 调用，这个 callback 被传递给 `passport-jwt` 作为 verify 回调
2. **request.user 的设置**：由 NestJS 的 `AuthGuard` 在 `canActivate()` 方法中手动设置
3. **数据流向**：`validate()` 返回值 → `done(null, user)` → `strategy.success(user)` → `callback(null, user)` → `AuthGuard` → `request.user = user`

**关键点**：这是 Passport 框架的标准流程，`validate()` 的返回值会自动成为 `request.user`，但具体的设置位置在 NestJS 的 `AuthGuard` 中。

