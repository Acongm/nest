import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateScheduledTaskDto } from './dto';
import { ScheduledTask, ScheduledTaskDocument } from './schemas/scheduled-task.schema';
import { TaskValidator } from './utils/task-validator.util';
import { TaskUpdater } from './utils/task-updater.util';
import { ScheduledTaskSchedulerService } from './scheduled-task-scheduler.service';

/**
 * 定时任务服务类
 * 负责定时任务的业务逻辑处理，包括创建、更新、查询等操作
 * @class ScheduledTaskService
 */
@Injectable()
export class ScheduledTaskService {
  /**
   * 系统固定的任务ID
   * @private
   * @type {string}
   */
  private readonly SYSTEM_TASK_ID = 'security-operations-report-system';

  /**
   * 构造函数，注入 Mongoose Model 和调度服务
   * @param {Model<ScheduledTaskDocument>} taskModel - 定时任务 Mongoose Model
   * @param {ScheduledTaskSchedulerService} schedulerService - 定时任务调度服务
   */
  constructor(
    @InjectModel(ScheduledTask.name)
    private taskModel: Model<ScheduledTaskDocument>,
    @Inject(forwardRef(() => ScheduledTaskSchedulerService))
    private schedulerService: ScheduledTaskSchedulerService,
  ) {}

  /**
   * 获取所有定时任务列表（按租户ID）
   * 按创建时间倒序排列
   * @param tenantId 租户ID
   * @returns {Promise<ScheduledTask[]>} 返回所有定时任务数组
   */
  async findAll(tenantId: string): Promise<ScheduledTask[]> {
    return await this.taskModel
      .find({ tenantId })
      .sort({ created: -1 })
      .exec();
  }

  /**
   * 创建或更新定时任务
   * 使用固定的系统任务ID，如果任务已存在则更新，不存在则创建新任务
   * 当 enable: false 时，只更新 enable 字段，其他字段保持不变
   * 当 enable: true 时，cronExpression 会根据 frequency 和 time 自动生成
   * @param {CreateScheduledTaskDto} taskData - 定时任务数据
   * @param tenantId 租户ID
   * @returns {Promise<ScheduledTask>} 返回创建或更新后的任务对象
   */
  async createOrUpdate(taskData: CreateScheduledTaskDto, tenantId: string): Promise<ScheduledTask> {
    const taskId = this.SYSTEM_TASK_ID;

    let updatedTask: ScheduledTask;

    // 如果是关闭操作（enable: false），只更新 enable 字段
    if (!taskData.enable) {
      updatedTask = await TaskUpdater.disableTask(this.taskModel, taskId, tenantId);
      // 取消调度
      this.schedulerService.unscheduleTask(taskId, tenantId);
    } else {
      // enable: true 时，验证必填字段
      TaskValidator.validateEnableTask(taskData);

      // 启用或更新任务（包含 tenantId）
      updatedTask = await TaskUpdater.enableOrUpdateTask(this.taskModel, taskId, taskData, tenantId);
      // 重新调度任务
      await this.schedulerService.rescheduleTask(taskId, tenantId);
    }

    return updatedTask;
  }
}