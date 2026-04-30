/**
 * MPS 转码模版配置
 * 用于漫剧视频增强的分辨率模版定义
 */

export interface ResolutionTemplate {
  id: number;
  name: string;
  label: string;
  description: string;
}

/**
 * 可用的分辨率模版列表
 */
export const RESOLUTION_TEMPLATES: ResolutionTemplate[] = [
  {
    id: 327008,
    name: '漫剧场景-大模型增强-MP4-4K-帧率随源',
    label: '4K 超高清',
    description: '适合大屏播放',
  },
  {
    id: 327006,
    name: '漫剧场景-大模型增强-MP4-2K-帧率随源',
    label: '2K 高清',
    description: '推荐，平衡画质与大小',
  },
  {
    id: 327004,
    name: '漫剧场景-大模型增强-MP4-1080P-帧率随源',
    label: '1080P',
    description: '适合移动端',
  },
];

/**
 * 默认模版 ID (2K)
 */
export const DEFAULT_TEMPLATE_ID = 327006;

/**
 * 根据模版 ID 获取模版配置
 */
export function getTemplateById(templateId: number): ResolutionTemplate | undefined {
  return RESOLUTION_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * 获取默认模版配置
 */
export function getDefaultTemplate(): ResolutionTemplate {
  return RESOLUTION_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)!;
}
