import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ScheduledTask, ScheduledTaskDocument } from './schemas/scheduled-task.schema';
import { TaskExecutionRecord, TaskExecutionRecordDocument } from '../task-execution-record/schemas/task-execution-record.schema';
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
  
  // 从环境变量读取重试次数，默认3次
  private readonly EXPORT_RETRY_COUNT = parseInt(
    process.env.EXPORT_RETRY_COUNT || '3',
    10,
  );

  // 从环境变量读取默认时区，默认为 Asia/Shanghai
  private readonly DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Shanghai';

  constructor(
    @InjectModel(ScheduledTask.name)
    private taskModel: Model<ScheduledTaskDocument>,
    @InjectModel(TaskExecutionRecord.name)
    private executionRecordModel: Model<TaskExecutionRecordDocument>,
    private schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => ReportExportService))
    private reportExportService: ReportExportService,
    private emailService: ScheduledTaskEmailService,
  ) { }

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

    // 获取任务的时区配置，使用环境变量中的默认时区
    const timezone = task.timezone || this.DEFAULT_TIMEZONE;

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
      timezone, // 使用任务指定的时区
    );

    // 注册任务（使用类型断言解决类型不匹配问题）
    this.schedulerRegistry.addCronJob(jobName, job as any);

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
   * 立即触发执行指定任务（用于测试）
   * @param taskId 任务ID
   * @param tenantId 租户ID
   * @returns Promise<void>
   */
  async triggerTaskExecution(taskId: string, tenantId: string): Promise<void> {
    logger.info('手动触发定时任务执行', { taskId, tenantId });

    // 查找任务
    const task = await this.taskModel.findOne({ id: taskId, tenantId }).exec();
    if (!task) {
      throw new Error(`任务不存在：${taskId} (租户: ${tenantId})`);
    }

    if (!task.enable) {
      throw new Error(`任务未启用：${taskId}`);
    }

    // 执行任务（异步执行，不阻塞）
    this.executeTask(task).catch((error) => {
      logger.error('手动触发任务执行失败', {
        taskId,
        tenantId,
        error: error.message,
        stack: error.stack,
      });
    });

    logger.info('定时任务已触发执行', { taskId, tenantId });
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
      pageIdsLength: task.pageIds?.length || 0,
      branchIdsLength: task.branchIds?.length || 0,
    });

    try {
      // 创建执行记录
      executionRecord = await this.createExecutionRecord(task, executionStartTime);

      // 计算时间范围（按照任务指定的时区）
      const timezone = task.timezone || this.DEFAULT_TIMEZONE;
      const { startTime, endTime } = this.calculateTimeRange(task.frequency, timezone);

      // 创建并等待导出任务完成（串行执行，避免内存压力）
      const successfulExports = await this.createAndWaitForExportTasks(
        task,
        startTime,
        endTime,
        executionRecord,
      );

      // 更新成功导出的任务数
      executionRecord.successfulExports = successfulExports.length;
      await executionRecord.save();

      // 发送邮件
      await this.sendReportEmails(task, successfulExports, executionRecord);

      // 保存执行记录为成功
      await this.saveExecutionRecordSuccess(executionRecord, executionStartTime, task);

      logger.info('定时任务执行完成', {
        taskId: task.id,
        tenantId: task.tenantId,
        totalExports: executionRecord.totalExports,
        successfulExports: successfulExports.length,
        emailStatus: executionRecord.emailStatus,
      });
    } catch (error) {
      await this.handleExecutionError(task, executionRecord, executionStartTime, error);
      throw error;
    }
  }

  /**
   * 创建执行记录
   */
  private async createExecutionRecord(
    task: ScheduledTask,
    startTime: Date,
  ): Promise<TaskExecutionRecordDocument> {
    const executionRecord = new this.executionRecordModel({
      taskId: task.id,
      tenantId: task.tenantId,
      status: 'success',
      startTime,
      emailStatus: 'not_sent',
      recipients: task.recipient,
      totalExports: 0,
      successfulExports: 0,
      emailAttachments: [],
    });

    const savedRecord = await executionRecord.save();
    logger.info('执行记录创建成功', {
      taskId: task.id,
      recordId: savedRecord._id?.toString(),
      tenantId: task.tenantId,
    });

    return savedRecord;
  }

  /**
   * 构建报表页面路径
   */
  private buildReportPagePath(pageId: string): string {
    try {
      const url = new URL(pageId);
      return url.pathname + (url.search || '');
    } catch {
      if (pageId.startsWith('/')) {
        return pageId;
      }
      return `/report/${pageId}`;
    }
  }

  /**
   * 为单个页面创建导出任务并等待完成（串行执行，避免并发内存过大）
   */
  private async createExportTasksForPage(
    task: ScheduledTask,
    pageId: string,
    startTime: Date,
    endTime: Date,
    executionRecord: TaskExecutionRecordDocument,
  ): Promise<Array<{ task: any; pageId: string; branchId?: string }>> {
    const reportPage = this.buildReportPagePath(pageId);

    logger.info('开始处理页面导出', {
      taskId: task.id,
      pageId,
      branchIds: task.branchIds,
      branchIdsCount: task.branchIds?.length || 0,
      reportPage,
    });

    try {
      // 获取任务的时区配置
      const timezone = task.timezone || this.DEFAULT_TIMEZONE;

      const exportTaskResult = await this.reportExportService.createExportTask(
        {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          branchIds: task.branchIds && task.branchIds.length > 0 ? task.branchIds : undefined,
          reportPage,
          taskName: `定时任务-${task.id}`,
          timezone, // 传递时区信息
        },
        task.tenantId,
      );

      const createdTasks: any[] = Array.isArray(exportTaskResult) ? exportTaskResult : [exportTaskResult];

      // 更新总导出任务数
      executionRecord.totalExports += createdTasks.length;
      await executionRecord.save();

      logger.info('导出任务创建成功，开始等待完成', {
        taskId: task.id,
        pageId,
        branchIds: task.branchIds,
        branchIdsCount: task.branchIds?.length || 0,
        reportPage,
        tasksCount: createdTasks.length,
        taskIds: createdTasks.map((t: any) => t._id.toString()),
      });

      const successfulExports: Array<{ task: any; pageId: string; branchId?: string }> = [];
      let pageSuccessfulCount = 0;

      // 串行等待每个导出任务完成，确保单个任务完成后再处理下一个
      for (let i = 0; i < createdTasks.length; i++) {
        const exportTask = createdTasks[i];
        const exportTaskId = exportTask._id.toString();
        const branchId = task.branchIds && task.branchIds.length > 0 ? task.branchIds[i] : undefined;

        // 等待当前导出任务完成（带重试机制）
        const result = await this.waitForSingleExportTask(task, exportTaskId, pageId, branchId, 0);
        if (result) {
          successfulExports.push(result);
          pageSuccessfulCount++;
          logger.info('页面导出任务成功完成', {
            taskId: task.id,
            pageId,
            branchId,
            exportTaskId,
            currentIndex: i + 1,
            totalTasks: createdTasks.length,
          });
        } else {
          logger.warn('页面导出任务最终失败', {
            taskId: task.id,
            pageId,
            branchId,
            exportTaskId,
            currentIndex: i + 1,
            totalTasks: createdTasks.length,
          });
        }
      }

      logger.info('页面所有导出任务处理完成', {
        taskId: task.id,
        pageId,
        pageExportsCount: createdTasks.length,
        pageSuccessfulExports: pageSuccessfulCount,
        pageFailedExports: createdTasks.length - pageSuccessfulCount,
      });

      return successfulExports;
    } catch (createError: any) {
      logger.error('创建导出任务失败', {
        taskId: task.id,
        pageId,
        branchIds: task.branchIds,
        reportPage,
        error: createError.message,
        stack: createError.stack,
      });
      return [];
    }
  }

  /**
   * 等待单个导出任务完成（带重试机制）
   */
  private async waitForSingleExportTask(
    task: ScheduledTask,
    exportTaskId: string,
    pageId: string,
    branchId?: string,
    retryCount: number = 0,
  ): Promise<{ task: any; pageId: string; branchId?: string } | null> {
    logger.info('开始等待导出任务完成', {
      taskId: task.id,
      exportTaskId,
      pageId,
      branchId,
      retryCount,
      maxRetries: this.EXPORT_RETRY_COUNT,
    });

    try {
      const completedTask = await this.waitForTaskCompletion(exportTaskId, task.tenantId);

      logger.info('导出任务完成', {
        taskId: task.id,
        exportTaskId,
        pageId,
        branchId,
        status: completedTask.status,
        filePath: completedTask.filePath,
        retryCount,
      });

      if (completedTask.status === ExportTaskStatus.COMPLETED && completedTask.filePath) {
        return {
          task: completedTask,
          pageId,
          branchId,
        };
      } else {
        // 导出任务失败，检查是否需要重试
        if (retryCount < this.EXPORT_RETRY_COUNT) {
          logger.warn('导出任务失败，准备重试', {
            taskId: task.id,
            exportTaskId,
            pageId,
            branchId,
            status: completedTask.status,
            errorMessage: completedTask.errorMessage,
            retryCount,
            maxRetries: this.EXPORT_RETRY_COUNT,
            nextRetry: retryCount + 1,
          });

          // 等待一段时间后重试（指数退避：1秒、2秒、4秒...）
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));

          // 重新创建导出任务并重试
          try {
            const { startTime, endTime } = this.calculateTimeRange(task.frequency);
            const reportPage = this.buildReportPagePath(pageId);
            
            // 重新创建导出任务
            const retryExportTaskResult = await this.reportExportService.createExportTask(
              {
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                branchIds: branchId ? [branchId] : undefined,
                reportPage,
                taskName: `定时任务-${task.id}-重试${retryCount + 1}`,
              },
              task.tenantId,
            );

            const retryTask = Array.isArray(retryExportTaskResult) 
              ? retryExportTaskResult[0] 
              : retryExportTaskResult;
            const retryTaskId = retryTask._id.toString();

            logger.info('重试导出任务已创建', {
              taskId: task.id,
              originalExportTaskId: exportTaskId,
              retryExportTaskId: retryTaskId,
              pageId,
              branchId,
              retryCount: retryCount + 1,
            });

            // 递归调用，增加重试次数
            return await this.waitForSingleExportTask(
              task,
              retryTaskId,
              pageId,
              branchId,
              retryCount + 1,
            );
          } catch (retryCreateError: any) {
            logger.error('重试创建导出任务失败', {
              taskId: task.id,
              exportTaskId,
              pageId,
              branchId,
              retryCount,
              error: retryCreateError.message,
              stack: retryCreateError.stack,
            });
            return null;
          }
        } else {
          // 已达到最大重试次数
          logger.error('导出任务失败，已达到最大重试次数', {
            taskId: task.id,
            exportTaskId,
            pageId,
            branchId,
            status: completedTask.status,
            errorMessage: completedTask.errorMessage,
            retryCount,
            maxRetries: this.EXPORT_RETRY_COUNT,
          });
          return null;
        }
      }
    } catch (waitError: any) {
      // 等待过程中出错，检查是否需要重试
      if (retryCount < this.EXPORT_RETRY_COUNT) {
        logger.warn('等待导出任务完成失败，准备重试', {
          taskId: task.id,
          exportTaskId,
          pageId,
          branchId,
          error: waitError.message,
          retryCount,
          maxRetries: this.EXPORT_RETRY_COUNT,
          nextRetry: retryCount + 1,
        });

        // 等待一段时间后重试（指数退避）
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // 重新创建导出任务并重试
        try {
          const { startTime, endTime } = this.calculateTimeRange(task.frequency);
          const reportPage = this.buildReportPagePath(pageId);
          
          // 重新创建导出任务
          const retryExportTaskResult = await this.reportExportService.createExportTask(
            {
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              branchIds: branchId ? [branchId] : undefined,
              reportPage,
              taskName: `定时任务-${task.id}-重试${retryCount + 1}`,
            },
            task.tenantId,
          );

          const retryTask = Array.isArray(retryExportTaskResult) 
            ? retryExportTaskResult[0] 
            : retryExportTaskResult;
          const retryTaskId = retryTask._id.toString();

          logger.info('重试导出任务已创建（异常重试）', {
            taskId: task.id,
            originalExportTaskId: exportTaskId,
            retryExportTaskId: retryTaskId,
            pageId,
            branchId,
            retryCount: retryCount + 1,
          });

          // 递归调用，增加重试次数
          return await this.waitForSingleExportTask(
            task,
            retryTaskId,
            pageId,
            branchId,
            retryCount + 1,
          );
        } catch (retryCreateError: any) {
          logger.error('重试创建导出任务失败（异常重试）', {
            taskId: task.id,
            exportTaskId,
            pageId,
            branchId,
            retryCount,
            error: retryCreateError.message,
            stack: retryCreateError.stack,
          });
          return null;
        }
      } else {
        // 已达到最大重试次数
        logger.error('等待导出任务完成失败，已达到最大重试次数', {
          taskId: task.id,
          exportTaskId,
          pageId,
          branchId,
          error: waitError.message,
          stack: waitError.stack,
          retryCount,
          maxRetries: this.EXPORT_RETRY_COUNT,
        });
        return null;
      }
    }
  }

  /**
   * 创建并等待所有导出任务完成（串行执行）
   * 每个页面在 createExportTasksForPage 中已经完成导出，这里只需要串行调用并收集结果
   */
  private async createAndWaitForExportTasks(
    task: ScheduledTask,
    startTime: Date,
    endTime: Date,
    executionRecord: TaskExecutionRecordDocument,
  ): Promise<Array<{ task: any; pageId: string; branchId?: string }>> {
    if (!task.pageIds || task.pageIds.length === 0) {
      logger.warn('定时任务没有配置 pageIds，跳过导出任务创建', {
        taskId: task.id,
        pageIds: task.pageIds,
      });
      return [];
    }

    logger.info('开始创建并执行导出任务', {
      taskId: task.id,
      pageIds: task.pageIds,
      branchIds: task.branchIds,
      pageIdsLength: task.pageIds.length,
      branchIdsLength: task.branchIds?.length || 0,
      tenantId: task.tenantId,
      timeRange: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });

    const successfulExports: Array<{ task: any; pageId: string; branchId?: string }> = [];

    // 串行处理每个 pageId，确保单个页面导出文件后才执行下一个导出
    // createExportTasksForPage 内部已经串行等待所有导出任务完成，避免并发内存过大
    for (let i = 0; i < task.pageIds.length; i++) {
      const pageId = task.pageIds[i];
      
      logger.info('开始处理页面导出', {
        taskId: task.id,
        pageId,
        currentPageIndex: i + 1,
        totalPages: task.pageIds.length,
      });

      // 为当前 pageId 创建导出任务并等待完成（内部串行执行）
      // createExportTasksForPage 内部会更新 executionRecord.totalExports
      const pageExports = await this.createExportTasksForPage(task, pageId, startTime, endTime, executionRecord);

      // 收集成功的导出结果
      successfulExports.push(...pageExports);

      logger.info('页面导出处理完成', {
        taskId: task.id,
        pageId,
        currentPageIndex: i + 1,
        totalPages: task.pageIds.length,
        pageSuccessfulExports: pageExports.length,
        totalSuccessfulExports: successfulExports.length,
      });
    }

    logger.info('所有导出任务处理完成', {
      taskId: task.id,
      totalTasks: executionRecord.totalExports,
      successfulExports: successfulExports.length,
    });

    return successfulExports;
  }

  /**
   * 发送报表邮件
   */
  private async sendReportEmails(
    task: ScheduledTask,
    successfulExports: Array<{ task: any; pageId: string; branchId?: string }>,
    executionRecord: TaskExecutionRecordDocument,
  ): Promise<void> {
    if (successfulExports.length === 0) {
      executionRecord.emailStatus = 'not_sent';
      logger.info('没有成功的导出，邮件状态设为未发送', {
        taskId: task.id,
      });
      return;
    }

    if (task.recipient.length === 0) {
      executionRecord.emailStatus = 'not_sent';
      logger.info('未配置收件人，邮件状态设为未发送', {
        taskId: task.id,
      });
      return;
    }

    try {
      const emailResult = await this.emailService.sendReportEmails(task, successfulExports);
      if (emailResult.success) {
        executionRecord.emailStatus = 'success';
        executionRecord.emailAttachments = emailResult.attachments.map(att => ({
          filename: att.filename,
          path: att.path,
        }));
        logger.info('邮件发送成功，更新执行记录', {
          taskId: task.id,
          attachmentsCount: emailResult.attachments.length,
        });
      } else {
        executionRecord.emailStatus = 'failed';
        executionRecord.emailErrorMessage = emailResult.error;
        logger.warn('邮件发送失败，更新执行记录', {
          taskId: task.id,
          error: emailResult.error,
        });
      }
    } catch (emailError) {
      executionRecord.emailStatus = 'failed';
      executionRecord.emailErrorMessage = emailError.message;
      logger.error('发送邮件异常', {
        taskId: task.id,
        error: emailError.message,
        stack: emailError.stack,
      });
    }
  }

  /**
   * 保存执行记录为成功状态
   */
  private async saveExecutionRecordSuccess(
    executionRecord: TaskExecutionRecordDocument,
    executionStartTime: Date,
    task: ScheduledTask,
  ): Promise<void> {
    const executionEndTime = new Date();
    executionRecord.status = 'success';
    executionRecord.endTime = executionEndTime;
    executionRecord.duration = executionEndTime.getTime() - executionStartTime.getTime();

    try {
      const savedRecord = await executionRecord.save();
      logger.info('执行记录保存成功', {
        taskId: task.id,
        recordId: savedRecord._id?.toString(),
        tenantId: savedRecord.tenantId,
        status: savedRecord.status,
        emailStatus: savedRecord.emailStatus,
        totalExports: savedRecord.totalExports,
        successfulExports: savedRecord.successfulExports,
        duration: savedRecord.duration,
      });
    } catch (saveError) {
      logger.error('执行记录保存失败', {
        taskId: task.id,
        error: saveError.message,
        stack: saveError.stack,
      });
    }
  }

  /**
   * 处理执行错误
   */
  private async handleExecutionError(
    task: ScheduledTask,
    executionRecord: TaskExecutionRecordDocument | null,
    executionStartTime: Date,
    error: any,
  ): Promise<void> {
    logger.error('定时任务执行异常', {
      taskId: task.id,
      error: error.message,
      stack: error.stack,
    });

    if (!executionRecord) {
      logger.warn('执行记录未创建，无法保存失败信息', {
        taskId: task.id,
      });
      return;
    }

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
        logger.info('失败通知邮件发送成功', {
          taskId: task.id,
        });
      } catch (emailError) {
        executionRecord.emailStatus = 'failed';
        executionRecord.emailErrorMessage = emailError.message;
        logger.error('发送失败通知邮件异常', {
          taskId: task.id,
          error: emailError.message,
        });
      }
    }

    // 保存失败的执行记录
    try {
      const savedRecord = await executionRecord.save();
      logger.info('失败执行记录保存成功', {
        taskId: task.id,
        recordId: savedRecord._id?.toString(),
        tenantId: savedRecord.tenantId,
        status: savedRecord.status,
        errorMessage: savedRecord.errorMessage,
      });
    } catch (saveError) {
      logger.error('失败执行记录保存失败', {
        taskId: task.id,
        error: saveError.message,
        stack: saveError.stack,
      });
    }
  }

  /**
   * 在指定时区获取当前日期时间的各个部分
   * @param timezone 时区（IANA 时区标识符）
   * @returns 包含年、月、日、时、分、秒的对象
   */
  private getCurrentDateTimePartsInTimezone(timezone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  } {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    return {
      year: parseInt(parts.find(p => p.type === 'year')?.value || '0', 10),
      month: parseInt(parts.find(p => p.type === 'month')?.value || '0', 10),
      day: parseInt(parts.find(p => p.type === 'day')?.value || '0', 10),
      hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10),
      minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10),
      second: parseInt(parts.find(p => p.type === 'second')?.value || '0', 10),
    };
  }

  /**
   * 在指定时区创建日期对象
   * 将时区的日期时间转换为 UTC Date 对象
   * @param year 年
   * @param month 月（1-12）
   * @param day 日
   * @param hour 时
   * @param minute 分
   * @param second 秒
   * @param timezone 时区（IANA 时区标识符）
   * @returns Date 对象（UTC）
   */
  private createDateInTimezone(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timezone: string,
  ): Date {
    // 创建一个参考日期（该时区的日期时间）
    // 使用一个技巧：创建一个 UTC 日期，然后通过时区偏移调整
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    // 获取该时区在该时间点的偏移
    // 方法：比较 UTC 时间和时区时间在同一时刻的表示
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // 获取 UTC 日期在该时区的表示
    const tzParts = tzFormatter.formatToParts(utcDate);
    const tzYear = parseInt(tzParts.find(p => p.type === 'year')?.value || '0', 10);
    const tzMonth = parseInt(tzParts.find(p => p.type === 'month')?.value || '0', 10);
    const tzDay = parseInt(tzParts.find(p => p.type === 'day')?.value || '0', 10);
    const tzHour = parseInt(tzParts.find(p => p.type === 'hour')?.value || '0', 10);
    const tzMinute = parseInt(tzParts.find(p => p.type === 'minute')?.value || '0', 10);
    const tzSecond = parseInt(tzParts.find(p => p.type === 'second')?.value || '0', 10);

    // 计算偏移：目标时区时间 - UTC 时间
    const targetTzDate = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond));
    const offsetMs = targetTzDate.getTime() - utcDate.getTime();

    // 调整：我们需要的是该时区时间对应的 UTC 时间
    // 所以需要反向调整
    const resultDate = new Date(utcDate.getTime() - offsetMs);

    return resultDate;
  }

  /**
   * 计算时间范围（按照指定时区）
   * @param frequency 频率
   * @param timezone 时区（IANA 时区标识符，如 Asia/Shanghai）
   */
  private calculateTimeRange(frequency: string, timezone?: string): { startTime: Date; endTime: Date } {
    // 使用传入的时区或默认时区
    const tz = timezone || this.DEFAULT_TIMEZONE;
    // 获取指定时区的当前日期时间部分
    const now = this.getCurrentDateTimePartsInTimezone(tz);

    // 创建今天结束时间（23:59:59）
    const endTime = this.createDateInTimezone(
      now.year,
      now.month,
      now.day,
      23,
      59,
      59,
      tz,
    );

    let startTime: Date;

    switch (frequency) {
      case 'daily':
        // 昨天开始到今天结束
        const yesterday = new Date(now.year, now.month - 1, now.day);
        yesterday.setDate(yesterday.getDate() - 1);
        startTime = this.createDateInTimezone(
          yesterday.getFullYear(),
          yesterday.getMonth() + 1,
          yesterday.getDate(),
          0,
          0,
          0,
          tz,
        );
        break;
      case 'weekly':
        // 一周前开始到今天结束
        const weekAgo = new Date(now.year, now.month - 1, now.day);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startTime = this.createDateInTimezone(
          weekAgo.getFullYear(),
          weekAgo.getMonth() + 1,
          weekAgo.getDate(),
          0,
          0,
          0,
          tz,
        );
        break;
      case 'monthly':
        // 一个月前开始到今天结束
        const monthAgo = new Date(now.year, now.month - 1, now.day);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startTime = this.createDateInTimezone(
          monthAgo.getFullYear(),
          monthAgo.getMonth() + 1,
          monthAgo.getDate(),
          0,
          0,
          0,
          tz,
        );
        break;
      default:
        // 默认：昨天开始到今天结束
        const defaultYesterday = new Date(now.year, now.month - 1, now.day);
        defaultYesterday.setDate(defaultYesterday.getDate() - 1);
        startTime = this.createDateInTimezone(
          defaultYesterday.getFullYear(),
          defaultYesterday.getMonth() + 1,
          defaultYesterday.getDate(),
          0,
          0,
          0,
          tz,
        );
    }

    logger.info('计算时间范围', {
      frequency,
      timezone: tz,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    return { startTime, endTime };
  }

  /**
   * 构建报表页面URL
   * @param pageId 页面ID或页面路径
   * @param branchId 分支ID
   */
  private buildReportPageUrl(pageId: string, branchId: string): string {
    // 如果 pageId 已经是完整 URL，直接使用并添加 branchId 参数
    try {
      const url = new URL(pageId);
      url.searchParams.set('branchId', branchId);
      return url.toString();
    } catch {
      // 如果 pageId 不是完整 URL，构建相对路径
      // 如果 pageId 已经是路径格式（以 / 开头），直接使用
      if (pageId.startsWith('/')) {
        const separator = pageId.includes('?') ? '&' : '?';
        return `${pageId}${separator}branchId=${branchId}`;
      }
      // 否则，假设是页面ID，构建路径格式：/report/{pageId}?branchId={branchId}
    return `/report/${pageId}?branchId=${branchId}`;
    }
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
    let lastStatus: string | null = null;
    let pollCount = 0;

    logger.info('开始轮询任务状态', {
      taskId,
      tenantId,
      maxWaitTime: `${maxWaitTime / 1000}秒`,
    });

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const task = await this.reportExportService.findOne(taskId, tenantId);
        
        if (!task) {
          throw new Error(`任务不存在：${taskId}`);
        }

        // 如果状态发生变化，记录日志
        if (task.status !== lastStatus) {
          logger.info('任务状态更新', {
            taskId,
            oldStatus: lastStatus,
            newStatus: task.status,
            pollCount,
          });
          lastStatus = task.status;
        }

        if (task.status === ExportTaskStatus.COMPLETED || task.status === ExportTaskStatus.FAILED) {
          logger.info('任务完成（成功或失败）', {
            taskId,
            status: task.status,
            filePath: task.filePath,
            errorMessage: task.errorMessage,
            pollCount,
            elapsedTime: `${(Date.now() - startTime) / 1000}秒`,
          });
          return task;
        }

        pollCount++;
        // 每10次轮询记录一次日志（避免日志过多）
        if (pollCount % 10 === 0) {
          logger.debug('继续轮询任务状态', {
            taskId,
            status: task.status,
            pollCount,
            elapsedTime: `${(Date.now() - startTime) / 1000}秒`,
          });
        }

        // 等待后继续轮询
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error: any) {
        logger.error('轮询任务状态失败', {
          taskId,
          tenantId,
          error: error.message,
          stack: error.stack,
          pollCount,
        });
        throw error;
      }
    }

    // 超时前最后一次查询，获取最新状态
    try {
      const finalTask = await this.reportExportService.findOne(taskId, tenantId);
      logger.warn('任务等待超时', {
        taskId,
        finalStatus: finalTask?.status,
        maxWaitTime: `${maxWaitTime / 1000}秒`,
        pollCount,
      });
    } catch (e) {
      // 忽略最后的查询错误
    }

    throw new Error(`任务超时：${taskId}（等待时间：${maxWaitTime / 1000}秒）`);
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
      if (job && job.nextDate) {
        nextExecution = job.nextDate().toJSDate();
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

