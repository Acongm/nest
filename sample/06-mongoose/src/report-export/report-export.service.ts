import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateExportTaskDto } from './dto/create-export-task.dto';
import { ExportTask, ExportTaskStatus } from './schemas/export-task.schema';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
const pLimit = require('p-limit');
import { logger } from '../common/logger';

@Injectable()
export class ReportExportService {
  // 当日最大导出次数（从环境变量读取，默认 10 次）
  private readonly MAX_DAILY_EXPORTS = parseInt(
    process.env.MAX_DAILY_EXPORTS || '10',
    10,
  );
  // 文件存储目录
  private readonly UPLOAD_DIR = join(process.cwd(), 'uploads', 'reports');
  // 基础URL（用于生成下载链接）
  private readonly BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  // 最大并发导出任务数（同时运行的浏览器实例数）
  // 可以根据服务器性能调整，建议 2-5 个
  private readonly MAX_CONCURRENT_EXPORTS = parseInt(
    process.env.MAX_CONCURRENT_EXPORTS || '2',
    10,
  );
  // 任务超时时间（毫秒），默认 5 分钟
  private readonly TASK_TIMEOUT = parseInt(
    process.env.EXPORT_TASK_TIMEOUT || '300000',
    10,
  );
  // 并发限制器
  private readonly limit = pLimit(this.MAX_CONCURRENT_EXPORTS);
  // Worker 进程路径（根据环境自动选择）
  private readonly workerPath = this.getWorkerPath();

  constructor(
    @InjectModel(ExportTask.name) private exportTaskModel: Model<ExportTask>,
  ) {
    // 确保上传目录存在
    if (!existsSync(this.UPLOAD_DIR)) {
      mkdirSync(this.UPLOAD_DIR, { recursive: true });
    }
    // 确保日志目录存在
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    logger.info('报表导出服务初始化完成', {
      maxConcurrent: this.MAX_CONCURRENT_EXPORTS,
      maxDailyExports: this.MAX_DAILY_EXPORTS,
      uploadDir: this.UPLOAD_DIR,
      taskTimeout: this.TASK_TIMEOUT,
    });
  }

  /**
   * 创建导出任务
   * 如果提供了 branchIds，会为每个 branchId 创建一个导出任务
   * @param createDto 创建导出任务DTO
   * @param tenantId 租户ID
   * @returns 如果提供了 branchIds，返回所有创建的任务数组；否则返回单个任务
   */
  async createExportTask(createDto: CreateExportTaskDto, tenantId: string): Promise<ExportTask | ExportTask[]> {
    // 1. 验证参数
    this.validateParams(createDto);

    // 2. 如果提供了 branchIds，为每个 branchId 创建导出任务
    if (createDto.branchIds && createDto.branchIds.length > 0) {
      const tasks: ExportTask[] = [];
      
      for (const branchId of createDto.branchIds) {
        // 为每个 branchId 检查当日导出次数
        await this.checkDailyExportLimit(branchId, tenantId);

        // 构建该 branchId 对应的 reportPage
        const reportPage = this.buildReportPageForBranch(createDto.reportPage, branchId);

        // 创建任务记录（状态：待处理）
        const task = new this.exportTaskModel({
          startTime: new Date(createDto.startTime),
          endTime: new Date(createDto.endTime),
          assetId: branchId,
          reportPage,
          taskName: createDto.taskName,
          tenantId,
          status: ExportTaskStatus.PENDING,
        });
        const savedTask = await task.save();
        tasks.push(savedTask);

        // 使用并发限制器异步执行导出任务（不阻塞响应）
        this.limit(() => this.processExportTask(savedTask._id.toString())).catch(
          (error) => {
            logger.error('导出任务执行失败', {
              taskId: savedTask._id.toString(),
              branchId,
              error: error.message,
              stack: error.stack,
            });
          },
        );
      }

      logger.info('批量创建导出任务完成', {
        branchIdsCount: createDto.branchIds.length,
        tasksCount: tasks.length,
        taskIds: tasks.map(t => t._id.toString()),
      });

      // 返回所有任务数组
      return tasks;
    }

    // 3. 单个任务创建逻辑（当 branchIds 为空或未提供时）
    // 如果没有提供 assetId，使用 reportPage 作为默认 assetId
    const assetId = createDto.assetId || createDto.reportPage || 'default';
    
    // 检查当日导出次数（按租户和资产ID）
    await this.checkDailyExportLimit(assetId, tenantId);

    // 创建任务记录（状态：待处理）
    const task = new this.exportTaskModel({
      startTime: new Date(createDto.startTime),
      endTime: new Date(createDto.endTime),
      assetId,
      reportPage: createDto.reportPage,
      taskName: createDto.taskName,
      tenantId, // 添加租户ID
      status: ExportTaskStatus.PENDING,
    });
    const savedTask = await task.save();

    // 使用并发限制器异步执行导出任务（不阻塞响应）
    this.limit(() => this.processExportTask(savedTask._id.toString())).catch(
      (error) => {
        logger.error('导出任务执行失败', {
          taskId: savedTask._id.toString(),
          error: error.message,
          stack: error.stack,
        });
      },
    );

    return savedTask;
  }

  /**
   * 为分支ID构建报表页面URL
   * @param reportPage 原始报表页面URL或路径
   * @param branchId 分支ID
   * @returns 构建后的报表页面URL
   */
  private buildReportPageForBranch(reportPage: string, branchId: string): string {
    // 如果 reportPage 已经是完整 URL，添加 branchId 参数
    try {
      const url = new URL(reportPage);
      url.searchParams.set('branchId', branchId);
      return url.toString();
    } catch {
      // 如果是相对路径，添加 branchId 参数
      const separator = reportPage.includes('?') ? '&' : '?';
      return `${reportPage}${separator}branchId=${branchId}`;
    }
  }

  /**
   * 验证参数
   */
  private validateParams(dto: CreateExportTaskDto): void {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    // 验证时间范围
    if (startTime >= endTime) {
      throw new BadRequestException('开始时间必须小于结束时间');
    }

    // 验证时间范围不能超过一年
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (endTime.getTime() - startTime.getTime() > oneYear) {
      throw new BadRequestException('时间范围不能超过一年');
    }

    // 验证报表页面URL格式
    if (!this.isValidUrl(dto.reportPage) && !dto.reportPage.startsWith('/')) {
      throw new BadRequestException('报表页面必须是有效的URL或路径');
    }

    // 允许 branchIds 为空数组，此时如果没有 assetId，会在 createExportTask 中使用默认值
  }

  /**
   * 检查当日导出次数限制（按租户和资产ID）
   */
  private async checkDailyExportLimit(assetId: string, tenantId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayExports = await this.exportTaskModel.countDocuments({
      tenantId,
      assetId,
      createdAt: {
        $gte: today,
        $lt: tomorrow,
      },
    });

    if (todayExports >= this.MAX_DAILY_EXPORTS) {
      throw new BadRequestException(
        `当日导出次数已达上限（${todayExports}/${this.MAX_DAILY_EXPORTS}次），请明天再试`,
      );
    }
  }

  /**
   * 处理导出任务
   */
  private async processExportTask(taskId: string): Promise<void> {
    const task = await this.exportTaskModel.findById(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    try {
      // 更新状态为处理中
      task.status = ExportTaskStatus.PROCESSING;
      await task.save();

      logger.info('开始处理导出任务', {
        taskId,
        assetId: task.assetId,
        reportPage: task.reportPage,
      });

      // 构建完整的报表页面URL
      const reportUrl = this.buildReportUrl(task.reportPage, {
        startTime: task.startTime.toISOString(),
        endTime: task.endTime.toISOString(),
        assetId: task.assetId,
      });

      // 使用子进程导出PDF（带超时控制）
      const absoluteFilePath = await Promise.race([
        this.exportToPdfViaWorker(reportUrl, taskId),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`任务超时（${this.TASK_TIMEOUT / 1000}秒）`)),
            this.TASK_TIMEOUT,
          ),
        ),
      ]);

      // 将绝对路径转换为相对路径（相对于 UPLOAD_DIR）
      // 例如：/path/to/uploads/reports/file.pdf -> reports/file.pdf
      const relativeFilePath = this.getRelativeFilePath(absoluteFilePath);

      // 生成下载URL
      const downloadUrl = `/api/report-export/download/${taskId}`;

      // 更新任务状态为已完成
      task.status = ExportTaskStatus.COMPLETED;
      task.filePath = relativeFilePath; // 保存相对路径
      task.downloadUrl = downloadUrl;
      await task.save();

      logger.info('导出任务完成', {
        taskId,
        relativeFilePath,
        absoluteFilePath,
        downloadUrl,
      });
    } catch (error) {
      // 更新任务状态为失败
      task.status = ExportTaskStatus.FAILED;
      task.errorMessage = error.message || '导出失败';
      await task.save();

      logger.error('导出任务失败', {
        taskId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 获取 Worker 进程路径
   */
  private getWorkerPath(): string {
    // 检查是否在编译后的 dist 目录中运行
    const compiledPath = join(__dirname, 'workers', 'pdf-export.worker.js');
    if (existsSync(compiledPath)) {
      return compiledPath;
    }

    // 开发环境：使用 ts-node 运行 TypeScript 文件
    const tsPath = join(__dirname, 'workers', 'pdf-export.worker.ts');
    if (existsSync(tsPath)) {
      // 返回 TypeScript 文件路径，fork 时会使用 ts-node 执行
      return tsPath;
    }

    throw new Error('找不到 Worker 文件');
  }

  /**
   * 通过子进程（Worker）导出PDF - 使用 spawn
   * 通过 stdin/stdout 进行 JSON 通信
   * 这样可以隔离浏览器实例，避免影响主进程
   */
  private async exportToPdfViaWorker(url: string, taskId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.info('启动 PDF 导出 Worker 进程（spawn）', {
        taskId,
        url,
        workerPath: this.workerPath,
      });

      const worker = this.spawnWorkerProcess();
      const timeout = this.setupWorkerTimeout(worker, taskId, reject);
      const dataCollectors = this.setupWorkerDataCollectors(worker, taskId);

      this.setupWorkerExitHandler(
        worker,
        timeout,
        dataCollectors,
        taskId,
        resolve,
        reject,
      );
      this.setupWorkerErrorHandler(worker, timeout, taskId, reject);
      this.sendTaskDataToWorker(worker, taskId, url);
    });
  }

  /**
   * 启动 Worker 子进程
   */
  private spawnWorkerProcess(): ChildProcess {
    const isTsFile = this.workerPath.endsWith('.ts');
    const nodeExecutable = process.execPath;
    const args = isTsFile
      ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', this.workerPath]
      : [this.workerPath];

    return spawn(nodeExecutable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'development',
      },
    });
  }

  /**
   * 设置 Worker 超时
   */
  private setupWorkerTimeout(
    worker: ChildProcess,
    taskId: string,
    reject: (reason: any) => void,
  ): NodeJS.Timeout {
    return setTimeout(() => {
      logger.error('Worker 进程超时', { taskId });
      worker.kill('SIGTERM');
      reject(new Error(`Worker 进程超时（${this.TASK_TIMEOUT / 1000}秒）`));
    }, this.TASK_TIMEOUT);
  }

  /**
   * 设置 Worker 数据收集器
   */
  private setupWorkerDataCollectors(
    worker: ChildProcess,
    taskId: string,
  ): { stdoutData: string; stderrData: string } {
    const dataCollectors = {
      stdoutData: '',
      stderrData: '',
    };

    worker.stdout?.on('data', (data: Buffer) => {
      dataCollectors.stdoutData += data.toString();
    });

    worker.stderr?.on('data', (data: Buffer) => {
      dataCollectors.stderrData += data.toString();
      logger.debug('Worker stderr', { taskId, data: data.toString() });
    });

    return dataCollectors;
  }

  /**
   * 设置 Worker 退出处理器
   */
  private setupWorkerExitHandler(
    worker: ChildProcess,
    timeout: NodeJS.Timeout,
    dataCollectors: { stdoutData: string; stderrData: string },
    taskId: string,
    resolve: (value: string) => void,
    reject: (reason: any) => void,
  ): void {
    worker.on('exit', (code, signal) => {
      clearTimeout(timeout);

      if (code === 0) {
        this.handleWorkerSuccess(dataCollectors.stdoutData, taskId, resolve, reject);
      } else {
        this.handleWorkerFailure(code, signal, dataCollectors.stderrData, taskId, reject);
      }
    });
  }

  /**
   * 处理 Worker 成功退出
   */
  private handleWorkerSuccess(
    stdoutData: string,
    taskId: string,
    resolve: (value: string) => void,
    reject: (reason: any) => void,
  ): void {
    try {
      const lines = stdoutData.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const result = JSON.parse(lastLine);

      if (result.type === 'success') {
        logger.info('Worker 进程完成', {
          taskId,
          filePath: result.filePath,
        });
        resolve(result.filePath);
      } else if (result.type === 'error') {
        logger.error('Worker 进程失败', {
          taskId,
          error: result.error,
        });
        reject(new Error(result.error || 'PDF 导出失败'));
      } else {
        reject(new Error('未知的响应类型'));
      }
    } catch (error) {
      logger.error('解析 Worker 输出失败', {
        taskId,
        error: error.message,
        stdout: stdoutData,
      });
      reject(new Error(`解析 Worker 输出失败: ${error.message}`));
    }
  }

  /**
   * 处理 Worker 失败退出
   */
  private handleWorkerFailure(
    code: number | null,
    signal: string | null,
    stderrData: string,
    taskId: string,
    reject: (reason: any) => void,
  ): void {
    logger.error('Worker 进程异常退出', {
      taskId,
      code,
      signal,
      stderr: stderrData,
    });
    reject(
      new Error(`Worker 进程异常退出，退出码: ${code}，错误: ${stderrData}`),
    );
  }

  /**
   * 设置 Worker 错误处理器
   */
  private setupWorkerErrorHandler(
    worker: ChildProcess,
    timeout: NodeJS.Timeout,
    taskId: string,
    reject: (reason: any) => void,
  ): void {
    worker.on('error', (error) => {
      clearTimeout(timeout);
      logger.error('Worker 进程错误', {
        taskId,
        error: error.message,
        stack: error.stack,
      });
      reject(error);
    });
  }

  /**
   * 向 Worker 发送任务数据
   */
  private sendTaskDataToWorker(
    worker: ChildProcess,
    taskId: string,
    url: string,
  ): void {
    const taskData = JSON.stringify({
      type: 'export-pdf',
      taskId,
      url,
      uploadDir: this.UPLOAD_DIR,
    });

    worker.stdin?.write(taskData + '\n');
    worker.stdin?.end();
  }

  /**
   * 构建报表页面URL
   */
  private buildReportUrl(reportPage: string, params: Record<string, string>): string {
    // 如果是完整URL，直接使用
    if (this.isValidUrl(reportPage)) {
      const url = new URL(reportPage);
      Object.keys(params).forEach((key) => {
        url.searchParams.append(key, params[key]);
      });
      return url.toString();
    }

    // 如果是相对路径，构建完整URL
    const baseUrl = this.BASE_URL;
    const url = new URL(reportPage, baseUrl);
    Object.keys(params).forEach((key) => {
      url.searchParams.append(key, params[key]);
    });
    return url.toString();
  }

  /**
   * 验证URL格式
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取所有导出任务列表
   */
  async findAll(tenantId: string, assetId?: string): Promise<ExportTask[]> {
    const query: any = { tenantId }; // 按租户ID过滤
    if (assetId) {
      query.assetId = assetId;
    }
    return this.exportTaskModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /**
   * 根据ID获取任务（验证租户ID）
   */
  async findOne(taskId: string, tenantId: string): Promise<ExportTask> {
    const task = await this.exportTaskModel.findOne({ _id: taskId, tenantId }).exec();
    if (!task) {
      throw new HttpException('任务不存在或无权限访问', HttpStatus.NOT_FOUND);
    }
    return task;
  }

  /**
   * 获取任务文件路径（验证租户ID）
   * 返回绝对路径，用于读取文件
   */
  async getTaskFilePath(taskId: string, tenantId: string): Promise<string> {
    const task = await this.findOne(taskId, tenantId);
    if (task.status !== ExportTaskStatus.COMPLETED || !task.filePath) {
      throw new HttpException('文件不存在或任务未完成', HttpStatus.NOT_FOUND);
    }
    
    // 将相对路径转换为绝对路径
    return this.getAbsoluteFilePath(task.filePath);
  }

  /**
   * 将绝对路径转换为相对路径（相对于 UPLOAD_DIR）
   * @param absolutePath 绝对路径
   * @returns 相对路径
   */
  private getRelativeFilePath(absolutePath: string): string {
    // 如果路径已经是相对路径，直接返回
    if (!absolutePath.startsWith('/') && !absolutePath.match(/^[A-Za-z]:/)) {
      return absolutePath;
    }
    
    // 获取相对于 UPLOAD_DIR 的路径
    const normalizedUploadDir = this.UPLOAD_DIR.replace(/\\/g, '/');
    const normalizedAbsolutePath = absolutePath.replace(/\\/g, '/');
    
    if (normalizedAbsolutePath.startsWith(normalizedUploadDir)) {
      // 提取相对路径部分
      const relativePath = normalizedAbsolutePath.substring(normalizedUploadDir.length);
      // 移除开头的斜杠
      return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    }
    
    // 如果路径不在 UPLOAD_DIR 下，尝试提取文件名部分
    // 格式：uploads/reports/report_xxx.pdf
    const match = normalizedAbsolutePath.match(/uploads\/reports\/(.+)$/);
    if (match) {
      return `reports/${match[1]}`;
    }
    
    // 如果无法转换，返回文件名
    const fileName = absolutePath.split('/').pop() || absolutePath.split('\\').pop() || 'unknown.pdf';
    return `reports/${fileName}`;
  }

  /**
   * 将相对路径转换为绝对路径
   * @param relativePath 相对路径
   * @returns 绝对路径
   */
  private getAbsoluteFilePath(relativePath: string): string {
    // 如果已经是绝对路径，直接返回
    if (relativePath.startsWith('/') || relativePath.match(/^[A-Za-z]:/)) {
      return relativePath;
    }
    
    // 如果相对路径以 reports/ 开头，直接拼接
    if (relativePath.startsWith('reports/')) {
      return join(this.UPLOAD_DIR, relativePath.substring('reports/'.length));
    }
    
    // 否则，假设是相对于 UPLOAD_DIR 的路径
    return join(this.UPLOAD_DIR, relativePath);
  }

  /**
   * 获取队列状态信息（按租户ID）
   */
  async getQueueStatus(tenantId: string): Promise<{
    maxConcurrent: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const [pending, processing, completed, failed] = await Promise.all([
      this.exportTaskModel.countDocuments({ tenantId, status: ExportTaskStatus.PENDING }),
      this.exportTaskModel.countDocuments({
        tenantId,
        status: ExportTaskStatus.PROCESSING,
      }),
      this.exportTaskModel.countDocuments({
        tenantId,
        status: ExportTaskStatus.COMPLETED,
      }),
      this.exportTaskModel.countDocuments({ tenantId, status: ExportTaskStatus.FAILED }),
    ]);

    return {
      maxConcurrent: this.MAX_CONCURRENT_EXPORTS,
      pending,
      processing,
      completed,
      failed,
    };
  }
}

