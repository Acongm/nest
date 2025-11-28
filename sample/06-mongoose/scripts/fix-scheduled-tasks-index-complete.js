/**
 * 完整修复 scheduled_tasks 集合的索引和数据
 * 
 * 1. 删除旧的 id_1 唯一索引
 * 2. 检查并清理重复数据（如果有）
 * 3. 验证复合索引存在
 * 
 * 使用方法：
 * mongo test scripts/fix-scheduled-tasks-index-complete.js
 * 
 * 或者在 MongoDB shell 中：
 * use test
 * load('scripts/fix-scheduled-tasks-index-complete.js')
 */

print('=== 开始修复 scheduled_tasks 集合 ===\n');

try {
  const collection = db.scheduled_tasks;
  
  // 1. 查看当前所有索引
  print('1. 查看当前索引...');
  const indexes = collection.getIndexes();
  print('当前索引列表：');
  indexes.forEach(index => {
    print('  - ' + index.name + ': ' + JSON.stringify(index.key));
  });
  print('');

  // 2. 检查是否存在 id_1 索引
  const idIndex = indexes.find(idx => idx.name === 'id_1');
  
  if (idIndex) {
    print('2. 找到 id_1 索引，准备删除...');
    try {
      const result = collection.dropIndex('id_1');
      print('  ✓ id_1 索引已删除: ' + JSON.stringify(result));
    } catch (dropError) {
      if (dropError.message.includes('not found')) {
        print('  ⚠ id_1 索引不存在或已删除');
      } else {
        throw dropError;
      }
    }
  } else {
    print('2. ✓ 未找到 id_1 索引（可能已删除）');
  }
  print('');

  // 3. 检查是否有重复的 id（不同 tenantId）
  print('3. 检查重复数据...');
  const duplicateIds = collection.aggregate([
    {
      $group: {
        _id: '$id',
        count: { $sum: 1 },
        tenantIds: { $push: '$tenantId' },
        docs: { $push: '$$ROOT' }
      }
    },
    {
      $match: { count: { $gt: 1 } }
    }
  ]).toArray();

  if (duplicateIds.length > 0) {
    print('  发现重复的 id：');
    duplicateIds.forEach(dup => {
      print('    - id: ' + dup._id);
      print('      数量: ' + dup.count);
      print('      tenantIds: ' + dup.tenantIds.join(', '));
    });
    print('  ⚠ 注意：这些重复数据是正常的（不同租户可以有相同的 id）');
  } else {
    print('  ✓ 未发现重复数据');
  }
  print('');

  // 4. 验证复合索引
  print('4. 验证复合索引...');
  const finalIndexes = collection.getIndexes();
  const compoundIndex = finalIndexes.find(idx => 
    idx.name === 'id_1_tenantId_1' || 
    (idx.key && idx.key.id === 1 && idx.key.tenantId === 1 && idx.unique)
  );
  
  if (compoundIndex) {
    print('  ✓ 复合唯一索引 { id: 1, tenantId: 1 } 存在');
    print('    索引名称: ' + compoundIndex.name);
  } else {
    print('  ⚠ 警告：未找到复合唯一索引 { id: 1, tenantId: 1 }');
    print('  请确保应用代码中已定义该索引');
  }
  print('');

  // 5. 显示最终索引列表
  print('5. 最终索引列表：');
  finalIndexes.forEach(index => {
    const unique = index.unique ? ' [UNIQUE]' : '';
    print('  - ' + index.name + ': ' + JSON.stringify(index.key) + unique);
  });
  print('');

  print('=== 修复完成！ ===');
  print('');
  print('如果仍有问题，请：');
  print('1. 重启应用');
  print('2. 检查应用日志');
  print('3. 确认 schema 中已移除 id 字段的 unique: true');

} catch (error) {
  print('✗ 错误：' + error.message);
  print('堆栈：' + error.stack);
  throw error;
}

