import { IsString, IsDateString, IsNotEmpty, IsOptional, IsArray, ValidateIf } from 'class-validator';

/**
 * 创建导出任务DTO
 */
export class CreateExportTaskDto {
  /** 开始时间 */
  @IsNotEmpty({ message: '开始时间不能为空' })
  @IsDateString({}, { message: '开始时间格式不正确' })
  startTime: string;

  /** 结束时间 */
  @IsNotEmpty({ message: '结束时间不能为空' })
  @IsDateString({}, { message: '结束时间格式不正确' })
  endTime: string;

  /** 资产ID（单个，当 branchIds 未提供时使用） */
  @ValidateIf((o) => !o.branchIds || o.branchIds.length === 0)
  @IsNotEmpty({ message: '资产ID不能为空（当 branchIds 未提供时）' })
  @IsString({ message: '资产ID必须是字符串' })
  assetId?: string;

  /** 分支ID列表（多个，如果提供则忽略 assetId，为每个 branchId 创建导出任务） */
  @IsOptional()
  @IsArray({ message: 'branchIds 必须是数组' })
  @IsString({ each: true, message: 'branchIds 中的每个元素必须是字符串' })
  branchIds?: string[];

  /** 报表页面URL或路径 */
  @IsNotEmpty({ message: '报表页面不能为空' })
  @IsString({ message: '报表页面必须是字符串' })
  reportPage: string;

  /** 任务名称（可选） */
  @IsOptional()
  @IsString()
  taskName?: string;
}

