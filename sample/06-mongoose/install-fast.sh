#!/bin/bash

# 快速安装脚本 - 跳过 Puppeteer Chromium 下载

echo "🚀 快速安装依赖（跳过 Puppeteer Chromium 下载）..."
echo ""

# 检查系统 Chrome
echo "📋 检查系统 Chrome/Chromium..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if [ -f "$CHROME_PATH" ]; then
        echo "✅ 找到系统 Chrome: $CHROME_PATH"
    else
        echo "⚠️  未找到系统 Chrome"
        echo "   提示: 可以运行 'brew install --cask google-chrome' 安装"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v google-chrome &> /dev/null; then
        echo "✅ 找到系统 Chrome: $(which google-chrome)"
    elif command -v chromium-browser &> /dev/null; then
        echo "✅ 找到系统 Chromium: $(which chromium-browser)"
    else
        echo "⚠️  未找到系统 Chrome/Chromium"
        echo "   提示: 可以运行 'sudo apt-get install chromium-browser' 安装"
    fi
else
    echo "⚠️  未知系统类型，请确保已安装 Chrome/Chromium"
fi

echo ""
echo "📦 开始安装依赖..."

# 设置环境变量跳过 Chromium 下载
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 安装依赖
npm install

echo ""
echo "✅ 安装完成！"
echo ""
echo "💡 提示:"
echo "   - 代码会自动检测并使用系统 Chrome"
echo "   - 如果遇到问题，请查看 docs/puppeteer-speedup-guide.md"

