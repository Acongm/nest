import { Get, Put, Body, Controller, Req, Param } from '@nestjs/common';
import { Request } from 'express';
import { ScheduledTaskService } from './scheduled-task.service';
import { CreateScheduledTaskDto } from './dto';
import { ScheduledTask } from './scheduled-task.interface';
import { isCurrentUserData } from '../auth/decorators/current-user.decorator';

/**
 * 定时任务控制器
 * 处理定时任务相关的 HTTP 请求
 * @class ScheduledTaskController
 */
@Controller('scheduled-tasks')
export class ScheduledTaskController {
  /**
   * 构造函数，注入定时任务服务
   * @param {ScheduledTaskService} scheduledTaskService - 定时任务服务实例
   */
  constructor(private readonly scheduledTaskService: ScheduledTaskService) {}

  /**
   * 获取所有定时任务列表
   * @route GET /scheduled-tasks
   * @returns {Promise<{tasks: ScheduledTask[], tasksCount: number}>} 返回任务列表和总数
   */
  @Get()
  async findAll(@Req() reqRequest: Request): Promise<{ tasks: ScheduledTask[]; tasksCount: number }> {
    // 使用类型守卫来帮助 TypeScript 识别类型
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;

    const tasks = await this.scheduledTaskService.findAll(tenantId);
    return {
      tasks,
      tasksCount: tasks.length,
    };
  }

  /**
   * 创建或更新定时任务
   * 使用固定的系统任务ID（security-operations-report-system）
   * enable: false 时，只需要传 enable 字段，其他字段可选
   * enable: true 时，frequency、time、recipient、pageIds、branchIds 都是必填字段
   * @route PUT /scheduled-tasks
   * @param {CreateScheduledTaskDto} data - 定时任务数据（不需要传入 id）
   * @returns {Promise<ScheduledTask>} 返回创建或更新后的任务对象
   */
  @Put()
  async createOrUpdate(
    @Req() reqRequest: Request,
    @Body() data: CreateScheduledTaskDto,
  ): Promise<ScheduledTask> {
    // 使用类型守卫来帮助 TypeScript 识别类型
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;

    return await this.scheduledTaskService.createOrUpdate(data, tenantId);
  }

  /**
   * 获取任务运行状态
   * @route GET /scheduled-tasks/:taskId/status
   * @param taskId 任务ID
   * @returns 任务运行状态
   */
  @Get(':taskId/status')
  async getTaskStatus(
    @Req() reqRequest: Request,
    @Param('taskId') taskId: string,
  ): Promise<{ isRunning: boolean; nextExecution?: Date }> {
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;

    return await this.scheduledTaskService.getTaskStatus(taskId, tenantId);
  }
}
