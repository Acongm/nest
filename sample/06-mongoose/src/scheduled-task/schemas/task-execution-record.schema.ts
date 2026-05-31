import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * 邮件附件信息
 */
@Schema({ _id: false })
export class EmailAttachment {
  /** 附件文件名 */
  @Prop({ required: true, type: String })
  filename: string;

  /** 附件文件路径 */
  @Prop({ required: true, type: String })
  path: string;
}

/**
 * 定时任务执行记录 Schema
 */
export type TaskExecutionRecordDocument = TaskExecutionRecord & Document;

@Schema({ collection: 'task_execution_records', timestamps: true })
export class TaskExecutionRecord {
  /** 关联的定时任务ID */
  @Prop({ required: true, type: String, index: true })
  taskId: string;

  /** 租户ID */
  @Prop({ required: true, type: String, index: true })
  tenantId: string;

  /** 执行状态：success | failed */
  @Prop({ required: true, type: String, enum: ['success', 'failed'], index: true })
  status: 'success' | 'failed';

  /** 执行开始时间 */
  @Prop({ required: true, type: Date, default: Date.now })
  startTime: Date;

  /** 执行结束时间 */
  @Prop({ type: Date })
  endTime?: Date;

  /** 执行耗时（毫秒） */
  @Prop({ type: Number })
  duration?: number;

  /** 错误信息（如果执行失败） */
  @Prop({ type: String })
  errorMessage?: string;

  /** 错误堆栈（如果执行失败） */
  @Prop({ type: String })
  errorStack?: string;

  /** 邮件发送状态：success | failed | not_sent */
  @Prop({ required: true, type: String, enum: ['success', 'failed', 'not_sent'], default: 'not_sent' })
  emailStatus: 'success' | 'failed' | 'not_sent';

  /** 邮件发送错误信息（如果发送失败） */
  @Prop({ type: String })
  emailErrorMessage?: string;

  /** 邮件附件列表 */
  @Prop({ type: [EmailAttachment], default: [] })
  emailAttachments: EmailAttachment[];

  /** 收件人列表 */
  @Prop({ type: [String], default: [] })
  recipients: string[];

  /** 导出的任务数量 */
  @Prop({ type: Number, default: 0 })
  totalExports: number;

  /** 成功导出的任务数量 */
  @Prop({ type: Number, default: 0 })
  successfulExports: number;

  /** 创建时间 */
  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  /** 更新时间 */
  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

/**
 * 创建 TaskExecutionRecord Schema
 */
export const TaskExecutionRecordSchema = SchemaFactory.createForClass(TaskExecutionRecord);

// 添加索引
TaskExecutionRecordSchema.index({ taskId: 1, tenantId: 1 });
TaskExecutionRecordSchema.index({ tenantId: 1, createdAt: -1 });
TaskExecutionRecordSchema.index({ status: 1, createdAt: -1 });
TaskExecutionRecordSchema.index({ emailStatus: 1, createdAt: -1 });

