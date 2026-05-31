import { Schema } from 'mongoose';

/**
 * Mongoose 全局插件
 * 统一将 _id 转换为 id，并删除 __v 字段
 * @param schema Mongoose Schema
 */
export function idTransformPlugin(schema: Schema) {
  // 在 toJSON 时转换
  schema.set('toJSON', {
    transform: function(doc, ret, options) {
      // 将 _id 转换为 id
      if (ret._id) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
      // 删除 __v 字段
      delete ret.__v;
      return ret;
    },
  });

  // 在 toObject 时也转换
  schema.set('toObject', {
    transform: function(doc, ret, options) {
      // 将 _id 转换为 id
      if (ret._id) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
      // 删除 __v 字段
      delete ret.__v;
      return ret;
    },
  });
}

