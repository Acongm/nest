### NestJS + Mongoose 示例（含定时任务、报表导出与邮件通知）

本项目是一个基于 NestJS 和 Mongoose 的完整示例，包含认证、示例 Cats 模块、报表导出、定时任务调度、执行记录查询、邮件配置校验与静态页面展示。

- 运行端口：`3000`
- API 前缀：`/api`
- 静态页面目录：`public/`（通过根路径直接访问）

---

### 特性

- 用户认证（JWT，Cookie 登录，注册/登录/登出，`/api/auth/*`）
- Mongoose 数据建模与全局 `_id -> id` 转换插件
- 报表导出（生成 PDF 并可下载，队列状态查询）
- 定时任务调度（按频率/时间执行，支持立即触发与状态查询）
- 任务执行记录查询（筛选条件与调试接口）
- 邮件发送与邮件配置校验（支持第三方配置接口或环境变量）
- 前端静态页面：登录、注册、任务管理、执行记录浏览
- Docker 化开发与生产部署示例

---

### 目录结构

```
src/
  auth/                 认证模块（JWT、Cookie）
  cats/                 示例 Cats 模块
  report-export/        报表导出模块（PDF 生成与下载）
  scheduled-task/       定时任务模块（调度与触发）
  task-execution-record/执行记录查询模块
  common/               通用工具（日志、邮件、邮件配置校验）
  app.module.ts         应用模块装配与 MongoDB 连接
  main.ts               应用入口（API 前缀与静态页面）
public/
  index.html            首页（导出任务操作）
  login.html            登录页
  register.html         注册页
  scheduled-tasks.html  定时任务管理页
  task-execution-records.html 执行记录列表页
```

---

### 环境要求

- Node.js `>= 18`（Docker 镜像使用 `node:20-alpine`）
- MongoDB `>= 4.x`（本地或 Docker）

---

### 本地快速开始

1) 安装依赖

```
npm install
```

遇到 Puppeteer 下载慢：

```
npm run install:fast
```

2) 启动 MongoDB（推荐 Docker）

```
docker-compose up -d mongodb
```

3) 配置环境变量（可选，示例见 `.env.example`）

```
# .env 示例（部分）
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/test
JWT_SECRET=your-secret-key-change-in-production

# 定时任务相关配置
DEFAULT_TIMEZONE=Asia/Shanghai          # 默认时区（IANA 时区标识符）
EXPORT_RETRY_COUNT=3                    # 导出任务失败时的默认重试次数
```

4) 创建必要目录（首次运行）

```
mkdir -p public/uploads
mkdir -p logs
```

5) 启动应用（开发模式）

```
npm run start:dev
```

访问地址：

- 应用首页：`http://localhost:3000/`
- API 根地址：`http://localhost:3000/api`

---

### 使用 Docker 启动

开发环境（挂载源代码，热重载）：

```
docker-compose -f docker-compose.dev.yml up --build
```

生产环境：

```
docker-compose up --build
```

查看日志：

```
docker-compose -f docker-compose.dev.yml logs -f app
```

停止服务：

```
docker-compose down
```

---

### 接口速查

所有接口均在 `/api` 前缀下，除注册与登录外均需要登录（JWT Cookie）。

认证 `auth`
- `POST /api/auth/register` 注册（公开）
- `POST /api/auth/login` 登录（公开，返回 `token` Cookie）
- `POST /api/auth/logout` 登出（需要登录）
- `GET  /api/auth/me` 当前用户信息（需要登录）

示例模块 `cats`
- `GET    /api/cats` 列表
- `GET    /api/cats/:id` 详情
- `POST   /api/cats` 创建
- `POST   /api/cats/:id` 更新
- `DELETE /api/cats/:id` 删除

定时任务 `scheduled-tasks`
- `GET    /api/scheduled-tasks` 获取任务列表
- `PUT    /api/scheduled-tasks` 创建/更新系统任务
- `GET    /api/scheduled-tasks/:taskId/status` 任务运行状态
- `POST   /api/scheduled-tasks/:taskId/trigger` 立即触发执行

执行记录 `scheduled-tasks/execution-records`
- `GET /api/scheduled-tasks/execution-records` 按租户查询（支持筛选）
- `GET /api/scheduled-tasks/execution-records/task/:taskId` 查询指定任务的记录
- `GET /api/scheduled-tasks/execution-records/:id` 记录详情
- `GET /api/scheduled-tasks/execution-records/debug/all` 调试用：查询全部

报表导出 `report-export`
- `POST /api/report-export` 创建导出任务
- `GET  /api/report-export` 任务列表（`assetId` 可选筛选）
- `GET  /api/report-export/:id` 任务详情
- `GET  /api/report-export/queue/status` 队列状态
- `GET  /api/report-export/download/:id` 下载 PDF 文件

邮件配置 `email-config`
- `GET  /api/email-config` 获取当前邮件配置（来源：第三方接口或环境变量）
- `POST /api/email-config/validate` 校验邮件配置（可传自定义配置）

---

### 静态页面导航

- `GET /` 首页（报表导出）
- `GET /login` 登录页
- `GET /register` 注册页
- `GET /scheduled-tasks` 定时任务管理页
- `GET /task-execution-records` 执行记录列表页

上述页面由 `main.ts` 中的中间件按路径返回对应 `public/*.html` 文件。

---

### 环境变量

请参考 `./.env.example`，常用项：

- `MONGODB_URI`：MongoDB 连接字符串，默认 `mongodb://localhost:27017/test`
- `JWT_SECRET`：JWT 密钥（生产环境务必修改）
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`：是否跳过 Chromium 下载（Docker 中默认 `true`）
- `PUPPETEER_EXECUTABLE_PATH`：系统 Chromium 路径（Docker 已安装）
- `SMTP_*`：邮件发送配置（`SMTP_HOST/PORT/SECURE/USER/PASS/FROM`）
- `EMAIL_CONFIG_API_URL`：第三方邮件配置接口（可选）

备注：当前应用固定监听 `3000` 端口，`.env` 中 `PORT` 未被使用。

---

### 常用脚本

- `npm run start` 正常启动
- `npm run start:dev` 开发模式（热重载）
- `npm run start:debug` 调试模式
- `npm run build` 构建生产包
- `npm run start:prod` 生产模式启动（需先 `build`）
- `npm run test` 单元测试
- `npm run lint` 代码检查
- `npm run format` 格式化
- `npm run install:fast` 跳过 Puppeteer 的 Chromium 下载（下载慢时使用）

---

### 疑难排查

- MongoDB 未启动：请先运行 `docker-compose up -d mongodb` 或使用本地 MongoDB 服务。
- Puppeteer 下载缓慢：使用 `npm run install:fast` 或参考 `docs/puppeteer-speedup-guide.md`。
- 认证失败：登录成功后接口会使用 `token` Cookie 访问，确保浏览器或 `curl` 携带 Cookie（`curl` 示例见 `docs/README.local.md`）。
- Docker 构建慢或超时：参考 `docs/docker-timeout-config.md`，或配置镜像源加速。

---

### 参考文档

- 本地运行指南：`docs/README.local.md`
- Docker 快速使用：`docs/README.docker.md`
- 邮件配置接口与说明：`docs/email-config-api.md`
- 任务调度与依赖说明：`docs/forwardref-and-scheduler-explanation.md`