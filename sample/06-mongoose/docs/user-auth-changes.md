# 用户认证系统调整说明

## 概述

本次调整对用户表结构和登录/注册逻辑进行了重大改进：

1. **用户ID调整**：移除独立的 `userId` 字段，使用 MongoDB 的 `_id` 作为用户唯一标识
2. **权限系统**：新增 `roles` 字段，支持角色权限管理
3. **登录方式**：支持管理员和普通用户两种不同的登录方式

## 数据库结构变更

### User Schema 变更

**移除字段：**
- `userId` - 不再单独存储，使用 `_id` 作为用户ID

**新增字段：**
- `roles: UserRole[]` - 用户角色列表，默认值为 `['user']`

**角色枚举：**
```typescript
enum UserRole {
  ADMIN = 'admin', // 管理员
  USER = 'user',   // 普通用户
}
```

## 注册接口变更

### 请求格式

**接口：** `POST /api/auth/register`

**请求体：**
```json
{
  "username": "testuser",
  "password": "password123",
  "tenantId": "tenant-123",
  "companyId": "company-123",
  "roles": ["user"],  // 可选，默认为 ["user"]
  "email": "test@example.com",  // 可选
  "phone": "13800138000",  // 可选
  "realName": "测试用户"  // 可选
}
```

**变更说明：**
- ❌ 移除了 `userId` 字段（注册后自动使用 `_id` 作为 `userId`）
- ✅ 新增了 `roles` 字段（可选，默认为 `["user"]`）
- ✅ 用户名在同一租户下必须唯一

**响应示例：**
```json
{
  "message": "注册成功",
  "user": {
    "id": "507f1f77bcf86cd799439011",  // MongoDB _id
    "userId": "507f1f77bcf86cd799439011",  // 与 _id 相同
    "username": "testuser",
    "tenantId": "tenant-123",
    "companyId": "company-123",
    "roles": ["user"],
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## 登录接口变更

### 管理员登录（保持现状）

**接口：** `POST /api/auth/login`

**请求体：**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**说明：**
- 只需要 `username` 和 `password`
- 系统会自动查找具有 `admin` 角色的用户
- 如果用户不是管理员，会提示需要提供 `userId` 和 `tenantId`

### 普通用户登录（新增）

**接口：** `POST /api/auth/login`

**请求体：**
```json
{
  "username": "testuser",
  "password": "password123",
  "userId": "507f1f77bcf86cd799439011",  // MongoDB _id
  "tenantId": "tenant-123"
}
```

**说明：**
- 需要提供 `username`、`password`、`userId`（即 `_id`）和 `tenantId`
- 系统会验证：
  1. `userId` 是否存在
  2. `username` 是否匹配
  3. `tenantId` 是否匹配
  4. `password` 是否正确

## JWT Token 变更

### JWT Payload 结构

```typescript
{
  userId: string;      // MongoDB _id（作为用户ID）
  tenantId: string;
  companyId: string;
  username: string;
  roles: string[];     // 新增：用户角色列表
  sub: string;         // MongoDB _id
}
```

### 获取当前用户信息

**接口：** `GET /api/auth/me`

**响应示例：**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "tenantId": "tenant-123",
  "companyId": "company-123",
  "username": "testuser",
  "roles": ["user"]
}
```

## 代码使用示例

### 注册新用户

```typescript
// 普通用户注册
const response = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'testuser',
    password: 'password123',
    tenantId: 'tenant-123',
    companyId: 'company-123',
  }),
});

const { user } = await response.json();
console.log('用户ID:', user.userId); // 即 MongoDB _id
```

### 管理员登录

```typescript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123',
  }),
});
```

### 普通用户登录

```typescript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'testuser',
    password: 'password123',
    userId: '507f1f77bcf86cd799439011', // 注册时返回的 userId
    tenantId: 'tenant-123',
  }),
});
```

### 在 Controller 中使用用户信息

```typescript
@Get('example')
@UseGuards(JwtAuthGuard)
async example(@Req() req: Request) {
  if (!isCurrentUserData(req.user)) {
    throw new Error('用户未认证');
  }
  
  const userId = req.user.userId;      // MongoDB _id
  const tenantId = req.user.tenantId;
  const roles = req.user.roles || []; // 用户角色
  
  // 检查是否为管理员
  if (roles.includes('admin')) {
    // 管理员逻辑
  }
}
```

## 迁移指南

### 对于现有数据

如果数据库中有现有用户数据，需要进行数据迁移：

1. **保留现有 userId**：可以将现有的 `userId` 值迁移到 MongoDB 的自定义 `_id`（需要重新创建文档）
2. **添加默认角色**：为所有现有用户添加 `roles: ['user']`
3. **更新登录逻辑**：普通用户需要使用新的登录方式

### 迁移脚本示例

```javascript
// MongoDB 迁移脚本
db.users.find().forEach(function(user) {
  // 为现有用户添加默认角色
  db.users.updateOne(
    { _id: user._id },
    { $set: { roles: ['user'] } }
  );
  
  // 如果需要保留 userId，可以创建一个映射表
  // 或者将 userId 迁移到 _id（需要重新创建文档）
});
```

## 注意事项

1. **用户ID唯一性**：现在使用 MongoDB 的 `_id` 作为用户唯一标识，确保全局唯一
2. **租户隔离**：用户名在同一租户下必须唯一，不同租户可以有相同的用户名
3. **角色管理**：只有管理员可以创建管理员账户（需要在业务逻辑中实现）
4. **向后兼容**：现有代码中使用 `req.user.userId` 的地方仍然有效，因为 JWT 中已经包含了 `userId`（即 `_id`）

## 安全建议

1. **管理员账户**：建议限制管理员账户的创建，只有超级管理员可以创建新的管理员
2. **角色验证**：在需要管理员权限的接口中，验证用户角色：
   ```typescript
   if (!req.user.roles?.includes('admin')) {
     throw new ForbiddenException('需要管理员权限');
   }
   ```
3. **租户隔离**：确保普通用户只能访问自己租户的数据

