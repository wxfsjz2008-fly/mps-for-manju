# MPS for Manju - 漫剧视频增强系统

## 项目简介

这是一个基于腾讯云 MPS（媒体处理服务）的视频增强系统，支持视频上传、增强处理、任务管理等功能。

## 技术栈

- **前端**: React 19 + TypeScript + Vite + TailwindCSS
- **后端**: Node.js + Express + TypeScript
- **数据库**: SQLite (sql.js)
- **云服务**: 腾讯云 COS + MPS

## 本地开发

### 后端

```bash
cd backend
npm install
npm run dev
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

## Docker 部署

### 构建镜像

```bash
docker build -t mps-for-manju:latest .
```

### 运行容器

```bash
docker run -d -p 3001:3001 \
  -e TENCENT_SECRET_ID=your_secret_id \
  -e TENCENT_SECRET_KEY=your_secret_key \
  -e COS_BUCKET=your_bucket \
  -e COS_REGION=your_region \
  mps-for-manju:latest
```

## 环境变量

| 变量名 | 说明 |
|--------|------|
| PORT | 服务端口 (默认 3001) |
| TENCENT_SECRET_ID | 腾讯云 SecretId |
| TENCENT_SECRET_KEY | 腾讯云 SecretKey |
| COS_BUCKET | COS 存储桶名称 |
| COS_REGION | COS 存储桶地域 |

## CI/CD

本项目支持自动化镜像构建和部署。

### CNB 流水线
- 镜像标签格式: `YYYY-MM-DD`
- 触发条件: 推送到 main 分支

### GitHub Actions
- 镜像标签格式: `github-main-YYYYMMDD-XX` (XX 为递增序号)
- 触发条件: 推送到 main 分支
- ⚠️ 需要在 GitHub 仓库设置中添加 Secret: `TCR_PASSWORD`

**最后更新**: 2026-05-18 14:48 - CICD 验证测试 (第五次)

## TAPD 集成

本项目支持与 TAPD 集成，实现需求自动化处理。

### 功能

- **需求获取**: 从 TAPD 拉取需求列表
- **Webhook 服务**: 接收 TAPD 新需求推送，自动触发 CodeBuddy CLI 实现
- **定时轮询**: 定时检测新需求并自动处理

### 使用方式

```bash
cd scripts/tapd-integration
npm install

# 启动 Webhook 服务
npm run webhook

# 或使用定时轮询
npm run cron:daemon
```

详见 `scripts/tapd-integration/README.md`

## 许可证

MIT
