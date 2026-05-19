import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

// 不需要认证的路径白名单
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/mps/callback',
  '/health',
];

// 静态文件扩展名（不需要认证）
const STATIC_EXTENSIONS = [
  '.html', '.css', '.js', '.jsx', '.ts', '.tsx',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.json', '.map',
];

/**
 * JWT 认证中间件
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 检查是否是公开路径
  if (PUBLIC_PATHS.some(path => req.path === path || req.path.startsWith(path))) {
    return next();
  }

  // 跳过非 API 请求（静态文件、前端页面）
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // 跳过静态文件请求
  if (STATIC_EXTENSIONS.some(ext => req.path.endsWith(ext))) {
    return next();
  }

  // 获取 Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: '未提供有效的认证信息',
    });
    return;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    
    // 将用户信息附加到请求对象
    (req as any).user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Token 无效或已过期',
    });
  }
}

export default authMiddleware;
