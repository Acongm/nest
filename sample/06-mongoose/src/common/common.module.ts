import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailConfigService } from './email-config.service';
import { EmailConfigController } from './email-config.controller';

/**
 * 通用模块
 * 包含邮件服务、邮件配置服务等通用功能
 */
@Module({
  providers: [EmailService, EmailConfigService],
  controllers: [EmailConfigController],
  exports: [EmailService, EmailConfigService],
})
export class CommonModule {}

