import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

// 数据库配置
interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

// 连接池
let pool: Pool | null = null;

/**
 * 获取数据库配置
 */
function getConfig(): DatabaseConfig {
  return {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mps',
  };
}

/**
 * 初始化数据库连接池
 */
export async function initDatabase(): Promise<Pool> {
  const config = getConfig();
  
  console.log(`🔌 Connecting to MySQL at ${config.host}:${config.port}...`);
  
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  // 测试连接
  const connection = await pool.getConnection();
  console.log('✅ MySQL connection established');
  
  // 创建任务表
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(36) PRIMARY KEY,
      original_video_url TEXT NOT NULL,
      original_video_name VARCHAR(255) NOT NULL,
      original_video_size BIGINT,
      output_video_url TEXT,
      output_screenshot_url TEXT,
      original_screenshot_url TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      mps_task_id VARCHAR(100),
      error_message TEXT,
      progress INT DEFAULT 0,
      template_id INT,
      template_name VARCHAR(255),
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      completed_at DATETIME,
      INDEX idx_status (status),
      INDEX idx_mps_task_id (mps_task_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  connection.release();
  console.log('✅ Database initialized');
  
  return pool;
}

/**
 * 获取数据库连接池
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

/**
 * 获取单个连接（用于事务）
 */
export async function getConnection(): Promise<PoolConnection> {
  return getPool().getConnection();
}

/**
 * 执行查询
 */
export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: any[]
): Promise<T> {
  const [rows] = await getPool().execute<T>(sql, params);
  return rows;
}

/**
 * 执行更新/插入/删除
 */
export async function execute(
  sql: string,
  params?: any[]
): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔌 MySQL connection closed');
  }
}

export default {
  initDatabase,
  getPool,
  getConnection,
  query,
  execute,
  closeDatabase,
};
