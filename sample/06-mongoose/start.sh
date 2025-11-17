#!/bin/bash

# 本地快速启动脚本

echo "🚀 启动 NestJS 应用..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查是否安装了依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 创建必要的目录
echo "📁 创建必要的目录..."
mkdir -p public/uploads
mkdir -p logs

# 检查 MongoDB 是否运行
if ! docker ps | grep -q nestjs-mongodb; then
    echo "🐳 启动 MongoDB (Docker)..."
    docker-compose up -d mongodb
    echo "⏳ 等待 MongoDB 启动..."
    sleep 3
fi

# 设置环境变量（如果未设置）
export MONGODB_URI=${MONGODB_URI:-mongodb://localhost:27017/test}
export JWT_SECRET=${JWT_SECRET:-your-secret-key-change-in-production}

echo "✅ 环境配置:"
echo "   MONGODB_URI: $MONGODB_URI"
echo "   JWT_SECRET: $JWT_SECRET"
echo ""

# 启动应用
echo "🎯 启动应用（开发模式）..."
npm run start:dev

