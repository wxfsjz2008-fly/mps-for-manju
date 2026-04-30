import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { taskApi, mpsApi, uploadApi } from '../services/api';
import type { Task, TaskStatus } from '../types';
import SideBySidePlayer from '../components/SideBySidePlayer';
import SplitComparePlayer from '../components/SplitComparePlayer';

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '等待中',
  uploading: '上传中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  uploading: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

type CompareMode = 'none' | 'side-by-side' | 'split';
type DownloadStatus = 'idle' | 'preparing' | 'downloading' | 'error';

// 签名 URL 缓存，包含 URL 和过期时间
interface SignedUrlCache {
  url: string;
  expiresAt: number;
}

export const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>('none');
  const [notification, setNotification] = useState<string | null>(null);
  
  // 签名 URL 状态
  const [signedOriginalUrl, setSignedOriginalUrl] = useState<SignedUrlCache | null>(null);
  const [signedOutputUrl, setSignedOutputUrl] = useState<SignedUrlCache | null>(null);
  const [loadingSignedUrls, setLoadingSignedUrls] = useState(false);
  
  // 下载状态
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // 加载任务详情
  const loadTask = useCallback(async () => {
    if (!id) return;
    
    try {
      setError(null);
      let taskData = await taskApi.getDetail(id);
      
      // 如果任务正在处理中，主动查询 MPS 状态来更新进度
      if (taskData.status === 'processing') {
        try {
          const mpsStatus = await mpsApi.getStatus(id);
          // MPS 状态查询会在后端更新数据库，重新获取最新数据
          taskData = await taskApi.getDetail(id);
        } catch (mpsErr) {
          console.warn('Failed to get MPS status:', mpsErr);
        }
      }
      
      // 检查是否刚完成
      if (task?.status === 'processing' && taskData.status === 'completed') {
        setNotification('🎉 视频增强已完成！');
        setTimeout(() => setNotification(null), 5000);
      }
      
      setTask(taskData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, task?.status]);

  useEffect(() => {
    loadTask();
  }, [id]);

  // 获取签名 URL
  const loadSignedUrls = useCallback(async (taskData: Task) => {
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 提前 5 分钟刷新

    try {
      setLoadingSignedUrls(true);

      // 获取原视频签名 URL
      if (taskData.original_video_url) {
        if (!signedOriginalUrl || now >= signedOriginalUrl.expiresAt - bufferTime) {
          const { signedUrl, expires } = await uploadApi.getSignedUrl(taskData.original_video_url);
          setSignedOriginalUrl({
            url: signedUrl,
            expiresAt: now + expires * 1000,
          });
        }
      }

      // 获取输出视频签名 URL
      if (taskData.output_video_url) {
        if (!signedOutputUrl || now >= signedOutputUrl.expiresAt - bufferTime) {
          try {
            const { signedUrl, expires } = await uploadApi.getSignedUrl(taskData.output_video_url);
            setSignedOutputUrl({
              url: signedUrl,
              expiresAt: now + expires * 1000,
            });
          } catch (outputErr) {
            console.error('Failed to get signed URL for output video:', outputErr);
          }
        }
      }
    } catch (err) {
      console.error('Failed to get signed URLs:', err);
    } finally {
      setLoadingSignedUrls(false);
    }
  }, [signedOriginalUrl, signedOutputUrl]);

  // 当任务加载完成后获取签名 URL
  useEffect(() => {
    if (task) {
      loadSignedUrls(task);
    }
  }, [task?.original_video_url, task?.output_video_url]);

  // 自动刷新处理中的任务
  useEffect(() => {
    if (task?.status !== 'processing' && task?.status !== 'pending') return;

    const interval = setInterval(loadTask, 5000);
    return () => clearInterval(interval);
  }, [task?.status, loadTask]);

  // 手动触发增强
  const handleStartEnhance = async () => {
    if (!task) return;
    
    try {
      await mpsApi.submit(task.id);
      await loadTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交任务失败');
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  // 格式化文件大小
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // 生成下载文件名：原文件名_增强.扩展名
  const getDownloadFilename = (originalName: string): string => {
    const lastDotIndex = originalName.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return `${originalName}_增强`;
    }
    const nameWithoutExt = originalName.substring(0, lastDotIndex);
    const ext = originalName.substring(lastDotIndex);
    return `${nameWithoutExt}_增强${ext}`;
  };

  // 处理下载增强后视频
  const handleDownload = async () => {
    if (!task || !task.output_video_url) return;

    try {
      setDownloadStatus('preparing');
      setDownloadError(null);

      // 生成下载文件名
      const downloadFilename = getDownloadFilename(task.original_video_name);

      // 获取下载 URL
      const { downloadUrl } = await uploadApi.getDownloadUrl(
        task.output_video_url,
        downloadFilename
      );

      setDownloadStatus('downloading');

      // 创建隐藏的 <a> 标签触发下载
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = downloadFilename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 延迟重置状态，让用户看到下载已开始的提示
      setTimeout(() => {
        setDownloadStatus('idle');
      }, 2000);

    } catch (err) {
      console.error('Download failed:', err);
      setDownloadStatus('error');
      setDownloadError(err instanceof Error ? err.message : '下载失败，请重试');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-500">加载中...</div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <div className="text-xl text-gray-700 mb-4">{error || '任务不存在'}</div>
          <button
            onClick={() => navigate('/tasks')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 通知提示 */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg animate-pulse">
          {notification}
        </div>
      )}

      {/* 头部导航 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/tasks')}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← 返回列表
            </button>
            <h1 className="text-xl font-bold text-gray-900">任务详情</h1>
          </div>
          <nav className="flex gap-4">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              上传新视频
            </button>
          </nav>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* 任务信息 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">任务信息</h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500">视频名称</label>
                <div className="font-medium">{task.original_video_name}</div>
              </div>
              
              <div>
                <label className="text-sm text-gray-500">文件大小</label>
                <div className="font-medium">{formatSize(task.original_video_size)}</div>
              </div>

              {task.template_name && (
                <div>
                  <label className="text-sm text-gray-500">转码模板</label>
                  <div className="mt-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {task.template_name}
                    </span>
                  </div>
                </div>
              )}
              
              <div>
                <label className="text-sm text-gray-500">状态</label>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${STATUS_COLORS[task.status]}`}>
                    {STATUS_LABELS[task.status]}
                    {task.status === 'processing' && task.progress !== undefined && (
                      <span className="ml-1">({task.progress}%)</span>
                    )}
                  </span>
                </div>
              </div>

              {task.status === 'processing' && task.progress !== undefined && (
                <div>
                  <label className="text-sm text-gray-500">处理进度</label>
                  <div className="mt-2">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {task.error_message && (
                <div>
                  <label className="text-sm text-gray-500">错误信息</label>
                  <div className="mt-1 text-red-600">{task.error_message}</div>
                </div>
              )}
              
              <div>
                <label className="text-sm text-gray-500">创建时间</label>
                <div className="font-medium">{formatTime(task.created_at)}</div>
              </div>
              
              {task.completed_at && (
                <div>
                  <label className="text-sm text-gray-500">完成时间</label>
                  <div className="font-medium">{formatTime(task.completed_at)}</div>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            {task.status === 'pending' && (
              <button
                onClick={handleStartEnhance}
                className="mt-6 w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                开始增强
              </button>
            )}

            {task.status === 'failed' && (
              <button
                onClick={handleStartEnhance}
                className="mt-6 w-full py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors"
              >
                重新处理
              </button>
            )}
          </div>

          {/* 视频预览 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">视频预览</h2>
            
            {loadingSignedUrls && !signedOriginalUrl && (
              <div className="text-center py-8 text-gray-500">加载视频中...</div>
            )}
            
            <div className="space-y-4">
              {/* 原视频 */}
              <div>
                <label className="text-sm text-gray-500 mb-2 block">原视频</label>
                <div className="bg-black rounded-lg overflow-hidden aspect-video">
                  {signedOriginalUrl ? (
                    <video
                      key={signedOriginalUrl.url}
                      src={signedOriginalUrl.url}
                      controls
                      className="w-full h-full object-contain"
                      playsInline
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      {loadingSignedUrls ? '加载中...' : '无法加载视频'}
                    </div>
                  )}
                </div>
              </div>

              {/* 增强后视频 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm text-gray-500">增强后视频</label>
                  {task.template_name && task.status === 'completed' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                      {task.template_name.includes('4K') || task.template_name.includes('4k') 
                        ? '4K' 
                        : task.template_name.includes('2K') || task.template_name.includes('2k')
                        ? '2K'
                        : task.template_name.includes('1080') 
                        ? '1080P'
                        : task.template_name.includes('720')
                        ? '720P'
                        : task.template_name}
                    </span>
                  )}
                </div>
                <div className="bg-black rounded-lg overflow-hidden aspect-video">
                  {task.output_video_url ? (
                    signedOutputUrl ? (
                      <video
                        key={signedOutputUrl.url}
                        src={signedOutputUrl.url}
                        controls
                        className="w-full h-full object-contain"
                        playsInline
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        {loadingSignedUrls ? '加载中...' : '无法加载视频'}
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-900">
                      {task.status === 'processing' ? (
                        <>
                          <svg className="w-12 h-12 mb-3 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="text-white font-medium">视频增强处理中...</span>
                          {task.progress !== undefined && (
                            <span className="text-blue-400 mt-1">{task.progress}%</span>
                          )}
                        </>
                      ) : task.status === 'pending' ? (
                        <>
                          <span className="text-4xl mb-2">⏳</span>
                          <span className="text-gray-400">等待开始增强</span>
                        </>
                      ) : task.status === 'failed' ? (
                        <>
                          <span className="text-4xl mb-2">❌</span>
                          <span className="text-red-400">增强失败</span>
                        </>
                      ) : (
                        <span className="text-gray-500">暂无增强视频</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 对比播放按钮 */}
        {task.status === 'completed' && task.output_video_url && (
          <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">效果对比</h2>
            
            <div className="flex gap-4">
              <button
                onClick={() => setCompareMode('side-by-side')}
                className="flex-1 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
              >
                <span className="text-2xl">⚡</span>
                <span>并排播放对比</span>
              </button>
              
              <button
                onClick={() => setCompareMode('split')}
                className="flex-1 py-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
              >
                <span className="text-2xl">🔍</span>
                <span>同屏滑动对比</span>
              </button>
            </div>
          </div>
        )}

        {/* 视频下载区块 */}
        {task.status === 'completed' && task.output_video_url && (
          <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">视频下载</h2>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* 文件信息 */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🎬</span>
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {getDownloadFilename(task.original_video_name)}
                  </div>
                  <div className="text-sm text-gray-500">
                    增强后视频 · 点击下载到本地
                  </div>
                </div>
              </div>

              {/* 下载按钮 */}
              <button
                onClick={handleDownload}
                disabled={downloadStatus === 'preparing' || downloadStatus === 'downloading'}
                className={`
                  px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2
                  ${downloadStatus === 'idle' 
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700' 
                    : downloadStatus === 'error'
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'}
                `}
              >
                {downloadStatus === 'idle' && (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>下载视频</span>
                  </>
                )}
                {downloadStatus === 'preparing' && (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>准备下载...</span>
                  </>
                )}
                {downloadStatus === 'downloading' && (
                  <>
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>下载已开始</span>
                  </>
                )}
                {downloadStatus === 'error' && (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>重新下载</span>
                  </>
                )}
              </button>
            </div>

            {/* 错误提示 */}
            {downloadError && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {downloadError}
              </div>
            )}

            {/* 下载提示 */}
            <div className="mt-4 text-sm text-gray-500">
              💡 提示：下载将使用浏览器的下载管理器，大文件可能需要较长时间。
            </div>
          </div>
        )}
      </main>

      {/* 对比播放器 */}
      {compareMode === 'side-by-side' && task.output_video_url && signedOriginalUrl && signedOutputUrl && (
        <SideBySidePlayer
          originalSrc={signedOriginalUrl.url}
          enhancedSrc={signedOutputUrl.url}
          onClose={() => setCompareMode('none')}
        />
      )}

      {compareMode === 'split' && task.output_video_url && signedOriginalUrl && signedOutputUrl && (
        <SplitComparePlayer
          originalSrc={signedOriginalUrl.url}
          enhancedSrc={signedOutputUrl.url}
          onClose={() => setCompareMode('none')}
        />
      )}
    </div>
  );
};

export default TaskDetailPage;
