# npm install 卡住问题排查指南

## 问题现象

运行 `npm run install:fast` 时卡住，没有响应。

## 可能的原因

### 1. ELECTRON_MIRROR 配置警告

**问题**：
```
npm warn Unknown user config "ELECTRON_MIRROR". This will stop working in the next major version of npm.
```

这是全局 npm 配置，虽然不会导致卡住，但会产生警告。

**解决方案**：
```bash
# 删除过时的配置
npm config delete ELECTRON_MIRROR
```

### 2. 网络问题或依赖下载慢

**可能原因**：
- 网络连接慢
- 某个依赖包下载卡住
- 镜像源响应慢

**排查方法**：

#### 方法 1：查看详细日志

```bash
# 使用详细模式查看安装过程
npm install --verbose

# 或者使用调试模式
DEBUG=* npm install
```

#### 方法 2：检查网络连接

```bash
# 测试镜像源连接
curl -I https://registry.npmmirror.com

# 测试特定包
npm view puppeteer --registry=https://registry.npmmirror.com
```

#### 方法 3：检查是否有进程卡住

```bash
# 查看 npm 进程
ps aux | grep npm

# 查看网络连接
lsof -i -P | grep node
```

### 3. Puppeteer 仍在下载 Chromium

虽然设置了 `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`，但可能：
- 环境变量未正确传递
- Puppeteer 版本问题
- 缓存问题

**解决方案**：

#### 方法 1：确保环境变量正确设置

```bash
# 在命令行中直接设置
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install
```

#### 方法 2：清理缓存

```bash
# 清理 npm 缓存
npm cache clean --force

# 清理 Puppeteer 缓存
rm -rf ~/.cache/puppeteer

# 重新安装
npm install
```

#### 方法 3：使用 .npmrc 配置（不推荐，已废弃）

如果环境变量不工作，可以尝试在 `.npmrc` 中设置（但 Puppeteer 可能不支持）：

```ini
# .npmrc（不推荐）
puppeteer_skip_chromium_download=true
```

### 4. 依赖冲突或锁定文件问题

**解决方案**：

```bash
# 删除锁定文件和 node_modules
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 5. 磁盘空间不足

**检查**：
```bash
df -h
```

**解决**：清理磁盘空间

## 快速解决方案

### 方案一：使用详细模式查看卡在哪里

```bash
# 停止当前进程（Ctrl+C）
# 然后运行
npm install --verbose 2>&1 | tee install.log
```

查看 `install.log` 文件，找到最后一行，看看卡在哪个包。

### 方案二：分步安装

```bash
# 1. 只安装生产依赖
npm install --production

# 2. 再安装开发依赖
npm install --save-dev
```

### 方案三：使用不同的镜像源

```bash
# 临时使用官方源
npm install --registry=https://registry.npmjs.org

# 或使用其他镜像源
npm install --registry=https://registry.npmmirror.com
```

### 方案四：跳过可选依赖

```bash
# 跳过可选依赖（可能包括 Puppeteer 的 Chromium）
npm install --no-optional
```

## 推荐的完整解决流程

```bash
# 1. 删除过时的配置
npm config delete ELECTRON_MIRROR

# 2. 清理缓存和文件
rm -rf node_modules package-lock.json
npm cache clean --force
rm -rf ~/.cache/puppeteer

# 3. 设置环境变量
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 4. 使用详细模式安装
npm install --verbose

# 5. 如果还是卡住，查看最后输出的包名，单独安装
npm install <包名> --verbose
```

## 如果仍然卡住

### 1. 检查系统资源

```bash
# 查看 CPU 和内存使用
top

# 查看磁盘 I/O
iostat -x 1
```

### 2. 使用超时设置

```bash
# 设置超时时间（秒）
npm install --fetch-timeout=60000
```

### 3. 使用代理（如果有）

```bash
npm config set proxy http://proxy.example.com:8080
npm config set https-proxy http://proxy.example.com:8080
```

### 4. 检查防火墙或安全软件

某些安全软件可能会阻止 npm 的网络连接。

## 预防措施

### 1. 使用 .npmrc 配置镜像源

已配置在 `.npmrc` 中：
```ini
registry=https://registry.npmmirror.com
```

### 2. 使用 npm 脚本

已配置 `install:fast` 脚本：
```json
{
  "scripts": {
    "install:fast": "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install"
  }
}
```

### 3. 定期清理缓存

```bash
npm cache clean --force
```

## 常见问题

### Q: 为什么设置了环境变量还是下载 Chromium？

**A**: 检查环境变量是否正确传递：
```bash
# 验证环境变量
echo $PUPPETEER_SKIP_CHROMIUM_DOWNLOAD

# 应该在脚本中设置
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install
```

### Q: 如何知道卡在哪个包？

**A**: 使用详细模式：
```bash
npm install --verbose 2>&1 | tee install.log
# 查看 install.log 的最后几行
tail -20 install.log
```

### Q: 可以强制终止并重试吗？

**A**: 可以，但建议先清理：
```bash
# Ctrl+C 终止
# 然后清理
rm -rf node_modules package-lock.json
# 重新安装
npm install
```

## 总结

如果 `npm install` 卡住：
1. ✅ 先删除过时的 `ELECTRON_MIRROR` 配置
2. ✅ 使用 `--verbose` 查看详细日志
3. ✅ 清理缓存和锁定文件
4. ✅ 确保环境变量正确设置
5. ✅ 检查网络连接和系统资源

