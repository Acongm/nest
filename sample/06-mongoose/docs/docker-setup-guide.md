# Docker 配置指南

本文档说明如何使用 Docker 来加速 Puppeteer 依赖下载和运行应用。

## 问题说明

Puppeteer 在安装时会自动下载 Chromium 浏览器，这个过程可能很慢，特别是在网络不好的情况下。

## 解决方案

我们使用 Docker 镜像中预装的 Chromium，避免 Puppeteer 下载 Chromium。

### 方案优势

1. **加速安装**：跳过 Chromium 下载，npm install 速度大幅提升
2. **环境一致**：Docker 环境统一，避免本地环境差异
3. **易于部署**：一键启动，包含 MongoDB 和应用服务

## 文件说明

### 1. Dockerfile（生产环境）

用于构建生产环境的 Docker 镜像。

**特点**：
- 使用 `node:20-alpine` 基础镜像（体积小）
- 安装系统 Chromium，跳过 Puppeteer 下载
- 只安装生产依赖
- 构建并运行应用

### 2. Dockerfile.dev（开发环境）

用于开发环境的 Docker 镜像。

**特点**：
- 安装所有依赖（包括 devDependencies）
- 支持热重载（watch 模式）
- 适合本地开发

### 3. docker-compose.yml

包含两个服务：
- `mongodb`：MongoDB 数据库服务
- `app`：NestJS 应用服务

## 使用方法

### 方法 1：使用 Docker Compose（推荐）

#### 构建并启动所有服务

```bash
# 构建并启动（生产环境）
docker-compose up --build

# 后台运行
docker-compose up -d --build

# 查看日志
docker-compose logs -f app

# 停止服务
docker-compose down
```

#### 开发环境

如果需要使用开发模式，可以修改 `docker-compose.yml` 中的 `dockerfile` 为 `Dockerfile.dev`，或者创建 `docker-compose.dev.yml`：

```yaml
# docker-compose.dev.yml
version: "3"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    # ... 其他配置
```

然后使用：

```bash
docker-compose -f docker-compose.dev.yml up --build
```

### 方法 2：仅构建 Docker 镜像（用于本地开发）

如果你只想在本地使用 Docker 镜像来安装依赖，而不运行容器：

```bash
# 构建镜像（会安装依赖）
docker build -t nestjs-app:latest .

# 进入容器查看
docker run -it --rm nestjs-app:latest sh

# 或者直接使用镜像中的 node_modules
docker run -it --rm -v $(pwd)/node_modules:/app/node_modules nestjs-app:latest npm install
```

### 方法 3：使用国内镜像源加速

如果 Docker 镜像下载也很慢，可以配置国内镜像源。

#### 配置 Docker 镜像加速器

编辑 `/etc/docker/daemon.json`（Linux）或 Docker Desktop 设置（Mac/Windows）：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

#### 配置 npm 镜像源

在 `Dockerfile` 中取消注释以下行：

```dockerfile
RUN npm config set registry https://registry.npmmirror.com
```

或者在构建时传递构建参数：

```bash
docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t nestjs-app .
```

## 环境变量

### 应用环境变量

在 `docker-compose.yml` 中配置：

- `NODE_ENV`：运行环境（production/development）
- `MONGODB_URI`：MongoDB 连接字符串
- `JWT_SECRET`：JWT 密钥
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`：跳过 Chromium 下载
- `PUPPETEER_EXECUTABLE_PATH`：Chromium 可执行文件路径

### 使用 .env 文件

创建 `.env` 文件：

```env
NODE_ENV=production
MONGODB_URI=mongodb://mongodb:27017/test
JWT_SECRET=your-secret-key-change-in-production
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

然后在 `docker-compose.yml` 中使用：

```yaml
services:
  app:
    env_file:
      - .env
```

## 验证安装

### 1. 检查 Chromium 是否安装

进入容器：

```bash
docker exec -it nestjs-app sh
```

检查 Chromium：

```bash
which chromium-browser
chromium-browser --version
```

### 2. 检查 Puppeteer 配置

在容器中：

```bash
node -e "console.log(process.env.PUPPETEER_EXECUTABLE_PATH)"
```

### 3. 测试 PDF 导出

访问应用并测试 PDF 导出功能，确认 Puppeteer 正常工作。

## 常见问题

### 1. 构建时 npm install 仍然很慢

**解决方案**：
- 使用国内 npm 镜像源（在 Dockerfile 中取消注释相关行）
- 使用 `npm ci` 代替 `npm install`（已在 Dockerfile 中使用）
- 使用 `--ignore-scripts` 跳过某些包的安装脚本（已在 Dockerfile 中使用）

### 2. Chromium 找不到

**检查**：
- 确认 `PUPPETEER_EXECUTABLE_PATH` 环境变量设置正确
- 确认 Chromium 已安装在容器中：`docker exec -it nestjs-app which chromium-browser`

**解决方案**：
- 检查 `getChromeExecutablePath()` 函数是否支持 Docker 环境（已更新）

### 3. 权限问题

如果遇到权限问题，可以在 Dockerfile 中添加：

```dockerfile
RUN chmod +x /usr/bin/chromium-browser
```

### 4. 内存不足

Puppeteer 需要一定内存，如果容器内存不足，可以：

- 增加 Docker 内存限制
- 在 Puppeteer launch 选项中添加 `--disable-dev-shm-usage`（已在代码中）

## 性能优化

### 1. 多阶段构建

可以优化 Dockerfile 使用多阶段构建，减小最终镜像体积：

```dockerfile
# 构建阶段
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 运行阶段
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main"]
```

### 2. 使用 .dockerignore

已创建 `.dockerignore` 文件，排除不必要的文件，加快构建速度。

## 总结

使用 Docker 可以：
1. ✅ 跳过 Puppeteer 的 Chromium 下载，加速依赖安装
2. ✅ 统一开发和生产环境
3. ✅ 简化部署流程
4. ✅ 隔离依赖，避免污染本地环境

推荐使用 `docker-compose` 一键启动所有服务。

