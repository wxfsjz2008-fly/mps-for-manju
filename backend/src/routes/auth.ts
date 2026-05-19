import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

const router = Router();

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: '用户名和密码不能为空',
      });
      return;
    }

    // 验证用户名和密码
    if (username !== config.auth.username || password !== config.auth.password) {
      res.status(401).json({
        success: false,
        error: '用户名或密码错误',
      });
      return;
    }

    // 生成 JWT token
    const token = jwt.sign(
      { username },
      config.auth.jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        token,
        username,
        expiresIn: 24 * 60 * 60, // 24小时（秒）
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: '登录失败',
    });
  }
});

/**
 * 验证 token
 * GET /api/auth/verify
 */
router.get('/verify', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: '未提供有效的认证信息',
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.auth.jwtSecret) as { username: string };

    res.json({
      success: true,
      data: {
        username: decoded.username,
        valid: true,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Token 无效或已过期',
    });
  }
});

export default router;
