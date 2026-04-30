import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import config from '../config/index.js';
import { getCosUrl } from './cos.js';

const MpsClient = tencentcloud.mps.v20190612.Client;

const clientConfig = {
  credential: {
    secretId: config.tencent.secretId,
    secretKey: config.tencent.secretKey,
  },
  region: config.mps.region,
  profile: {
    httpProfile: {
      endpoint: 'mps.tencentcloudapi.com',
    },
  },
};

const mpsClient = new MpsClient(clientConfig);

export interface EnhanceTaskResult {
  taskId: string;
  requestId: string;
}

export interface TaskStatusResult {
  taskId: string;
  status: 'WAITING' | 'PROCESSING' | 'FINISH';
  progress?: number;
  outputUrl?: string;
  errCode?: number;
  errMsg?: string;
}

/** 默认模版 ID (2K) */
const DEFAULT_TEMPLATE_ID = 327006;

/**
 * 根据 MPS 返回的 Path 构建完整的 COS Key
 * @param rawPath MPS 返回的原始路径
 */
function buildFullOutputKey(rawPath: string): string {
  // 去掉开头的斜杠
  const path = rawPath.replace(/^\/+/, '');
  
  // 检查路径是否已经包含 manju/ 前缀
  if (path.startsWith('manju/')) {
    return path;
  }
  
  // 如果路径只包含 output/ 或只是文件名，需要添加 manju/ 前缀
  if (path.startsWith('output/')) {
    return `manju/${path}`;
  }
  
  // 其他情况，使用完整的 manju/output/ 前缀
  return `manju/output/${path}`;
}

/**
 * 提交视频增强任务
 * @param inputCosKey 输入文件的 COS key
 * @param outputCosKey 输出文件的 COS key
 * @param templateId 转码模版 ID，默认为 327006 (2K)
 */
export async function submitEnhanceTask(
  inputCosKey: string,
  outputCosKey: string,
  templateId?: number
): Promise<EnhanceTaskResult> {
  // MPS 要求 Bucket 格式为完整的 BucketName-APPID
  const bucket = config.cos.bucket;
  // 使用传入的 templateId，如未传入则使用默认值
  const effectiveTemplateId = templateId || DEFAULT_TEMPLATE_ID;

  // 从 outputCosKey 中分离目录和文件名
  // outputCosKey 格式: manju/output/xxx.mp4
  // OutputDir: manju/output/
  // OutputObjectPath: 只需要文件名部分（相对于 OutputDir）
  const lastSlashIndex = outputCosKey.lastIndexOf('/');
  const outputDir = outputCosKey.substring(0, lastSlashIndex + 1);
  const outputFileName = outputCosKey.substring(lastSlashIndex + 1);

  const params = {
    InputInfo: {
      Type: 'COS',
      CosInputInfo: {
        Bucket: bucket,
        Region: config.cos.region,
        Object: inputCosKey,
      },
    },
    OutputStorage: {
      Type: 'COS',
      CosOutputStorage: {
        Bucket: bucket,
        Region: config.cos.region,
      },
    },
    OutputDir: outputDir,
    MediaProcessTask: {
      TranscodeTaskSet: [
        {
          Definition: effectiveTemplateId,
          // OutputObjectPath 是相对于 OutputDir 的路径，只传文件名
          OutputObjectPath: outputFileName,
        },
      ],
    },
    TaskNotifyConfig: config.mps.callbackUrl
      ? {
          NotifyMode: 'Finish',
          NotifyType: 'URL',
          NotifyUrl: config.mps.callbackUrl,
        }
      : undefined,
  };

  try {
    const response = await mpsClient.ProcessMedia(params);
    return {
      taskId: response.TaskId || '',
      requestId: response.RequestId || '',
    };
  } catch (error) {
    console.error('MPS submitEnhanceTask error:', error);
    throw error;
  }
}

/**
 * 查询任务状态
 */
export async function queryTaskStatus(taskId: string): Promise<TaskStatusResult> {
  try {
    const response = await mpsClient.DescribeTaskDetail({
      TaskId: taskId,
    });

    const status = response.Status as 'WAITING' | 'PROCESSING' | 'FINISH';
    let outputUrl: string | undefined;
    let errCode: number | undefined;
    let errMsg: string | undefined;
    let progress: number | undefined;

    // 根据任务类型获取结果
    // ProcessMedia 提交的任务类型是 WorkflowTask
    const workflowTask = response.WorkflowTask;
    
    if (status === 'FINISH' && workflowTask) {
      const mediaProcessResult = workflowTask.MediaProcessResultSet?.[0];
      if (mediaProcessResult?.TranscodeTask) {
        const transcodeTask = mediaProcessResult.TranscodeTask;
        
        if (transcodeTask.ErrCode === 0 && transcodeTask.Status === 'SUCCESS') {
          const output = transcodeTask.Output;
          
          if (output && output.Path) {
            console.log('MPS TranscodeTask Output:', JSON.stringify(output, null, 2));
            
            const fullOutputKey = buildFullOutputKey(output.Path);
            console.log('Final output key:', fullOutputKey);
            outputUrl = getCosUrl(fullOutputKey);
          }
          progress = 100;
        } else {
          errCode = transcodeTask.ErrCode;
          errMsg = transcodeTask.Message;
        }
      }
    } else if (workflowTask) {
      // 任务进行中，获取进度
      const mediaProcessResult = workflowTask.MediaProcessResultSet?.[0];
      progress = mediaProcessResult?.TranscodeTask?.Progress;
    }

    return {
      taskId,
      status,
      progress,
      outputUrl,
      errCode,
      errMsg,
    };
  } catch (error) {
    console.error('MPS queryTaskStatus error:', error);
    throw error;
  }
}

/**
 * 处理 MPS 回调
 */
export function parseMpsCallback(data: any): {
  taskId: string;
  status: 'completed' | 'failed';
  outputUrl?: string;
  errorMessage?: string;
} {
  const taskId = data.TaskId;
  const status = data.Status === 'FINISH' && data.ErrCode === 0 ? 'completed' : 'failed';
  
  let outputUrl: string | undefined;
  let errorMessage: string | undefined;

  if (status === 'completed') {
    const mediaProcessResult = data.MediaProcessResultSet?.[0];
    if (mediaProcessResult?.TranscodeTask?.Output?.Path) {
      const fullOutputKey = buildFullOutputKey(mediaProcessResult.TranscodeTask.Output.Path);
      console.log('MPS callback - Final output key:', fullOutputKey);
      outputUrl = getCosUrl(fullOutputKey);
    }
  } else {
    errorMessage = data.Message || 'Unknown error';
  }

  return { taskId, status, outputUrl, errorMessage };
}

export default {
  submitEnhanceTask,
  queryTaskStatus,
  parseMpsCallback,
};
