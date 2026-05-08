/**
 * TAPD 新需求检测与编程任务生成脚本
 * 
 * 功能：
 * 1. 检测 TAPD 中的新需求
 * 2. 生成结构化的编程任务描述
 * 3. 输出给 CodeBuddy 进行 AI 编程
 */

import * as fs from 'fs';
import * as path from 'path';
import { TapdClient, TapdStory, TapdConfig } from './tapd-client';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env') });

// 数据存储路径
const DATA_DIR = path.join(__dirname, 'data');
const STORIES_FILE = path.join(DATA_DIR, 'known-stories.json');
const PENDING_TASKS_FILE = path.join(DATA_DIR, 'pending-tasks.json');
const IMPLEMENTED_FILE = path.join(DATA_DIR, 'implemented-stories.json');

// 需求状态映射
const STATUS_MAP: Record<string, string> = {
  'planning': '规划中',
  'developing': '开发中',
  'testing': '测试中',
  'status_3': '已完成',
  'resolved': '已解决',
  'closed': '已关闭',
  'rejected': '已拒绝'
};

// 优先级映射
const PRIORITY_MAP: Record<string, number> = {
  'High': 1,
  'Middle': 2,
  'Low': 3,
  'Nice To Have': 4
};

interface KnownStories {
  lastCheck: string;
  storyIds: string[];
}

interface PendingTask {
  storyId: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  detectedAt: string;
  implemented: boolean;
}

interface ImplementedStory {
  storyId: string;
  title: string;
  implementedAt: string;
  commitHash?: string;
}

// 获取需求优先级（兼容 priority 和 priority_label）
function getStoryPriority(story: TapdStory): string {
  return (story as any).priority || story.priority_label || '未设置';
}

// 验证配置
function validateConfig(): TapdConfig {
  const apiUser = process.env.TAPD_API_USER;
  const apiPassword = process.env.TAPD_API_PASSWORD;
  const workspaceId = process.env.TAPD_WORKSPACE_ID;
  const apiBaseUrl = process.env.TAPD_API_URL || 'https://api.tapd.cn';

  if (!apiUser || !apiPassword || !workspaceId) {
    console.error('❌ 配置错误：请检查 .env 文件中的 TAPD 配置');
    process.exit(1);
  }

  return { apiUser, apiPassword, workspaceId, apiBaseUrl };
}

// 确保数据目录存在
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 加载已知需求
function loadKnownStories(): KnownStories {
  if (fs.existsSync(STORIES_FILE)) {
    return JSON.parse(fs.readFileSync(STORIES_FILE, 'utf-8'));
  }
  return { lastCheck: '', storyIds: [] };
}

// 保存已知需求
function saveKnownStories(data: KnownStories): void {
  fs.writeFileSync(STORIES_FILE, JSON.stringify(data, null, 2));
}

// 加载待实现任务
function loadPendingTasks(): PendingTask[] {
  if (fs.existsSync(PENDING_TASKS_FILE)) {
    return JSON.parse(fs.readFileSync(PENDING_TASKS_FILE, 'utf-8'));
  }
  return [];
}

// 保存待实现任务
function savePendingTasks(tasks: PendingTask[]): void {
  fs.writeFileSync(PENDING_TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// 加载已实现需求
function loadImplementedStories(): ImplementedStory[] {
  if (fs.existsSync(IMPLEMENTED_FILE)) {
    return JSON.parse(fs.readFileSync(IMPLEMENTED_FILE, 'utf-8'));
  }
  return [];
}

// 保存已实现需求
function saveImplementedStories(stories: ImplementedStory[]): void {
  fs.writeFileSync(IMPLEMENTED_FILE, JSON.stringify(stories, null, 2));
}

// 清理 HTML 标签
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

// 生成编程任务描述
function generateTaskDescription(story: TapdStory): string {
  const description = stripHtml(story.description || '无详细描述');
  const priority = getStoryPriority(story);
  
  return `
## 需求信息

- **需求ID**: ${story.id}
- **标题**: ${story.name}
- **优先级**: ${priority}
- **状态**: ${STATUS_MAP[story.status] || story.status}
- **创建时间**: ${story.created}

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
`.trim();
}

// 生成 CodeBuddy 可读的任务报告
function generateCodeBuddyReport(newStories: TapdStory[]): string {
  if (newStories.length === 0) {
    return '✅ 没有检测到新需求，当前无待实现的任务。';
  }

  // 按优先级排序
  const sorted = [...newStories].sort((a, b) => {
    const priorityA = getStoryPriority(a);
    const priorityB = getStoryPriority(b);
    return (PRIORITY_MAP[priorityA] || 99) - (PRIORITY_MAP[priorityB] || 99);
  });

  let report = `
# 🆕 TAPD 新需求检测报告

**检测时间**: ${new Date().toLocaleString('zh-CN')}
**新需求数量**: ${newStories.length}

---

`;

  sorted.forEach((story, index) => {
    report += `
## ${index + 1}. ${story.name}

${generateTaskDescription(story)}

---
`;
  });

  report += `
## 📋 实现建议

按照以上需求的优先级顺序依次实现。每完成一个需求后：
1. 提交代码并标注需求 ID
2. 在 TAPD 中更新需求状态
3. 继续下一个需求

**开始实现第一个需求吗？**
`;

  return report;
}

// 主函数：检测新需求
async function checkNewStories(): Promise<{ newStories: TapdStory[], report: string }> {
  ensureDataDir();
  
  const config = validateConfig();
  const client = new TapdClient(config);
  
  console.log('🔍 正在检测 TAPD 新需求...\n');
  
  // 获取所有需求
  const allStories = await client.getAllStories();
  const knownStories = loadKnownStories();
  const implementedStories = loadImplementedStories();
  const implementedIds = new Set(implementedStories.map(s => s.storyId));
  
  // 找出新需求（不在已知列表中且未实现）
  const newStories = allStories.filter(story => 
    !knownStories.storyIds.includes(story.id) && 
    !implementedIds.has(story.id)
  );
  
  // 更新已知需求列表
  const updatedKnown: KnownStories = {
    lastCheck: new Date().toISOString(),
    storyIds: allStories.map(s => s.id)
  };
  saveKnownStories(updatedKnown);
  
  // 更新待实现任务
  if (newStories.length > 0) {
    const pendingTasks = loadPendingTasks();
    const existingIds = new Set(pendingTasks.map(t => t.storyId));
    
    const newTasks: PendingTask[] = newStories
      .filter(s => !existingIds.has(s.id))
      .map(story => ({
        storyId: story.id,
        title: story.name,
        description: stripHtml(story.description || ''),
        priority: getStoryPriority(story),
        status: story.status,
        createdAt: story.created,
        detectedAt: new Date().toISOString(),
        implemented: false
      }));
    
    if (newTasks.length > 0) {
      savePendingTasks([...pendingTasks, ...newTasks]);
    }
  }
  
  // 生成报告
  const report = generateCodeBuddyReport(newStories);
  
  return { newStories, report };
}

// 标记需求为已实现
function markAsImplemented(storyId: string, commitHash?: string): void {
  ensureDataDir();
  
  const pendingTasks = loadPendingTasks();
  const task = pendingTasks.find(t => t.storyId === storyId);
  
  if (task) {
    // 从待实现列表移除
    const updatedPending = pendingTasks.filter(t => t.storyId !== storyId);
    savePendingTasks(updatedPending);
    
    // 添加到已实现列表
    const implemented = loadImplementedStories();
    implemented.push({
      storyId: task.storyId,
      title: task.title,
      implementedAt: new Date().toISOString(),
      commitHash
    });
    saveImplementedStories(implemented);
    
    console.log(`✅ 需求 ${storyId} 已标记为已实现`);
  } else {
    console.log(`⚠️ 未找到需求 ${storyId}`);
  }
}

// 获取待实现任务
function getPendingTasks(): PendingTask[] {
  ensureDataDir();
  return loadPendingTasks().filter(t => !t.implemented);
}

// 主入口
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  console.log(`
╔══════════════════════════════════════════╗
║   TAPD → CodeBuddy 自动编程助手 v1.0    ║
╚══════════════════════════════════════════╝
`);

  try {
    switch (command) {
      case 'check': {
        const { newStories, report } = await checkNewStories();
        console.log(report);
        
        if (newStories.length > 0) {
          // 保存报告
          const reportDir = path.join(__dirname, 'reports');
          if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
          }
          const reportFile = path.join(reportDir, `new-stories-${new Date().toISOString().split('T')[0]}.md`);
          fs.writeFileSync(reportFile, report);
          console.log(`\n📄 报告已保存: ${reportFile}`);
        }
        break;
      }
      
      case 'pending': {
        const tasks = getPendingTasks();
        if (tasks.length === 0) {
          console.log('✅ 没有待实现的需求');
        } else {
          console.log(`📋 待实现需求 (${tasks.length} 个):\n`);
          tasks.forEach((task, i) => {
            console.log(`${i + 1}. [${task.priority}] ${task.title}`);
            console.log(`   ID: ${task.storyId}`);
            console.log(`   检测时间: ${task.detectedAt}\n`);
          });
        }
        break;
      }
      
      case 'done': {
        const storyId = args[1];
        const commitHash = args[2];
        if (!storyId) {
          console.log('用法: npx ts-node check-and-implement.ts done <storyId> [commitHash]');
        } else {
          markAsImplemented(storyId, commitHash);
        }
        break;
      }
      
      case 'help':
      default: {
        console.log(`
📖 使用说明:

  npx ts-node check-and-implement.ts <命令>

📋 可用命令:

  check     检测新需求并生成 CodeBuddy 编程任务
  pending   查看待实现的需求列表
  done <id> 标记需求为已实现
  help      显示帮助信息

🔄 自动化工作流:

  1. 运行 'check' 检测新需求
  2. CodeBuddy 根据报告实现需求
  3. 实现完成后运行 'done <id>' 标记完成
  4. 重复步骤 1-3
        `);
        break;
      }
    }
  } catch (error) {
    console.error('❌ 执行出错:', error);
    process.exit(1);
  }
}

main();
