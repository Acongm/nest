import { Get, Controller, Req, Param, Query } from '@nestjs/common';
import { Request } from 'express';
import { TaskExecutionRecordService } from './task-execution-record.service';
import { TaskExecutionRecord } from './schemas/task-execution-record.schema';
import { isCurrentUserData } from '../auth/decorators/current-user.decorator';

/**
 * 定时任务执行记录控制器
 * 处理执行记录相关的 HTTP 请求
 */
@Controller('scheduled-tasks/execution-records')
export class TaskExecutionRecordController {
  constructor(private readonly executionRecordService: TaskExecutionRecordService) {}

  /**
   * 获取指定任务的所有执行记录
   * @route GET /scheduled-tasks/execution-records/task/:taskId
   * @param taskId 任务ID
   * @param limit 限制返回数量
   * @returns 执行记录列表
   */
  @Get('task/:taskId')
  async findByTaskId(
    @Req() reqRequest: Request,
    @Param('taskId') taskId: string,
    @Query('limit') limit?: string,
  ): Promise<{ records: TaskExecutionRecord[]; recordsCount: number }> {
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;

    const limitNum = limit ? parseInt(limit, 10) : 50;
    const records = await this.executionRecordService.findByTaskId(taskId, tenantId, limitNum);
    return {
      records,
      recordsCount: records.length,
    };
  }

  /**
   * 获取租户的所有执行记录
   * @route GET /scheduled-tasks/execution-records
   * @param limit 限制返回数量
   * @returns 执行记录列表
   */
  @Get()
  async findAll(
    @Req() reqRequest: Request,
    @Query('limit') limit?: string,
  ): Promise<{ records: TaskExecutionRecord[]; recordsCount: number }> {
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;

    const limitNum = limit ? parseInt(limit, 10) : 100;
    const records = await this.executionRecordService.findByTenantId(tenantId, limitNum);
    return {
      records,
      recordsCount: records.length,
    };
  }

  /**
   * 根据ID获取执行记录详情
   * @route GET /scheduled-tasks/execution-records/:id
   * @param id 执行记录ID
   * @returns 执行记录详情
   */
  @Get(':id')
  async findById(
    @Req() reqRequest: Request,
    @Param('id') id: string,
  ): Promise<TaskExecutionRecord> {
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;

    const record = await this.executionRecordService.findById(id, tenantId);
    if (!record) {
      throw new Error('执行记录不存在');
    }
    return record;
  }
}

