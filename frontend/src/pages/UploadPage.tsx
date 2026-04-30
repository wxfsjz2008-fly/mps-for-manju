import { useNavigate } from 'react-router-dom';
import VideoUploader from '../components/VideoUploader';

export const UploadPage = () => {
  const navigate = useNavigate();

  const handleUploadComplete = (taskId: string) => {
    // 上传完成后跳转到任务详情页
    navigate(`/tasks/${taskId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部导航 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">漫剧视频增强系统</h1>
          <nav className="flex gap-4">
            <button
              onClick={() => navigate('/tasks')}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              任务列表
            </button>
          </nav>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            上传漫剧视频，一键高清增强
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            使用腾讯云 MPS 音视频增强技术，自动提升视频画质，包括超分辨率、去噪、色彩增强等功能。
            支持并排播放和同屏对比，直观展示增强效果。
          </p>
        </div>

        <VideoUploader onUploadComplete={handleUploadComplete} autoEnhance={true} />

        {/* 功能介绍 */}
        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-4xl mb-4">📤</div>
            <h3 className="text-lg font-semibold mb-2">快速上传</h3>
            <p className="text-gray-600 text-sm">
              支持拖拽上传，分片传输，断点续传，大文件也能稳定上传
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-4xl mb-4">✨</div>
            <h3 className="text-lg font-semibold mb-2">AI 增强</h3>
            <p className="text-gray-600 text-sm">
              腾讯云 MPS 音视频增强模板，自动提升画质、去噪、色彩优化
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold mb-2">效果对比</h3>
            <p className="text-gray-600 text-sm">
              并排播放和同屏滑动对比，直观展示增强前后的画质差异
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default UploadPage;
