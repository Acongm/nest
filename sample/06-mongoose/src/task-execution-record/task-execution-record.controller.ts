import { Get, Controller, Req, Param, Query } from '@nestjs/common';
import { Request } from 'express';
import { TaskExecutionRecordService } from './task-execution-record.service';
import { TaskExecutionRecord } from './schemas/task-execution-record.schema';
import { isCurrentUserData } from '../auth/decorators/current-user.decorator';
import { logger } from '../common/logger';

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
    // 检查用户认证
    if (!isCurrentUserData(reqRequest.user)) {
      logger.warn('查询执行记录失败：用户未认证', {
        path: reqRequest.path,
        user: reqRequest.user,
      });
      throw new Error('用户未认证，请先登录');
    }
    const tenantId = reqRequest.user.tenantId;

    logger.info('查询执行记录', {
      tenantId,
      limit,
      userId: reqRequest.user.userId,
    });

    const limitNum = limit ? parseInt(limit, 10) : 100;
    const records = await this.executionRecordService.findByTenantId(tenantId, limitNum);
    
    logger.info('执行记录查询完成', {
      tenantId,
      recordsCount: records.length,
    });
    
    return {
      records,
      recordsCount: records.length,
    };
  }

  /**
   * 调试接口：获取所有执行记录（不按租户过滤）
   * 注意：此路由必须在 @Get(':id') 之前，否则会被当作 :id 处理
   * @route GET /scheduled-tasks/execution-records/debug/all
   * @param limit 限制返回数量
   * @returns 所有执行记录列表
   */
  @Get('debug/all')
  async findAllDebug(
    @Req() reqRequest: Request,
    @Query('limit') limit?: string,
  ): Promise<{ records: TaskExecutionRecord[]; recordsCount: number; userTenantId?: string }> {
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证，请先登录');
    }
    
    const limitNum = limit ? parseInt(limit, 10) : 100;
    const records = await this.executionRecordService.findAll(limitNum);
    
    logger.info('调试查询：获取所有执行记录', {
      userTenantId: reqRequest.user.tenantId,
      totalRecords: records.length,
    });
    
    return {
      records,
      recordsCount: records.length,
      userTenantId: reqRequest.user.tenantId,
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

