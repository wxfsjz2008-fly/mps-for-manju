import { Router, Request, Response } from 'express';
import mpsService from '../services/mps.js';
import taskService from '../services/task.js';
import cosService from '../services/cos.js';

const router = Router();

/**
 * 提交视频增强任务
 * POST /api/mps/submit
 */
router.post('/submit', async (req: Request, res: Response) => {
  try {
    const { taskId, templateId } = req.body;

    if (!taskId) {
      res.status(400).json({
        success: false,
        error: 'Task ID is required',
      });
      return;
    }

    // 获取任务信息
    const task = taskService.getTaskById(taskId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    // 解析输入文件的 COS key
    const inputUrl = task.original_video_url;
    const inputKey = inputUrl.split('.myqcloud.com/')[1];
    
    if (!inputKey) {
      res.status(400).json({
        success: false,
        error: 'Invalid input video URL',
      });
      return;
    }

    // 生成输出路径
    const outputKey = cosService.generateCosKey(task.original_video_name, 'output');

    // 提交 MPS 任务，传递 templateId 参数
    const result = await mpsService.submitEnhanceTask(inputKey, outputKey, templateId);

    // 更新任务状态
    taskService.updateTask(taskId, {
      status: 'processing',
      mps_task_id: result.taskId,
    });

    res.json({
      success: true,
      data: {
        mpsTaskId: result.taskId,
        requestId: result.requestId,
      },
    });
  } catch (error: any) {
    console.error('Submit MPS task error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to submit enhancement task',
    });
  }
});

/**
 * 查询 MPS 任务状态
 * GET /api/mps/status/:taskId
 */
router.get('/status/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    // 获取任务
    const task = taskService.getTaskById(taskId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    if (!task.mps_task_id) {
      res.json({
        success: true,
        data: {
          status: task.status,
          progress: task.progress,
        },
      });
      return;
    }

    // 查询 MPS 任务状态
    const mpsStatus = await mpsService.queryTaskStatus(task.mps_task_id);

    // 更新任务状态
    if (mpsStatus.status === 'FINISH') {
      if (mpsStatus.outputUrl) {
        taskService.updateTask(taskId, {
          status: 'completed',
          output_video_url: mpsStatus.outputUrl,
          progress: 100,
          completed_at: new Date().toISOString(),
        });
      } else if (mpsStatus.errCode) {
        taskService.updateTask(taskId, {
          status: 'failed',
          error_message: mpsStatus.errMsg || 'Unknown error',
        });
      }
    } else if (mpsStatus.progress !== undefined) {
      taskService.updateTask(taskId, {
        progress: mpsStatus.progress,
      });
    }

    res.json({
      success: true,
      data: {
        status: mpsStatus.status === 'FINISH' 
          ? (mpsStatus.outputUrl ? 'completed' : 'failed') 
          : 'processing',
        progress: mpsStatus.progress,
        outputUrl: mpsStatus.outputUrl,
        errorMessage: mpsStatus.errMsg,
      },
    });
  } catch (error) {
    console.error('Query MPS status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to query task status',
    });
  }
});

/**
 * MPS 回调接口
 * POST /api/mps/callback
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const callbackData = req.body;
    console.log('MPS callback received:', JSON.stringify(callbackData, null, 2));

    const { taskId, status, outputUrl, errorMessage } = mpsService.parseMpsCallback(callbackData);

    // 查找任务
    const task = taskService.getTaskByMpsTaskId(taskId);
    if (!task) {
      console.warn('Task not found for MPS task ID:', taskId);
      res.json({ success: true });
      return;
    }

    // 更新任务
    if (status === 'completed') {
      taskService.updateTask(task.id, {
        status: 'completed',
        output_video_url: outputUrl,
        progress: 100,
        completed_at: new Date().toISOString(),
      });
    } else {
      taskService.updateTask(task.id, {
        status: 'failed',
        error_message: errorMessage,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('MPS callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process callback',
    });
  }
});

export default router;
