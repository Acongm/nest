#!/bin/bash

echo "=== Docker 配置检查 ==="
echo ""

echo "1. 检查 Docker 是否运行："
docker ps > /dev/null 2>&1 && echo "✓ Docker 正在运行" || echo "✗ Docker 未运行"

echo ""
echo "2. 检查镜像加速器配置："
docker info 2>/dev/null | grep -A 10 "Registry Mirrors" || echo "✗ 未配置镜像加速器"

echo ""
echo "3. 检查 daemon.json 配置文件："
if [ -f ~/.docker/daemon.json ]; then
    echo "✓ 配置文件存在："
    cat ~/.docker/daemon.json | python3 -m json.tool 2>/dev/null || cat ~/.docker/daemon.json
else
    echo "✗ 配置文件不存在：~/.docker/daemon.json"
fi

echo ""
echo "4. 测试网络连接："
echo "测试 Docker Hub:"
curl -I https://auth.docker.io 2>&1 | head -2 || echo "✗ 无法连接 Docker Hub"

echo ""
echo "5. 建议："
echo "如果未配置镜像加速器，请："
echo "1. 打开 Docker Desktop"
echo "2. Settings -> Docker Engine"
echo "3. 添加 registry-mirrors 配置"
echo "4. 点击 Apply & Restart"

