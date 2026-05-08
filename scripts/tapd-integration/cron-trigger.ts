/**
 * TAPD 定时轮询触发器
 * 
 * 功能：定时检测 TAPD 新需求，发现后自动调用 CodeBuddy CLI
 * 
 * 使用方法：
 * 1. 直接运行：npm run cron:once（单次检测）
 * 2. 守护进程：npm run cron:daemon（持续运行）
 * 3. 系统 cron：设置 crontab 定期执行 npm run cron:once
 * 
 * 与 Webhook 方案的区别：
 * - Webhook：被动接收，实时性好，需要公网可访问
 * - 定时轮询：主动检测，有延迟，但配置简单
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 配置
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(__dirname, 'data');
const LOG_DIR = path.join(__dirname, 'logs');
const KNOWN_STORIES_FILE = path.join(DATA_DIR, 'known-stories.json');
const PROCESSING_FILE = path.join(DATA_DIR, 'processing.lock');
const POLL_INTERVAL = parseInt(process.env.TAPD_POLL_INTERVAL || '300') * 1000; // 默认5分钟

// 确保目录存在
[DATA_DIR, LOG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// TAPD 配置
interface TapdConfig {
  apiUser: string;
  apiPassword: string;
  workspaceId: string;
  apiBaseUrl: string;
}

interface TapdStory {
  id: string;
  name: string;
  description: string;
  status: string;
  priority_label: string;
  created: string;
  creator: string;
}

// 日志函数
function log(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  
  // 写入日志文件
  const logFile = path.join(LOG_DIR, `cron-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage + '\n');
}

// 验证配置
function validateConfig(): TapdConfig {
  const apiUser = process.env.TAPD_API_USER;
  const apiPassword = process.env.TAPD_API_PASSWORD;
  const workspaceId = process.env.TAPD_WORKSPACE_ID;
  const apiBaseUrl = process.env.TAPD_API_URL || 'https://api.tapd.cn';

  if (!apiUser || !apiPassword || !workspaceId) {
    throw new Error('TAPD API 配置不完整，请检查 .env 文件');
  }

  return { apiUser, apiPassword, workspaceId, apiBaseUrl };
}

// 获取所有需求
async function fetchAllStories(config: TapdConfig): Promise<TapdStory[]> {
  const auth = Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString('base64');
  
  return new Promise((resolve, reject) => {
    const url = `${config.apiBaseUrl}/stories?workspace_id=${config.workspaceId}&limit=200`;
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
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
          if (json.status === 1 && json.data) {
            const stories = json.data.map((item: any) => item.Story);
            resolve(stories);
          } else {
            reject(new Error(`API 返回错误: ${JSON.stringify(json)}`));
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

// 加载已知需求
function loadKnownStories(): Set<string> {
  try {
    if (fs.existsSync(KNOWN_STORIES_FILE)) {
      const data = JSON.parse(fs.readFileSync(KNOWN_STORIES_FILE, 'utf-8'));
      return new Set(data.map((s: any) => s.id));
    }
  } catch (e) {
    log(`加载已知需求失败: ${e}`, 'ERROR');
  }
  return new Set();
}

// 保存已知需求
function saveKnownStories(stories: TapdStory[]) {
  const data = stories.map(s => ({ id: s.id, name: s.name, savedAt: new Date().toISOString() }));
  fs.writeFileSync(KNOWN_STORIES_FILE, JSON.stringify(data, null, 2));
}

// 检查是否正在处理（避免并发）
function isProcessing(): boolean {
  if (!fs.existsSync(PROCESSING_FILE)) return false;
  
  // 检查锁文件是否过期（30分钟）
  const stat = fs.statSync(PROCESSING_FILE);
  const age = Date.now() - stat.mtime.getTime();
  if (age > 30 * 60 * 1000) {
    fs.unlinkSync(PROCESSING_FILE);
    return false;
  }
  
  return true;
}

// 设置/清除处理锁
function setProcessing(processing: boolean) {
  if (processing) {
    fs.writeFileSync(PROCESSING_FILE, new Date().toISOString());
  } else if (fs.existsSync(PROCESSING_FILE)) {
    fs.unlinkSync(PROCESSING_FILE);
  }
}

// 生成需求描述
function generatePrompt(story: TapdStory): string {
  const description = story.description ? 
    story.description.replace(/<[^>]*>/g, '').trim() : 
    '无详细描述';
  
  return `
## 新需求实现任务

来自 TAPD 的新需求，请在当前项目中实现。

### 需求信息

- **需求ID**: ${story.id}
- **标题**: ${story.name}
- **优先级**: ${story.priority_label || '未设置'}
- **状态**: ${story.status}
- **创建时间**: ${story.created}
- **创建人**: ${story.creator || '未知'}

### 需求描述

${description}

### 实现要求

1. 分析需求，确定需要修改或新增的文件
2. 编写高质量的代码实现功能
3. 确保代码符合项目现有的编码规范
4. 添加必要的注释和文档
5. 如果涉及 API 变更，更新相关接口文档

完成后请总结：
- 实现的文件列表
- 主要变更内容
- 需要注意的事项
`.trim();
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

// 调用 CodeBuddy CLI
async function executeWithCodeBuddy(story: TapdStory): Promise<boolean> {
  log(`开始执行 CodeBuddy CLI 任务: ${story.id} - ${story.name}`);
  
  const prompt = generatePrompt(story);
  const outputFile = path.join(LOG_DIR, `codebuddy-${story.id}-${Date.now()}.log`);
  
  // 查找可用的 CodeBuddy 命令
  let codebuddyCmd: string;
  try {
    codebuddyCmd = findCodeBuddyCommand();
    log(`使用 CodeBuddy 命令: ${codebuddyCmd}`);
  } catch (e: any) {
    log(e.message, 'ERROR');
    return false;
  }
  
  return new Promise((resolve) => {
    const outputStream = fs.createWriteStream(outputFile);
    
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

    codebuddyProcess.stdout?.on('data', (data) => {
      log(`[CodeBuddy] ${data.toString().trim().substring(0, 100)}...`, 'DEBUG');
    });

    codebuddyProcess.on('close', (code) => {
      outputStream.end();
      if (code === 0) {
        log(`✅ CodeBuddy 任务完成: ${story.id}, 日志: ${outputFile}`);
        resolve(true);
      } else {
        log(`❌ CodeBuddy 任务失败: ${story.id}, 退出码: ${code}`, 'ERROR');
        resolve(false);
      }
    });

    codebuddyProcess.on('error', (err) => {
      outputStream.end();
      log(`❌ CodeBuddy 执行错误: ${err.message}`, 'ERROR');
      resolve(false);
    });

    // 设置超时（30分钟）
    setTimeout(() => {
      codebuddyProcess.kill();
      log(`⏰ CodeBuddy 任务超时: ${story.id}`, 'ERROR');
      resolve(false);
    }, 30 * 60 * 1000);
  });
}

// 记录已实现的需求
function recordImplemented(story: TapdStory, success: boolean) {
  const implementedFile = path.join(DATA_DIR, 'implemented-stories.json');
  let implemented: any[] = [];
  
  try {
    if (fs.existsSync(implementedFile)) {
      implemented = JSON.parse(fs.readFileSync(implementedFile, 'utf-8'));
    }
  } catch (e) {
    // ignore
  }
  
  implemented.push({
    storyId: story.id,
    title: story.name,
    implementedAt: new Date().toISOString(),
    success,
    triggeredBy: 'cron'
  });
  
  fs.writeFileSync(implementedFile, JSON.stringify(implemented, null, 2));
}

// 判断是否应该处理该需求
function shouldProcessStory(story: TapdStory): boolean {
  // 跳过示例需求
  if (story.name.includes('示例')) {
    log(`跳过示例需求: ${story.name}`);
    return false;
  }
  
  // 可以添加其他过滤条件，比如：
  // - 只处理特定状态的需求
  // - 只处理特定优先级的需求
  // - 只处理特定创建人的需求
  
  return true;
}

// 单次检测并处理
async function checkOnce() {
  log('='.repeat(60));
  log('开始检测 TAPD 新需求...');
  
  if (isProcessing()) {
    log('检测到正在处理中，跳过本次检测');
    return;
  }
  
  try {
    const config = validateConfig();
    log(`项目 ID: ${config.workspaceId}`);
    
    // 获取所有需求
    const allStories = await fetchAllStories(config);
    log(`获取到 ${allStories.length} 条需求`);
    
    // 加载已知需求
    const knownIds = loadKnownStories();
    const isFirstRun = knownIds.size === 0;
    
    // 找出新需求
    const newStories = allStories.filter(s => !knownIds.has(s.id));
    
    if (isFirstRun) {
      log(`首次运行，记录 ${allStories.length} 条现有需求，不触发实现`);
      saveKnownStories(allStories);
      return;
    }
    
    if (newStories.length === 0) {
      log('✅ 没有检测到新需求');
      return;
    }
    
    log(`🆕 检测到 ${newStories.length} 条新需求`);
    
    // 过滤需要处理的需求
    const storiesToProcess = newStories.filter(shouldProcessStory);
    
    if (storiesToProcess.length === 0) {
      log('没有需要处理的新需求（可能都是示例需求）');
      saveKnownStories(allStories);
      return;
    }
    
    log(`将处理 ${storiesToProcess.length} 条新需求`);
    
    // 设置处理锁
    setProcessing(true);
    
    // 逐个处理新需求
    for (const story of storiesToProcess) {
      log(`\n📋 处理需求: ${story.id} - ${story.name}`);
      
      const success = await executeWithCodeBuddy(story);
      recordImplemented(story, success);
      
      if (!success) {
        log(`需求 ${story.id} 处理失败，继续处理下一个`);
      }
      
      // 每个需求处理完后稍等一下
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // 更新已知需求
    saveKnownStories(allStories);
    
    log(`\n✅ 所有新需求处理完成`);
    
  } catch (error: any) {
    log(`检测过程出错: ${error.message}`, 'ERROR');
  } finally {
    setProcessing(false);
  }
  
  log('='.repeat(60));
}

// 守护进程模式
async function daemon() {
  log('='.repeat(60));
  log('TAPD 定时检测守护进程已启动');
  log(`检测间隔: ${POLL_INTERVAL / 1000} 秒`);
  log(`项目根目录: ${PROJECT_ROOT}`);
  log('按 Ctrl+C 退出');
  log('='.repeat(60));
  
  // 立即执行一次
  await checkOnce();
  
  // 设置定时器
  setInterval(async () => {
    await checkOnce();
  }, POLL_INTERVAL);
  
  // 优雅退出
  process.on('SIGINT', () => {
    log('收到退出信号，正在关闭...');
    setProcessing(false);
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    log('收到退出信号，正在关闭...');
    setProcessing(false);
    process.exit(0);
  });
}

// 主程序
const args = process.argv.slice(2);
const mode = args[0] || 'once';

switch (mode) {
  case 'once':
    checkOnce().then(() => {
      log('单次检测完成');
      process.exit(0);
    }).catch(err => {
      log(`错误: ${err.message}`, 'ERROR');
      process.exit(1);
    });
    break;
    
  case 'daemon':
    daemon();
    break;
    
  default:
    console.log(`
TAPD 定时轮询触发器

用法:
  npx ts-node cron-trigger.ts once    单次检测（适合 crontab）
  npx ts-node cron-trigger.ts daemon  守护进程模式（持续运行）

环境变量:
  TAPD_POLL_INTERVAL  检测间隔（秒），默认 300（5分钟）
`);
    process.exit(0);
}
