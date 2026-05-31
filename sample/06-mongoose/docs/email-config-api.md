# 邮件配置校验接口文档

## 概述

邮件配置校验接口提供了获取和校验邮件配置的功能。支持两种配置来源：
1. **第三方接口**：通过 HTTP/HTTPS 接口获取邮件配置
2. **环境变量**：从本地环境变量读取邮件配置

## 环境变量配置

### 基础邮件配置（环境变量）

```env
# SMTP 服务器配置
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@163.com
SMTP_PASS=your-password
SMTP_FROM=your-email@163.com
```

### 第三方接口配置（可选）

如果需要从第三方接口获取邮件配置，需要配置以下环境变量：

```env
# 第三方邮件配置接口 URL（可选）
# 如果配置了此变量，系统会优先从此接口获取配置
# 接口应返回 JSON 格式的邮件配置，例如：
# {
#   "host": "smtp.163.com",
#   "port": 465,
#   "secure": true,
#   "user": "your-email@163.com",
#   "pass": "your-password",
#   "from": "your-email@163.com"
# }
EMAIL_CONFIG_API_URL=https://your-api.com/api/email-config
```

## API 接口

### 1. 获取邮件配置

**接口地址：** `GET /api/email-config`

**说明：** 获取当前邮件配置（优先从第三方接口获取，失败则从环境变量获取）

**响应示例：**

```json
{
  "config": {
    "host": "smtp.163.com",
    "port": 465,
    "secure": true,
    "user": "your-email@163.com",
    "pass": "***",
    "from": "your-email@163.com"
  },
  "source": "third-party"  // 或 "environment"
}
```

### 2. 校验邮件配置

**接口地址：** `POST /api/email-config/validate`

**说明：** 校验邮件配置的有效性。可以通过实际连接 SMTP 服务器来验证配置是否正确。

**请求体（可选）：**

如果不提供请求体，将使用当前配置（从第三方接口或环境变量获取）进行校验。

```json
{
  "host": "smtp.163.com",
  "port": 465,
  "secure": true,
  "user": "your-email@163.com",
  "pass": "your-password",
  "from": "your-email@163.com"
}
```

**响应示例（成功）：**

```json
{
  "valid": true,
  "message": "邮件配置校验成功",
  "config": {
    "host": "smtp.163.com",
    "port": 465,
    "secure": true,
    "user": "your-email@163.com",
    "pass": "***",
    "from": "your-email@163.com"
  }
}
```

**响应示例（失败）：**

```json
{
  "valid": false,
  "message": "邮件配置校验失败",
  "error": "SMTP 认证失败，请检查 SMTP_USER 和 SMTP_PASS 配置是否正确"
}
```

## 使用示例

### 使用 curl 获取配置

```bash
curl -X GET http://localhost:3000/api/email-config
```

### 使用 curl 校验配置（使用当前配置）

```bash
curl -X POST http://localhost:3000/api/email-config/validate
```

### 使用 curl 校验自定义配置

```bash
curl -X POST http://localhost:3000/api/email-config/validate \
  -H "Content-Type: application/json" \
  -d '{
    "host": "smtp.163.com",
    "port": 465,
    "secure": true,
    "user": "your-email@163.com",
    "pass": "your-password"
  }'
```

### 使用 JavaScript/TypeScript

```typescript
// 获取配置
const response = await fetch('http://localhost:3000/api/email-config');
const data = await response.json();
console.log('配置来源:', data.source);
console.log('邮件配置:', data.config);

// 校验配置（使用当前配置）
const validateResponse = await fetch('http://localhost:3000/api/email-config/validate', {
  method: 'POST',
});
const validateResult = await validateResponse.json();
console.log('校验结果:', validateResult.valid ? '成功' : '失败');

// 校验自定义配置
const customValidateResponse = await fetch('http://localhost:3000/api/email-config/validate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    host: 'smtp.163.com',
    port: 465,
    secure: true,
    user: 'your-email@163.com',
    pass: 'your-password',
  }),
});
const customValidateResult = await customValidateResponse.json();
console.log('自定义配置校验结果:', customValidateResult.valid ? '成功' : '失败');
```

## 第三方接口要求

如果使用第三方接口获取邮件配置，接口需要满足以下要求：

1. **HTTP 方法：** GET 或 POST
2. **响应格式：** JSON
3. **响应状态码：** 200-299
4. **响应数据结构：**

```json
{
  "host": "smtp.163.com",
  "port": 465,
  "secure": true,
  "user": "your-email@163.com",
  "pass": "your-password",
  "from": "your-email@163.com"
}
```

5. **必需字段：** `host`, `port`, `user`, `pass`
6. **可选字段：** `secure`（如果不提供，会根据端口自动判断：465 端口默认为 true），`from`

## 错误处理

### 常见错误信息

- **"无法连接到 SMTP 服务器"**：检查 `SMTP_HOST` 和 `SMTP_PORT` 配置，以及网络连接
- **"SMTP 认证失败"**：检查 `SMTP_USER` 和 `SMTP_PASS` 配置
- **"SSL/TLS 配置可能有问题"**：检查 `SMTP_SECURE` 和端口配置（465 端口需要 `secure=true`）
- **"连接超时"**：检查 SMTP 服务器地址和端口是否正确

## 安全注意事项

1. **密码保护：** 所有接口响应中的密码字段都会被替换为 `***`，不会返回真实密码
2. **HTTPS 推荐：** 如果使用第三方接口，强烈建议使用 HTTPS 协议
3. **环境变量安全：** 确保 `.env` 文件不被提交到版本控制系统
4. **认证：** 建议为这些接口添加认证机制（如 JWT），防止未授权访问

