import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskApi } from '../services/api';
import type { Task, TaskStatus } from '../types';

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

// 轮询间隔（毫秒）
const POLL_INTERVAL = 3000;

export const TaskListPage = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksRef = useRef<Task[]>([]); // 用 ref 存储任务列表，避免依赖问题

  // 同步 tasks 到 ref
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // 刷新处理中任务的状态 - 使用 ref 读取当前任务列表
  const refreshProcessingTasks = useCallback(async () => {
    // 从 ref 读取当前任务列表
    const currentTasks = tasksRef.current;
    
    // 找出所有处理中或等待中的任务
    const processingTaskIds = currentTasks
      .filter(t => t.status === 'processing' || t.status === 'pending')
      .map(t => t.id);

    if (processingTaskIds.length === 0) {
      return;
    }

    try {
      setIsPolling(true);
      const updatedTasks = await taskApi.refreshStatus(processingTaskIds);

      // 更新任务列表中的状态
      setTasks(prevTasks => 
        prevTasks.map(task => {
          if (updatedTasks[task.id]) {
            return updatedTasks[task.id];
          }
          return task;
        })
      );
    } catch (err) {
      console.error('Failed to refresh task status:', err);
    } finally {
      setIsPolling(false);
    }
  }, []); // 不依赖 tasks，通过 ref 读取

  // 加载任务列表，加载完成后立即刷新处理中任务的状态
  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await taskApi.getList(
        filter || undefined,
        page,
        20
      );
      setTasks(result.tasks);
      setTotalPages(result.totalPages);
      
      // 检查是否有处理中的任务，如果有则立即刷新状态
      const hasProcessing = result.tasks.some(
        (t: Task) => t.status === 'processing' || t.status === 'pending'
      );
      if (hasProcessing) {
        // 更新 ref 以便 refreshProcessingTasks 能读取到最新数据
        tasksRef.current = result.tasks;
        // 立即刷新处理中任务的真实状态
        setTimeout(() => refreshProcessingTasks(), 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filter, page, refreshProcessingTasks]);

  // 初始加载任务列表
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 设置轮询以更新处理中任务的状态
  useEffect(() => {
    const hasProcessing = tasks.some(t => t.status === 'processing' || t.status === 'pending');
    
    // 清除之前的轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // 如果有处理中的任务，启动轮询
    if (hasProcessing) {
      pollIntervalRef.current = setInterval(() => {
        refreshProcessingTasks();
      }, POLL_INTERVAL);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [tasks, refreshProcessingTasks]);

  // 格式化时间
  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 格式化文件大小
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部导航 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">任务列表</h1>
          <nav className="flex gap-4">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              上传视频
            </button>
          </nav>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 筛选栏 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => { setFilter(''); setPage(1); }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === '' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => { setFilter('processing'); setPage(1); }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'processing' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              处理中
            </button>
            <button
              onClick={() => { setFilter('completed'); setPage(1); }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'completed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              已完成
            </button>
            <button
              onClick={() => { setFilter('failed'); setPage(1); }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'failed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              失败
            </button>
          </div>

          <button
            onClick={loadTasks}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            disabled={loading}
          >
            {loading ? (
              '加载中...'
            ) : (
              <>
                {isPolling && (
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="正在同步状态..." />
                )}
                🔄 刷新
              </>
            )}
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* 任务列表 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading && tasks.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              加载中...
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-6xl mb-4">📭</div>
              <p>暂无任务</p>
              <button
                onClick={() => navigate('/')}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                上传视频
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">视频名称</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">转码模板</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">大小</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">状态</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">创建时间</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="max-w-xs truncate font-medium text-gray-900" title={task.original_video_name}>
                        {task.original_video_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {task.template_name ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {task.template_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatSize(task.original_video_size)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                        {task.status === 'processing' && task.progress !== undefined && (
                          <span className="ml-1">({task.progress}%)</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatTime(task.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              上一页
            </button>
            <span className="px-4 py-2 text-gray-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              下一页
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default TaskListPage;
