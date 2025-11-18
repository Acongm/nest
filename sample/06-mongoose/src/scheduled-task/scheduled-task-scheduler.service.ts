import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ScheduledTask, ScheduledTaskDocument } from './schemas/scheduled-task.schema';
import { TaskExecutionRecord, TaskExecutionRecordDocument } from './schemas/task-execution-record.schema';
import { ReportExportService } from '../report-export/report-export.service';
import { ScheduledTaskEmailService } from './scheduled-task-email.service';
import { ExportTaskStatus } from '../report-export/schemas/export-task.schema';
import { logger } from '../common/logger';

/**
 * 定时任务调度服务
 * 负责管理定时任务的执行和调度
 */
@Injectable()
export class ScheduledTaskSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  constructor(
    @InjectModel(ScheduledTask.name)
    private taskModel: Model<ScheduledTaskDocument>,
    @InjectModel(TaskExecutionRecord.name)
    private executionRecordModel: Model<TaskExecutionRecordDocument>,
    private schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => ReportExportService))
    private reportExportService: ReportExportService,
    private emailService: ScheduledTaskEmailService,
  ) {}

  /**
   * 模块初始化时加载所有启用的定时任务
   */
  async onModuleInit() {
    logger.info('开始加载定时任务');
    await this.loadAllEnabledTasks();
  }

  /**
   * 模块销毁时清理所有定时任务
   */
  onModuleDestroy() {
    logger.info('清理所有定时任务');
    this.clearAllJobs();
  }

  /**
   * 加载所有启用的定时任务
   */
  async loadAllEnabledTasks(): Promise<void> {
    try {
      const tasks = await this.taskModel.find({ enable: true }).exec();

      logger.info(`找到 ${tasks.length} 个启用的定时任务`);

      for (const task of tasks) {
        this.scheduleTask(task);
      }
    } catch (error) {
      logger.error('加载定时任务失败', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * 调度单个定时任务
   * @param task 定时任务
   */
  scheduleTask(task: ScheduledTask): void {
    const jobName = `scheduled-task-${task.id}-${task.tenantId}`;

    // 如果任务已存在，先删除
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
      logger.info(`删除已存在的定时任务: ${jobName}`);
    }

    // 创建新的 Cron 任务
    const job = new CronJob(
      task.cronExpression,
      () => {
        this.executeTask(task).catch((error) => {
          logger.error('定时任务执行失败', {
            taskId: task.id,
            error: error.message,
            stack: error.stack,
          });
        });
      },
      null, // onComplete
      true, // start
      'Asia/Shanghai', // timeZone
    );

    // 注册任务
    this.schedulerRegistry.addCronJob(jobName, job);

    logger.info('定时任务已调度', {
      taskId: task.id,
      cronExpression: task.cronExpression,
      jobName,
    });
  }

  /**
   * 取消调度单个定时任务
   * @param taskId 任务ID
   * @param tenantId 租户ID
   */
  unscheduleTask(taskId: string, tenantId: string): void {
    const jobName = `scheduled-task-${taskId}-${tenantId}`;

    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
      logger.info('定时任务已取消调度', { taskId, jobName });
    }
  }

  /**
   * 重新调度任务（用于更新任务时）
   * @param taskId 任务ID
   * @param tenantId 租户ID
   */
  async rescheduleTask(taskId: string, tenantId: string): Promise<void> {
    // 先取消现有任务
    this.unscheduleTask(taskId, tenantId);

    // 重新加载任务并调度
    const task = await this.taskModel.findOne({ id: taskId, tenantId }).exec();
    if (task && task.enable) {
      this.scheduleTask(task);
    }
  }

  /**
   * 执行定时任务
   * @param task 定时任务
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    const executionStartTime = new Date();
    let executionRecord: TaskExecutionRecordDocument | null = null;

    logger.info('开始执行定时任务', {
      taskId: task.id,
      pageIds: task.pageIds,
      branchIds: task.branchIds,
      recipients: task.recipient,
    });

    try {
      // 创建执行记录
      executionRecord = new this.executionRecordModel({
        taskId: task.id,
        tenantId: task.tenantId,
        status: 'success',
        startTime: executionStartTime,
        emailStatus: 'not_sent',
        recipients: task.recipient,
        totalExports: 0,
        successfulExports: 0,
        emailAttachments: [],
      });
      await executionRecord.save();

      // 计算时间范围（根据频率计算开始和结束时间）
      const { startTime, endTime } = this.calculateTimeRange(task.frequency);

      // 为每个 pageId 和 branchId 组合创建导出任务
      const exportTasks = [];

      for (const pageId of task.pageIds) {
        for (const branchId of task.branchIds) {
          // 构建报表页面URL
          const reportPage = this.buildReportPageUrl(pageId, branchId);

          // 创建导出任务（使用定时任务的 tenantId）
          const exportTask = this.reportExportService.createExportTask(
            {
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              assetId: branchId, // 使用 branchId 作为 assetId
              reportPage,
              taskName: `定时任务-${task.id}`,
            },
            task.tenantId,
          );

          exportTasks.push({
            exportTask,
            pageId,
            branchId,
          });
        }
      }

      // 更新总导出任务数
      executionRecord.totalExports = exportTasks.length;
      await executionRecord.save();

      // 等待所有导出任务完成
      const results = await Promise.allSettled(
        exportTasks.map(({ exportTask }) => exportTask),
      );

      // 收集成功的导出任务
      const successfulExports = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          const exportTask = result.value;
          const { pageId, branchId } = exportTasks[i];

          // 等待任务完成（使用定时任务的 tenantId）
          const completedTask = await this.waitForTaskCompletion(
            exportTask._id.toString(),
            task.tenantId,
          );

          if (completedTask.status === ExportTaskStatus.COMPLETED && completedTask.filePath) {
            successfulExports.push({
              task: completedTask,
              pageId,
              branchId,
            });
          }
        } else {
          logger.error('导出任务创建失败', {
            taskId: task.id,
            error: result.reason?.message,
          });
        }
      }

      // 更新成功导出的任务数
      executionRecord.successfulExports = successfulExports.length;
      await executionRecord.save();

      // 发送邮件（如果有成功的导出）
      let emailResult: { success: boolean; error?: string; attachments: Array<{ filename: string; path: string }> } | null = null;
      if (successfulExports.length > 0 && task.recipient.length > 0) {
        try {
          emailResult = await this.emailService.sendReportEmails(task, successfulExports);
          if (emailResult.success) {
            executionRecord.emailStatus = 'success';
            executionRecord.emailAttachments = emailResult.attachments.map(att => ({
              filename: att.filename,
              path: att.path,
            }));
          } else {
            executionRecord.emailStatus = 'failed';
            executionRecord.emailErrorMessage = emailResult.error;
          }
        } catch (emailError) {
          executionRecord.emailStatus = 'failed';
          executionRecord.emailErrorMessage = emailError.message;
          logger.error('发送邮件失败', {
            taskId: task.id,
            error: emailError.message,
          });
        }
      } else if (task.recipient.length === 0) {
        executionRecord.emailStatus = 'not_sent';
      }

      // 更新执行记录为成功
      const executionEndTime = new Date();
      executionRecord.status = 'success';
      executionRecord.endTime = executionEndTime;
      executionRecord.duration = executionEndTime.getTime() - executionStartTime.getTime();
      await executionRecord.save();

      logger.info('定时任务执行完成', {
        taskId: task.id,
        totalExports: exportTasks.length,
        successfulExports: successfulExports.length,
      });
    } catch (error) {
      logger.error('定时任务执行异常', {
        taskId: task.id,
        error: error.message,
        stack: error.stack,
      });

      // 更新执行记录为失败
      if (executionRecord) {
        const executionEndTime = new Date();
        executionRecord.status = 'failed';
        executionRecord.endTime = executionEndTime;
        executionRecord.duration = executionEndTime.getTime() - executionStartTime.getTime();
        executionRecord.errorMessage = error.message;
        executionRecord.errorStack = error.stack;
        
        // 发送失败通知邮件
        if (task.recipient.length > 0) {
          try {
            await this.emailService.sendFailureNotification(task, error);
            executionRecord.emailStatus = 'success';
          } catch (emailError) {
            executionRecord.emailStatus = 'failed';
            executionRecord.emailErrorMessage = emailError.message;
            logger.error('发送失败通知邮件异常', {
              taskId: task.id,
              error: emailError.message,
            });
          }
        }
        
        await executionRecord.save();
      }

      throw error;
    }
  }

  /**
   * 计算时间范围
   * @param frequency 频率
   */
  private calculateTimeRange(frequency: string): { startTime: Date; endTime: Date } {
    const endTime = new Date();
    endTime.setHours(23, 59, 59, 999); // 今天结束

    let startTime = new Date();

    switch (frequency) {
      case 'daily':
        // 昨天开始到今天结束
        startTime.setDate(startTime.getDate() - 1);
        startTime.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        // 一周前开始到今天结束
        startTime.setDate(startTime.getDate() - 7);
        startTime.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        // 一个月前开始到今天结束
        startTime.setMonth(startTime.getMonth() - 1);
        startTime.setHours(0, 0, 0, 0);
        break;
      default:
        // 默认：昨天开始到今天结束
        startTime.setDate(startTime.getDate() - 1);
        startTime.setHours(0, 0, 0, 0);
    }

    return { startTime, endTime };
  }

  /**
   * 构建报表页面URL
   * @param pageId 页面ID
   * @param branchId 分支ID
   */
  private buildReportPageUrl(pageId: string, branchId: string): string {
    // 根据实际业务需求构建URL
    // 这里假设报表页面路径格式为 /report/{pageId}?branchId={branchId}
    return `/report/${pageId}?branchId=${branchId}`;
  }

  /**
   * 等待任务完成
   * @param taskId 任务ID
   * @param tenantId 租户ID
   * @param maxWaitTime 最大等待时间（毫秒），默认10分钟
   */
  private async waitForTaskCompletion(
    taskId: string,
    tenantId: string,
    maxWaitTime: number = 10 * 60 * 1000,
  ): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 2000; // 每2秒轮询一次

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const task = await this.reportExportService.findOne(taskId, tenantId);

        if (task.status === ExportTaskStatus.COMPLETED || task.status === ExportTaskStatus.FAILED) {
          return task;
        }

        // 等待后继续轮询
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        logger.error('轮询任务状态失败', {
          taskId,
          error: error.message,
        });
        throw error;
      }
    }

    throw new Error(`任务超时：${taskId}`);
  }


  /**
   * 检查任务是否正在运行
   * @param taskId 任务ID
   * @param tenantId 租户ID
   * @returns 是否正在运行
   */
  isTaskRunning(taskId: string, tenantId: string): boolean {
    const jobName = `scheduled-task-${taskId}-${tenantId}`;
    return this.schedulerRegistry.doesExist('cron', jobName);
  }

  /**
   * 获取任务的运行状态信息
   * @param taskId 任务ID
   * @param tenantId 租户ID
   * @returns 运行状态信息
   */
  getTaskStatus(taskId: string, tenantId: string): { isRunning: boolean; nextExecution?: Date } {
    const jobName = `scheduled-task-${taskId}-${tenantId}`;
    const isRunning = this.schedulerRegistry.doesExist('cron', jobName);
    
    let nextExecution: Date | undefined;
    if (isRunning) {
      const job = this.schedulerRegistry.getCronJob(jobName);
      if (job && job.nextDates) {
        nextExecution = job.nextDates().toDate();
      }
    }

    return {
      isRunning,
      nextExecution,
    };
  }

  /**
   * 清理所有定时任务
   */
  private clearAllJobs(): void {
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((job, name) => {
      if (name.startsWith('scheduled-task-')) {
        this.schedulerRegistry.deleteCronJob(name);
        logger.info('清理定时任务', { jobName: name });
      }
    });
  }
}

