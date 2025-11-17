# npm 废弃警告处理指南

## glob@7.2.3 废弃警告

### 问题描述

```
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
```

### 原因分析

这是一个**传递依赖**（transitive dependency）问题，依赖链如下：

```
ts-jest@29.4.5
  └─┬ @jest/transform@30.2.0
    └─┬ babel-plugin-istanbul@7.0.1
      └─┬ test-exclude@6.0.0
        └── glob@7.2.3  ← 旧版本（已废弃）
```

### 解决方案

#### 方案一：使用 npm overrides（已配置）⭐

已在 `package.json` 中添加了 `overrides` 字段，强制使用新版本的 `glob`：

```json
{
  "overrides": {
    "glob": "^11.0.0"
  }
}
```

**使用方法**：
```bash
# 重新安装依赖以应用 overrides
rm -rf node_modules package-lock.json
npm install
```

**优点**：
- ✅ 强制使用新版本，消除警告
- ✅ npm 8.3+ 原生支持

**注意**：
- 如果出现兼容性问题，可以回退到方案二

#### 方案二：忽略警告（备选方案）

如果 `overrides` 导致兼容性问题，可以忽略这个警告：

**原因**：
- ✅ 这是传递依赖，不是直接依赖
- ✅ 旧版本的 `glob` 仍然可以正常工作
- ✅ 不影响功能
- ✅ 等待上游包（`test-exclude`）更新更安全

**如何抑制警告**：

在 `.npmrc` 中配置（不推荐，但可以临时使用）：

```ini
# 抑制废弃警告
audit=false
```

或使用环境变量：

```bash
npm install --no-audit
```

#### 方案三：更新相关依赖

尝试更新 `ts-jest` 到最新版本：

```bash
npm install ts-jest@latest --save-dev
```

**注意**：当前 `ts-jest@29.4.5` 已是最新版本。

### 推荐做法

**已配置方案一（npm overrides）**，这是最彻底的解决方案。

如果遇到兼容性问题，可以：
1. 移除 `overrides` 配置
2. 使用方案二（忽略警告）

### 验证修复

重新安装依赖后，警告应该消失：

```bash
rm -rf node_modules package-lock.json
npm install
```

### 检查依赖树

查看完整的依赖树：

```bash
npm ls glob
```

应该看到所有 `glob` 都使用 `^11.0.0` 版本。

### 相关链接

- [glob 官方仓库](https://github.com/isaacs/node-glob)
- [npm overrides 文档](https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides)
- [npm overrides 使用指南](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides)
