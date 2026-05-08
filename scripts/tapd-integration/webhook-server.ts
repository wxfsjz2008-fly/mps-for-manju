/**
 * TAPD Webhook 服务器
 * 
 * 功能：接收 TAPD 推送的新需求事件，自动调用 CodeBuddy CLI 实现需求
 * 
 * 使用方法：
 * 1. 启动服务：npm run webhook
 * 2. 在 TAPD 开放平台配置 Webhook URL（需要公网可访问的地址）
 * 3. 当 TAPD 有新需求时，会自动触发 CodeBuddy 编程
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const execAsync = promisify(exec);

// 配置
const PORT = parseInt(process.env.WEBHOOK_PORT || '3000');
const WEBHOOK_SECRET = process.env.TAPD_WEBHOOK_SECRET || '';
const WORKSPACE_ID = process.env.TAPD_WORKSPACE_ID;
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const LOG_DIR = path.join(__dirname, 'logs');
const QUEUE_FILE = path.join(__dirname, 'data', 'task-queue.json');

// 确保目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 任务队列接口
interface TaskItem {
  storyId: string;
  title: string;
  workspace_id: number;
  event: string;
  receivedAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  completedAt?: string;
}

// 日志函数
function log(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  
  // 写入日志文件
  const logFile = path.join(LOG_DIR, `webhook-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage + '\n');
}

// 加载任务队列
function loadQueue(): TaskItem[] {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`加载任务队列失败: ${e}`, 'ERROR');
  }
  return [];
}

// 保存任务队列
function saveQueue(queue: TaskItem[]) {
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

// 添加任务到队列
function addToQueue(task: TaskItem) {
  const queue = loadQueue();
  // 避免重复添加
  if (!queue.some(t => t.storyId === task.storyId)) {
    queue.push(task);
    saveQueue(queue);
    log(`任务已加入队列: ${task.storyId} - ${task.title}`);
  }
}

// 更新任务状态
function updateTaskStatus(storyId: string, status: TaskItem['status'], error?: string) {
  const queue = loadQueue();
  const task = queue.find(t => t.storyId === storyId);
  if (task) {
    task.status = status;
    if (error) task.error = error;
    if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date().toISOString();
    }
    saveQueue(queue);
  }
}

// 获取需求详情（通过 TAPD API）
async function fetchStoryDetails(storyId: string): Promise<string> {
  const apiUser = process.env.TAPD_API_USER;
  const apiPassword = process.env.TAPD_API_PASSWORD;
  const baseUrl = process.env.TAPD_API_URL || 'https://api.tapd.cn';

  if (!apiUser || !apiPassword || !WORKSPACE_ID) {
    throw new Error('TAPD API 配置不完整');
  }

  const auth = Buffer.from(`${apiUser}:${apiPassword}`).toString('base64');
  
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}/stories?workspace_id=${WORKSPACE_ID}&id=${storyId}`;
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 1 && json.data && json.data.length > 0) {
            const story = json.data[0].Story;
            const description = story.description ? 
              story.description.replace(/<[^>]*>/g, '').trim() : 
              '无详细描述';
            
            resolve(`
## 需求信息

- **需求ID**: ${story.id}
- **标题**: ${story.name}
- **优先级**: ${story.priority_label || story.priority || '未设置'}
- **状态**: ${story.status}
- **创建时间**: ${story.created}
- **创建人**: ${story.creator || '未知'}

## 需求描述

${description}

## 实现要求

请根据以上需求信息，在当前项目中实现该功能。具体要求：

1. 分析需求，确定需要修改或新增的文件
2. 编写高质量的代码实现功能
3. 确保代码符合项目现有的编码规范
4. 添加必要的注释和文档
5. 如果涉及 API 变更，更新相关接口文档

完成后请告知实现的文件列表和主要变更内容。
`.trim());
          } else {
            reject(new Error('获取需求详情失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 查找 CodeBuddy CLI 命令
function findCodeBuddyCommand(): string {
  const commands = ['codebuddy', 'cbc'];
  for (const cmd of commands) {
    try {
      require('child_process').execSync(`which ${cmd}`, { stdio: 'ignore' });
      return cmd;
    } catch {
      // 继续尝试下一个
    }
  }
  throw new Error('CodeBuddy CLI 未安装。请运行: npm install -g @tencent-ai/codebuddy-code');
}

// 调用 CodeBuddy CLI 执行任务
async function executeWithCodeBuddy(storyId: string, prompt: string): Promise<void> {
  log(`开始执行 CodeBuddy CLI 任务: ${storyId}`);
  
  // 查找可用的 CodeBuddy 命令
  const codebuddyCmd = findCodeBuddyCommand();
  log(`使用 CodeBuddy 命令: ${codebuddyCmd}`);
  
  return new Promise((resolve, reject) => {
    const outputFile = path.join(LOG_DIR, `codebuddy-${storyId}-${Date.now()}.log`);
    const outputStream = fs.createWriteStream(outputFile);
    
    // 构建 CodeBuddy CLI 命令
    const codebuddyProcess = spawn(codebuddyCmd, [
      '-p', prompt,
      '-y',  // 跳过权限确认
      '--output-format', 'text'
    ], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    codebuddyProcess.stdout?.pipe(outputStream);
    codebuddyProcess.stderr?.pipe(outputStream);

    let output = '';
    codebuddyProcess.stdout?.on('data', (data) => {
      output += data.toString();
      log(`[CodeBuddy] ${data.toString().trim()}`, 'DEBUG');
    });

    codebuddyProcess.stderr?.on('data', (data) => {
      log(`[CodeBuddy Error] ${data.toString().trim()}`, 'ERROR');
    });

    codebuddyProcess.on('close', (code) => {
      outputStream.end();
      if (code === 0) {
        log(`CodeBuddy 任务完成: ${storyId}, 日志: ${outputFile}`);
        resolve();
      } else {
        reject(new Error(`CodeBuddy 退出码: ${code}`));
      }
    });

    codebuddyProcess.on('error', (err) => {
      outputStream.end();
      reject(err);
    });

    // 设置超时（30分钟）
    setTimeout(() => {
      codebuddyProcess.kill();
      reject(new Error('任务执行超时（30分钟）'));
    }, 30 * 60 * 1000);
  });
}

// 处理任务队列
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  
  const queue = loadQueue();
  const pendingTask = queue.find(t => t.status === 'pending');
  
  if (!pendingTask) return;
  
  isProcessing = true;
  log(`开始处理任务: ${pendingTask.storyId} - ${pendingTask.title}`);
  
  try {
    updateTaskStatus(pendingTask.storyId, 'processing');
    
    // 获取需求详情
    const storyDetails = await fetchStoryDetails(pendingTask.storyId);
    
    // 调用 CodeBuddy CLI
    await executeWithCodeBuddy(pendingTask.storyId, storyDetails);
    
    updateTaskStatus(pendingTask.storyId, 'completed');
    log(`任务完成: ${pendingTask.storyId}`);
    
    // 标记需求为已实现
    await markStoryImplemented(pendingTask.storyId, pendingTask.title);
    
  } catch (error: any) {
    log(`任务失败: ${pendingTask.storyId} - ${error.message}`, 'ERROR');
    updateTaskStatus(pendingTask.storyId, 'failed', error.message);
  } finally {
    isProcessing = false;
    // 继续处理下一个任务
    setTimeout(processQueue, 1000);
  }
}

// 标记需求为已实现
async function markStoryImplemented(storyId: string, title: string) {
  const implementedFile = path.join(__dirname, 'data', 'implemented-stories.json');
  let implemented: any[] = [];
  
  try {
    if (fs.existsSync(implementedFile)) {
      implemented = JSON.parse(fs.readFileSync(implementedFile, 'utf-8'));
    }
  } catch (e) {
    // ignore
  }
  
  implemented.push({
    storyId,
    title,
    implementedAt: new Date().toISOString(),
    triggeredBy: 'webhook'
  });
  
  fs.writeFileSync(implementedFile, JSON.stringify(implemented, null, 2));
}

// 解析请求体
function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('application/json')) {
          resolve(JSON.parse(body));
        } else if (contentType.includes('x-www-form-urlencoded')) {
          // 解析 form 数据
          const params = new URLSearchParams(body);
          const data: any = {};
          params.forEach((value, key) => {
            data[key] = value;
          });
          resolve(data);
        } else {
          // 尝试 JSON 解析
          resolve(JSON.parse(body));
        }
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// 验证 Webhook 签名
function verifySignature(data: any): boolean {
  if (!WEBHOOK_SECRET) return true; // 未配置密钥则跳过验证
  return data.secret === WEBHOOK_SECRET;
}

// HTTP 请求处理
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url || '/';
  const method = req.method || 'GET';
  
  log(`收到请求: ${method} ${url}`);
  
  // 健康检查
  if (url === '/health' || url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  
  // 任务队列状态
  if (url === '/status') {
    const queue = loadQueue();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      queueLength: queue.length,
      pending: queue.filter(t => t.status === 'pending').length,
      processing: queue.filter(t => t.status === 'processing').length,
      completed: queue.filter(t => t.status === 'completed').length,
      failed: queue.filter(t => t.status === 'failed').length,
      tasks: queue.slice(-10) // 最近10个任务
    }, null, 2));
    return;
  }
  
  // Webhook 接收端点
  if (url === '/webhook' && method === 'POST') {
    try {
      const data = await parseBody(req);
      log(`Webhook 数据: ${JSON.stringify(data)}`);
      
      // 验证签名
      if (!verifySignature(data)) {
        log('Webhook 签名验证失败', 'ERROR');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      // 检查是否是需求创建事件
      if (data.event === 'story::create') {
        const storyId = String(data.id);
        
        // 忽略示例需求（可选配置）
        // 由于 webhook 只推送 ID，需要后续获取详情时判断
        
        log(`收到新需求事件: ID=${storyId}`);
        
        // 添加到任务队列
        addToQueue({
          storyId,
          title: `需求 #${storyId}`, // 详细标题需要通过 API 获取
          workspace_id: data.workspace_id,
          event: data.event,
          receivedAt: new Date().toISOString(),
          status: 'pending'
        });
        
        // 触发队列处理
        setTimeout(processQueue, 100);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: '任务已加入队列',
          storyId 
        }));
        return;
      }
      
      // 其他事件类型
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: '事件已接收', event: data.event }));
      
    } catch (error: any) {
      log(`Webhook 处理错误: ${error.message}`, 'ERROR');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  
  // 手动触发端点（用于测试）
  if (url.startsWith('/trigger/') && method === 'POST') {
    const storyId = url.replace('/trigger/', '');
    log(`手动触发任务: ${storyId}`);
    
    addToQueue({
      storyId,
      title: `手动触发 #${storyId}`,
      workspace_id: parseInt(WORKSPACE_ID || '0'),
      event: 'manual::trigger',
      receivedAt: new Date().toISOString(),
      status: 'pending'
    });
    
    setTimeout(processQueue, 100);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: '任务已加入队列', storyId }));
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

// 启动服务器
function startServer() {
  const server = http.createServer(handleRequest);
  
  server.listen(PORT, () => {
    log('='.repeat(60));
    log(`TAPD Webhook 服务器已启动`);
    log(`监听端口: ${PORT}`);
    log(`项目根目录: ${PROJECT_ROOT}`);
    log('');
    log('可用端点:');
    log(`  GET  /health     - 健康检查`);
    log(`  GET  /status     - 任务队列状态`);
    log(`  POST /webhook    - TAPD Webhook 接收`);
    log(`  POST /trigger/:id - 手动触发需求实现`);
    log('');
    log('配置 TAPD Webhook:');
    log(`  URL: http://YOUR_PUBLIC_IP:${PORT}/webhook`);
    log(`  事件: story::create`);
    log('='.repeat(60));
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      log(`端口 ${PORT} 已被占用，请修改 WEBHOOK_PORT 环境变量`, 'ERROR');
    } else {
      log(`服务器错误: ${err.message}`, 'ERROR');
    }
    process.exit(1);
  });

  // 优雅退出
  process.on('SIGINT', () => {
    log('收到 SIGINT 信号，正在关闭服务器...');
    server.close(() => {
      log('服务器已关闭');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    log('收到 SIGTERM 信号，正在关闭服务器...');
    server.close(() => {
      log('服务器已关闭');
      process.exit(0);
    });
  });
}

// 主程序
startServer();
