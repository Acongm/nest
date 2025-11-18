import { Injectable } from '@nestjs/common';
import { EmailService } from '../common/email.service';
import { ScheduledTask } from './schemas/scheduled-task.schema';
import { logger } from '../common/logger';

/**
 * 定时任务邮件服务
 * 专门处理定时任务相关的邮件发送逻辑
 */
@Injectable()
export class ScheduledTaskEmailService {
  constructor(private emailService: EmailService) {}

  /**
   * 批量发送报表邮件
   * 为每个成功的导出任务发送邮件
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
  ): Promise<{ success: boolean; error?: string; attachments: Array<{ filename: string; path: string }> }> {
    logger.info('开始发送报表邮件', {
      taskId: task.id,
      exportCount: successfulExports.length,
      recipients: task.recipient,
    });

    const attachments: Array<{ filename: string; path: string }> = [];
    let hasError = false;
    let lastError: string | undefined;

    // 为每个成功的导出发送邮件
    for (const { task: exportTask, pageId, branchId } of successfulExports) {
      try {
        const reportFileName = this.generateReportFileName(pageId, branchId);
        await this.sendSingleReportEmail(task, exportTask, pageId, branchId);
        // 记录附件信息
        if (exportTask.filePath) {
          attachments.push({
            filename: reportFileName,
            path: exportTask.filePath,
          });
        }
      } catch (error) {
        hasError = true;
        lastError = error.message;
        logger.error('报表邮件发送失败', {
          taskId: task.id,
          pageId,
          branchId,
          error: error.message,
        });
        // 继续发送其他邮件，不中断流程
      }
    }

    logger.info('报表邮件发送完成', {
      taskId: task.id,
      totalSent: successfulExports.length,
      attachmentsCount: attachments.length,
    });

    return {
      success: !hasError,
      error: hasError ? lastError : undefined,
      attachments,
    };
  }

  /**
   * 发送单个报表邮件
   * @param task 定时任务
   * @param exportTask 导出任务
   * @param pageId 页面ID
   * @param branchId 分支ID
   */
  private async sendSingleReportEmail(
    task: ScheduledTask,
    exportTask: any,
    pageId: string,
    branchId: string,
  ): Promise<void> {
    // 生成报表文件名
    const reportFileName = this.generateReportFileName(pageId, branchId);

    // 发送邮件
    await this.emailService.sendReportEmail(
      task.recipient,
      exportTask.filePath,
      reportFileName,
      `定时任务-${task.id}`,
    );

    logger.info('报表邮件发送成功', {
      taskId: task.id,
      pageId,
      branchId,
      recipients: task.recipient,
      fileName: reportFileName,
    });
  }

  /**
   * 生成报表文件名
   * @param pageId 页面ID
   * @param branchId 分支ID
   * @returns 报表文件名
   */
  private generateReportFileName(pageId: string, branchId: string): string {
    const dateStr = new Date().toISOString().split('T')[0];
    return `报表_${pageId}_${branchId}_${dateStr}.pdf`;
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

