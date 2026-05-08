/**
 * TAPD 集成客户端
 * 通过 TAPD Open API 获取指定项目的需求
 */

import * as fs from 'fs';
import * as path from 'path';

// TAPD API 配置接口
interface TapdConfig {
  apiUser: string;      // API 用户名（应用ID）
  apiPassword: string;  // API 密码（应用秘钥）
  workspaceId: string;  // 项目ID
  apiBaseUrl: string;   // API 基础URL
}

// 需求接口定义
interface TapdStory {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority_label: string;
  owner: string;
  creator: string;
  created: string;
  modified: string;
  iteration_id: string;
  category_id: string;
  begin: string | null;
  due: string | null;
  completed: string | null;
  effort: string | null;
  progress: string;
  workspace_id: string;
  parent_id: string;
  workitem_type_id: string;
  label: string;
  [key: string]: any;  // 支持自定义字段
}

// API 响应接口
interface TapdApiResponse {
  status: number;
  data: Array<{ Story: TapdStory }>;
  info: string;
}

// 需求查询参数
interface StoryQueryParams {
  limit?: number;       // 返回数量限制，默认30，最大200
  page?: number;        // 页码
  order?: string;       // 排序规则，如 'created desc'
  fields?: string;      // 指定返回字段
  status?: string;      // 状态过滤
  created?: string;     // 创建时间过滤（支持范围查询）
  modified?: string;    // 修改时间过滤
  owner?: string;       // 处理人
  creator?: string;     // 创建人
  iteration_id?: string;// 迭代ID
  [key: string]: any;
}

// 本地存储的需求记录
interface StoredStoryRecord {
  lastFetchTime: string;
  stories: TapdStory[];
  newStoryIds: string[];
}

class TapdClient {
  private config: TapdConfig;
  private storageDir: string;

  constructor(config: TapdConfig) {
    this.config = {
      ...config,
      apiBaseUrl: config.apiBaseUrl || 'https://api.tapd.cn'
    };
    this.storageDir = path.join(__dirname, 'data');
    this.ensureStorageDir();
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * 生成 Basic Auth 头
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(
      `${this.config.apiUser}:${this.config.apiPassword}`
    ).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * 发送 API 请求
   */
  private async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const url = new URL(`${this.config.apiBaseUrl}${endpoint}`);
    
    // 添加必填的 workspace_id
    url.searchParams.append('workspace_id', this.config.workspaceId);
    
    // 添加其他参数
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    console.log(`📡 请求: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * 获取需求列表
   */
  async getStories(params: StoryQueryParams = {}): Promise<TapdStory[]> {
    const defaultParams: StoryQueryParams = {
      limit: 200,
      page: 1,
      order: 'created desc',
      ...params
    };

    const response = await this.request<TapdApiResponse>('/stories', defaultParams);

    if (response.status !== 1) {
      throw new Error(`获取需求失败: ${response.info}`);
    }

    return response.data.map(item => item.Story);
  }

  /**
   * 获取所有需求（自动分页）
   */
  async getAllStories(params: StoryQueryParams = {}): Promise<TapdStory[]> {
    const allStories: TapdStory[] = [];
    let page = 1;
    const limit = 200;

    while (true) {
      const stories = await this.getStories({ ...params, page, limit });
      allStories.push(...stories);

      console.log(`📄 已获取第 ${page} 页，共 ${stories.length} 条需求`);

      if (stories.length < limit) {
        break;
      }
      page++;
    }

    console.log(`✅ 共获取 ${allStories.length} 条需求`);
    return allStories;
  }

  /**
   * 获取指定时间之后创建的新需求
   */
  async getNewStories(sinceTime: string): Promise<TapdStory[]> {
    // 使用 created 字段进行时间范围查询
    // TAPD API 支持 >=, <=, > , < 等操作符
    return this.getAllStories({
      created: `>=${sinceTime}`,
      order: 'created desc'
    });
  }

  /**
   * 获取指定时间之后修改的需求
   */
  async getModifiedStories(sinceTime: string): Promise<TapdStory[]> {
    return this.getAllStories({
      modified: `>=${sinceTime}`,
      order: 'modified desc'
    });
  }

  /**
   * 获取存储文件路径
   */
  private getStorageFilePath(): string {
    return path.join(this.storageDir, `stories_${this.config.workspaceId}.json`);
  }

  /**
   * 加载上次存储的需求记录
   */
  loadStoredStories(): StoredStoryRecord | null {
    const filePath = this.getStorageFilePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * 保存需求记录
   */
  saveStories(stories: TapdStory[], newStoryIds: string[] = []): void {
    const record: StoredStoryRecord = {
      lastFetchTime: new Date().toISOString(),
      stories,
      newStoryIds
    };
    const filePath = this.getStorageFilePath();
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    console.log(`💾 已保存 ${stories.length} 条需求到 ${filePath}`);
  }

  /**
   * 检测新需求
   * 对比当前需求列表与上次存储的记录，返回新增的需求
   */
  async detectNewStories(): Promise<{
    newStories: TapdStory[];
    allStories: TapdStory[];
    lastFetchTime: string | null;
  }> {
    // 获取当前所有需求
    const currentStories = await this.getAllStories();
    
    // 加载上次的记录
    const storedRecord = this.loadStoredStories();
    
    let newStories: TapdStory[] = [];
    let lastFetchTime: string | null = null;

    if (storedRecord) {
      lastFetchTime = storedRecord.lastFetchTime;
      const storedIds = new Set(storedRecord.stories.map(s => s.id));
      
      // 找出新增的需求
      newStories = currentStories.filter(story => !storedIds.has(story.id));
      
      console.log(`📊 上次获取时间: ${lastFetchTime}`);
      console.log(`📊 上次需求数量: ${storedRecord.stories.length}`);
      console.log(`📊 当前需求数量: ${currentStories.length}`);
      console.log(`🆕 新增需求数量: ${newStories.length}`);
    } else {
      console.log(`📝 首次获取，所有需求都视为新需求`);
      newStories = currentStories;
    }

    // 保存当前记录
    const newStoryIds = newStories.map(s => s.id);
    this.saveStories(currentStories, newStoryIds);

    return {
      newStories,
      allStories: currentStories,
      lastFetchTime
    };
  }

  /**
   * 格式化需求为可读文本
   */
  formatStory(story: TapdStory): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 需求ID: ${story.id}
📌 标题: ${story.name}
📊 状态: ${story.status}
⭐ 优先级: ${story.priority_label || '未设置'}
👤 处理人: ${story.owner || '未分配'}
✍️ 创建人: ${story.creator}
📅 创建时间: ${story.created}
📅 修改时间: ${story.modified}
🔄 迭代: ${story.iteration_id || '未关联'}
📝 描述: ${story.description ? story.description.substring(0, 200) + '...' : '无描述'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }

  /**
   * 生成需求报告
   */
  generateReport(stories: TapdStory[], title: string = '需求列表'): string {
    const now = new Date().toLocaleString('zh-CN');
    let report = `
╔══════════════════════════════════════════════════════════╗
║                    TAPD ${title}                          
║                    项目ID: ${this.config.workspaceId}     
║                    生成时间: ${now}                       
║                    需求数量: ${stories.length}            
╚══════════════════════════════════════════════════════════╝
`;

    if (stories.length === 0) {
      report += '\n🎉 没有新需求！\n';
    } else {
      stories.forEach((story, index) => {
        report += `\n[${index + 1}/${stories.length}]`;
        report += this.formatStory(story);
      });
    }

    return report;
  }
}

export { TapdClient, TapdConfig, TapdStory, StoryQueryParams };
