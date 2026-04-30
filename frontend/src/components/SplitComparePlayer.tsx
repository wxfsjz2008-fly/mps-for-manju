import { useRef, useCallback, useState, useEffect, type MouseEvent } from 'react';

interface SplitComparePlayerProps {
  originalSrc: string;
  enhancedSrc: string;
  onClose?: () => void;
}

export const SplitComparePlayer = ({
  originalSrc,
  enhancedSrc,
  onClose,
}: SplitComparePlayerProps) => {
  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const enhancedVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [splitPosition, setSplitPosition] = useState(50); // 分割线位置百分比
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(0.5);

  // 同步阈值（毫秒）
  const SYNC_THRESHOLD = 100;

  // 同步两个视频
  const syncVideos = useCallback((masterTime: number) => {
    const original = originalVideoRef.current;
    const enhanced = enhancedVideoRef.current;

    if (original && enhanced) {
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
  const handleSeek = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    const original = originalVideoRef.current;
    const enhanced = enhancedVideoRef.current;

    if (original) original.currentTime = newTime;
    if (enhanced) enhanced.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // 分割线拖拽开始
  const handleDragStart = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // 分割线拖拽
  const handleDrag = useCallback((e: globalThis.MouseEvent) => {
    if (!isDragging || !videoContainerRef.current) return;

    const rect = videoContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(10, Math.min(90, (x / rect.width) * 100));
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

  // 音量控制
  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    if (originalVideoRef.current) originalVideoRef.current.volume = newVolume;
    if (enhancedVideoRef.current) enhancedVideoRef.current.volume = 0; // 只播放原视频的声音
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
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col" ref={containerRef}>
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 bg-black/50">
        <h2 className="text-white text-lg font-semibold">同屏对比播放</h2>
        <button
          onClick={onClose}
          className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 视频对比区域 */}
      <div className="flex-1 p-4">
        <div
          ref={videoContainerRef}
          className="relative w-full h-full bg-black rounded-lg overflow-hidden"
        >
          {/* 增强后视频（底层，完整显示） */}
          <video
            ref={enhancedVideoRef}
            src={enhancedSrc}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            muted
          />

          {/* 原视频（上层，通过 clip-path 裁剪） */}
          <video
            ref={originalVideoRef}
            src={originalSrc}
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              clipPath: `inset(0 ${100 - splitPosition}% 0 0)`,
            }}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            playsInline
          />

          {/* 分割线 */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10 select-none"
            style={{ left: `${splitPosition}%`, transform: 'translateX(-50%)' }}
            onMouseDown={handleDragStart}
          >
            {/* 拖拽手柄 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l-4-7 4-7zm8 0v14l4-7-4-7z"/>
              </svg>
            </div>
          </div>

          {/* 标签 */}
          <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
            原视频
          </div>
          <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
            增强后
          </div>
        </div>
      </div>

      {/* 控制条 */}
      <div className="p-4 bg-black/50">
        {/* 进度条 */}
        <div
          className="h-2 bg-white/30 rounded-full cursor-pointer mb-4 relative group"
          onClick={handleSeek}
        >
          <div
            className="absolute h-full bg-blue-500 rounded-full"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          <div
            className="absolute w-4 h-4 bg-white rounded-full top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            style={{ left: `calc(${(currentTime / duration) * 100}% - 8px)` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* 播放/暂停 */}
            <button
              onClick={togglePlay}
              className="w-12 h-12 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            {/* 音量 */}
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-24 accent-blue-500"
              />
            </div>

            {/* 时间 */}
            <span className="text-white">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 分割位置指示 */}
            <span className="text-white/60 text-sm">
              分割: {Math.round(splitPosition)}%
            </span>

            {/* 全屏按钮 */}
            <button
              onClick={toggleFullscreen}
              className="text-white hover:bg-white/20 p-2 rounded transition-colors"
            >
              {isFullscreen ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
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

export default SplitComparePlayer;
