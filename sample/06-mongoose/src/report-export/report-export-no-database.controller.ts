import { Body, Controller, Header, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CreateExportTaskDto } from './dto/create-export-task.dto';
import { ReportExportDirectService } from './report-export-direct.service';

@Controller('report-export')
export class ReportExportNoDatabaseController {
  constructor(
    private readonly reportExportDirectService: ReportExportDirectService,
  ) {}

  @Post()
  @Header('Content-Type', 'application/pdf')
  async exportReport(
    @Body() data: CreateExportTaskDto,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.reportExportDirectService.exportToPdfBuffer(data);

    res.status(HttpStatus.CREATED);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.send(pdfBuffer);
  }
}
