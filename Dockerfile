# 阶段1: 构建前端
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# 阶段2: 构建后端
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# 阶段3: 生产环境
FROM node:20-alpine AS production
WORKDIR /app

# 安装后端生产依赖
COPY backend/package*.json ./
RUN npm install --omit=dev

# 复制后端构建产物
COPY --from=backend-builder /app/backend/dist ./dist

# 复制前端构建产物到 public 目录
COPY --from=frontend-builder /app/frontend/dist ./public

# 创建数据目录
RUN mkdir -p /app/data

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 非敏感配置 - 可以硬编码
ENV COS_REGION=ap-nanjing
ENV MPS_REGION=ap-nanjing
ENV COS_BUCKET=mps-1259916703
ENV MPS_ENHANCE_TEMPLATE_ID=30077
ENV CALLBACK_URL=http://119.91.150.127:30015/api/mps/callback

# ⚠️ 敏感配置 - 必须在部署时通过环境变量传入，不要硬编码！
# ENV TENCENT_SECRET_ID=<在TKE中配置>
# ENV TENCENT_SECRET_KEY=<在TKE中配置>

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["node", "dist/index.js"]
