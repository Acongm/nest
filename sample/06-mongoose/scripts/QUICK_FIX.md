# 🚨 紧急修复：删除旧的 id_1 索引

## 问题
数据库中仍存在旧的 `id_1` 唯一索引，导致重复键错误。

## 快速修复（3步）

### 步骤 1: 连接到 MongoDB

```bash
# 如果使用 Docker
docker exec -it <mongodb-container-name> mongosh test

# 或者直接使用 mongosh
mongosh mongodb://localhost:27017/test
```

### 步骤 2: 删除旧索引

```javascript
db.scheduled_tasks.dropIndex("id_1")
```

### 步骤 3: 验证

```javascript
// 查看所有索引，确认 id_1 已删除
db.scheduled_tasks.getIndexes()
```

应该看到类似这样的输出（**不应该有 `id_1`**）：
```
[
  { v: 2, key: { _id: 1 }, name: '_id_' },
  { v: 2, key: { id: 1, tenantId: 1 }, name: 'id_1_tenantId_1', unique: true },
  { v: 2, key: { tenantId: 1 }, name: 'tenantId_1' },
  ...
]
```

## 完成！

删除索引后，重启应用即可。错误应该消失。

## 如果仍有问题

运行完整修复脚本：
```bash
mongo test scripts/fix-scheduled-tasks-index-complete.js
```

