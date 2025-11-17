# 修复 Docker 连接问题

## 当前状态

✅ 镜像加速器已配置
✅ Docker 正在运行
❌ 仍然无法拉取镜像（connection refused）

## 可能的原因

1. **镜像加速器配置未完全生效** - 需要完全重启 Docker Desktop
2. **网络环境限制** - 防火墙或网络策略阻止连接
3. **DNS 问题** - 虽然能解析，但连接被拒绝

## 解决方案

### 方案一：完全重启 Docker Desktop（推荐）

1. **完全退出 Docker Desktop**
   - 点击菜单栏 Docker 图标
   - 选择 `Quit Docker Desktop`
   - 等待完全退出（菜单栏图标消失）

2. **重新启动 Docker Desktop**
   - 从应用程序启动 Docker Desktop
   - 等待完全启动（菜单栏图标不再显示启动中）

3. **验证配置**
   ```bash
   docker info | grep -A 5 "Registry Mirrors"
   ```

4. **测试拉取镜像**
   ```bash
   docker pull node:20-alpine
   ```

### 方案二：清理 Docker 缓存并重试

```bash
# 清理构建缓存
docker builder prune -a -f

# 清理未使用的镜像
docker image prune -a -f

# 重新尝试
docker-compose -f docker-compose.dev.yml up --build
```

### 方案三：使用代理（如果有）

如果网络环境需要代理：

1. **打开 Docker Desktop**
   - `Settings` -> `Resources` -> `Proxies`

2. **配置代理**
   ```
   Manual proxy configuration
   HTTP Proxy: http://127.0.0.1:7890
   HTTPS Proxy: http://127.0.0.1:7890
   ```

3. **应用并重启 Docker Desktop**

### 方案四：手动拉取镜像

如果上述方法都不行，可以尝试：

1. **使用其他网络环境拉取镜像**
   - 使用手机热点
   - 使用 VPN
   - 使用其他网络

2. **或者使用已有的镜像**
   ```bash
   # 查看本地已有的镜像
   docker images | grep node
   
   # 如果有 node 镜像，可以修改 Dockerfile 使用特定版本
   ```

### 方案五：检查网络连接

```bash
# 测试 Docker Hub 连接
curl -v https://auth.docker.io

# 测试镜像加速器连接
curl -v https://docker.mirrors.ustc.edu.cn
curl -v https://hub-mirror.c.163.com
```

## 快速测试

运行以下命令测试：

```bash
# 1. 检查 Docker 配置
./check-docker-config.sh

# 2. 测试拉取镜像
docker pull node:20-alpine

# 3. 如果成功，重新构建
docker-compose -f docker-compose.dev.yml up --build
```

## 如果仍然失败

如果所有方法都失败，可能需要：

1. **联系网络管理员** - 检查防火墙设置
2. **使用 VPN** - 绕过网络限制
3. **使用其他网络** - 切换到可访问 Docker Hub 的网络

## 临时解决方案

如果急需使用，可以：

1. **使用本地已有的 Node.js 镜像**
   ```bash
   # 查看本地镜像
   docker images
   
   # 如果有其他版本的 node 镜像，可以临时使用
   ```

2. **或者先拉取基础镜像**
   ```bash
   # 尝试在不同网络环境下先拉取
   docker pull node:20-alpine
   ```

