import STS from 'qcloud-cos-sts';
import COS from 'cos-nodejs-sdk-v5';
import config from '../config/index.js';

// STS 配置
const stsConfig = {
  secretId: config.tencent.secretId,
  secretKey: config.tencent.secretKey,
  durationSeconds: config.cos.stsExpireTime,
  bucket: config.cos.bucket,
  region: config.cos.region,
  allowPrefix: '*',
  allowActions: [
    'name/cos:PutObject',
    'name/cos:PostObject',
    'name/cos:InitiateMultipartUpload',
    'name/cos:ListMultipartUploads',
    'name/cos:ListParts',
    'name/cos:UploadPart',
    'name/cos:CompleteMultipartUpload',
    'name/cos:AbortMultipartUpload',
  ],
};

// COS 客户端
const cosClient = new COS({
  SecretId: config.tencent.secretId,
  SecretKey: config.tencent.secretKey,
});

export interface STSCredentials {
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
  };
  startTime: number;
  expiredTime: number;
  bucket: string;
  region: string;
}

/**
 * 获取 COS 临时密钥
 */
export async function getSTSCredentials(): Promise<STSCredentials> {
  return new Promise((resolve, reject) => {
    const policy = {
      version: '2.0',
      statement: [
        {
          action: stsConfig.allowActions,
          effect: 'allow',
          principal: { qcs: ['*'] },
          resource: [
            `qcs::cos:${config.cos.region}:uid/${getBucketAppId()}:${config.cos.bucket}/${stsConfig.allowPrefix}`,
          ],
        },
      ],
    };

    STS.getCredential(
      {
        secretId: stsConfig.secretId,
        secretKey: stsConfig.secretKey,
        durationSeconds: stsConfig.durationSeconds,
        policy: policy,
      },
      (err: any, credential: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            credentials: {
              tmpSecretId: credential.credentials.tmpSecretId,
              tmpSecretKey: credential.credentials.tmpSecretKey,
              sessionToken: credential.credentials.sessionToken,
            },
            startTime: credential.startTime,
            expiredTime: credential.expiredTime,
            bucket: config.cos.bucket,
            region: config.cos.region,
          });
        }
      }
    );
  });
}

/**
 * 从 bucket 名称中提取 AppId
 */
function getBucketAppId(): string {
  const parts = config.cos.bucket.split('-');
  return parts[parts.length - 1] || '';
}

/**
 * 生成 COS 文件路径
 */
export function generateCosKey(filename: string, type: 'input' | 'output' = 'input'): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const ext = filename.split('.').pop() || 'mp4';
  return `manju/${type}/${timestamp}_${randomStr}.${ext}`;
}

/**
 * 获取 COS 文件的完整 URL
 */
export function getCosUrl(key: string): string {
  return `https://${config.cos.bucket}.cos.${config.cos.region}.myqcloud.com/${key}`;
}

/**
 * 检查文件是否存在
 */
export async function checkFileExists(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    cosClient.headObject(
      {
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: key,
      },
      (err) => {
        resolve(!err);
      }
    );
  });
}

/**
 * 从 COS URL 中提取 Key
 */
export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // URL 格式: https://{bucket}.cos.{region}.myqcloud.com/{key}
    // 返回路径部分（去掉开头的斜杠）
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}

/**
 * 获取签名 URL（用于私有读取）
 * @param url COS 文件的完整 URL
 * @param expires 签名有效期（秒），默认 1 小时
 */
export async function getSignedUrl(url: string, expires: number = 3600): Promise<string> {
  const key = extractKeyFromUrl(url);
  if (!key) {
    throw new Error('Invalid COS URL');
  }

  return new Promise((resolve, reject) => {
    cosClient.getObjectUrl(
      {
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: key,
        Sign: true,
        Expires: expires,
      },
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.Url);
        }
      }
    );
  });
}

/**
 * 获取下载签名 URL（带 Content-Disposition 头触发浏览器下载）
 * @param url COS 文件的完整 URL
 * @param filename 下载时的文件名
 * @param expires 签名有效期（秒），默认 1 小时
 */
export async function getDownloadUrl(url: string, filename: string, expires: number = 3600): Promise<string> {
  const key = extractKeyFromUrl(url);
  if (!key) {
    throw new Error('Invalid COS URL');
  }

  return new Promise((resolve, reject) => {
    cosClient.getObjectUrl(
      {
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: key,
        Sign: true,
        Expires: expires,
        Query: {
          // 设置 response-content-disposition 头，触发浏览器下载行为
          'response-content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      },
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.Url);
        }
      }
    );
  });
}

export default {
  getSTSCredentials,
  generateCosKey,
  getCosUrl,
  checkFileExists,
  extractKeyFromUrl,
  getSignedUrl,
  getDownloadUrl,
};
