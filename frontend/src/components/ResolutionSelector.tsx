import React from 'react';
import { RESOLUTION_TEMPLATES, DEFAULT_TEMPLATE_ID } from '../config/templates';

interface ResolutionSelectorProps {
  value: number[];
  onChange: (templateIds: number[]) => void;
  disabled?: boolean;
}

/**
 * 分辨率选择器组件
 * 使用多选复选框展示分辨率选项，支持同时选择多个分辨率
 */
export const ResolutionSelector: React.FC<ResolutionSelectorProps> = ({
  value = [DEFAULT_TEMPLATE_ID],
  onChange,
  disabled = false,
}) => {
  const handleToggle = (templateId: number) => {
    if (disabled) return;
    
    const isSelected = value.includes(templateId);
    let newValue: number[];
    
    if (isSelected) {
      // 取消选择，但至少保留一个
      if (value.length > 1) {
        newValue = value.filter(id => id !== templateId);
      } else {
        return; // 不允许取消最后一个
      }
    } else {
      // 添加选择
      newValue = [...value, templateId];
    }
    
    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700 mb-2">
        选择输出分辨率（可多选）：
      </div>
      <div className="space-y-2">
        {RESOLUTION_TEMPLATES.map((template) => {
          const isSelected = value.includes(template.id);
          const isRecommended = template.id === DEFAULT_TEMPLATE_ID;

          return (
            <label
              key={template.id}
              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-blue-50 border border-blue-200'
                  : 'bg-gray-50 border border-transparent hover:bg-gray-100'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                value={template.id}
                checked={isSelected}
                onChange={() => handleToggle(template.id)}
                disabled={disabled}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                    {template.label}
                  </span>
                  {isRecommended && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                      推荐
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {template.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>
      {value.length > 1 && (
        <p className="text-xs text-blue-600 mt-2">
          已选择 {value.length} 个分辨率，将生成 {value.length} 个不同分辨率的增强视频
        </p>
      )}
    </div>
  );
};

export default ResolutionSelector;
