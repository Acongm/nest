import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { logger } from './logger';

/**
 * 邮件服务
 * 负责发送邮件
 */
@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // 从环境变量读取邮件配置
    const emailConfig = {
      host: process.env.SMTP_HOST || 'smtp.163.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    };

    // 创建邮件传输器
    this.transporter = nodemailer.createTransport(emailConfig);

    logger.info('邮件服务初始化完成', {
      host: emailConfig.host,
      port: emailConfig.port,
      user: emailConfig.auth.user,
    });
  }

  /**
   * 发送邮件
   * @param to 收件人邮箱（可以是字符串或字符串数组）
   * @param subject 邮件主题
   * @param text 邮件文本内容
   * @param html 邮件HTML内容（可选）
   * @param attachments 附件列表（可选）
   */
  async sendEmail(
    to: string | string[],
    subject: string,
    text: string,
    html?: string,
    attachments?: Array<{
      filename: string;
      path: string;
    }>,
  ): Promise<void> {
    try {
      const recipients = Array.isArray(to) ? to : [to];

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: recipients.join(','),
        subject,
        text,
        html,
        attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('邮件发送成功', {
        to: recipients,
        subject,
        messageId: info.messageId,
      });
    } catch (error) {
      logger.error('邮件发送失败', {
        to: Array.isArray(to) ? to : [to],
        subject,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 发送带附件的报表邮件
   * @param recipients 收件人邮箱列表
   * @param reportFilePath PDF文件路径
   * @param reportFileName 报表文件名
   * @param taskName 任务名称（可选）
   */
  async sendReportEmail(
    recipients: string[],
    reportFilePath: string,
    reportFileName: string,
    taskName?: string,
  ): Promise<void> {
    const subject = taskName
      ? `定时报表：${taskName}`
      : '定时报表导出完成';

    const text = `您好，

定时报表已生成完成，请查收附件。

${taskName ? `任务名称：${taskName}\n` : ''}生成时间：${new Date().toLocaleString('zh-CN')}

此邮件由系统自动发送，请勿回复。`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #2c3e50;">定时报表导出完成</h2>
        <p>您好，</p>
        <p>定时报表已生成完成，请查收附件。</p>
        ${taskName ? `<p><strong>任务名称：</strong>${taskName}</p>` : ''}
        <p><strong>生成时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
      </div>
    `;

    await this.sendEmail(recipients, subject, text, html, [
      {
        filename: reportFileName,
        path: reportFilePath,
      },
    ]);
  }
}

