import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

describe('Report export without database', () => {
  let app: INestApplication;
  const oldEnv = { ...process.env };

  beforeEach(async () => {
    jest.resetModules();
    process.env = {
      ...oldEnv,
      DATABASE_DISABLED: 'true',
      MONGODB_URI: '',
    };

    const { AppModule } = require('../app.module');
    const {
      ReportExportDirectService,
    } = require('./report-export-direct.service');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ReportExportDirectService)
      .useValue({
        exportToPdfBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4\n')),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    process.env = oldEnv;
    await app?.close();
  });

  it('returns a PDF directly from POST /api/report-export', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/report-export')
      .send({
        startTime: '2026-05-25T00:00:00.000Z',
        endTime: '2026-05-26T00:00:00.000Z',
        assetId: 'daily-news',
        reportPage:
          'https://www.acongm.com/daily-news/2026-05-25.html#%E4%BB%8A%E6%97%A5%E6%A6%82%E8%A7%88',
      })
      .expect(201)
      .expect('content-type', /application\/pdf/);

    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="report.pdf"',
    );
    expect(response.body.toString()).toContain('%PDF-1.4');
  });
});
