import axios from 'axios';
import type { ApiResponse, STSCredentials, Task, TaskListResult, TaskStatus } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 上传相关 API
export const uploadApi = {
  getCredentials: async (): Promise<STSCredentials> => {
    const res = await api.get<ApiResponse<STSCredentials>>('/upload/credentials');
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to get credentials');
    }
    return res.data.data;
  },

  generateKey: async (filename: string): Promise<{ key: string; url: string }> => {
    const res = await api.post<ApiResponse<{ key: string; url: string }>>('/upload/generate-key', { filename });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to generate key');
    }
    return res.data.data;
  },

  completeUpload: async (key: string, filename: string, size: number) => {
    const res = await api.post<ApiResponse<{ key: string; url: string }>>('/upload/complete', { key, filename, size });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to complete upload');
    }
    return res.data.data;
  },

  /**
   * 获取签名 URL（用于视频播放）
   */
  getSignedUrl: async (url: string): Promise<{ signedUrl: string; expires: number }> => {
    const res = await api.post<ApiResponse<{ signedUrl: string; expires: number }>>('/upload/signed-url', { url });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to get signed URL');
    }
    return res.data.data;
  },

  /**
   * 获取下载 URL（用于视频下载，带 Content-Disposition 头）
   * @param url COS 文件 URL
   * @param filename 下载时的文件名
   */
  getDownloadUrl: async (url: string, filename: string): Promise<{ downloadUrl: string; expires: number }> => {
    const res = await api.post<ApiResponse<{ downloadUrl: string; expires: number }>>('/upload/download-url', { url, filename });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to get download URL');
    }
    return res.data.data;
  },
};

// 任务相关 API
export const taskApi = {
  create: async (
    videoUrl: string,
    videoName: string,
    videoSize?: number,
    templateId?: number,
    templateName?: string
  ): Promise<Task> => {
    const res = await api.post<ApiResponse<Task>>('/tasks', {
      videoUrl,
      videoName,
      videoSize,
      templateId,
      templateName,
    });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to create task');
    }
    return res.data.data;
  },

  getList: async (status?: TaskStatus, page = 1, pageSize = 20): Promise<TaskListResult> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('page', page.toString());
    params.append('pageSize', pageSize.toString());

    const res = await api.get<ApiResponse<TaskListResult>>(`/tasks?${params.toString()}`);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to get task list');
    }
    return res.data.data;
  },

  getDetail: async (id: string): Promise<Task> => {
    const res = await api.get<ApiResponse<Task>>(`/tasks/${id}`);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to get task detail');
    }
    return res.data.data;
  },

  update: async (id: string, data: Partial<Task>): Promise<Task> => {
    const res = await api.patch<ApiResponse<Task>>(`/tasks/${id}`, data);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to update task');
    }
    return res.data.data;
  },

  /**
   * 批量刷新处理中任务的 MPS 状态
   * @param taskIds 需要刷新的任务 ID 列表
   * @returns 更新后的任务映射 { [taskId]: Task }
   */
  refreshStatus: async (taskIds: string[]): Promise<{ [key: string]: Task }> => {
    const res = await api.post<ApiResponse<{ [key: string]: Task }>>('/tasks/refresh-status', { taskIds });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to refresh tasks status');
    }
    return res.data.data;
  },
};

// MPS 相关 API
export const mpsApi = {
  submit: async (taskId: string, templateId: number = 327006): Promise<{ mpsTaskId: string; requestId: string }> => {
    const res = await api.post<ApiResponse<{ mpsTaskId: string; requestId: string }>>('/mps/submit', { taskId, templateId });
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to submit MPS task');
    }
    return res.data.data;
  },

  getStatus: async (taskId: string): Promise<{
    status: string;
    progress?: number;
    outputUrl?: string;
    errorMessage?: string;
  }> => {
    const res = await api.get<ApiResponse<{
      status: string;
      progress?: number;
      outputUrl?: string;
      errorMessage?: string;
    }>>(`/mps/status/${taskId}`);
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.error || 'Failed to get MPS status');
    }
    return res.data.data;
  },
};

export default { uploadApi, taskApi, mpsApi };
