import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { CreateExportTaskDto } from './dto/create-export-task.dto';
import { logger } from '../common/logger';

export type OfficeFormat = 'docx' | 'pptx' | 'xlsx';

@Injectable()
export class ReportExportOfficeService {
  private readonly UPLOAD_DIR = join(process.cwd(), 'uploads', 'reports');
  private readonly TASK_TIMEOUT = parseInt(
    process.env.EXPORT_TASK_TIMEOUT || '300000',
    10,
  );

  private readonly BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  private readonly workerPath = this.getWorkerPath();

  constructor() {
    if (!existsSync(this.UPLOAD_DIR)) {
      mkdirSync(this.UPLOAD_DIR, { recursive: true });
    }
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
  }

  /**
   * 生成页面的完整 URL
   */
  private buildReportUrl(page: string, params: Record<string, string>): string {
    // 如果传的是完整 URL，直接返回
    try {
      const u = new URL(page);
      return u.toString();
    } catch (_) {
      // 不是完整 URL，当作路径拼接到 BASE_URL
    }

    const url = new URL(page, this.BASE_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  }

  /**
   * 通过子进程（spawn）调用 Office 导出 worker，生成文件并返回 base64
   */
  async exportOffice(
    createDto: CreateExportTaskDto,
    tenantId: string,
    format: OfficeFormat,
  ): Promise<{ filePath: string; base64: string }[]> {
    // 获取时区，使用环境变量中的默认时区
    const timezone = createDto.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Shanghai';
    // 构建需要导出的 assetId 列表（兼容单个 assetId 与多个 branchIds）
    const assetIds =
      createDto.branchIds && createDto.branchIds.length > 0
        ? createDto.branchIds
        : createDto.assetId
        ? [createDto.assetId]
        : [];

    if (assetIds.length === 0) {
      throw new Error('资产ID或分支ID不能为空');
    }

    const results: { filePath: string; base64: string }[] = [];
    for (const assetId of assetIds) {
      const urlParams: Record<string, string> = {
        startTime: new Date(createDto.startTime).toISOString(),
        endTime: new Date(createDto.endTime).toISOString(),
        assetId,
        tenantId,
      };
      
      // 如果提供了时区，添加到 URL 参数中
      if (createDto.timezone) {
        urlParams.timezone = createDto.timezone;
      }
      
      const reportUrl = this.buildReportUrl(createDto.reportPage, urlParams);

      const taskId = `${Date.now()}_${assetId}`;
      const { filePath, base64 } = await this.exportToOfficeViaWorker(
        reportUrl,
        taskId,
        format,
        timezone,
      );
      results.push({ filePath, base64 });
    }

    return results;
  }

  private getWorkerPath(): string {
    const compiledPath = join(__dirname, 'workers', 'office-export.worker.js');
    if (existsSync(compiledPath)) {
      return compiledPath;
    }
    const tsPath = join(__dirname, 'workers', 'office-export.worker.ts');
    if (existsSync(tsPath)) {
      return tsPath;
    }
    throw new Error('找不到 Office Worker 文件');
  }

  private spawnWorkerProcess(timezone?: string): ChildProcess {
    const isTsFile = this.workerPath.endsWith('.ts');
    const nodeExecutable = process.execPath;
    const args = isTsFile
      ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', this.workerPath]
      : [this.workerPath];

    const env = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'development',
    };

    // 设置时区环境变量
    if (timezone) {
      env.TZ = timezone;
    }

    return spawn(nodeExecutable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
  }

  private async exportToOfficeViaWorker(
    url: string,
    taskId: string,
    format: OfficeFormat,
    timezone?: string,
  ): Promise<{ filePath: string; base64: string }> {
    return new Promise((resolve, reject) => {
      logger.info('启动 Office 导出 Worker 进程（spawn）', {
        taskId,
        url,
        format,
        timezone,
        workerPath: this.workerPath,
      });

      const worker = this.spawnWorkerProcess(timezone);
      const timeout = setTimeout(() => {
        logger.error('Office Worker 进程超时', { taskId });
        worker.kill('SIGTERM');
        reject(new Error(`Worker 进程超时（${this.TASK_TIMEOUT / 1000}秒）`));
      }, this.TASK_TIMEOUT);

      let stdoutData = '';
      let stderrData = '';
      worker.stdout?.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });
      worker.stderr?.on('data', (data: Buffer) => {
        const s = data.toString();
        stderrData += s;
        logger.debug('Office Worker stderr', { taskId, data: s });
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          try {
            const lines = stdoutData.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const result = JSON.parse(lastLine);
            if (result.type === 'success') {
              resolve({ filePath: result.filePath, base64: result.base64 });
            } else {
              reject(new Error(result.error || 'Office 导出失败'));
            }
          } catch (e: any) {
            logger.error('解析 Office Worker 输出失败', {
              taskId,
              error: e.message,
              stdout: stdoutData,
            });
            reject(new Error(`解析 Worker 输出失败: ${e.message}`));
          }
        } else {
          logger.error('Office Worker 进程异常退出', {
            taskId,
            code,
            stderr: stderrData,
          });
          reject(
            new Error(
              `Worker 进程异常退出，退出码: ${code}，错误: ${stderrData}`,
            ),
          );
        }
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        logger.error('Office Worker 进程错误', {
          taskId,
          error: error.message,
          stack: error.stack,
        });
        reject(error);
      });

      const taskData = JSON.stringify({
        type: 'export-office',
        taskId,
        url,
        format,
        uploadDir: this.UPLOAD_DIR,
      });
      worker.stdin?.write(taskData + '\n');
      worker.stdin?.end();
    });
  }
}