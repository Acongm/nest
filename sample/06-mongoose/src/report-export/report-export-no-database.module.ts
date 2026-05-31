import { Module } from '@nestjs/common';
import { ReportExportDirectService } from './report-export-direct.service';
import { ReportExportNoDatabaseController } from './report-export-no-database.controller';

@Module({
  controllers: [ReportExportNoDatabaseController],
  providers: [ReportExportDirectService],
  exports: [ReportExportDirectService],
})
export class ReportExportNoDatabaseModule {}
