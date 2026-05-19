import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../models/database.js';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskListQuery,
  TaskListResult,
  TaskStatus,
} from '../types/task.js';

/**
 * 创建任务
 */
export function createTask(input: CreateTaskInput): Task {
  const db = getDatabase();
  const now = new Date().toISOString();
  const task: Task = {
    id: uuidv4(),
    original_video_url: input.original_video_url,
    original_video_name: input.original_video_name,
    original_video_size: input.original_video_size,
    status: 'pending',
    progress: 0,
    template_id: input.template_id,
    template_name: input.template_name,
    created_at: now,
    updated_at: now,
  };

  const stmt = db.prepare(`
    INSERT INTO tasks (id, original_video_url, original_video_name, original_video_size, status, progress, template_id, template_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    task.id,
    task.original_video_url,
    task.original_video_name,
    task.original_video_size || null,
    task.status,
    task.progress ?? 0,
    task.template_id || null,
    task.template_name || null,
    task.created_at,
    task.updated_at,
  ]);
  stmt.free();
  saveDatabase();

  return task;
}

/**
 * 更新任务
 */
export function updateTask(id: string, input: UpdateTaskInput): Task | null {
  const db = getDatabase();
  const now = new Date().toISOString();

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
    values.push(input.completed_at);
  }

  values.push(id);

  const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
  db.run(sql, values);
  saveDatabase();

  return getTaskById(id);
}

/**
 * 根据 ID 获取任务
 */
export function getTaskById(id: string): Task | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  stmt.bind([id]);

  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return rowToTask(row);
  }
  stmt.free();
  return null;
}

/**
 * 根据 MPS 任务 ID 获取任务
 */
export function getTaskByMpsTaskId(mpsTaskId: string): Task | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM tasks WHERE mps_task_id = ?');
  stmt.bind([mpsTaskId]);

  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return rowToTask(row);
  }
  stmt.free();
  return null;
}

/**
 * 获取任务列表
 */
export function getTaskList(query: TaskListQuery): TaskListResult {
  const db = getDatabase();
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let whereClause = '';
  const params: any[] = [];

  if (query.status) {
    whereClause = 'WHERE status = ?';
    params.push(query.status);
  }

  // 获取总数
  const countSql = `SELECT COUNT(*) as total FROM tasks ${whereClause}`;
  const countStmt = db.prepare(countSql);
  if (params.length > 0) countStmt.bind(params);
  countStmt.step();
  const total = (countStmt.getAsObject() as { total: number }).total;
  countStmt.free();

  // 获取分页数据
  const dataSql = `
    SELECT * FROM tasks ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  const dataParams = [...params, pageSize, offset];
  const dataStmt = db.prepare(dataSql);
  dataStmt.bind(dataParams);

  const tasks: Task[] = [];
  while (dataStmt.step()) {
    tasks.push(rowToTask(dataStmt.getAsObject()));
  }
  dataStmt.free();

  return {
    tasks,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 将数据库行转换为 Task 对象
 */
function rowToTask(row: any): Task {
  return {
    id: row.id as string,
    original_video_url: row.original_video_url as string,
    original_video_name: row.original_video_name as string,
    original_video_size: row.original_video_size as number | undefined,
    output_video_url: row.output_video_url as string | undefined,
    output_screenshot_url: row.output_screenshot_url as string | undefined,
    original_screenshot_url: row.original_screenshot_url as string | undefined,
    status: row.status as TaskStatus,
    mps_task_id: row.mps_task_id as string | undefined,
    error_message: row.error_message as string | undefined,
    progress: row.progress as number | undefined,
    template_id: row.template_id as number | undefined,
    template_name: row.template_name as string | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | undefined,
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

/**
 * 删除单个任务
 */
export function deleteTask(id: string): boolean {
  const db = getDatabase();
  const task = getTaskById(id);
  if (!task) {
    return false;
  }

  db.run('DELETE FROM tasks WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

/**
 * 批量删除任务
 */
export function batchDeleteTasks(ids: string[]): { deleted: number; failed: string[] } {
  const db = getDatabase();
  let deleted = 0;
  const failed: string[] = [];

  for (const id of ids) {
    const task = getTaskById(id);
    if (task) {
      db.run('DELETE FROM tasks WHERE id = ?', [id]);
      deleted++;
    } else {
      failed.push(id);
    }
  }

  saveDatabase();
  return { deleted, failed };
}
