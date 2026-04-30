import { useState, useRef, useCallback, useEffect, type MouseEvent } from 'react';

interface ScreenshotCompareProps {
  originalSrc: string;
  enhancedSrc: string;
  onClose?: () => void;
}

export const ScreenshotCompare = ({
  originalSrc,
  enhancedSrc,
  onClose,
}: ScreenshotCompareProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState({ original: false, enhanced: false });

  // 分割线拖拽开始
  const handleDragStart = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // 分割线拖拽
  const handleDrag = useCallback((e: globalThis.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSplitPosition(percent);
  }, [isDragging]);

  // 分割线拖拽结束
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 监听全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDrag);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDrag, handleDragEnd]);

  // 监听 ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isLoading = !imagesLoaded.original || !imagesLoaded.enhanced;

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 bg-black/50">
        <h2 className="text-white text-lg font-semibold">截图对比</h2>
        <button
          onClick={onClose}
          className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 图片对比区域 */}
      <div className="flex-1 p-4 flex items-center justify-center">
        <div
          ref={containerRef}
          className="relative w-full max-w-5xl aspect-video bg-gray-900 rounded-lg overflow-hidden"
        >
          {/* 加载状态 */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="text-white">加载中...</div>
            </div>
          )}

          {/* 增强后图片（底层，完整显示） */}
          <img
            src={enhancedSrc}
            alt="增强后"
            className="absolute inset-0 w-full h-full object-contain"
            onLoad={() => setImagesLoaded(prev => ({ ...prev, enhanced: true }))}
          />

          {/* 原图片（上层，通过 clip-path 裁剪） */}
          <img
            src={originalSrc}
            alt="原图"
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              clipPath: `inset(0 ${100 - splitPosition}% 0 0)`,
            }}
            onLoad={() => setImagesLoaded(prev => ({ ...prev, original: true }))}
          />

          {/* 分割线 */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10 select-none"
            style={{ left: `${splitPosition}%`, transform: 'translateX(-50%)' }}
            onMouseDown={handleDragStart}
          >
            {/* 拖拽手柄 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l-4-7 4-7zm8 0v14l4-7-4-7z"/>
              </svg>
            </div>
          </div>

          {/* 标签 */}
          <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium">
            原图
          </div>
          <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium">
            增强后
          </div>
        </div>
      </div>

      {/* 底部控制 */}
      <div className="p-4 bg-black/50">
        <div className="flex items-center justify-center gap-4">
          <span className="text-white/60 text-sm">
            拖动分割线查看对比效果
          </span>
          <span className="text-white text-sm">
            分割位置: {Math.round(splitPosition)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default ScreenshotCompare;
