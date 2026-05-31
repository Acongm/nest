import { BadRequestException, Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { existsSync } from 'fs';
import { CreateExportTaskDto } from './dto/create-export-task.dto';
import { logger } from '../common/logger';

type ChromiumModule = {
  args?: string[];
  executablePath?: () => Promise<string> | string;
  headless?: boolean | 'shell';
};

@Injectable()
export class ReportExportDirectService {
  private readonly BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  private readonly PAGE_LOAD_TIMEOUT = parseInt(
    process.env.REPORT_EXPORT_PAGE_LOAD_TIMEOUT || '60000',
    10,
  );
  private readonly RENDER_SETTLE_MS = parseInt(
    process.env.REPORT_EXPORT_RENDER_SETTLE_MS || '2000',
    10,
  );

  async exportToPdfBuffer(createDto: CreateExportTaskDto): Promise<Buffer> {
    this.validateParams(createDto);

    const reportUrl = this.buildReportUrl(createDto.reportPage, {
      startTime: createDto.startTime,
      endTime: createDto.endTime,
      assetId: createDto.assetId || createDto.branchIds?.[0] || 'default',
      ...(createDto.timezone ? { timezone: createDto.timezone } : {}),
    });

    const browser = await puppeteer.launch(await this.getLaunchOptions());

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      logger.info('无数据库模式开始直接导出 PDF', { reportUrl });

      await page.goto(reportUrl, {
        waitUntil: 'networkidle0',
        timeout: this.PAGE_LOAD_TIMEOUT,
      });

      await new Promise((resolve) => setTimeout(resolve, this.RENDER_SETTLE_MS));

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private async getLaunchOptions(): Promise<puppeteer.LaunchOptions> {
    const chromium = await this.loadVercelChromium();
    const executablePath = await this.getChromeExecutablePath(chromium);
    const args = [
      ...(chromium?.args || []),
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ];

    return {
      headless: chromium?.headless ?? true,
      args,
      ...(executablePath ? { executablePath } : {}),
    };
  }

  private async loadVercelChromium(): Promise<ChromiumModule | null> {
    try {
      // Optional dependency for Vercel/serverless. Local Docker/system Chrome works without it.
      return require('@sparticuz/chromium') as ChromiumModule;
    } catch {
      return null;
    }
  }

  private async getChromeExecutablePath(
    chromium: ChromiumModule | null,
  ): Promise<string | undefined> {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
      if (existsSync(envPath)) {
        return envPath;
      }
    }

    if (chromium?.executablePath) {
      const executablePath = await chromium.executablePath();
      if (executablePath) {
        return executablePath;
      }
    }

    const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (process.platform === 'darwin' && existsSync(macPath)) {
      return macPath;
    }

    const linuxPaths = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ];

    if (process.platform === 'linux') {
      return linuxPaths.find((path) => existsSync(path));
    }

    return undefined;
  }

  private validateParams(dto: CreateExportTaskDto): void {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (startTime >= endTime) {
      throw new BadRequestException('开始时间必须小于结束时间');
    }

    if (!this.isValidUrl(dto.reportPage) && !dto.reportPage.startsWith('/')) {
      throw new BadRequestException('报表页面必须是有效的URL或路径');
    }
  }

  private buildReportUrl(
    reportPage: string,
    params: Record<string, string>,
  ): string {
    const url = this.isValidUrl(reportPage)
      ? new URL(reportPage)
      : new URL(reportPage, this.BASE_URL);

    Object.keys(params).forEach((key) => {
      url.searchParams.set(key, params[key]);
    });

    return url.toString();
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
