# 修复 scheduled_tasks 索引

## 问题描述

在更新 schema 后，数据库中可能仍存在旧的 `id_1` 唯一索引，导致重复键错误。

## 解决方案

### 方法 1：使用 MongoDB Shell 直接删除

连接到 MongoDB 并执行：

```javascript
// 切换到对应的数据库
use test

// 查看所有索引
db.scheduled_tasks.getIndexes()

// 删除旧的 id_1 唯一索引
db.scheduled_tasks.dropIndex("id_1")

// 验证索引已删除
db.scheduled_tasks.getIndexes()
```

### 方法 2：使用提供的脚本

```bash
# 在 MongoDB shell 中
mongo your_database_name

# 加载并运行脚本
load('scripts/fix-scheduled-tasks-index.js')
```

### 方法 3：使用 MongoDB Compass 或 GUI 工具

1. 打开 MongoDB Compass
2. 连接到数据库
3. 选择 `scheduled_tasks` 集合
4. 进入 "Indexes" 标签页
5. 找到 `id_1` 索引并删除

## 验证

删除索引后，应该只保留以下索引：
- `_id_` (MongoDB 默认)
- `id_1_tenantId_1` (复合唯一索引)
- `tenantId_1` (普通索引)
- `tenantId_1_enable_1` (复合索引)
- `enable_1` (普通索引)

## 注意事项

- 删除索引是安全的，不会影响数据
- 确保应用已更新代码使用 `upsert` 选项
- 建议在非生产环境先测试

