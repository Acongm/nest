import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * 导出任务状态枚举
 */
export enum ExportTaskStatus {
  PENDING = 'pending', // 待处理
  PROCESSING = 'processing', // 处理中
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed', // 失败
}

/**
 * 导出任务Schema
 */
@Schema({ timestamps: true })
export class ExportTask extends Document {
  /** 任务名称 */
  @Prop({ type: String })
  taskName?: string;

  /** 开始时间 */
  @Prop({ type: Date, required: true })
  startTime: Date;

  /** 结束时间 */
  @Prop({ type: Date, required: true })
  endTime: Date;

  /** 租户ID */
  @Prop({ type: String, required: true, index: true })
  tenantId: string;

  /** 资产ID */
  @Prop({ type: String, required: true, index: true })
  assetId: string;

  /** 报表页面URL或路径 */
  @Prop({ type: String, required: true })
  reportPage: string;

  /** 任务状态 */
  @Prop({
    type: String,
    enum: ExportTaskStatus,
    default: ExportTaskStatus.PENDING,
    index: true,
  })
  status: ExportTaskStatus;

  /** PDF文件路径（已废弃，保留用于兼容） */
  @Prop({ type: String })
  filePath?: string;

  /** GridFS 文件ID */
  @Prop({ type: String, index: true })
  fileId?: string;

  /** 文件大小（字节） */
  @Prop({ type: Number })
  fileSize?: number;

  /** 下载URL */
  @Prop({ type: String })
  downloadUrl?: string;

  /** 错误信息 */
  @Prop({ type: String })
  errorMessage?: string;

  /** 创建时间 */
  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  /** 更新时间 */
  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const ExportTaskSchema = SchemaFactory.createForClass(ExportTask);

// 创建索引
ExportTaskSchema.index({ tenantId: 1, createdAt: -1 });
ExportTaskSchema.index({ tenantId: 1, assetId: 1, createdAt: -1 });
ExportTaskSchema.index({ status: 1, createdAt: -1 });

// 在 JSON 序列化时排除 filePath 字段
// 注意：全局插件已经将 _id 转换为 id 并删除 __v，这里只需要处理 filePath
// 需要合并全局插件的 transform 和本地的 transform
ExportTaskSchema.set('toJSON', {
  transform: function(doc, ret) {
    // 先应用全局插件的转换（_id -> id, 删除 __v）
    if (ret._id) {
      ret.id = ret._id.toString();
      delete ret._id;
    }
    delete ret.__v;
    // 然后删除 filePath 字段
    delete ret.filePath;
    return ret;
  },
});

// 在对象序列化时也排除 filePath 字段
ExportTaskSchema.set('toObject', {
  transform: function(doc, ret) {
    // 先应用全局插件的转换（_id -> id, 删除 __v）
    if (ret._id) {
      ret.id = ret._id.toString();
      delete ret._id;
    }
    delete ret.__v;
    // 然后删除 filePath 字段
    delete ret.filePath;
    return ret;
  },
});

