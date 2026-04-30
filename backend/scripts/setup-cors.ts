/**
 * 配置 COS 存储桶的 CORS 跨域规则
 */
import COS from 'cos-nodejs-sdk-v5';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: resolve(__dirname, '../.env') });

const cos = new COS({
  SecretId: process.env.TENCENT_SECRET_ID!,
  SecretKey: process.env.TENCENT_SECRET_KEY!,
});

const Bucket = process.env.COS_BUCKET!;
const Region = process.env.COS_REGION!;

console.log('配置 COS CORS 跨域规则...');
console.log(`存储桶: ${Bucket}`);
console.log(`区域: ${Region}`);

// 配置 CORS 规则
cos.putBucketCors({
  Bucket,
  Region,
  CORSRules: [
    {
      AllowedOrigin: ['*'], // 允许所有来源，生产环境建议限制为具体域名
      AllowedMethod: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
      AllowedHeader: ['*'],
      ExposeHeader: ['ETag', 'Content-Length', 'x-cos-request-id'],
      MaxAgeSeconds: 600,
    },
  ],
}, (err, data) => {
  if (err) {
    console.error('配置 CORS 失败:', err);
    process.exit(1);
  } else {
    console.log('✅ CORS 配置成功!');
    console.log('配置详情:', JSON.stringify(data, null, 2));
    
    // 验证配置
    cos.getBucketCors({
      Bucket,
      Region,
    }, (err, data) => {
      if (err) {
        console.error('获取 CORS 配置失败:', err);
      } else {
        console.log('\n当前 CORS 配置:');
        console.log(JSON.stringify(data.CORSRules, null, 2));
      }
    });
  }
});
