import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/tasks.db');

// 确保 data 目录存在
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: SqlJsDatabase | null = null;

export async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  
  // 尝试加载现有数据库
  let fileBuffer: Buffer | null = null;
  if (fs.existsSync(dbPath)) {
    fileBuffer = fs.readFileSync(dbPath);
  }
  
  db = new SQL.Database(fileBuffer ? fileBuffer : undefined);
  
  // 创建任务表
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      original_video_url TEXT NOT NULL,
      original_video_name TEXT NOT NULL,
      original_video_size INTEGER,
      output_video_url TEXT,
      output_screenshot_url TEXT,
      original_screenshot_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      mps_task_id TEXT,
      error_message TEXT,
      progress INTEGER DEFAULT 0,
      template_id INTEGER,
      template_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);
  
  // 检查并添加 template_id 和 template_name 列（用于已存在的数据库）
  try {
    db.run('ALTER TABLE tasks ADD COLUMN template_id INTEGER');
  } catch (e) {
    // 列已存在，忽略错误
  }
  try {
    db.run('ALTER TABLE tasks ADD COLUMN template_name TEXT');
  } catch (e) {
    // 列已存在，忽略错误
  }
  
  // 保存数据库
  saveDatabase();
  
  console.log('✅ Database initialized');
  return db;
}

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

export default { initDatabase, getDatabase, saveDatabase };
