import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  Query,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ReportExportService } from './report-export.service';
import { CreateExportTaskDto } from './dto/create-export-task.dto';
import { readFileSync, existsSync } from 'fs';
import { isCurrentUserData } from '../auth/decorators/current-user.decorator';

/**
 * 报表导出控制器
 */
@Controller('report-export')
export class ReportExportController {
  constructor(private readonly reportExportService: ReportExportService) {}

  /**
   * 创建导出任务
   * @route POST /api/report-export
   */
  @Post()
  async createExportTask(
    @Req() reqRequest: Request,
    @Body() data: CreateExportTaskDto,
  ) {
    // 使用类型守卫来帮助 TypeScript 识别类型
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;

    return this.reportExportService.createExportTask(data, tenantId);
  }

  /**
   * 获取导出任务列表
   * @route GET /api/report-export
   * @query assetId - 可选，按资产ID筛选
   */
  @Get()
  async getExportTasks(
    @Req() reqRequest: Request,
    @Query('assetId') assetId: string | undefined,
  ) {
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;
    const tasks = await this.reportExportService.findAll(tenantId, assetId);
    return {
      tasks,
      total: tasks.length,
    };
  }

  /**
   * 获取队列状态
   * @route GET /api/report-export/queue/status
   */
  @Get('queue/status')
  async getQueueStatus(@Req() reqRequest: Request) {
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;
    return this.reportExportService.getQueueStatus(tenantId);
  }

  /**
   * 获取单个任务详情
   * @route GET /api/report-export/:id
   */
  @Get(':id')
  async getTask(
    @Req() reqRequest: Request,
    @Param('id') id: string,
  ) {
    if (!isCurrentUserData(reqRequest.user)) {
      throw new Error('用户未认证');
    }
    const tenantId = reqRequest.user.tenantId;
    return this.reportExportService.findOne(id, tenantId);
  }

  /**
   * 下载PDF文件
   * @route GET /api/report-export/download/:id
   */
  @Get('download/:id')
  async downloadFile(
    @Req() reqRequest: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      if (!isCurrentUserData(reqRequest.user)) {
        throw new Error('用户未认证');
      }
      const tenantId = reqRequest.user.tenantId;
      const filePath = await this.reportExportService.getTaskFilePath(id, tenantId);
      
      if (!existsSync(filePath)) {
        return res.status(HttpStatus.NOT_FOUND).json({
          message: '文件不存在',
        });
      }

      // 读取文件
      const file = readFileSync(filePath);
      
      // 设置响应头
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="report_${id}.pdf"`,
      );
      
      // 发送文件
      res.send(file);
    } catch (error) {
      return res.status(HttpStatus.NOT_FOUND).json({
        message: error.message || '文件不存在',
      });
    }
  }
}

