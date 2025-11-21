import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 查询执行记录参数 DTO
 */
export class QueryExecutionRecordsDto {
  /**
   * 限制返回数量
   * @default 100
   * @minimum 1
   * @maximum 1000
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须是整数' })
  @Min(1, { message: 'limit 最小值为 1' })
  @Max(1000, { message: 'limit 最大值为 1000' })
  limit?: number;

  /**
   * 任务ID（可选，用于过滤特定任务的执行记录）
   */
  @IsOptional()
  @IsString({ message: 'taskId 必须是字符串' })
  taskId?: string;

  /**
   * 执行状态过滤（可选）
   */
  @IsOptional()
  @IsEnum(['success', 'failed'], { message: 'status 必须是 success 或 failed' })
  status?: 'success' | 'failed';

  /**
   * 邮件发送状态过滤（可选）
   */
  @IsOptional()
  @IsEnum(['success', 'failed', 'not_sent'], {
    message: 'emailStatus 必须是 success、failed 或 not_sent',
  })
  emailStatus?: 'success' | 'failed' | 'not_sent';
}

