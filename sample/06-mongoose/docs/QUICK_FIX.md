# 快速修复 Docker 镜像拉取问题

## 当前问题

无法连接到 Docker Hub 或国内镜像源，导致镜像拉取失败。

## 解决方案（按优先级）

### 方案一：配置 Docker Desktop 镜像加速器（推荐）⭐

这是最可靠的方案，不需要修改 Dockerfile。

#### 步骤：

1. **打开 Docker Desktop**
   - 点击菜单栏的 Docker 图标
   - 选择 `Settings`（设置）

2. **进入 Docker Engine 设置**
   - 在左侧菜单选择 `Docker Engine`

3. **添加镜像加速配置**
   - 在 JSON 编辑器中，添加或修改 `registry-mirrors`：

```json
{
  "builder": {
    "gc": {
      "defaultKeepStorage": "20GB",
      "enabled": true
    }
  },
  "experimental": false,
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

4. **应用并重启**
   - 点击 `Apply & Restart` 按钮
   - 等待 Docker 完全重启（菜单栏图标不再显示启动中）

5. **验证配置**
   ```bash
   docker info | grep -A 5 "Registry Mirrors"
   ```

6. **重新构建**
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

### 方案二：使用代理

如果网络环境需要代理：

1. **打开 Docker Desktop**
   - `Settings` -> `Resources` -> `Proxies`

2. **配置代理**
   - 输入你的 HTTP/HTTPS 代理地址
   - 例如：`http://127.0.0.1:7890`

3. **应用并重启 Docker Desktop**

### 方案三：检查 DNS 设置

如果镜像源无法解析，可能是 DNS 问题：

1. **检查 DNS 设置**
   ```bash
   # 查看当前 DNS
   scutil --dns | grep nameserver
   ```

2. **尝试使用公共 DNS**
   - 8.8.8.8 (Google)
   - 114.114.114.114 (国内)
   - 223.5.5.5 (阿里云)

3. **在 Docker Desktop 中配置 DNS**
   - `Settings` -> `Docker Engine`
   - 添加 DNS 配置：

```json
{
  "dns": ["8.8.8.8", "114.114.114.114"]
}
```

### 方案四：使用 VPN

如果网络环境限制访问 Docker Hub，可能需要使用 VPN。

## 验证步骤

配置完成后，按以下步骤验证：

1. **测试拉取镜像**
   ```bash
   docker pull node:20-alpine
   ```

2. **如果成功，重新构建**
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

## 如果仍然失败

如果以上方案都不行，可以尝试：

1. **手动下载镜像**（在有网络的环境）
2. **使用本地镜像仓库**
3. **联系网络管理员**检查防火墙设置

## 当前 Dockerfile 配置

当前 Dockerfile 使用官方镜像：
```dockerfile
FROM node:20-alpine
```

配置镜像加速器后，Docker 会自动使用最快的镜像源拉取。

