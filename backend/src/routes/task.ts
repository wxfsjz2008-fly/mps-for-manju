import { Router, Request, Response } from 'express';
import taskService from '../services/task.js';
import mpsService from '../services/mps.js';
import { TaskStatus } from '../types/task.js';

const router = Router();

/**
 * 创建任务
 * POST /api/tasks
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { videoUrl, videoName, videoSize, templateId, templateName } = req.body;

    if (!videoUrl || !videoName) {
      res.status(400).json({
        success: false,
        error: 'Video URL and name are required',
      });
      return;
    }

    const task = taskService.createTask({
      original_video_url: videoUrl,
      original_video_name: videoName,
      original_video_size: videoSize,
      template_id: templateId,
      template_name: templateName,
    });

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
    });
  }
});

/**
 * 获取任务列表
 * GET /api/tasks
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const { status, page, pageSize } = req.query;

    const result = taskService.getTaskList({
      status: status as TaskStatus | undefined,
      page: page ? parseInt(page as string) : 1,
      pageSize: pageSize ? parseInt(pageSize as string) : 20,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get task list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task list',
    });
  }
});

/**
 * 批量刷新处理中任务的 MPS 状态
 * POST /api/tasks/refresh-status
 * 
 * 请求体: { taskIds: string[] }
 * 返回更新后的任务列表
 */
router.post('/refresh-status', async (req: Request, res: Response) => {
  try {
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Task IDs array is required',
      });
      return;
    }

    // 并发查询所有任务的 MPS 状态
    const updatedTasks = await Promise.all(
      taskIds.map(async (taskId: string) => {
        try {
          const task = taskService.getTaskById(taskId);
          if (!task) {
            return { taskId, error: 'Task not found' };
          }

          // 如果任务没有 mps_task_id，返回当前状态
          if (!task.mps_task_id) {
            return { taskId, task };
          }

          // 查询 MPS 任务状态
          const mpsStatus = await mpsService.queryTaskStatus(task.mps_task_id);

          // 根据 MPS 状态更新任务
          if (mpsStatus.status === 'FINISH') {
            if (mpsStatus.outputUrl) {
              const updatedTask = taskService.updateTask(taskId, {
                status: 'completed',
                output_video_url: mpsStatus.outputUrl,
                progress: 100,
                completed_at: new Date().toISOString(),
              });
              return { taskId, task: updatedTask };
            } else if (mpsStatus.errCode) {
              const updatedTask = taskService.updateTask(taskId, {
                status: 'failed',
                error_message: mpsStatus.errMsg || 'Unknown error',
              });
              return { taskId, task: updatedTask };
            }
          } else if (mpsStatus.progress !== undefined) {
            const updatedTask = taskService.updateTask(taskId, {
              progress: mpsStatus.progress,
            });
            return { taskId, task: updatedTask };
          }

          return { taskId, task };
        } catch (err) {
          console.error(`Error refreshing task ${taskId}:`, err);
          return { taskId, error: 'Failed to query MPS status' };
        }
      })
    );

    // 构建返回结果
    const result: { [key: string]: any } = {};
    for (const item of updatedTasks) {
      if (item.task) {
        result[item.taskId] = item.task;
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Refresh tasks status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh tasks status',
    });
  }
});

/**
 * 获取任务详情
 * GET /api/tasks/:id
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const task = taskService.getTaskById(id);
    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Get task detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task detail',
    });
  }
});

/**
 * 更新任务状态
 * PATCH /api/tasks/:id
 */
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const task = taskService.updateTask(id, updateData);
    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task',
    });
  }
});

export default router;
