# Docker 镜像加速配置（Mac）

## 问题

如果遇到以下错误：
```
failed to solve: DeadlineExceeded: failed to fetch anonymous token: Get "https://auth.docker.io/token": dial tcp: i/o timeout
```

这通常是因为无法访问 Docker Hub，需要配置镜像加速器。

## 解决方案

### 方法一：通过 Docker Desktop 配置（推荐）

1. **打开 Docker Desktop**
   - 点击菜单栏的 Docker 图标
   - 选择 `Settings`（设置）或 `Preferences`（首选项）

2. **进入 Docker Engine 设置**
   - 在左侧菜单选择 `Docker Engine`

3. **添加镜像加速配置**
   - 在 JSON 配置中添加以下内容：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "insecure-registries": [],
  "experimental": false
}
```

4. **应用并重启**
   - 点击 `Apply & Restart` 按钮
   - 等待 Docker 重启完成

### 方法二：手动编辑配置文件

1. **创建或编辑配置文件**

```bash
# 创建配置目录（如果不存在）
mkdir -p ~/.docker

# 编辑配置文件
nano ~/.docker/daemon.json
```

2. **添加以下内容**

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

3. **重启 Docker Desktop**
   - 完全退出 Docker Desktop
   - 重新启动 Docker Desktop

### 方法三：使用国内镜像源（修改 Dockerfile）

如果上述方法不行，可以直接在 Dockerfile 中使用国内镜像源：

**修改 Dockerfile.dev 和 Dockerfile**：

```dockerfile
# 使用阿里云镜像源
FROM registry.cn-hangzhou.aliyuncs.com/acs/node:20-alpine

# 或者使用其他国内镜像
# FROM docker.mirrors.ustc.edu.cn/library/node:20-alpine
```

## 验证配置

配置完成后，验证是否生效：

```bash
# 查看 Docker 配置
docker info | grep -A 10 "Registry Mirrors"

# 或者
docker info | grep -i mirror
```

应该能看到配置的镜像地址。

## 常用国内镜像源

### 1. 中科大镜像
```
https://docker.mirrors.ustc.edu.cn
```

### 2. 网易镜像
```
https://hub-mirror.c.163.com
```

### 3. 百度云镜像
```
https://mirror.baidubce.com
```

### 4. 阿里云镜像（需要登录获取专属地址）
- 访问：https://cr.console.aliyun.com/cn-hangzhou/instances/mirrors
- 登录后获取专属加速地址

### 5. Docker 中国官方镜像
```
https://registry.docker-cn.com
```

## 测试拉取镜像

配置完成后，测试拉取镜像：

```bash
# 测试拉取 Node.js 镜像
docker pull node:20-alpine

# 如果成功，应该能看到下载进度
```

## 如果仍然超时

### 1. 检查网络连接

```bash
# 测试网络连接
ping docker.mirrors.ustc.edu.cn

# 测试 HTTPS 连接
curl -I https://docker.mirrors.ustc.edu.cn
```

### 2. 尝试使用代理

如果有代理，可以在 Docker Desktop 中配置：

1. 打开 Docker Desktop Settings
2. 选择 `Resources` -> `Proxies`
3. 配置 HTTP/HTTPS 代理

### 3. 使用 VPN

如果网络环境限制，可能需要使用 VPN。

### 4. 手动下载镜像

如果网络问题持续，可以：

1. 在有网络的环境下载镜像
2. 导出镜像：
   ```bash
   docker save node:20-alpine -o node-20-alpine.tar
   ```
3. 在目标机器导入：
   ```bash
   docker load -i node-20-alpine.tar
   ```

## 完整配置示例

完整的 `~/.docker/daemon.json` 配置：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "insecure-registries": [],
  "experimental": false,
  "debug": false,
  "data-root": "",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

## 重新尝试构建

配置完成后，重新运行：

```bash
# 清理之前的构建缓存
docker system prune -a

# 重新构建
docker-compose -f docker-compose.dev.yml up --build
```

## 注意事项

1. **多个镜像源**：可以配置多个镜像源，Docker 会按顺序尝试
2. **重启生效**：修改配置后必须重启 Docker Desktop
3. **网络环境**：不同网络环境可能需要不同的镜像源
4. **安全性**：使用官方或可信的镜像源

## 参考链接

- [Docker 官方文档 - 配置镜像加速](https://docs.docker.com/config/daemon/registry-mirrors/)
- [中科大镜像站](https://mirrors.ustc.edu.cn/help/dockerhub.html)
- [阿里云容器镜像服务](https://cr.console.aliyun.com/)

