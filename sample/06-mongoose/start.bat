@echo off
REM Windows 快速启动脚本

echo 🚀 启动 NestJS 应用...

REM 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 错误: 未找到 Node.js，请先安装 Node.js
    exit /b 1
)

REM 检查是否安装了依赖
if not exist "node_modules" (
    echo 📦 安装依赖...
    call npm install
)

REM 创建必要的目录
echo 📁 创建必要的目录...
if not exist "public\uploads" mkdir public\uploads
if not exist "logs" mkdir logs

REM 检查 MongoDB 是否运行（需要 Docker）
docker ps | findstr nestjs-mongodb >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo 🐳 启动 MongoDB (Docker)...
    docker-compose up -d mongodb
    echo ⏳ 等待 MongoDB 启动...
    timeout /t 3 /nobreak >nul
)

REM 设置环境变量（如果未设置）
if "%MONGODB_URI%"=="" set MONGODB_URI=mongodb://localhost:27017/test
if "%JWT_SECRET%"=="" set JWT_SECRET=your-secret-key-change-in-production

echo ✅ 环境配置:
echo    MONGODB_URI: %MONGODB_URI%
echo    JWT_SECRET: %JWT_SECRET%
echo.

REM 启动应用
echo 🎯 启动应用（开发模式）...
call npm run start:dev

