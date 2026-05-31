/**
 * 修复 scheduled_tasks 集合的索引
 * 删除旧的 id_1 唯一索引，保留复合索引 { id: 1, tenantId: 1 }
 * 
 * 使用方法：
 * 1. 连接到 MongoDB
 * 2. 切换到对应的数据库（如：use test）
 * 3. 运行此脚本：load('scripts/fix-scheduled-tasks-index.js')
 * 
 * 或者直接在 MongoDB shell 中执行：
 * db.scheduled_tasks.dropIndex("id_1")
 */

// 连接到数据库（如果不在 MongoDB shell 中，需要先连接）
// use test;

try {
  // 获取所有索引
  const indexes = db.scheduled_tasks.getIndexes();
  print('当前索引列表：');
  indexes.forEach(index => {
    print(JSON.stringify(index, null, 2));
  });

  // 检查是否存在 id_1 索引
  const idIndex = indexes.find(idx => idx.name === 'id_1');
  
  if (idIndex) {
    print('\n找到 id_1 索引，准备删除...');
    
    // 删除 id_1 索引
    const result = db.scheduled_tasks.dropIndex('id_1');
    print('删除结果：' + JSON.stringify(result, null, 2));
    print('✓ id_1 索引已删除');
  } else {
    print('\n未找到 id_1 索引，可能已经删除或不存在');
  }

  // 验证复合索引是否存在
  const compoundIndex = indexes.find(idx => 
    idx.name === 'id_1_tenantId_1' || 
    (idx.key && idx.key.id === 1 && idx.key.tenantId === 1)
  );
  
  if (compoundIndex) {
    print('\n✓ 复合索引 { id: 1, tenantId: 1 } 存在');
  } else {
    print('\n⚠ 警告：未找到复合索引 { id: 1, tenantId: 1 }');
    print('请确保 schema 中已定义该索引');
  }

  // 显示最终的索引列表
  print('\n最终索引列表：');
  const finalIndexes = db.scheduled_tasks.getIndexes();
  finalIndexes.forEach(index => {
    print(JSON.stringify(index, null, 2));
  });

  print('\n✓ 索引修复完成！');
} catch (error) {
  print('✗ 错误：' + error.message);
  print('堆栈：' + error.stack);
}

