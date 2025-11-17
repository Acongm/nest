# 使用官方镜像，通过 Docker Desktop 配置镜像加速器来加速
# 如果直接使用镜像源失败，请配置 Docker Desktop -> Settings -> Docker Engine -> registry-mirrors
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 安装 Chromium 和必要的依赖（Alpine Linux）
# 这样可以避免 Puppeteer 下载 Chromium，直接使用系统安装的版本
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# 设置环境变量，跳过 Puppeteer 的 Chromium 下载
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 设置 npm 镜像源（可选，如果需要加速 npm 安装）
# RUN npm config set registry https://registry.npmmirror.com

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
# 使用 --ignore-scripts 可以跳过某些包的安装脚本，加快速度
RUN npm ci --only=production --ignore-scripts || npm install --only=production --ignore-scripts

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "run", "start:prod"]

