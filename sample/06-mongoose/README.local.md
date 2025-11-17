# 本地运行指南

本文档说明如何在本地运行项目，提供两种方式：Docker 方式和直接运行方式。

## 方式一：使用 Docker 运行（推荐）

### 前置要求
- 安装 Docker 和 Docker Compose

### 快速开始

#### 1. 启动所有服务（MongoDB + 应用）

```bash
# 开发环境（支持热重载）
docker-compose -f docker-compose.dev.yml up --build

# 生产环境
docker-compose up --build
```

#### 2. 后台运行

```bash
docker-compose up -d --build
```

#### 3. 查看日志

```bash
# 查看应用日志
docker-compose logs -f app

# 查看所有日志
docker-compose logs -f
```

#### 4. 停止服务

```bash
docker-compose down
```

#### 5. 只启动 MongoDB（如果只想用 Docker 运行数据库）

```bash
# 启动 MongoDB
docker-compose up -d mongodb

# 停止 MongoDB
docker-compose stop mongodb
```

### 访问应用

- 应用地址：http://localhost:3000
- API 地址：http://localhost:3000/api
- MongoDB：localhost:27017

---

## 方式二：直接在本地运行

### 前置要求

1. **Node.js**：v18+ （推荐 v20）
2. **MongoDB**：本地安装或使用 Docker 运行
3. **Chrome/Chromium**：用于 Puppeteer（可选，代码会自动检测）

### 步骤 1：安装依赖

```bash
# 安装所有依赖
npm install

# 如果 Puppeteer 下载 Chromium 很慢，可以设置环境变量跳过
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install
```

**注意**：如果设置了 `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`，需要确保系统已安装 Chrome/Chromium。

### 步骤 2：启动 MongoDB

#### 选项 A：使用 Docker 运行 MongoDB（推荐）

```bash
# 只启动 MongoDB
docker-compose up -d mongodb
```

#### 选项 B：本地安装的 MongoDB

```bash
# macOS (使用 Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
# 在服务管理器中启动 MongoDB 服务
```

### 步骤 3：配置环境变量

创建 `.env` 文件（可选，也可以直接使用环境变量）：

```bash
# .env
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/test
JWT_SECRET=your-secret-key-change-in-production
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
```

或者在命令行中设置：

```bash
# macOS/Linux
export MONGODB_URI=mongodb://localhost:27017/test
export JWT_SECRET=your-secret-key-change-in-production

# Windows (PowerShell)
$env:MONGODB_URI="mongodb://localhost:27017/test"
$env:JWT_SECRET="your-secret-key-change-in-production"
```

### 步骤 4：创建必要的目录

```bash
# 创建上传目录
mkdir -p public/uploads

# 创建日志目录
mkdir -p logs
```

### 步骤 5：运行应用

```bash
# 开发模式（支持热重载）
npm run start:dev

# 生产模式（需要先构建）
npm run build
npm run start:prod

# 调试模式
npm run start:debug
```

### 访问应用

- 应用地址：http://localhost:3000
- API 地址：http://localhost:3000/api
- 登录页面：http://localhost:3000/login
- 注册页面：http://localhost:3000/register

---

## 常见问题

### 1. Puppeteer 下载 Chromium 很慢

**解决方案**：

```bash
# 设置环境变量跳过下载
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install
```

代码会自动检测系统已安装的 Chrome/Chromium。

**macOS**：
```bash
# 安装 Chrome（如果未安装）
brew install --cask google-chrome
```

**Linux**：
```bash
# Ubuntu/Debian
sudo apt-get install chromium-browser

# CentOS/RHEL
sudo yum install chromium
```

### 2. MongoDB 连接失败

**检查**：
- MongoDB 是否正在运行
- 连接字符串是否正确（默认：`mongodb://localhost:27017/test`）

**使用 Docker 运行 MongoDB**：
```bash
docker-compose up -d mongodb
```

### 3. 端口被占用

**检查端口占用**：

```bash
# macOS/Linux
lsof -i :3000
lsof -i :27017

# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :27017
```

**修改端口**：

在 `src/main.ts` 中修改：
```typescript
await app.listen(3000); // 改为其他端口，如 3001
```

### 4. 依赖安装失败

**使用国内镜像源**：

```bash
# 设置 npm 镜像源
npm config set registry https://registry.npmmirror.com

# 或者使用 cnpm
npm install -g cnpm --registry=https://registry.npmmirror.com
cnpm install
```

### 5. 权限问题（Linux）

如果遇到权限问题：

```bash
# 给上传目录添加写权限
chmod -R 755 public/uploads
chmod -R 755 logs
```

---

## 开发工作流

### 1. 首次运行

```bash
# 1. 安装依赖
npm install

# 2. 启动 MongoDB（使用 Docker）
docker-compose up -d mongodb

# 3. 启动应用（开发模式）
npm run start:dev
```

### 2. 日常开发

```bash
# 启动应用（自动监听文件变化）
npm run start:dev
```

### 3. 测试 API

使用 Postman 或 curl：

```bash
# 注册用户
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test",
    "password": "123456",
    "userId": "user1",
    "tenantId": "tenant1",
    "companyId": "company1"
  }'

# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test",
    "password": "123456"
  }' \
  -c cookies.txt

# 使用 cookie 访问受保护的接口
curl -X GET http://localhost:3000/api/cats \
  -b cookies.txt
```

---

## 项目结构

```
.
├── src/                    # 源代码
│   ├── auth/              # 认证模块
│   ├── cats/              # 示例模块
│   ├── report-export/     # 报表导出模块
│   ├── scheduled-task/    # 定时任务模块
│   └── main.ts            # 入口文件
├── public/                # 前端静态文件
│   ├── index.html
│   ├── login.html
│   └── register.html
├── logs/                  # 日志文件
├── docker-compose.yml     # Docker Compose 配置（生产）
├── docker-compose.dev.yml # Docker Compose 配置（开发）
└── package.json           # 项目配置
```

---

## 推荐方式

- **开发环境**：使用 Docker 运行 MongoDB + 本地运行应用（`npm run start:dev`）
- **生产环境**：使用 Docker Compose 运行所有服务
- **快速测试**：使用 Docker Compose 一键启动

---

## 更多信息

- [Docker 配置指南](./docs/docker-setup-guide.md)
- [Docker 快速使用](./README.docker.md)

