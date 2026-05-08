/**
 * TAPD 需求获取脚本
 * 
 * 功能：
 * 1. 获取指定项目的所有需求
 * 2. 检测新增的需求
 * 3. 生成需求报告
 * 
 * 使用方法：
 * 1. 复制 .env.example 为 .env 并填写配置
 * 2. 运行: npx ts-node fetch-stories.ts [命令]
 * 
 * 命令：
 * - all: 获取所有需求
 * - new: 检测新需求（与上次对比）
 * - since <日期>: 获取指定日期后创建的需求
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { TapdClient, TapdConfig, TapdStory } from './tapd-client';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env') });

// 验证必要的环境变量
function validateConfig(): TapdConfig {
  const apiUser = process.env.TAPD_API_USER;
  const apiPassword = process.env.TAPD_API_PASSWORD;
  const workspaceId = process.env.TAPD_WORKSPACE_ID;

  if (!apiUser || !apiPassword || !workspaceId) {
    console.error(`
❌ 缺少必要的配置！

请确保 .env 文件包含以下配置：
- TAPD_API_USER: API 用户名（应用ID）
- TAPD_API_PASSWORD: API 密码（应用秘钥）
- TAPD_WORKSPACE_ID: 项目ID

配置获取方式：
1. 访问 TAPD 开放平台: https://open.tapd.cn
2. 创建或选择应用
3. 获取应用ID和秘钥
4. 确保应用已授权访问目标项目
    `);
    process.exit(1);
  }

  return {
    apiUser,
    apiPassword,
    workspaceId,
    apiBaseUrl: process.env.TAPD_API_URL || 'https://api.tapd.cn'
  };
}

// 保存报告到文件
function saveReport(content: string, filename: string): void {
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const filePath = path.join(reportsDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`📄 报告已保存到: ${filePath}`);
}

// 生成 Markdown 格式的需求列表
function generateMarkdownReport(stories: TapdStory[], title: string): string {
  const now = new Date().toLocaleString('zh-CN');
  let md = `# ${title}\n\n`;
  md += `> 生成时间: ${now}\n`;
  md += `> 需求数量: ${stories.length}\n\n`;

  if (stories.length === 0) {
    md += '🎉 **没有新需求！**\n';
    return md;
  }

  md += '| # | ID | 标题 | 状态 | 优先级 | 处理人 | 创建时间 |\n';
  md += '|---|---|------|------|--------|--------|----------|\n';

  stories.forEach((story, index) => {
    md += `| ${index + 1} | ${story.id} | ${story.name} | ${story.status} | ${story.priority_label || '-'} | ${story.owner || '未分配'} | ${story.created} |\n`;
  });

  md += '\n## 详细信息\n\n';

  stories.forEach((story, index) => {
    md += `### ${index + 1}. ${story.name}\n\n`;
    md += `- **ID**: ${story.id}\n`;
    md += `- **状态**: ${story.status}\n`;
    md += `- **优先级**: ${story.priority_label || '未设置'}\n`;
    md += `- **处理人**: ${story.owner || '未分配'}\n`;
    md += `- **创建人**: ${story.creator}\n`;
    md += `- **创建时间**: ${story.created}\n`;
    md += `- **修改时间**: ${story.modified}\n`;
    if (story.description) {
      md += `\n**描述**:\n\n${story.description}\n`;
    }
    md += '\n---\n\n';
  });

  return md;
}

// 显示帮助信息
function showHelp(): void {
  console.log(`
📖 使用说明:

  npx ts-node fetch-stories.ts <命令> [参数]

📋 可用命令:

  all              获取项目所有需求
  new              检测新需求（与上次运行对比）
  since <日期>     获取指定日期后创建的需求
  modified [日期]  获取指定日期后修改的需求（默认7天内）
  help             显示帮助信息

📝 示例:

  npx ts-node fetch-stories.ts all
  npx ts-node fetch-stories.ts new
  npx ts-node fetch-stories.ts since 2026-05-01
  npx ts-node fetch-stories.ts modified 2026-05-01

⚙️ 配置说明:

  在 .env 文件中配置以下环境变量：
  - TAPD_API_USER: API 用户名（应用ID）
  - TAPD_API_PASSWORD: API 密码（应用秘钥）
  - TAPD_WORKSPACE_ID: 项目ID
  - TAPD_API_URL: API地址（可选，默认 https://api.tapd.cn）
  `);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'new';

  console.log(`
╔══════════════════════════════════════╗
║       TAPD 需求获取工具 v1.0        ║
╚══════════════════════════════════════╝
`);

  // 帮助命令不需要配置
  if (command === 'help') {
    showHelp();
    return;
  }

  const config = validateConfig();
  const client = new TapdClient(config);

  console.log(`📋 项目ID: ${config.workspaceId}`);
  console.log(`🔧 命令: ${command}\n`);

  try {
    switch (command) {
      case 'all': {
        // 获取所有需求
        console.log('📥 正在获取所有需求...\n');
        const stories = await client.getAllStories();
        
        const report = client.generateReport(stories, '所有需求');
        console.log(report);
        
        const mdReport = generateMarkdownReport(stories, 'TAPD 所有需求列表');
        const timestamp = new Date().toISOString().split('T')[0];
        saveReport(mdReport, `all-stories-${timestamp}.md`);
        break;
      }

      case 'new': {
        // 检测新需求
        console.log('🔍 正在检测新需求...\n');
        const { newStories, allStories, lastFetchTime } = await client.detectNewStories();
        
        if (newStories.length > 0) {
          const report = client.generateReport(newStories, '新增需求');
          console.log(report);
          
          const mdReport = generateMarkdownReport(newStories, 'TAPD 新增需求');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          saveReport(mdReport, `new-stories-${timestamp}.md`);

          console.log(`
╔══════════════════════════════════════════════════════════╗
║                    🎯 新需求汇总                          
╠══════════════════════════════════════════════════════════╣
║  上次检查时间: ${lastFetchTime || '首次运行'}
║  新增需求数量: ${newStories.length}
║  总需求数量: ${allStories.length}
╚══════════════════════════════════════════════════════════╝

💡 提示: 你可以基于以上新需求进行开发任务规划！
          `);
        } else {
          console.log(`
╔══════════════════════════════════════════════════════════╗
║                    ✅ 检查完成                            
╠══════════════════════════════════════════════════════════╣
║  上次检查时间: ${lastFetchTime || '首次运行'}
║  新增需求数量: 0
║  总需求数量: ${allStories.length}
╚══════════════════════════════════════════════════════════╝

🎉 没有新需求，可以继续当前工作！
          `);
        }
        break;
      }

      case 'since': {
        // 获取指定日期后的需求
        const sinceDate = args[1];
        if (!sinceDate) {
          console.error('❌ 请指定日期，格式: since YYYY-MM-DD');
          console.log('示例: npx ts-node fetch-stories.ts since 2026-05-01');
          process.exit(1);
        }

        console.log(`📥 正在获取 ${sinceDate} 之后创建的需求...\n`);
        const stories = await client.getNewStories(sinceDate);
        
        const report = client.generateReport(stories, `${sinceDate} 之后的需求`);
        console.log(report);
        
        const mdReport = generateMarkdownReport(stories, `TAPD ${sinceDate} 之后的需求`);
        saveReport(mdReport, `stories-since-${sinceDate}.md`);
        break;
      }

      case 'modified': {
        // 获取最近修改的需求
        const sinceDate = args[1] || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        console.log(`📥 正在获取 ${sinceDate} 之后修改的需求...\n`);
        const stories = await client.getModifiedStories(sinceDate);
        
        const report = client.generateReport(stories, `${sinceDate} 之后修改的需求`);
        console.log(report);
        
        const mdReport = generateMarkdownReport(stories, `TAPD ${sinceDate} 之后修改的需求`);
        saveReport(mdReport, `modified-stories-since-${sinceDate}.md`);
        break;
      }

      case 'help':
      default: {
        showHelp();
        break;
      }
    }
  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  }
}

main();
