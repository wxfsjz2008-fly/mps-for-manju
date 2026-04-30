import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  
  // 腾讯云配置
  tencent: {
    secretId: process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TENCENT_SECRET_KEY || '',
  },
  
  // COS 配置
  cos: {
    region: process.env.COS_REGION || 'ap-nanjing',
    bucket: process.env.COS_BUCKET || '',
    // 临时密钥有效期（秒）
    stsExpireTime: 1800,
  },
  
  // MPS 配置
  mps: {
    region: process.env.MPS_REGION || 'ap-nanjing',
    enhanceTemplateId: process.env.MPS_ENHANCE_TEMPLATE_ID || '',
    callbackUrl: process.env.CALLBACK_URL || '',
  },
};

export default config;
