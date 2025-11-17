import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { logger } from './common/logger';

async function bootstrap() {
  // 确保日志目录存在
  const logsDir = join(process.cwd(), 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // 启用 cookie 解析中间件
  app.use(cookieParser());
  
  // 设置全局路由前缀（API 接口）
  app.setGlobalPrefix('api');
  
  // 配置静态文件服务 - 前端打包文件目录
  // 前端打包后的文件应该放在项目根目录的 'public' 文件夹下
  const publicPath = join(__dirname, '..', 'public');
  app.useStaticAssets(publicPath, {
    prefix: '/', // 访问路径前缀，设置为根路径
    index: false, // 不自动提供 index.html，由中间件处理
  });
  
  // 启用全局验证管道，自动验证请求体
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动移除未在 DTO 中定义的属性
      forbidNonWhitelisted: true, // 如果请求包含未定义的属性，返回错误
      transform: true, // 自动将请求体转换为 DTO 实例
      transformOptions: {
        enableImplicitConversion: true, // 启用隐式类型转换
      },
    }),
  );
  
  // 路由处理：根据路径返回对应的 HTML 文件
  app.use((req, res, next) => {
    // 如果是 API 请求，跳过
    if (req.path.startsWith('/api')) {
      return next();
    }
    
    // 如果是静态资源请求（如 .js, .css, .png 等），跳过
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      return next();
    }
    
    let htmlFile = 'index.html';
    
    // 根据路径返回对应的 HTML 文件
    if (req.path === '/login' || req.path.startsWith('/login')) {
      htmlFile = 'login.html';
    } else if (req.path === '/register' || req.path.startsWith('/register')) {
      htmlFile = 'register.html';
    }
    
    try {
      const htmlPath = join(publicPath, htmlFile);
      if (existsSync(htmlPath)) {
        const html = readFileSync(htmlPath, 'utf-8');
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } else {
        res.status(404).send(`File not found: ${htmlFile}`);
      }
    } catch (error) {
      logger.error('读取 HTML 文件失败', {
        path: req.path,
        htmlFile,
        error: error.message,
      });
      res.status(500).send('Internal server error');
    }
  });
  
  await app.listen(3000);
  const url = await app.getUrl();
  logger.info('应用启动成功', {
    url,
    publicPath,
    apiUrl: `${url}/api`,
  });
}
bootstrap().catch((error) => {
  logger.error('应用启动失败', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
