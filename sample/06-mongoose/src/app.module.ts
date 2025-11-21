import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CatsModule } from './cats/cats.module';
import { ScheduledTaskModule } from './scheduled-task/scheduled-task.module';
import { ReportExportModule } from './report-export/report-export.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    // 配置 ConfigModule，全局可用
    ConfigModule.forRoot({
      isGlobal: true, // 使 ConfigModule 全局可用
      envFilePath: '.env', // 指定 .env 文件路径
    }),
    // 使用 ConfigService 获取 MongoDB URI
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017/test'),
        retryWrites: true,
        w: 'majority',
      }),
      inject: [ConfigService],
    }),
    CommonModule,
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
