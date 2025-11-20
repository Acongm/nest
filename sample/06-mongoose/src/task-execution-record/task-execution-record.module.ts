import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TaskExecutionRecordService } from './task-execution-record.service';
import { TaskExecutionRecordController } from './task-execution-record.controller';
import { TaskExecutionRecord, TaskExecutionRecordSchema } from './schemas/task-execution-record.schema';

/**
 * 定时任务执行记录模块
 * 管理任务执行记录相关的服务、控制器等
 * @class TaskExecutionRecordModule
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskExecutionRecord.name, schema: TaskExecutionRecordSchema }
    ]),
  ],
  providers: [TaskExecutionRecordService],
  controllers: [TaskExecutionRecordController],
  exports: [TaskExecutionRecordService, MongooseModule],
})
export class TaskExecutionRecordModule {}

