#!/bin/bash

# npm install 调试脚本

echo "🔍 开始排查 npm install 卡住问题..."
echo ""

# 1. 检查 ELECTRON_MIRROR 配置
echo "1️⃣ 检查 ELECTRON_MIRROR 配置..."
if npm config get ELECTRON_MIRROR 2>&1 | grep -q "npmmirror.com"; then
    echo "   ⚠️  发现 ELECTRON_MIRROR 配置，尝试删除..."
    npm config delete ELECTRON_MIRROR 2>&1 | grep -v "warn" || true
    echo "   ✅ 已删除"
else
    echo "   ✅ 未发现 ELECTRON_MIRROR 配置"
fi
echo ""

# 2. 清理缓存
echo "2️⃣ 清理缓存..."
echo "   清理 npm 缓存..."
npm cache clean --force 2>&1 | grep -v "warn" || true
echo "   清理 Puppeteer 缓存..."
rm -rf ~/.cache/puppeteer 2>&1 || true
echo "   ✅ 缓存已清理"
echo ""

# 3. 检查网络连接
echo "3️⃣ 检查网络连接..."
if curl -s -o /dev/null -w "%{http_code}" https://registry.npmmirror.com | grep -q "200"; then
    echo "   ✅ 镜像源连接正常"
else
    echo "   ⚠️  镜像源连接异常，尝试使用官方源"
    export NPM_REGISTRY="https://registry.npmjs.org"
fi
echo ""

# 4. 设置环境变量
echo "4️⃣ 设置环境变量..."
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
echo "   ✅ PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true"
echo ""

# 5. 开始安装（使用详细模式）
echo "5️⃣ 开始安装依赖（详细模式）..."
echo "   如果卡住，请查看最后输出的包名"
echo "   按 Ctrl+C 可以终止"
echo ""

# 使用超时设置，避免无限等待
timeout 300 npm install --verbose 2>&1 | tee install.log || {
    echo ""
    echo "❌ 安装超时或失败"
    echo "📋 查看最后 20 行日志："
    tail -20 install.log
    echo ""
    echo "💡 提示："
    echo "   - 查看 install.log 文件找到卡住的包"
    echo "   - 尝试单独安装该包：npm install <包名> --verbose"
    exit 1
}

echo ""
echo "✅ 安装完成！"

