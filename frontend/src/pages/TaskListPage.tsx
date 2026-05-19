import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
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
  const { logout, username } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksRef = useRef<Task[]>([]); // 用 ref 存储任务列表，避免依赖问题

  // 选中的任务（用于批量删除）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'batch'; id?: string } | null>(null);

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
      setSelectedIds(new Set()); // 清空选中
      
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

  // 切换选中状态
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map(t => t.id)));
    }
  };

  // 删除单个任务
  const handleDelete = (id: string) => {
    setDeleteTarget({ type: 'single', id });
    setShowDeleteConfirm(true);
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteTarget({ type: 'batch' });
    setShowDeleteConfirm(true);
  };

  // 确认删除
  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setDeleting(true);
      if (deleteTarget.type === 'single' && deleteTarget.id) {
        await taskApi.delete(deleteTarget.id);
      } else if (deleteTarget.type === 'batch') {
        await taskApi.batchDelete(Array.from(selectedIds));
      }
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  // 退出登录
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部导航 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">任务列表</h1>
          <nav className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              上传视频
            </button>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-sm">{username}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                退出
              </button>
            </div>
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

          <div className="flex items-center gap-4">
            {/* 批量删除按钮 */}
            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                删除选中 ({selectedIds.size})
              </button>
            )}

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
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === tasks.length && tasks.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  </th>
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
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onChange={() => toggleSelect(task.id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </td>
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
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => navigate(`/tasks/${task.id}`)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          查看
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          删除
                        </button>
                      </div>
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

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
            </div>
            <p className="text-gray-600 mb-6">
              {deleteTarget?.type === 'single'
                ? '确定要删除这个任务吗？删除后无法恢复。'
                : `确定要删除选中的 ${selectedIds.size} 个任务吗？删除后无法恢复。`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={deleting}
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskListPage;
