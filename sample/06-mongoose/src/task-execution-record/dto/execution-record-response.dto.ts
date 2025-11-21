/**
 * 邮件附件响应 DTO
 */
export class EmailAttachmentResponseDto {
  /** 附件文件名 */
  filename: string;

  /** 附件文件路径 */
  path: string;
}

/**
 * 执行记录响应 DTO
 */
export class TaskExecutionRecordResponseDto {
  /** 执行记录ID */
  id: string;

  /** 关联的定时任务ID */
  taskId: string;

  /** 租户ID */
  tenantId: string;

  /** 执行状态：success | failed */
  status: 'success' | 'failed';

  /** 执行开始时间 */
  startTime: Date;

  /** 执行结束时间 */
  endTime?: Date;

  /** 执行耗时（毫秒） */
  duration?: number;

  /** 错误信息（如果执行失败） */
  errorMessage?: string;

  /** 错误堆栈（如果执行失败） */
  errorStack?: string;

  /** 邮件发送状态：success | failed | not_sent */
  emailStatus: 'success' | 'failed' | 'not_sent';

  /** 邮件发送错误信息（如果发送失败） */
  emailErrorMessage?: string;

  /** 邮件附件列表 */
  emailAttachments: EmailAttachmentResponseDto[];

  /** 收件人列表 */
  recipients: string[];

  /** 导出的任务数量 */
  totalExports: number;

  /** 成功导出的任务数量 */
  successfulExports: number;

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 执行记录列表响应 DTO
 */
export class TaskExecutionRecordListResponseDto {
  /** 执行记录列表 */
  records: TaskExecutionRecordResponseDto[];

  /** 记录总数 */
  recordsCount: number;

  /** 用户租户ID（仅调试接口返回） */
  userTenantId?: string;
}

