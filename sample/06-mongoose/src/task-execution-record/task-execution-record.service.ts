import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TaskExecutionRecord, TaskExecutionRecordDocument } from './schemas/task-execution-record.schema';

/**
 * 定时任务执行记录服务
 * 负责执行记录的查询等操作
 */
@Injectable()
export class TaskExecutionRecordService {
  constructor(
    @InjectModel(TaskExecutionRecord.name)
    private executionRecordModel: Model<TaskExecutionRecordDocument>,
  ) {}

  /**
   * 获取指定任务的所有执行记录
   * @param taskId 任务ID
   * @param tenantId 租户ID
   * @param limit 限制返回数量，默认50
   * @returns 执行记录列表
   */
  async findByTaskId(
    taskId: string,
    tenantId: string,
    limit: number = 50,
  ): Promise<TaskExecutionRecord[]> {
    return await this.executionRecordModel
      .find({ taskId, tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * 获取租户的所有执行记录
   * @param tenantId 租户ID
   * @param limit 限制返回数量，默认100
   * @returns 执行记录列表
   */
  async findByTenantId(
    tenantId: string,
    limit: number = 100,
  ): Promise<TaskExecutionRecord[]> {
    const records = await this.executionRecordModel
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    
    return records;
  }
  
  /**
   * 获取所有执行记录（用于调试，不按租户过滤）
   * @param limit 限制返回数量
   * @returns 执行记录列表
   */
  async findAll(limit: number = 100): Promise<TaskExecutionRecord[]> {
    return await this.executionRecordModel
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * 根据ID获取执行记录
   * @param id 执行记录ID
   * @param tenantId 租户ID
   * @returns 执行记录
   */
  async findById(id: string, tenantId: string): Promise<TaskExecutionRecord | null> {
    return await this.executionRecordModel.findOne({ _id: id, tenantId }).exec();
  }
}

