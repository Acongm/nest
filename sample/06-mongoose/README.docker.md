# Docker 快速使用指南

## 快速开始

### 1. 构建并启动（生产环境）

```bash
docker-compose up --build
```

### 2. 开发环境

```bash
docker-compose -f docker-compose.dev.yml up --build
```

### 3. 后台运行

```bash
docker-compose up -d --build
```

### 4. 查看日志

```bash
docker-compose logs -f app
```

### 5. 停止服务

```bash
docker-compose down
```

## 关键配置

### 跳过 Puppeteer Chromium 下载

Dockerfile 中已配置：

```dockerfile
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### 使用系统 Chromium

Dockerfile 中已安装：

```dockerfile
RUN apk add --no-cache chromium ...
```

## 加速 npm 安装（可选）

如果需要加速 npm 安装，可以在 Dockerfile 中取消注释：

```dockerfile
RUN npm config set registry https://registry.npmmirror.com
```

## 验证

访问 http://localhost:3000 查看应用是否正常运行。

## 更多信息

查看 [docs/docker-setup-guide.md](./docs/docker-setup-guide.md) 获取详细说明。

