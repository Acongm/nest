# Docker 镜像源故障排查

## 问题

如果遇到镜像源连接失败（EOF、超时等），可以尝试以下解决方案。

## 解决方案

### 方案一：尝试其他镜像源

如果某个镜像源不可用，可以尝试其他镜像源。修改 `Dockerfile.dev` 和 `Dockerfile` 中的 `FROM` 行：

#### 1. 网易镜像（推荐）

```dockerfile
FROM hub-mirror.c.163.com/library/node:20-alpine
```

#### 2. 中科大镜像

```dockerfile
FROM docker.mirrors.ustc.edu.cn/library/node:20-alpine
```

#### 3. 阿里云镜像

```dockerfile
FROM registry.cn-hangzhou.aliyuncs.com/acs/node:20-alpine
```

#### 4. 百度云镜像

```dockerfile
FROM mirror.baidubce.com/library/node:20-alpine
```

#### 5. 腾讯云镜像

```dockerfile
FROM ccr.ccs.tencentyun.com/library/node:20-alpine
```

### 方案二：使用镜像加速器配置（推荐）

不修改 Dockerfile，而是配置 Docker 使用镜像加速器：

1. **打开 Docker Desktop**
   - 点击菜单栏的 Docker 图标
   - 选择 `Settings` -> `Docker Engine`

2. **添加镜像加速配置**

```json
{
  "registry-mirrors": [
    "https://hub-mirror.c.163.com",
    "https://docker.mirrors.ustc.edu.cn",
    "https://mirror.baidubce.com"
  ]
}
```

3. **应用并重启 Docker Desktop**

4. **恢复 Dockerfile 使用官方镜像**

```dockerfile
FROM node:20-alpine
```

这样 Docker 会自动使用配置的镜像加速器。

### 方案三：使用官方镜像 + 代理

如果有代理，可以配置 Docker 使用代理：

1. **打开 Docker Desktop**
   - `Settings` -> `Resources` -> `Proxies`

2. **配置代理**

```
HTTP Proxy: http://proxy.example.com:8080
HTTPS Proxy: http://proxy.example.com:8080
No Proxy: localhost,127.0.0.1
```

3. **使用官方镜像**

```dockerfile
FROM node:20-alpine
```

### 方案四：手动拉取镜像

如果网络环境特殊，可以：

1. **在有网络的环境手动拉取镜像**

```bash
docker pull node:20-alpine
```

2. **导出镜像**

```bash
docker save node:20-alpine -o node-20-alpine.tar
```

3. **在目标机器导入**

```bash
docker load -i node-20-alpine.tar
```

4. **使用本地镜像**

```dockerfile
FROM node:20-alpine
```

## 测试镜像源

在切换镜像源前，可以先测试镜像源是否可用：

```bash
# 测试中科大镜像
curl -I https://docker.mirrors.ustc.edu.cn

# 测试网易镜像
curl -I https://hub-mirror.c.163.com

# 测试拉取镜像
docker pull hub-mirror.c.163.com/library/node:20-alpine
```

## 推荐配置

**最佳实践**：镜像加速器配置 + 多个备选镜像源

1. **配置镜像加速器**（Docker Desktop Settings）
2. **Dockerfile 中使用官方镜像**（让 Docker 自动选择最快的镜像源）
3. **如果加速器失效，再修改 Dockerfile 使用特定镜像源**

## 当前推荐

如果中科大镜像不可用，推荐使用：

1. **网易镜像**（通常比较稳定）
   ```dockerfile
   FROM hub-mirror.c.163.com/library/node:20-alpine
   ```

2. **或者配置镜像加速器**，使用官方镜像：
   ```dockerfile
   FROM node:20-alpine
   ```

## 快速切换

如果需要快速切换镜像源，可以使用环境变量或构建参数：

```dockerfile
ARG MIRROR=hub-mirror.c.163.com
FROM ${MIRROR}/library/node:20-alpine
```

构建时指定：

```bash
docker build --build-arg MIRROR=docker.mirrors.ustc.edu.cn -t myapp .
```

