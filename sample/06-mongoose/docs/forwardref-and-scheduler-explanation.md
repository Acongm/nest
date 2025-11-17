# forwardRef 和定时任务重启机制详解

## 一、forwardRef 是什么？

### 1. 什么是循环依赖？

在 NestJS 中，当两个模块或服务相互依赖时，就会出现循环依赖问题。

**示例：**
```
ScheduledTaskModule 需要 ReportExportModule
ReportExportModule 可能需要 ScheduledTaskModule
```

这会导致：
- 模块 A 在初始化时需要模块 B
- 但模块 B 在初始化时又需要模块 A
- 形成死锁，无法正常启动

### 2. forwardRef 的作用

`forwardRef` 是 NestJS 提供的解决循环依赖的工具，它允许延迟解析依赖关系。

**工作原理：**
- 使用 `forwardRef(() => SomeModule)` 延迟模块的解析
- 在运行时才真正解析依赖，而不是在编译时
- 使用 `@Inject(forwardRef(() => SomeService))` 延迟服务的注入

### 3. 在我们的代码中的使用

#### 在模块中使用：

```typescript
// scheduled-task.module.ts
@Module({
  imports: [
    // 使用 forwardRef 延迟 ReportExportModule 的解析
    forwardRef(() => ReportExportModule),
  ],
  // ...
})
```

#### 在服务中使用：

```typescript
// scheduled-task-scheduler.service.ts
constructor(
  // 使用 @Inject(forwardRef()) 延迟 ReportExportService 的注入
  @Inject(forwardRef(() => ReportExportService))
  private reportExportService: ReportExportService,
) {}
```

```typescript
// scheduled-task.service.ts
constructor(
  // 使用 @Inject(forwardRef()) 延迟 ScheduledTaskSchedulerService 的注入
  @Inject(forwardRef(() => ScheduledTaskSchedulerService))
  private schedulerService: ScheduledTaskSchedulerService,
) {}
```

### 4. 为什么需要 forwardRef？

在我们的场景中：
- `ScheduledTaskSchedulerService` 需要 `ReportExportService` 来创建导出任务
- `ScheduledTaskService` 需要 `ScheduledTaskSchedulerService` 来调度任务
- 如果 `ReportExportModule` 也需要 `ScheduledTaskModule`，就会形成循环依赖

使用 `forwardRef` 可以打破这个循环，让 NestJS 在运行时按需解析依赖。

---

## 二、服务重启时如何重新触发定时任务？

### 1. 生命周期钩子：OnModuleInit

NestJS 提供了生命周期钩子，`OnModuleInit` 在模块初始化完成后自动执行。

```typescript
// scheduled-task-scheduler.service.ts
@Injectable()
export class ScheduledTaskSchedulerService implements OnModuleInit, OnModuleDestroy {
  
  // 当模块初始化完成时，这个方法会自动执行
  async onModuleInit() {
    logger.info('开始加载定时任务');
    await this.loadAllEnabledTasks();
  }
  
  // 当模块销毁时，这个方法会自动执行
  onModuleDestroy() {
    logger.info('清理所有定时任务');
    this.clearAllJobs();
  }
}
```

### 2. 加载流程详解

#### 步骤 1：服务启动
```
应用启动 → NestJS 初始化所有模块 → 创建所有服务实例
```

#### 步骤 2：执行 onModuleInit
```
ScheduledTaskSchedulerService 实例创建完成
  ↓
自动调用 onModuleInit() 方法
  ↓
执行 loadAllEnabledTasks()
```

#### 步骤 3：从数据库加载任务
```typescript
async loadAllEnabledTasks(): Promise<void> {
  // 1. 从 MongoDB 查询所有启用的任务
  const tasks = await this.taskModel.find({ enable: true }).exec();
  
  // 2. 为每个任务创建 Cron 调度
  for (const task of tasks) {
    this.scheduleTask(task);
  }
}
```

#### 步骤 4：创建 Cron 任务
```typescript
scheduleTask(task: ScheduledTask): void {
  const jobName = `scheduled-task-${task.id}`;
  
  // 创建 CronJob 实例
  const job = new CronJob(
    task.cronExpression,  // 例如: "0 0 9 * * *" (每天9点)
    () => {
      // 当时间到达时，执行这个回调函数
      this.executeTask(task);
    },
    null,
    true,  // 立即启动
    'Asia/Shanghai',
  );
  
  // 注册到调度器
  this.schedulerRegistry.addCronJob(jobName, job);
}
```

### 3. 完整的启动流程

```
┌─────────────────────────────────────────┐
│  1. 应用启动 (npm start)                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  2. NestJS 初始化模块                   │
│     - AppModule                         │
│     - ScheduledTaskModule               │
│     - ReportExportModule                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  3. 创建服务实例                        │
│     - ScheduledTaskSchedulerService     │
│     - ScheduledTaskService              │
│     - ReportExportService               │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  4. 执行生命周期钩子                    │
│     ScheduledTaskSchedulerService       │
│     .onModuleInit()                     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  5. 从数据库加载任务                    │
│     taskModel.find({ enable: true })    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  6. 为每个任务创建 Cron 调度            │
│     scheduleTask(task)                  │
│     - 解析 cronExpression               │
│     - 创建 CronJob                      │
│     - 注册到 SchedulerRegistry          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  7. Cron 任务开始运行                   │
│     根据 cronExpression 自动触发        │
└─────────────────────────────────────────┘
```

### 4. 任务执行流程

当 Cron 时间到达时：

```
┌─────────────────────────────────────────┐
│  Cron 时间到达                          │
│  (例如: 每天 9:00)                      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  执行 executeTask(task)                 │
│  1. 计算时间范围                        │
│  2. 为每个 pageId × branchId 创建导出   │
│  3. 等待所有导出完成                    │
│  4. 发送邮件                            │
└─────────────────────────────────────────┘
```

### 5. 更新任务时的重新调度

当通过 API 更新任务时：

```typescript
// scheduled-task.service.ts
async createOrUpdate(taskData: CreateScheduledTaskDto) {
  // 1. 更新数据库
  const updatedTask = await TaskUpdater.enableOrUpdateTask(...);
  
  // 2. 重新调度任务
  await this.schedulerService.rescheduleTask(taskId);
  //    ↓
  //    - 取消旧的 Cron 任务
  //    - 从数据库重新加载任务
  //    - 创建新的 Cron 任务
}
```

### 6. 服务停止时的清理

```typescript
onModuleDestroy() {
  // 清理所有注册的 Cron 任务
  this.clearAllJobs();
}
```

---

## 三、关键代码位置

### 1. 自动加载任务
**文件：** `src/scheduled-task/scheduled-task-scheduler.service.ts`

```typescript
async onModuleInit() {
  logger.info('开始加载定时任务');
  await this.loadAllEnabledTasks();  // ← 这里自动执行
}
```

### 2. 从数据库加载
```typescript
async loadAllEnabledTasks(): Promise<void> {
  const tasks = await this.taskModel.find({ enable: true }).exec();
  for (const task of tasks) {
    this.scheduleTask(task);  // ← 为每个任务创建调度
  }
}
```

### 3. 创建 Cron 调度
```typescript
scheduleTask(task: ScheduledTask): void {
  const job = new CronJob(
    task.cronExpression,  // ← 使用数据库中的 cron 表达式
    () => {
      this.executeTask(task);  // ← 时间到达时执行
    },
    null,
    true,  // ← 立即启动
    'Asia/Shanghai',
  );
  this.schedulerRegistry.addCronJob(jobName, job);
}
```

---

## 四、总结

### forwardRef
- **作用**：解决循环依赖问题
- **使用场景**：当两个模块/服务相互依赖时
- **原理**：延迟依赖解析到运行时

### 定时任务重启机制
- **触发时机**：服务启动时自动执行 `onModuleInit()`
- **加载方式**：从 MongoDB 查询所有 `enable: true` 的任务
- **调度方式**：使用 `CronJob` 根据 `cronExpression` 自动调度
- **更新方式**：更新任务时调用 `rescheduleTask()` 重新调度
- **清理方式**：服务停止时在 `onModuleDestroy()` 中清理

这样设计的好处：
- ✅ 服务重启后自动恢复所有定时任务
- ✅ 不需要手动重新配置
- ✅ 任务配置持久化在数据库中
- ✅ 支持动态更新和重新调度

