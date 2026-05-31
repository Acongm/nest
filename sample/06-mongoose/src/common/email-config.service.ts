import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';
import { logger } from './logger';

/**
 * 邮件配置接口
 */
export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from?: string;
}

/**
 * 邮件配置校验结果
 */
export interface EmailConfigValidationResult {
  valid: boolean;
  message: string;
  config?: EmailConfig;
  error?: string;
}

/**
 * 邮件配置服务
 * 负责从第三方接口或环境变量获取邮件配置，并校验配置的有效性
 */
@Injectable()
export class EmailConfigService {
  constructor(private configService: ConfigService) {}

  /**
   * 获取邮件配置
   * 优先从第三方接口获取，如果失败则从环境变量获取
   */
  async getEmailConfig(): Promise<EmailConfig> {
    // 首先尝试从第三方接口获取配置
    const thirdPartyConfig = await this.getConfigFromThirdParty();
    if (thirdPartyConfig) {
      logger.info('从第三方接口获取邮件配置成功');
      return thirdPartyConfig;
    }

    // 如果第三方接口失败，从环境变量获取
    logger.info('从环境变量获取邮件配置');
    return this.getConfigFromEnv();
  }

  /**
   * 从第三方接口获取邮件配置
   */
  private async getConfigFromThirdParty(): Promise<EmailConfig | null> {
    const apiUrl = this.configService.get<string>('EMAIL_CONFIG_API_URL');
    
    // 如果没有配置第三方接口 URL，直接返回 null
    if (!apiUrl) {
      logger.debug('未配置 EMAIL_CONFIG_API_URL，跳过第三方接口');
      return null;
    }

    try {
      logger.info('尝试从第三方接口获取邮件配置', { apiUrl });
      
      const config = await this.httpRequest(apiUrl);
      
      // 验证返回的配置格式
      if (!config || typeof config !== 'object') {
        throw new Error('第三方接口返回的配置格式不正确');
      }

      // 验证必需字段
      const requiredFields = ['host', 'port', 'user', 'pass'];
      for (const field of requiredFields) {
        if (!config[field]) {
          throw new Error(`第三方接口返回的配置缺少必需字段: ${field}`);
        }
      }

      // 构建配置对象
      const emailConfig: EmailConfig = {
        host: String(config.host),
        port: parseInt(String(config.port), 10),
        secure: config.secure === true || config.secure === 'true' || config.port === 465,
        user: String(config.user),
        pass: String(config.pass),
        from: config.from ? String(config.from) : undefined,
      };

      logger.info('从第三方接口获取邮件配置成功', {
        host: emailConfig.host,
        port: emailConfig.port,
        user: emailConfig.user ? `${emailConfig.user.substring(0, 3)}***` : '未配置',
      });

      return emailConfig;
    } catch (error: any) {
      logger.warn('从第三方接口获取邮件配置失败，将使用环境变量', {
        apiUrl,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * 从环境变量获取邮件配置
   */
  private getConfigFromEnv(): EmailConfig {
    const smtpHost = this.configService.get<string>('SMTP_HOST', 'smtp.163.com');
    const smtpPort = parseInt(this.configService.get<string>('SMTP_PORT', '465'), 10);
    const smtpSecure = this.configService.get<string>('SMTP_SECURE') === 'true';
    const smtpUser = this.configService.get<string>('SMTP_USER', '');
    const smtpPass = this.configService.get<string>('SMTP_PASS', '');
    const smtpFrom = this.configService.get<string>('SMTP_FROM');

    // 根据端口自动判断是否使用 secure
    const useSecure = smtpSecure || smtpPort === 465;

    return {
      host: smtpHost,
      port: smtpPort,
      secure: useSecure,
      user: smtpUser,
      pass: smtpPass,
      from: smtpFrom,
    };
  }

  /**
   * 校验邮件配置
   * 通过实际连接 SMTP 服务器来验证配置是否有效
   */
  async validateEmailConfig(config?: EmailConfig): Promise<EmailConfigValidationResult> {
    try {
      // 如果没有提供配置，则获取配置
      const emailConfig = config || await this.getEmailConfig();

      // 验证配置完整性
      if (!emailConfig.host || !emailConfig.port || !emailConfig.user || !emailConfig.pass) {
        return {
          valid: false,
          message: '邮件配置不完整，缺少必需字段',
          error: '缺少 host、port、user 或 pass 字段',
        };
      }

      // 使用 nodemailer 验证连接
      const nodemailer = require('nodemailer');
      const testTransporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: {
          user: emailConfig.user,
          pass: emailConfig.pass,
        },
        connectionTimeout: 10000, // 10秒超时
        greetingTimeout: 5000, // 5秒问候超时
        socketTimeout: 10000, // 10秒socket超时
        tls: {
          rejectUnauthorized: this.configService.get<string>('NODE_ENV') === 'production',
        },
      });

      // 验证连接
      await testTransporter.verify();

      logger.info('邮件配置校验成功', {
        host: emailConfig.host,
        port: emailConfig.port,
        user: emailConfig.user ? `${emailConfig.user.substring(0, 3)}***` : '未配置',
      });

      return {
        valid: true,
        message: '邮件配置校验成功',
        config: {
          ...emailConfig,
          pass: '***', // 不返回密码
        },
      };
    } catch (error: any) {
      logger.error('邮件配置校验失败', {
        error: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
      });

      return {
        valid: false,
        message: '邮件配置校验失败',
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * 获取友好的错误信息
   */
  private getErrorMessage(error: any): string {
    const errorMsg = error.message?.toLowerCase() || '';
    
    if (errorMsg.includes('connection closed') || errorMsg.includes('connection refused')) {
      return '无法连接到 SMTP 服务器，请检查 SMTP_HOST 和 SMTP_PORT 配置是否正确，以及网络连接是否正常';
    }
    
    if (errorMsg.includes('authentication') || errorMsg.includes('login')) {
      return 'SMTP 认证失败，请检查 SMTP_USER 和 SMTP_PASS 配置是否正确';
    }
    
    if (errorMsg.includes('certificate') || errorMsg.includes('tls')) {
      return 'SSL/TLS 配置可能有问题，请检查 SMTP_SECURE 和端口配置（465 端口需要 secure=true）';
    }
    
    if (errorMsg.includes('timeout')) {
      return '连接超时，请检查 SMTP 服务器地址和端口是否正确';
    }
    
    return error.message || '未知错误';
  }

  /**
   * 发送 HTTP/HTTPS 请求（使用原生模块）
   */
  private httpRequest(url: string, options: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        timeout: options.timeout || 10000, // 10秒超时
      };

      const req = httpModule.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const jsonData = JSON.parse(data);
              resolve(jsonData);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error: any) {
            reject(new Error(`解析响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }
}

