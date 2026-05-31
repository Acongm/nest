import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
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
    const smtpHost = process.env.SMTP_HOST || 'smtp.163.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
    const smtpSecure = process.env.SMTP_SECURE === 'true';
    
    // 根据端口自动判断是否使用 secure
    // 465 端口使用 SSL，587/25 端口使用 STARTTLS
    const useSecure = smtpSecure || smtpPort === 465;
    
    const emailConfig: any = {
      host: smtpHost,
      port: smtpPort,
      secure: useSecure, // true for 465, false for other ports (uses STARTTLS)
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
      // 增加超时设置，避免连接过早关闭
      connectionTimeout: 60000, // 60秒连接超时
      greetingTimeout: 30000, // 30秒问候超时
      socketTimeout: 60000, // 60秒socket超时
      // 启用连接池
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // TLS 配置（开发环境可以跳过证书验证）
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production', // 生产环境验证证书
      },
    };

    // 创建邮件传输器
    this.transporter = nodemailer.createTransport(emailConfig);

    logger.info(`异步验证连接 ---- ${JSON.stringify(emailConfig)}`)

    // 异步验证连接（不阻塞服务启动）
    this.verifyConnection();

    logger.info('邮件服务初始化完成', {
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      user: emailConfig.auth.user ? `${emailConfig.auth.user.substring(0, 3)}***` : '未配置',
      connectionTimeout: emailConfig.connectionTimeout,
    });
  }

  /**
   * 验证 SMTP 连接
   */
  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('邮件服务连接验证成功');
    } catch (error: any) {
      logger.warn('邮件服务连接验证失败（不影响服务运行）', {
        error: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
        suggestion: this.getConnectionSuggestion(error),
      });
    }
  }

  /**
   * 根据错误信息提供连接建议
   */
  private getConnectionSuggestion(error: any): string {
    const errorMsg = error.message?.toLowerCase() || '';
    
    if (errorMsg.includes('connection closed') || errorMsg.includes('connection refused')) {
      return '请检查 SMTP_HOST 和 SMTP_PORT 配置是否正确，以及网络连接是否正常';
    }
    
    if (errorMsg.includes('authentication') || errorMsg.includes('login')) {
      return '请检查 SMTP_USER 和 SMTP_PASS 配置是否正确';
    }
    
    if (errorMsg.includes('certificate') || errorMsg.includes('tls')) {
      return 'SSL/TLS 配置可能有问题，请检查 SMTP_SECURE 和端口配置（465 端口需要 secure=true）';
    }
    
    return '请检查 SMTP 配置是否正确，常见配置：163邮箱使用 smtp.163.com:465 (secure=true) 或 smtp.163.com:587 (secure=false)';
  }

  /**
   * 发送邮件（带重试机制）
   * @param to 收件人邮箱（可以是字符串或字符串数组）
   * @param subject 邮件主题
   * @param text 邮件文本内容
   * @param html 邮件HTML内容（可选）
   * @param attachments 附件列表（可选）
   * @param retries 重试次数，默认3次
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
    retries: number = 3,
  ): Promise<void> {
    const recipients = Array.isArray(to) ? to : [to];
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients.join(','),
      subject,
      text,
      html,
      attachments,
    };

    let lastError: Error | null = null;
    
    // 计算附件总大小（用于日志）
    let totalAttachmentSize = 0;
    if (attachments) {
      for (const att of attachments) {
        try {
          const stats = fs.statSync(att.path);
          totalAttachmentSize += stats.size;
        } catch (e) {
          // 忽略文件大小获取错误
        }
      }
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`尝试发送邮件 (${attempt}/${retries})`, {
          to: recipients,
          subject,
          attachmentsCount: attachments?.length || 0,
          totalAttachmentSize: totalAttachmentSize > 0 ? `${(totalAttachmentSize / 1024 / 1024).toFixed(2)} MB` : '0 MB',
        });

        const info = await this.transporter.sendMail(mailOptions);

        logger.info('邮件发送成功', {
          to: recipients,
          subject,
          messageId: info.messageId,
          attempt,
        });
        return; // 发送成功，退出
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === retries;
        
        logger.warn(`邮件发送失败 (${attempt}/${retries})`, {
          to: recipients,
          subject,
          error: error.message,
          attempt,
          isLastAttempt,
        });

        // 如果不是最后一次尝试，等待后重试
        if (!isLastAttempt) {
          // 指数退避：第1次重试等2秒，第2次等4秒
          const waitTime = Math.pow(2, attempt) * 1000;
          logger.info(`等待 ${waitTime}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // 所有重试都失败
    logger.error('邮件发送失败（已重试所有次数）', {
      to: recipients,
      subject,
      error: lastError?.message,
      stack: lastError?.stack,
      retries,
    });
    throw lastError || new Error('邮件发送失败');
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

