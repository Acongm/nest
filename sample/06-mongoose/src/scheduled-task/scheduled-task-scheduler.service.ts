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
      
      const initialRecord = await executionRecord.save();
      logger.info('执行记录创建成功', {
        taskId: task.id,
        recordId: initialRecord._id?.toString(),
        tenantId: task.tenantId,
      });

      // 计算时间范围（根据频率计算开始和结束时间）
      const { startTime, endTime } = this.calculateTimeRange(task.frequency);

      // 检查 pageIds 和 branchIds 是否为空
      if (!task.pageIds || task.pageIds.length === 0) {
        logger.warn('定时任务没有配置 pageIds，跳过导出任务创建', {
          taskId: task.id,
          pageIds: task.pageIds,
        });
      }

      // 为每个 pageId 和 branchId 组合创建导出任务
      const exportTasks = [];

      logger.info('开始创建导出任务', {
        taskId: task.id,
        pageIds: task.pageIds,
        branchIds: task.branchIds,
        pageIdsLength: task.pageIds?.length || 0,
        branchIdsLength: task.branchIds?.length || 0,
        tenantId: task.tenantId,
        timeRange: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        },
      });

      for (const pageId of task.pageIds) {
        // 构建报表页面URL（不包含 branchId，因为会在 createExportTask 中为每个 branchId 添加）
        // 如果 pageId 是完整 URL，直接使用；如果是路径，构建基础路径
        let reportPage: string;
        try {
          const url = new URL(pageId);
          reportPage = url.pathname + (url.search || '');
        } catch {
          // 如果 pageId 是路径格式（以 / 开头），直接使用
          if (pageId.startsWith('/')) {
            reportPage = pageId;
          } else {
            // 否则，假设是页面ID，构建路径格式：/report/{pageId}
            reportPage = `/report/${pageId}`;
          }
        }
        
        logger.info('创建导出任务', {
          taskId: task.id,
          pageId,
          branchIds: task.branchIds,
          branchIdsCount: task.branchIds?.length || 0,
          reportPage,
        });

        try {
          // 创建导出任务
          // 如果 branchIds 有值，传入 branchIds 数组；否则传入空数组，会创建单个任务
          const exportTaskResult = await this.reportExportService.createExportTask(
            {
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              branchIds: task.branchIds && task.branchIds.length > 0 ? task.branchIds : undefined, // 如果为空数组，传 undefined
              reportPage,
              taskName: `定时任务-${task.id}`,
            },
            task.tenantId,
          );

          // createExportTask 返回数组（当传入 branchIds 时）或单个任务
          const createdTasks: any[] = Array.isArray(exportTaskResult) ? exportTaskResult : [exportTaskResult];

          logger.info('导出任务创建成功', {
            taskId: task.id,
            pageId,
            branchIds: task.branchIds,
            branchIdsCount: task.branchIds?.length || 0,
            reportPage,
            tasksCount: createdTasks.length,
            taskIds: createdTasks.map((t: any) => t._id.toString()),
          });

          // 为每个创建的任务添加到等待列表
          for (let i = 0; i < createdTasks.length; i++) {
            const exportTask = createdTasks[i];
            // 如果 branchIds 有值，使用对应的 branchId；否则使用 undefined
            const branchId = task.branchIds && task.branchIds.length > 0 ? task.branchIds[i] : undefined;

          exportTasks.push({
              exportTask: Promise.resolve(exportTask),
              pageId,
              branchId, // 保存对应的 branchId（可能为 undefined）
            });
          }
        } catch (createError: any) {
          logger.error('创建导出任务失败', {
            taskId: task.id,
            pageId,
            branchIds: task.branchIds,
            reportPage,
            error: createError.message,
            stack: createError.stack,
          });
          // 即使创建失败，也继续处理其他任务
        }
      }

      // 更新总导出任务数
      executionRecord.totalExports = exportTasks.length;
      await executionRecord.save();

      // 等待所有导出任务创建完成
      const results = await Promise.allSettled(
        exportTasks.map(({ exportTask }) => exportTask),
      );

      logger.info('导出任务创建完成', {
        taskId: task.id,
        totalTasks: exportTasks.length,
        fulfilled: results.filter(r => r.status === 'fulfilled').length,
        rejected: results.filter(r => r.status === 'rejected').length,
      });

      // 收集成功的导出任务
      const successfulExports = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const { pageId, branchId } = exportTasks[i];
        
        if (result.status === 'fulfilled') {
          const exportTask = result.value;
          const exportTaskId = exportTask._id.toString();
          
          logger.info('开始等待导出任务完成', {
            taskId: task.id,
            exportTaskId,
            pageId,
            branchId,
          });

          try {
          // 等待任务完成（使用定时任务的 tenantId）
          const completedTask = await this.waitForTaskCompletion(
              exportTaskId,
            task.tenantId,
          );

            logger.info('导出任务完成', {
              taskId: task.id,
              exportTaskId,
              pageId,
              branchId,
              status: completedTask.status,
              filePath: completedTask.filePath,
            });

          if (completedTask.status === ExportTaskStatus.COMPLETED && completedTask.filePath) {
            successfulExports.push({
              task: completedTask,
              pageId,
              branchId,
              });
            } else {
              logger.warn('导出任务未成功完成', {
                taskId: task.id,
                exportTaskId,
                pageId,
                branchId,
                status: completedTask.status,
                errorMessage: completedTask.errorMessage,
              });
            }
          } catch (waitError: any) {
            logger.error('等待导出任务完成失败', {
              taskId: task.id,
              exportTaskId,
              pageId,
              branchId,
              error: waitError.message,
              stack: waitError.stack,
            });
          }
        } else {
          logger.error('导出任务创建失败', {
            taskId: task.id,
            pageId,
            branchId,
            error: result.reason?.message,
            stack: result.reason?.stack,
          });
        }
      }

      logger.info('所有导出任务处理完成', {
        taskId: task.id,
        totalTasks: exportTasks.length,
        successfulExports: successfulExports.length,
      });

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
      } else if (task.recipient.length === 0) {
        executionRecord.emailStatus = 'not_sent';
        logger.info('未配置收件人，邮件状态设为未发送', {
          taskId: task.id,
        });
      } else if (successfulExports.length === 0) {
        executionRecord.emailStatus = 'not_sent';
        logger.info('没有成功的导出，邮件状态设为未发送', {
          taskId: task.id,
        });
      }

      // 更新执行记录为成功
      const executionEndTime = new Date();
      executionRecord.status = 'success';
      executionRecord.endTime = executionEndTime;
      executionRecord.duration = executionEndTime.getTime() - executionStartTime.getTime();

      // 保存执行记录，并记录详细信息
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
        // 即使保存失败，也不抛出错误，避免影响主流程
      }

      logger.info('定时任务执行完成', {
        taskId: task.id,
        tenantId: task.tenantId,
        totalExports: exportTasks.length,
        successfulExports: successfulExports.length,
        emailStatus: executionRecord.emailStatus,
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
      } else {
        logger.warn('执行记录未创建，无法保存失败信息', {
          taskId: task.id,
        });
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

