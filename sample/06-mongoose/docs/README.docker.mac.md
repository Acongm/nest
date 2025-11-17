# Mac 本地 Docker Compose 启动指南

## 前置要求

### 1. 安装 Docker Desktop for Mac

如果还没有安装 Docker，请先安装：

1. 访问 [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
2. 下载并安装 Docker Desktop
3. 启动 Docker Desktop 应用
4. 确保 Docker 正在运行（菜单栏应该显示 Docker 图标）

### 2. 验证 Docker 安装

打开终端，运行以下命令验证：

```bash
docker --version
docker-compose --version
```

应该能看到版本号，例如：
```
Docker version 24.0.0
docker-compose version 1.29.2
```

## 快速启动

### 方式一：开发环境（推荐用于开发）

开发环境支持热重载，代码修改后自动重启：

```bash
# 构建并启动服务（前台运行，可以看到日志）
docker-compose -f docker-compose.dev.yml up --build

# 或者后台运行
docker-compose -f docker-compose.dev.yml up -d --build
```

**特点**：
- 代码修改后自动重启
- 代码挂载到容器，修改即时生效
- 适合开发调试

### 方式二：生产环境

生产环境构建优化后的镜像：

```bash
# 构建并启动服务（前台运行）
docker-compose up --build

# 或者后台运行
docker-compose up -d --build
```

**特点**：
- 优化后的生产构建
- 代码打包到镜像中
- 适合生产部署

## 常用命令

### 查看服务状态

```bash
# 查看运行中的容器
docker-compose ps

# 查看所有容器（包括停止的）
docker-compose ps -a
```

### 查看日志

```bash
# 查看应用日志（实时）
docker-compose logs -f app

# 查看 MongoDB 日志
docker-compose logs -f mongodb

# 查看所有服务日志
docker-compose logs -f

# 查看最近 100 行日志
docker-compose logs --tail=100 app
```

### 停止服务

```bash
# 停止服务（保留容器）
docker-compose stop

# 停止并删除容器（保留数据卷）
docker-compose down

# 停止并删除容器和数据卷（⚠️ 会删除 MongoDB 数据）
docker-compose down -v
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart app
```

### 进入容器

```bash
# 进入应用容器
docker-compose exec app sh

# 进入 MongoDB 容器
docker-compose exec mongodb sh

# 在容器中执行命令
docker-compose exec app npm run build
```

## 服务访问

启动成功后，可以通过以下地址访问：

- **应用服务**: http://localhost:3000
- **API 接口**: http://localhost:3000/api
- **MongoDB**: localhost:27017

## 环境变量配置

如果需要修改环境变量，可以：

### 方式一：修改 docker-compose.yml

编辑 `docker-compose.yml` 或 `docker-compose.dev.yml` 中的 `environment` 部分：

```yaml
environment:
  - NODE_ENV=development
  - MONGODB_URI=mongodb://mongodb:27017/test
  - JWT_SECRET=your-secret-key-change-in-production
```

### 方式二：使用 .env 文件

创建 `.env` 文件（项目根目录）：

```env
NODE_ENV=development
MONGODB_URI=mongodb://mongodb:27017/test
JWT_SECRET=your-secret-key-change-in-production
```

然后在 `docker-compose.yml` 中引用：

```yaml
environment:
  - NODE_ENV=${NODE_ENV}
  - MONGODB_URI=${MONGODB_URI}
  - JWT_SECRET=${JWT_SECRET}
```

## 数据持久化

### MongoDB 数据

MongoDB 数据存储在 Docker 数据卷中，即使删除容器，数据也会保留。

查看数据卷：
```bash
docker volume ls
```

查看数据卷详情：
```bash
docker volume inspect 06-mongoose_mongodb_data
```

### 应用数据

应用的上传文件和日志会挂载到本地目录：

- `./public/uploads` - 上传的文件
- `./logs` - 应用日志

## 常见问题

### 1. 端口被占用

如果 3000 或 27017 端口被占用，可以修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "3001:3000"  # 将本地 3001 端口映射到容器的 3000 端口
```

### 2. 权限问题

如果遇到权限问题，可以尝试：

```bash
# 给目录添加写权限
chmod -R 755 ./public/uploads
chmod -R 755 ./logs
```

### 3. 清理 Docker 资源

如果遇到问题，可以清理 Docker 资源：

```bash
# 停止并删除所有容器
docker-compose down

# 删除未使用的镜像
docker image prune

# 删除未使用的数据卷（⚠️ 会删除数据）
docker volume prune
```

### 4. 重新构建镜像

如果修改了 Dockerfile 或依赖，需要重新构建：

```bash
# 强制重新构建（不使用缓存）
docker-compose build --no-cache

# 然后启动
docker-compose up
```

### 5. 查看容器资源使用情况

```bash
# 查看容器资源使用
docker stats

# 查看特定容器
docker stats nestjs-app-dev
```

## 开发工作流

### 推荐开发流程

1. **启动开发环境**：
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. **查看日志**：
   ```bash
   docker-compose -f docker-compose.dev.yml logs -f app
   ```

3. **修改代码**：
   - 直接在本地编辑代码
   - 开发环境会自动检测变化并重启

4. **测试 API**：
   - 访问 http://localhost:3000/api
   - 使用 Postman 或 curl 测试接口

5. **停止服务**：
   ```bash
   docker-compose -f docker-compose.dev.yml down
   ```

## 性能优化

### 1. 使用 Docker BuildKit

启用 BuildKit 可以加速构建：

```bash
export DOCKER_BUILDKIT=1
docker-compose build
```

### 2. 使用多阶段构建缓存

Dockerfile 已经使用了多阶段构建，可以充分利用缓存。

### 3. 限制资源使用

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## 验证安装

启动后，可以通过以下方式验证：

1. **检查容器状态**：
   ```bash
   docker-compose ps
   ```
   应该看到 `app` 和 `mongodb` 两个容器都在运行。

2. **检查应用日志**：
   ```bash
   docker-compose logs app | grep "应用启动成功"
   ```

3. **访问应用**：
   打开浏览器访问 http://localhost:3000

4. **测试 API**：
   ```bash
   curl http://localhost:3000/api
   ```

## 下一步

- 查看 [README.docker.md](./README.docker.md) 了解更多 Docker 使用信息
- 查看 [README.local.md](./README.local.md) 了解本地非 Docker 运行方式
- 查看项目文档了解更多功能

