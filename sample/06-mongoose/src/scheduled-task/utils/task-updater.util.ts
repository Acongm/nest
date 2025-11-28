import { Model } from 'mongoose';
import { CreateScheduledTaskDto } from '../dto';
import { ScheduledTask, ScheduledTaskDocument } from '../schemas/scheduled-task.schema';
import { FrequencyEnum } from '../enums/frequency.enum';
import { CronGenerator } from './cron-generator.util';

/**
 * 定时任务更新工具类
 * 负责处理任务的创建和更新操作
 * @class TaskUpdater
 */
export class TaskUpdater {
  /**
   * 更新任务的启用状态为禁用
   * @param {Model<ScheduledTaskDocument>} taskModel - Mongoose Model
   * @param {string} taskId - 任务ID
   * @param {string} tenantId - 租户ID
   * @returns {Promise<ScheduledTask>} 返回更新后的任务对象
   */
  static async disableTask(
    taskModel: Model<ScheduledTaskDocument>,
    taskId: string,
    tenantId: string,
  ): Promise<ScheduledTask> {
    try {
      // 使用 upsert 原子性地更新或创建任务，避免并发问题
      const updatedTask = await taskModel
        .findOneAndUpdate(
          { id: taskId, tenantId },
          {
            $set: {
              enable: false,
              updated: new Date()
            },
            $setOnInsert: {
              // 仅在插入时设置这些字段
              id: taskId,
              tenantId,
              frequency: FrequencyEnum.DAILY,
              time: { time: '00:00' },
              recipient: [],
              pageIds: [],
              branchIds: [],
              cronExpression: '0 0 0 * * *',
              created: new Date(),
            }
          },
          { 
            new: true, // 返回更新后的文档
            upsert: true, // 如果不存在则创建
            runValidators: true, // 运行验证器
          }
        )
        .exec();
      
      if (!updatedTask) {
        throw new Error(`任务 ${taskId} 更新失败`);
      }
      
      return updatedTask;
    } catch (error: any) {
      // 如果是重复键错误，说明数据库中仍有旧的 id_1 唯一索引
      if (error.code === 11000 && error.keyPattern?.id) {
        throw new Error(
          `数据库索引错误：仍存在旧的 id_1 唯一索引。请运行修复脚本删除该索引：` +
          `db.scheduled_tasks.dropIndex("id_1")`
        );
      }
      throw error;
    }
  }

  /**
   * 启用或更新任务
   * @param {Model<ScheduledTaskDocument>} taskModel - Mongoose Model
   * @param {string} taskId - 任务ID
   * @param {CreateScheduledTaskDto} taskData - 定时任务数据
   * @param {string} tenantId - 租户ID
   * @returns {Promise<ScheduledTask>} 返回创建或更新后的任务对象
   */
  static async enableOrUpdateTask(
    taskModel: Model<ScheduledTaskDocument>,
    taskId: string,
    taskData: CreateScheduledTaskDto,
    tenantId: string,
  ): Promise<ScheduledTask> {
    try {
      // 生成 cron 表达式
      const cronExpression = CronGenerator.generate(taskData.frequency!, taskData.time!);

      // 构建更新数据
      const updateData: any = {
        enable: true,
        frequency: taskData.frequency!,
        time: taskData.time!,
        recipient: taskData.recipient!,
        pageIds: taskData.pageIds!,
        cronExpression,
        updated: new Date(),
      };
      
      // branchIds 允许为空数组，如果提供了就更新
      if (taskData.branchIds !== undefined) {
        updateData.branchIds = taskData.branchIds;
      }

      // 使用 upsert 原子性地更新或创建任务，避免并发问题
      const updatedTask = await taskModel
        .findOneAndUpdate(
          { id: taskId, tenantId },
          {
            $set: updateData,
            $setOnInsert: {
              // 仅在插入时设置这些字段
              id: taskId,
              tenantId,
              created: new Date(),
            }
          },
          { 
            new: true, // 返回更新后的文档
            upsert: true, // 如果不存在则创建
            runValidators: true, // 运行验证器
          }
        )
        .exec();
      
      if (!updatedTask) {
        throw new Error(`任务 ${taskId} 更新失败`);
      }
      
      return updatedTask;
    } catch (error: any) {
      // 如果是重复键错误，说明数据库中仍有旧的 id_1 唯一索引
      if (error.code === 11000 && error.keyPattern?.id) {
        throw new Error(
          `数据库索引错误：仍存在旧的 id_1 唯一索引。请运行修复脚本删除该索引：` +
          `db.scheduled_tasks.dropIndex("id_1") 或执行 scripts/fix-scheduled-tasks-index-complete.js`
        );
      }
      throw error;
    }
  }
}

