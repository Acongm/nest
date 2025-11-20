import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { EmailService } from '../common/email.service';
import { ScheduledTask } from './schemas/scheduled-task.schema';
import { ReportExportService } from '../report-export/report-export.service';
import { logger } from '../common/logger';
import { join } from 'path';

/**
 * 定时任务邮件服务
 * 专门处理定时任务相关的邮件发送逻辑
 */
@Injectable()
export class ScheduledTaskEmailService {
  // 文件存储目录（与 ReportExportService 保持一致）
  private readonly UPLOAD_DIR = join(process.cwd(), 'uploads', 'reports');

  constructor(
    private emailService: EmailService,
    @Inject(forwardRef(() => ReportExportService))
    private reportExportService: ReportExportService,
  ) {}

  /**
   * 批量发送报表邮件
   * 将所有成功的导出文件汇聚后，发送一封包含所有附件的邮件
   * @param task 定时任务
   * @param successfulExports 成功的导出任务列表
   * @returns 返回发送结果，包含成功状态、错误信息和附件列表
   */
  async sendReportEmails(
    task: ScheduledTask,
    successfulExports: Array<{
      task: any;
      pageId: string;
      branchId: string;
    }>,
  ): Promise<{ success: boolean; error?: string; attachments: Array<{ filename: string; path: string; absolutePath: string }> }> {
    logger.info('开始发送报表邮件', {
      taskId: task.id,
      exportCount: successfulExports.length,
      recipients: task.recipient,
    });

    // 收集所有附件
    // path: 相对路径（用于保存到数据库）
    // absolutePath: 绝对路径（用于读取文件发送邮件）
    const attachments: Array<{ filename: string; path: string; absolutePath: string }> = [];
    
    for (const { task: exportTask, pageId, branchId } of successfulExports) {
      if (exportTask.filePath) {
        const reportFileName = this.generateReportFileName(pageId, branchId);
        // 将相对路径转换为绝对路径（用于读取文件）
        const absolutePath = this.getAbsoluteFilePath(exportTask.filePath);
        attachments.push({
          filename: reportFileName,
          path: exportTask.filePath, // 保存相对路径（用于数据库记录）
          absolutePath, // 使用绝对路径（用于发送邮件）
        });
      }
    }

    // 如果没有附件，直接返回
    if (attachments.length === 0) {
      logger.warn('没有可发送的附件', {
        taskId: task.id,
      });
      return {
        success: true,
        attachments: [],
      };
    }

    // 发送一封包含所有附件的邮件
    try {
      await this.sendConsolidatedReportEmail(task, attachments, successfulExports.length);
      
      logger.info('报表邮件发送完成', {
        taskId: task.id,
        recipients: task.recipient,
        attachmentsCount: attachments.length,
      });

      return {
        success: true,
        attachments,
      };
    } catch (error) {
      logger.error('报表邮件发送失败', {
        taskId: task.id,
        error: error.message,
        stack: error.stack,
      });
      
      return {
        success: false,
        error: error.message,
        attachments,
      };
    }
  }

  /**
   * 发送汇聚的报表邮件（包含所有附件）
   * @param task 定时任务
   * @param attachments 附件列表
   * @param totalExports 总导出数量
   */
  private async sendConsolidatedReportEmail(
    task: ScheduledTask,
    attachments: Array<{ filename: string; path: string; absolutePath: string }>,
    totalExports: number,
  ): Promise<void> {
    const subject = `定时报表汇总：${task.id}`;
    const taskName = `定时任务-${task.id}`;
    const dateStr = new Date().toLocaleString('zh-CN');

    const text = `您好，

定时报表已生成完成，本次共生成 ${totalExports} 个报表文件，请查收附件。

任务名称：${taskName}
生成时间：${dateStr}
附件数量：${attachments.length}

附件列表：
${attachments.map((att, index) => `${index + 1}. ${att.filename}`).join('\n')}

此邮件由系统自动发送，请勿回复。`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #2c3e50;">定时报表汇总</h2>
        <p>您好，</p>
        <p>定时报表已生成完成，本次共生成 <strong>${totalExports}</strong> 个报表文件，请查收附件。</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>任务名称：</strong>${taskName}</p>
          <p><strong>生成时间：</strong>${dateStr}</p>
          <p><strong>附件数量：</strong>${attachments.length}</p>
        </div>
        <div style="background-color: #ffffff; padding: 15px; border: 1px solid #dee2e6; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #495057; margin-top: 0;">附件列表：</h3>
          <ul style="list-style-type: none; padding-left: 0;">
            ${attachments.map((att, index) => `
              <li style="padding: 8px 0; border-bottom: 1px solid #eee;">
                <span style="color: #6c757d;">${index + 1}.</span> ${att.filename}
              </li>
            `).join('')}
          </ul>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
      </div>
    `;

    // 使用绝对路径发送邮件
    await this.emailService.sendEmail(
      task.recipient,
      subject,
      text,
      html,
      attachments.map(att => ({
        filename: att.filename,
        path: att.absolutePath, // 使用绝对路径
      })),
    );

    logger.info('汇聚报表邮件发送成功', {
      taskId: task.id,
      recipients: task.recipient,
      attachmentsCount: attachments.length,
    });
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
   * 生成报表文件名
   * @param pageId 页面ID
   * @param branchId 分支ID（可选）
   * @returns 报表文件名
   */
  private generateReportFileName(pageId: string, branchId?: string): string {
    const dateStr = new Date().toISOString().split('T')[0];
    // 如果 branchId 为空，使用 pageId 作为标识
    const branchPart = branchId ? branchId : 'default';
    // 清理 pageId 中的特殊字符，避免文件名问题
    const cleanPageId = pageId.replace(/[^a-zA-Z0-9]/g, '_');
    return `报表_${cleanPageId}_${branchPart}_${dateStr}.pdf`;
  }

  /**
   * 发送任务执行失败通知邮件
   * @param task 定时任务
   * @param error 错误信息
   */
  async sendFailureNotification(
    task: ScheduledTask,
    error: Error,
  ): Promise<void> {
    try {
      const subject = `定时任务执行失败：${task.id}`;
      const text = `您好，

定时任务执行失败，请检查任务配置。

任务ID：${task.id}
执行时间：${new Date().toLocaleString('zh-CN')}
错误信息：${error.message}

此邮件由系统自动发送，请勿回复。`;

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #e74c3c;">定时任务执行失败</h2>
          <p>您好，</p>
          <p>定时任务执行失败，请检查任务配置。</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>任务ID：</strong>${task.id}</p>
            <p><strong>执行时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
            <p><strong>错误信息：</strong><span style="color: #e74c3c;">${error.message}</span></p>
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
        </div>
      `;

      await this.emailService.sendEmail(task.recipient, subject, text, html);

      logger.info('失败通知邮件发送成功', {
        taskId: task.id,
        recipients: task.recipient,
      });
    } catch (error) {
      logger.error('失败通知邮件发送失败', {
        taskId: task.id,
        error: error.message,
      });
      // 不抛出错误，避免影响主流程
    }
  }
}

