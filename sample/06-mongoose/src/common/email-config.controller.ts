import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { EmailConfigService, EmailConfig, EmailConfigValidationResult } from './email-config.service';
import { logger } from './logger';

/**
 * 邮件配置控制器
 * 提供邮件配置获取和校验接口
 */
@Controller('email-config')
export class EmailConfigController {
  constructor(private readonly emailConfigService: EmailConfigService) {}

  /**
   * 获取邮件配置
   * GET /api/email-config
   */
  @Get()
  async getConfig(): Promise<{ config: EmailConfig; source: string }> {
    try {
      logger.info('获取邮件配置');
      
      const config = await this.emailConfigService.getEmailConfig();
      
      // 判断配置来源
      const apiUrl = process.env.EMAIL_CONFIG_API_URL;
      const source = apiUrl ? 'third-party' : 'environment';
      
      // 不返回密码
      const safeConfig = {
        ...config,
        pass: '***',
      };

      return {
        config: safeConfig,
        source,
      };
    } catch (error: any) {
      logger.error('获取邮件配置失败', {
        error: error.message,
        stack: error.stack,
      });
      throw new HttpException(
        {
          message: '获取邮件配置失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 校验邮件配置
   * POST /api/email-config/validate
   * 
   * 请求体（可选）：
   * {
   *   "host": "smtp.163.com",
   *   "port": 465,
   *   "secure": true,
   *   "user": "your-email@163.com",
   *   "pass": "your-password"
   * }
   * 
   * 如果不提供请求体，将使用当前配置（从第三方接口或环境变量获取）
   */
  @Post('validate')
  async validateConfig(
    @Body() body?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
      from?: string;
    },
  ): Promise<EmailConfigValidationResult> {
    try {
      logger.info('校验邮件配置', {
        hasCustomConfig: !!body,
        host: body?.host,
        port: body?.port,
      });

      let config: EmailConfig | undefined;

      // 如果提供了自定义配置，使用自定义配置
      if (body && (body.host || body.user)) {
        if (!body.host || !body.port || !body.user || !body.pass) {
          throw new HttpException(
            {
              message: '配置不完整',
              error: 'host、port、user、pass 都是必需字段',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        config = {
          host: body.host,
          port: body.port,
          secure: body.secure !== undefined ? body.secure : body.port === 465,
          user: body.user,
          pass: body.pass,
          from: body.from,
        };
      }

      // 校验配置
      const result = await this.emailConfigService.validateEmailConfig(config);

      if (!result.valid) {
        logger.warn('邮件配置校验失败', {
          error: result.error,
        });
      } else {
        logger.info('邮件配置校验成功');
      }

      return result;
    } catch (error: any) {
      logger.error('校验邮件配置失败', {
        error: error.message,
        stack: error.stack,
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          message: '校验邮件配置失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

