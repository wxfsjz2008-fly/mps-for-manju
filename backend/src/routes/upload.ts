import { Router, Request, Response } from 'express';
import cosService from '../services/cos.js';

const router = Router();

/**
 * 获取 COS 临时上传凭证
 * GET /api/upload/credentials
 */
router.get('/credentials', async (req: Request, res: Response) => {
  try {
    console.log('Getting STS credentials...');
    const credentials = await cosService.getSTSCredentials();
    console.log('STS credentials obtained successfully');
    res.json({
      success: true,
      data: credentials,
    });
  } catch (error: any) {
    console.error('Get STS credentials error:', JSON.stringify(error, null, 2));
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    res.status(500).json({
      success: false,
      error: 'Failed to get upload credentials',
      details: JSON.stringify(error),
    });
  }
});

/**
 * 生成上传路径
 * POST /api/upload/generate-key
 */
router.post('/generate-key', (req: Request, res: Response) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      res.status(400).json({
        success: false,
        error: 'Filename is required',
      });
      return;
    }

    const key = cosService.generateCosKey(filename, 'input');
    const url = cosService.getCosUrl(key);

    res.json({
      success: true,
      data: {
        key,
        url,
      },
    });
  } catch (error) {
    console.error('Generate COS key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate upload key',
    });
  }
});

/**
 * 上传完成回调
 * POST /api/upload/complete
 */
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const { key, filename, size } = req.body;
    
    if (!key || !filename) {
      res.status(400).json({
        success: false,
        error: 'Key and filename are required',
      });
      return;
    }

    // 验证文件是否存在
    const exists = await cosService.checkFileExists(key);
    if (!exists) {
      res.status(404).json({
        success: false,
        error: 'File not found in COS',
      });
      return;
    }

    const url = cosService.getCosUrl(key);

    res.json({
      success: true,
      data: {
        key,
        url,
        filename,
        size,
      },
    });
  } catch (error) {
    console.error('Upload complete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete upload',
    });
  }
});

/**
 * 获取签名 URL（用于视频播放）
 * POST /api/upload/signed-url
 */
router.post('/signed-url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      res.status(400).json({
        success: false,
        error: 'URL is required',
      });
      return;
    }

    const signedUrl = await cosService.getSignedUrl(url, 3600); // 1 小时有效期

    res.json({
      success: true,
      data: {
        signedUrl,
        expires: 3600,
      },
    });
  } catch (error) {
    console.error('Get signed URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get signed URL',
    });
  }
});

/**
 * 获取下载 URL（带 Content-Disposition 头触发浏览器下载）
 * POST /api/upload/download-url
 */
router.post('/download-url', async (req: Request, res: Response) => {
  try {
    const { url, filename } = req.body;
    
    if (!url) {
      res.status(400).json({
        success: false,
        error: 'URL is required',
      });
      return;
    }

    if (!filename) {
      res.status(400).json({
        success: false,
        error: 'Filename is required',
      });
      return;
    }

    const downloadUrl = await cosService.getDownloadUrl(url, filename, 3600); // 1 小时有效期

    res.json({
      success: true,
      data: {
        downloadUrl,
        expires: 3600,
      },
    });
  } catch (error) {
    console.error('Get download URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get download URL',
    });
  }
});

export default router;
