import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { CatsModule } from './cats/cats.module';
import { ScheduledTaskModule } from './scheduled-task/scheduled-task.module';
import { ReportExportModule } from './report-export/report-export.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

// MongoDB 连接字符串
// 支持环境变量，如果没有设置则使用默认值
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

@Module({
  imports: [
    MongooseModule.forRoot(mongoUri, {
      // 连接选项
      retryWrites: true,
      w: 'majority',
    }),
    AuthModule,
    CatsModule,
    ScheduledTaskModule,
    ReportExportModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule { }
