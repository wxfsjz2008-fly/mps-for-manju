import React, { useRef, useCallback, useState, useEffect } from 'react';

interface SideBySidePlayerProps {
  originalSrc: string;
  enhancedSrc: string;
  onClose?: () => void;
}

export const SideBySidePlayer: React.FC<SideBySidePlayerProps> = ({
  originalSrc,
  enhancedSrc,
  onClose,
}) => {
  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const enhancedVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [originalVolume, setOriginalVolume] = useState(0.5);
  const [enhancedVolume, setEnhancedVolume] = useState(0.5);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 同步阈值（毫秒）
  const SYNC_THRESHOLD = 100;

  // 同步两个视频
  const syncVideos = useCallback((masterTime: number) => {
    const original = originalVideoRef.current;
    const enhanced = enhancedVideoRef.current;

    if (original && enhanced) {
      // 检查是否需要同步
      if (Math.abs(original.currentTime - masterTime) * 1000 > SYNC_THRESHOLD) {
        original.currentTime = masterTime;
      }
      if (Math.abs(enhanced.currentTime - masterTime) * 1000 > SYNC_THRESHOLD) {
        enhanced.currentTime = masterTime;
      }
    }
  }, []);

  // 播放/暂停
  const togglePlay = useCallback(async () => {
    const original = originalVideoRef.current;
    const enhanced = enhancedVideoRef.current;

    if (original && enhanced) {
      if (isPlaying) {
        original.pause();
        enhanced.pause();
        setIsPlaying(false);
      } else {
        try {
          await Promise.all([original.play(), enhanced.play()]);
          setIsPlaying(true);
        } catch (error) {
          console.error('Play error:', error);
        }
      }
    }
  }, [isPlaying]);

  // 时间更新处理
  const handleTimeUpdate = useCallback(() => {
    const original = originalVideoRef.current;
    if (original) {
      setCurrentTime(original.currentTime);
      syncVideos(original.currentTime);
    }
  }, [syncVideos]);

  // 时长更新
  const handleDurationChange = useCallback(() => {
    const original = originalVideoRef.current;
    if (original) {
      setDuration(original.duration);
    }
  }, []);

  // 进度条点击
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    const original = originalVideoRef.current;
    const enhanced = enhancedVideoRef.current;

    if (original) original.currentTime = newTime;
    if (enhanced) enhanced.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // 监听 ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        onClose?.();
      }
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, togglePlay]);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" ref={containerRef}>
      {/* 内容容器 - 使用更大的宽度以获得更好的观看体验 */}
      <div className="w-full max-w-[95vw] max-h-[95vh] flex flex-col bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-800/80 border-b border-gray-700">
          <h2 className="text-white text-lg font-semibold">并排播放对比</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 视频区域 */}
        <div className="flex-1 flex gap-6 p-3 min-h-0">
          {/* 原视频 */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="text-white text-center mb-2 font-medium text-sm">原视频</div>
            <div 
              className="flex-1 bg-black rounded-lg overflow-hidden relative cursor-pointer group"
              style={{ maxHeight: '78vh' }}
              onClick={togglePlay}
            >
              <video
                ref={originalVideoRef}
                src={originalSrc}
                className="w-full h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={handleDurationChange}
                playsInline
              />
              {/* 中央播放按钮覆盖层 */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                  <div className="w-16 h-16 bg-blue-600/90 rounded-full flex items-center justify-center shadow-2xl">
                    <svg className="w-8 h-8 ml-1 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              )}
              {/* 独立音量控制 */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-2 py-1" onClick={e => e.stopPropagation()}>
                <span className="text-white text-xs">音量</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={originalVolume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setOriginalVolume(vol);
                    if (originalVideoRef.current) {
                      originalVideoRef.current.volume = vol;
                    }
                  }}
                  className="w-14 accent-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 增强后视频 */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="text-white text-center mb-2 font-medium text-sm">增强后视频</div>
            <div 
              className="flex-1 bg-black rounded-lg overflow-hidden relative cursor-pointer group"
              style={{ maxHeight: '78vh' }}
              onClick={togglePlay}
            >
              <video
                ref={enhancedVideoRef}
                src={enhancedSrc}
                className="w-full h-full object-contain"
                playsInline
              />
              {/* 中央播放按钮覆盖层 */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                  <div className="w-16 h-16 bg-blue-600/90 rounded-full flex items-center justify-center shadow-2xl">
                    <svg className="w-8 h-8 ml-1 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              )}
              {/* 独立音量控制 */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-2 py-1" onClick={e => e.stopPropagation()}>
                <span className="text-white text-xs">音量</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={enhancedVolume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setEnhancedVolume(vol);
                    if (enhancedVideoRef.current) {
                      enhancedVideoRef.current.volume = vol;
                    }
                  }}
                  className="w-14 accent-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 控制条 */}
        <div className="px-6 py-4 bg-gray-800/80 border-t border-gray-700">
          {/* 进度条 */}
          <div
            className="h-1.5 bg-gray-600 rounded-full cursor-pointer mb-4 relative group"
            onClick={handleSeek}
          >
            <div
              className="absolute h-full bg-blue-500 rounded-full"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
            <div
              className="absolute w-3 h-3 bg-white rounded-full top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
              style={{ left: `calc(${(currentTime / duration) * 100}% - 6px)` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* 播放/暂停 */}
              <button
                onClick={togglePlay}
                className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded-full text-white transition-colors shadow-lg"
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* 时间 */}
              <span className="text-white text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* 全屏按钮 */}
            <button
              onClick={toggleFullscreen}
              className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SideBySidePlayer;
