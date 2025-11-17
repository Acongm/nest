import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduledTaskService } from './scheduled-task.service';
import { ScheduledTaskController } from './scheduled-task.controller';
import { ScheduledTaskSchedulerService } from './scheduled-task-scheduler.service';
import { ScheduledTaskEmailService } from './scheduled-task-email.service';
import { ScheduledTask, ScheduledTaskSchema } from './schemas/scheduled-task.schema';
import { ReportExportModule } from '../report-export/report-export.module';
import { EmailService } from '../common/email.service';

/**
 * 定时任务模块
 * 管理定时任务相关的服务、控制器等
 * @class ScheduledTaskModule
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScheduledTask.name, schema: ScheduledTaskSchema }
    ]),
    ScheduleModule.forRoot(),
    forwardRef(() => ReportExportModule),
  ],
  providers: [
    ScheduledTaskService,
    ScheduledTaskSchedulerService,
    ScheduledTaskEmailService,
    EmailService,
  ],
  controllers: [ScheduledTaskController],
  exports: [ScheduledTaskService, ScheduledTaskSchedulerService],
})
export class ScheduledTaskModule {}
