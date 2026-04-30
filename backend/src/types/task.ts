export interface Task {
  id: string;
  original_video_url: string;
  original_video_name: string;
  original_video_size?: number;
  output_video_url?: string;
  output_screenshot_url?: string;
  original_screenshot_url?: string;
  status: TaskStatus;
  mps_task_id?: string;
  error_message?: string;
  progress?: number;
  template_id?: number;
  template_name?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export type TaskStatus = 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';

export interface CreateTaskInput {
  original_video_url: string;
  original_video_name: string;
  original_video_size?: number;
  template_id?: number;
  template_name?: string;
}

export interface UpdateTaskInput {
  output_video_url?: string;
  output_screenshot_url?: string;
  original_screenshot_url?: string;
  status?: TaskStatus;
  mps_task_id?: string;
  error_message?: string;
  progress?: number;
  completed_at?: string;
}

export interface TaskListQuery {
  status?: TaskStatus;
  page?: number;
  pageSize?: number;
}

export interface TaskListResult {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
