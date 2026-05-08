# TAPD → CodeBuddy 自动编程集成

通过 TAPD Open API 监控项目需求，**自动调用 CodeBuddy CLI 实现新需求**。

## ✨ 核心功能

- 🔄 **自动检测**：持续监控 TAPD 新需求
- 🤖 **自动编程**：发现新需求后自动调用 CodeBuddy CLI 实现
- 📝 **任务追踪**：记录已实现的需求，避免重复处理
- 📊 **日志记录**：完整的执行日志便于排查问题

## 🚀 快速开始

### 1. 安装依赖

```bash
cd scripts/tapd-integration
npm install
```

### 2. 确保 CodeBuddy CLI 已安装

```bash
# 检查是否安装
codebuddy --version

# 如未安装，请参考官方文档安装
# https://www.codebuddy.cn/docs/zh/cli
```

### 3. 配置环境变量

```bash
# 编辑 .env 文件（已预配置）
# 确认以下配置正确：
TAPD_API_USER=你的应用ID
TAPD_API_PASSWORD=你的应用秘钥
TAPD_WORKSPACE_ID=你的项目ID
```

### 4. 选择运行方式

---

## 📌 运行方式

### 方式一：守护进程模式（推荐 ✅）

最简单的方式，启动后会持续运行，每5分钟检测一次新需求：

```bash
# 前台运行（可以看到日志）
./start.sh cron

# 或后台运行
nohup npm run cron:daemon > /dev/null 2>&1 &
```

### 方式二：系统 Crontab

使用系统定时任务，更稳定：

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每5分钟检测一次）
*/5 * * * * cd /Users/xiongfeiwu/CodeBuddy/mps-for-manju/scripts/tapd-integration && npm run cron:once >> logs/cron.log 2>&1
```

### 方式三：Webhook 模式（实时 ⚡）

如果你有公网可访问的服务器或使用内网穿透：

```bash
# 启动 Webhook 服务
./start.sh webhook

# 然后在 TAPD 开放平台配置：
# URL: http://YOUR_PUBLIC_IP:3000/webhook
# 事件: story::create
```

---

## 📋 命令参考

| 命令 | 说明 |
|------|------|
| `npm run cron:daemon` | 启动定时检测守护进程 |
| `npm run cron:once` | 单次检测新需求 |
| `npm run webhook` | 启动 Webhook 服务 |
| `npm run fetch:all` | 获取所有需求 |
| `npm run fetch:new` | 检测新需求（不触发编程） |
| `./start.sh status` | 查看运行状态 |

---

## 🔧 配置说明

### 环境变量 (.env)

```env
# TAPD API 配置
TAPD_API_USER=应用ID
TAPD_API_PASSWORD=应用秘钥
TAPD_WORKSPACE_ID=项目ID
TAPD_API_URL=https://api.tapd.cn

# 定时轮询配置
TAPD_POLL_INTERVAL=300  # 检测间隔（秒），默认5分钟

# Webhook 配置
WEBHOOK_PORT=3000
TAPD_WEBHOOK_SECRET=  # Webhook 验证密钥
```

### 需求过滤

默认会跳过标题包含"示例"的需求。如需修改过滤规则，编辑 `cron-trigger.ts` 中的 `shouldProcessStory` 函数：

```typescript
function shouldProcessStory(story: TapdStory): boolean {
  // 跳过示例需求
  if (story.name.includes('示例')) return false;
  
  // 可添加其他过滤条件：
  // if (story.status !== 'planning') return false;
  // if (story.priority_label !== 'High') return false;
  
  return true;
}
```

---

## 📁 文件结构

```
scripts/tapd-integration/
├── start.sh              # 启动脚本
├── cron-trigger.ts       # 定时轮询触发器 ⭐
├── webhook-server.ts     # Webhook 服务
├── tapd-client.ts        # TAPD API 客户端
├── fetch-stories.ts      # 需求获取脚本
├── check-and-implement.ts # 手动触发脚本
├── .env                  # 配置文件
├── data/
│   ├── known-stories.json      # 已知需求记录
│   ├── implemented-stories.json # 已实现需求
│   └── task-queue.json         # 任务队列（Webhook模式）
└── logs/
    └── *.log             # 执行日志
```

---

## 🔄 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                      TAPD 项目                               │
│                         │                                    │
│                    创建新需求                                 │
│                         │                                    │
└─────────────┬───────────┴───────────┬───────────────────────┘
              │                       │
              ▼                       ▼
     ┌────────────────┐      ┌────────────────┐
     │  Webhook 推送   │      │  定时轮询检测   │
     │  (实时触发)     │      │  (每5分钟)     │
     └────────┬───────┘      └────────┬───────┘
              │                       │
              └───────────┬───────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │   检测到新需求        │
              │   (过滤示例需求)      │
              └──────────┬───────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │   生成需求描述        │
              │   (Prompt)           │
              └──────────┬───────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │   调用 CodeBuddy CLI  │
              │   codebuddy -p -y    │
              └──────────┬───────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │   CodeBuddy 自动编程  │
              │   实现需求功能        │
              └──────────┬───────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │   记录已实现需求      │
              │   生成执行日志        │
              └──────────────────────┘
```

---

## ❓ 常见问题

### Q: CodeBuddy CLI 未找到？

确保已全局安装并配置 PATH：
```bash
npm install -g @anthropic-ai/codebuddy
# 或根据官方文档安装
```

### Q: 首次运行没有触发编程？

首次运行会将所有现有需求记录为"已知"，只有之后创建的新需求才会触发编程。

### Q: 如何测试是否正常工作？

1. 启动服务：`./start.sh cron`
2. 在 TAPD 创建一个新需求（标题不要包含"示例"）
3. 等待下次检测（最多5分钟）
4. 查看日志：`tail -f logs/cron-*.log`

### Q: 如何查看已实现的需求？

```bash
cat data/implemented-stories.json | jq
```

### Q: 任务执行超时？

默认超时时间是30分钟。复杂需求可能需要更长时间，可以在代码中调整 `setTimeout` 的值。

---

## 📝 日志说明

日志文件位于 `logs/` 目录：

- `cron-YYYY-MM-DD.log` - 定时检测日志
- `webhook-YYYY-MM-DD.log` - Webhook 服务日志
- `codebuddy-{storyId}-{timestamp}.log` - CodeBuddy 执行日志

---

## 🔗 相关链接

- [TAPD 开放平台](https://open.tapd.cn)
- [CodeBuddy CLI 文档](https://www.codebuddy.cn/docs/zh/cli)
- [TAPD Webhook 配置](https://o.tapd.tencent.com/document/api-doc/next/webhook/)
