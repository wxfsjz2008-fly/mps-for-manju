import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './models/database.js';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import mpsRoutes from './routes/mps.js';
import taskRoutes from './routes/task.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 认证中间件（放在路由之前）
app.use(authMiddleware);

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/mps', mpsRoutes);
app.use('/api/tasks', taskRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 生产环境下服务静态文件
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  
  // SPA fallback - 所有非 API 路由返回 index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(publicPath, 'index.html'));
    }
  });
}

// 启动服务
async function startServer() {
  // 初始化数据库
  await initDatabase();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

export default app;
