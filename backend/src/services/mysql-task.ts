import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../models/mysql-database.js';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskListQuery,
  TaskListResult,
  TaskStatus,
} from '../types/task.js';
import { RowDataPacket } from 'mysql2/promise';

// 定义数据库行类型
interface TaskRow extends RowDataPacket {
  id: string;
  original_video_url: string;
  original_video_name: string;
  original_video_size: number | null;
  output_video_url: string | null;
  output_screenshot_url: string | null;
  original_screenshot_url: string | null;
  status: string;
  mps_task_id: string | null;
  error_message: string | null;
  progress: number | null;
  template_id: number | null;
  template_name: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

/**
 * 创建任务
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const now = new Date();
  const task: Task = {
    id: uuidv4(),
    original_video_url: input.original_video_url,
    original_video_name: input.original_video_name,
    original_video_size: input.original_video_size,
    status: 'pending',
    progress: 0,
    template_id: input.template_id,
    template_name: input.template_name,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  await execute(
    `INSERT INTO tasks (id, original_video_url, original_video_name, original_video_size, status, progress, template_id, template_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.original_video_url,
      task.original_video_name,
      task.original_video_size || null,
      task.status,
      task.progress ?? 0,
      task.template_id || null,
      task.template_name || null,
      now,
      now,
    ]
  );

  return task;
}

/**
 * 更新任务
 */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task | null> {
  const now = new Date();

  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];

  if (input.output_video_url !== undefined) {
    updates.push('output_video_url = ?');
    values.push(input.output_video_url);
  }
  if (input.output_screenshot_url !== undefined) {
    updates.push('output_screenshot_url = ?');
    values.push(input.output_screenshot_url);
  }
  if (input.original_screenshot_url !== undefined) {
    updates.push('original_screenshot_url = ?');
    values.push(input.original_screenshot_url);
  }
  if (input.status !== undefined) {
    updates.push('status = ?');
    values.push(input.status);
  }
  if (input.mps_task_id !== undefined) {
    updates.push('mps_task_id = ?');
    values.push(input.mps_task_id);
  }
  if (input.error_message !== undefined) {
    updates.push('error_message = ?');
    values.push(input.error_message);
  }
  if (input.progress !== undefined) {
    updates.push('progress = ?');
    values.push(input.progress);
  }
  if (input.completed_at !== undefined) {
    updates.push('completed_at = ?');
    values.push(input.completed_at ? new Date(input.completed_at) : null);
  }

  values.push(id);

  const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
  await execute(sql, values);

  return getTaskById(id);
}

/**
 * 根据 ID 获取任务
 */
export async function getTaskById(id: string): Promise<Task | null> {
  const rows = await query<TaskRow[]>(
    'SELECT * FROM tasks WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  return rowToTask(rows[0]);
}

/**
 * 根据 MPS 任务 ID 获取任务
 */
export async function getTaskByMpsTaskId(mpsTaskId: string): Promise<Task | null> {
  const rows = await query<TaskRow[]>(
    'SELECT * FROM tasks WHERE mps_task_id = ?',
    [mpsTaskId]
  );

  if (rows.length === 0) {
    return null;
  }

  return rowToTask(rows[0]);
}

/**
 * 获取任务列表
 */
export async function getTaskList(queryParams: TaskListQuery): Promise<TaskListResult> {
  const page = queryParams.page || 1;
  const pageSize = queryParams.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let whereClause = '';
  const params: any[] = [];

  if (queryParams.status) {
    whereClause = 'WHERE status = ?';
    params.push(queryParams.status);
  }

  // 获取总数
  const countRows = await query<CountRow[]>(
    `SELECT COUNT(*) as total FROM tasks ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  // 获取分页数据
  const dataParams = [...params, pageSize, offset];
  const rows = await query<TaskRow[]>(
    `SELECT * FROM tasks ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    dataParams
  );

  const tasks: Task[] = rows.map(rowToTask);

  return {
    tasks,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 删除单个任务
 */
export async function deleteTask(id: string): Promise<boolean> {
  const task = await getTaskById(id);
  if (!task) {
    return false;
  }

  await execute('DELETE FROM tasks WHERE id = ?', [id]);
  return true;
}

/**
 * 批量删除任务
 */
export async function batchDeleteTasks(ids: string[]): Promise<{ deleted: number; failed: string[] }> {
  let deleted = 0;
  const failed: string[] = [];

  for (const id of ids) {
    const task = await getTaskById(id);
    if (task) {
      await execute('DELETE FROM tasks WHERE id = ?', [id]);
      deleted++;
    } else {
      failed.push(id);
    }
  }

  return { deleted, failed };
}

/**
 * 将数据库行转换为 Task 对象
 */
function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    original_video_url: row.original_video_url,
    original_video_name: row.original_video_name,
    original_video_size: row.original_video_size ?? undefined,
    output_video_url: row.output_video_url ?? undefined,
    output_screenshot_url: row.output_screenshot_url ?? undefined,
    original_screenshot_url: row.original_screenshot_url ?? undefined,
    status: row.status as TaskStatus,
    mps_task_id: row.mps_task_id ?? undefined,
    error_message: row.error_message ?? undefined,
    progress: row.progress ?? undefined,
    template_id: row.template_id ?? undefined,
    template_name: row.template_name ?? undefined,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    completed_at: row.completed_at instanceof Date ? row.completed_at.toISOString() : (row.completed_at ?? undefined),
  };
}

export default {
  createTask,
  updateTask,
  getTaskById,
  getTaskByMpsTaskId,
  getTaskList,
  deleteTask,
  batchDeleteTasks,
};
