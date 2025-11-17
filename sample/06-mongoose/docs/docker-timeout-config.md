# Docker 超时配置说明

## 问题说明

Docker 在拉取镜像时，如果 30 秒内无法连接到 Docker Hub，就会报 `DeadlineExceeded` 错误。这是 Docker 客户端的默认超时时间。

## 超时时间设置位置

### 1. Docker 客户端超时（30秒）

**位置**：Docker 客户端内部设置（无法直接修改）

这是 Docker 客户端在尝试连接 Docker Hub 时的默认超时时间，约为 30 秒。这个超时时间在 Docker 源码中硬编码，无法通过配置文件直接修改。

### 2. Docker BuildKit 超时

如果使用 BuildKit，可以通过环境变量设置：

```bash
# 设置构建超时为 5 分钟
export BUILDKIT_STEP_LOG_MAX_SIZE=50000000
export BUILDKIT_STEP_LOG_MAX_SPEED=100000000
```

但这主要影响构建过程的超时，不影响镜像拉取的超时。

## 解决方案

### 方案一：配置镜像加速器（推荐）⭐

这是最根本的解决方案。配置镜像加速器后，Docker 会从国内镜像源拉取镜像，速度更快，不会超时。

#### 1. 通过 Docker Desktop 配置

1. 打开 Docker Desktop
2. 进入 `Settings` -> `Docker Engine`
3. 添加以下配置：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

4. 点击 `Apply & Restart`

#### 2. 手动编辑配置文件

```bash
# 编辑配置文件
nano ~/.docker/daemon.json
```

添加：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

然后重启 Docker Desktop。

### 方案二：使用国内镜像源（修改 Dockerfile）

直接修改 Dockerfile，使用国内镜像源，避免连接 Docker Hub：

**修改 `Dockerfile.dev` 和 `Dockerfile`**：

```dockerfile
# 使用中科大镜像源
FROM docker.mirrors.ustc.edu.cn/library/node:20-alpine

# 或者使用阿里云镜像源
# FROM registry.cn-hangzhou.aliyuncs.com/acs/node:20-alpine
```

### 方案三：使用环境变量（部分有效）

虽然无法直接修改客户端超时，但可以通过环境变量影响某些行为：

```bash
# 设置 Docker 客户端超时（部分版本支持）
export DOCKER_CLIENT_TIMEOUT=120

# 使用 BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

### 方案四：使用代理

如果有代理，可以配置 Docker 使用代理：

1. 打开 Docker Desktop
2. 进入 `Settings` -> `Resources` -> `Proxies`
3. 配置 HTTP/HTTPS 代理

或者在 `~/.docker/config.json` 中配置：

```json
{
  "proxies": {
    "default": {
      "httpProxy": "http://proxy.example.com:8080",
      "httpsProxy": "http://proxy.example.com:8080",
      "noProxy": "localhost,127.0.0.1"
    }
  }
}
```

## 验证配置

配置完成后，验证：

```bash
# 查看镜像加速配置
docker info | grep -A 5 "Registry Mirrors"

# 测试拉取镜像
docker pull node:20-alpine
```

## 为什么是 30 秒？

30 秒是 Docker 客户端在尝试连接远程仓库时的默认超时时间。这个时间包括：

1. DNS 解析时间
2. TCP 连接建立时间
3. TLS 握手时间
4. 认证请求时间

如果网络不稳定或无法访问 Docker Hub，这些步骤可能会超过 30 秒，导致超时。

## 推荐方案

**最佳实践**：配置镜像加速器 + 使用国内镜像源

1. **配置镜像加速器**：让 Docker 自动使用国内镜像
2. **修改 Dockerfile**：直接使用国内镜像源，双重保障

这样即使镜像加速器配置失效，Dockerfile 中的镜像源也能正常工作。

## 快速修复

如果现在就需要立即解决问题，最快的方法是：

1. **修改 Dockerfile.dev**：
   ```dockerfile
   FROM docker.mirrors.ustc.edu.cn/library/node:20-alpine
   ```

2. **修改 Dockerfile**：
   ```dockerfile
   FROM docker.mirrors.ustc.edu.cn/library/node:20-alpine
   ```

3. **重新构建**：
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

这样就不需要连接 Docker Hub，直接从国内镜像源拉取，速度更快，不会超时。

