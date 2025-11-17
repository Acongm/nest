# Puppeteer 加速安装指南

本文档提供多种方法来解决 Puppeteer 依赖下载太慢的问题，**无需使用 Docker**。

## 方案一：跳过 Chromium 下载，使用系统 Chrome（推荐）⭐

这是最简单且最快速的方法，利用系统已安装的 Chrome/Chromium。

### 步骤 1：设置环境变量

**macOS/Linux**：
```bash
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install
```

**Windows (PowerShell)**：
```powershell
$env:PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"
npm install
```

**Windows (CMD)**：
```cmd
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install
```

### 步骤 2：确保系统已安装 Chrome/Chromium

**macOS**：
```bash
# 检查是否已安装
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 如果未安装，使用 Homebrew 安装
brew install --cask google-chrome
```

**Linux (Ubuntu/Debian)**：
```bash
# 检查是否已安装
which google-chrome || which chromium-browser

# 如果未安装
sudo apt-get update
sudo apt-get install -y chromium-browser
# 或
sudo apt-get install -y google-chrome-stable
```

**Linux (CentOS/RHEL)**：
```bash
# 安装 Chromium
sudo yum install -y chromium
```

**Windows**：
- 从 [Chrome 官网](https://www.google.com/chrome/) 下载安装

### 步骤 3：验证

代码已经自动检测系统 Chrome，无需额外配置。如果找不到系统 Chrome，代码会回退到使用 Puppeteer 自带的浏览器。

### 优点
- ✅ 安装速度最快（跳过 Chromium 下载）
- ✅ 使用系统浏览器，版本更新方便
- ✅ 代码已支持自动检测

---

## 方案二：使用国内镜像源下载 Chromium

如果仍需要下载 Chromium，可以使用国内镜像源加速。

### 方法 A：使用 .npmrc 配置（推荐）

已创建 `.npmrc` 文件，包含以下配置：

```ini
# Puppeteer Chromium 下载镜像源
puppeteer_download_host=https://npmmirror.com/mirrors
```

然后正常安装：
```bash
npm install
```

### 方法 B：使用环境变量

**macOS/Linux**：
```bash
export PUPPETEER_DOWNLOAD_HOST=https://npmmirror.com/mirrors
npm install
```

**Windows (PowerShell)**：
```powershell
$env:PUPPETEER_DOWNLOAD_HOST="https://npmmirror.com/mirrors"
npm install
```

### 方法 C：使用 npm config

```bash
npm config set puppeteer_download_host https://npmmirror.com/mirrors
npm install
```

### 可用的国内镜像源

- `https://npmmirror.com/mirrors` （推荐，淘宝镜像）
- `https://cdn.npmmirror.com/binaries/chrome-for-testing`
- `https://mirrors.huaweicloud.com/chromium-browser-snapshots`

---

## 方案三：使用 puppeteer-core（高级）

`puppeteer-core` 不包含 Chromium，需要手动管理浏览器。

### 步骤 1：替换依赖

修改 `package.json`：

```json
{
  "dependencies": {
    "puppeteer-core": "^24.30.0"  // 替换 puppeteer
  }
}
```

### 步骤 2：安装

```bash
npm install
```

### 步骤 3：代码修改

代码中需要确保指定 Chrome 路径，代码已经支持，无需修改。

### 优点
- ✅ 包体积更小
- ✅ 完全控制浏览器版本

### 缺点
- ❌ 需要手动管理浏览器版本
- ❌ 需要修改 package.json

---

## 方案四：使用 npm 镜像源加速所有下载

### 配置 npm 镜像源

**临时使用**：
```bash
npm install --registry=https://registry.npmmirror.com
```

**永久配置**：
```bash
npm config set registry https://registry.npmmirror.com
```

**使用 .npmrc 文件**（已创建）：
```ini
registry=https://registry.npmmirror.com
```

### 验证配置

```bash
npm config get registry
```

### 恢复官方源

```bash
npm config set registry https://registry.npmjs.org
```

---

## 方案五：使用 cnpm（中国 npm 镜像客户端）

### 安装 cnpm

```bash
npm install -g cnpm --registry=https://registry.npmmirror.com
```

### 使用 cnpm 安装

```bash
cnpm install
```

### 优点
- ✅ 自动使用国内镜像
- ✅ 下载速度快

### 缺点
- ❌ 需要额外安装工具
- ❌ 可能与其他工具不兼容

---

## 方案六：手动下载 Chromium（不推荐）

如果上述方法都不行，可以手动下载 Chromium。

### 步骤 1：下载 Chromium

访问 [Chromium 下载页面](https://www.chromium.org/getting-involved/download-chromium) 或使用脚本：

```bash
# macOS
curl -L "https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac/LASTEST/chrome-mac.zip" -o chromium.zip
unzip chromium.zip

# Linux
curl -L "https://commondatastorage.googleapis.com/chromium-browser-snapshots/Linux_x64/LASTEST/chrome-linux.zip" -o chromium.zip
unzip chromium.zip
```

### 步骤 2：设置环境变量

```bash
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/path/to/chromium/chrome
```

---

## 推荐方案组合

### 最佳实践（推荐）⭐

1. **使用 .npmrc 配置镜像源**（已创建）
2. **跳过 Chromium 下载，使用系统 Chrome**

```bash
# 1. 设置环境变量跳过下载
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 2. 安装依赖（.npmrc 已配置镜像源）
npm install
```

### 如果系统没有 Chrome

```bash
# 1. 使用国内镜像源下载 Chromium
export PUPPETEER_DOWNLOAD_HOST=https://npmmirror.com/mirrors

# 2. 安装依赖
npm install
```

---

## 验证安装

### 检查 Puppeteer 是否正常工作

```bash
node -e "
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  console.log('✅ Puppeteer 工作正常');
  await browser.close();
})();
"
```

### 检查是否使用了系统 Chrome

查看日志输出，应该看到：
```
使用系统 Chrome: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

---

## 常见问题

### 1. 设置了 `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` 但仍然下载

**原因**：环境变量未生效或 Puppeteer 版本问题。

**解决**：
- 确保在安装前设置环境变量
- 删除 `node_modules` 和 `package-lock.json` 后重新安装
- 检查 `.npmrc` 中是否有冲突配置

### 2. 找不到系统 Chrome

**解决**：
- 确保 Chrome/Chromium 已正确安装
- 检查代码中的 `getChromeExecutablePath()` 函数是否支持你的系统
- 手动设置 `PUPPETEER_EXECUTABLE_PATH` 环境变量

### 3. 镜像源仍然很慢

**解决**：
- 尝试其他镜像源
- 使用 VPN 或代理
- 考虑使用方案一（跳过下载）

### 4. Windows 上的路径问题

**解决**：
- 使用正斜杠 `/` 或双反斜杠 `\\`
- 检查 Chrome 安装路径是否正确

---

## 性能对比

| 方案 | 安装时间 | 包体积 | 推荐度 |
|------|---------|--------|--------|
| 跳过下载 + 系统 Chrome | ⚡⚡⚡ 最快 | 小 | ⭐⭐⭐⭐⭐ |
| 国内镜像源下载 | ⚡⚡ 快 | 大 | ⭐⭐⭐⭐ |
| 官方源下载 | ⚡ 慢 | 大 | ⭐⭐ |
| puppeteer-core | ⚡⚡⚡ 最快 | 最小 | ⭐⭐⭐ |

---

## 总结

**推荐使用方案一**：跳过 Chromium 下载，使用系统 Chrome。这是最快且最简单的方法，代码已经支持自动检测系统 Chrome。

如果系统没有 Chrome，使用方案二：配置国内镜像源下载 Chromium。

