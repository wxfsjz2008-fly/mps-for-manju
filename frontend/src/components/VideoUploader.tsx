import { useCallback, useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import COS from 'cos-js-sdk-v5';
import { uploadApi, taskApi, mpsApi } from '../services/api';
import { ResolutionSelector } from './ResolutionSelector';
import { DEFAULT_TEMPLATE_ID, RESOLUTION_TEMPLATES } from '../config/templates';

interface VideoUploaderProps {
  onUploadComplete?: (taskId: string) => void;
  autoEnhance?: boolean;
}

interface UploadProgress {
  percent: number;
  speed: number;
  loaded: number;
  total: number;
}

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi'];
const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export const VideoUploader = ({
  onUploadComplete,
  autoEnhance = true,
}: VideoUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoEnhanceEnabled, setAutoEnhanceEnabled] = useState(autoEnhance);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([DEFAULT_TEMPLATE_ID]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 验证文件
  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return '仅支持 MP4、MOV、AVI 格式的视频文件';
    }
    if (file.size > MAX_SIZE) {
      return '文件大小超过限制（最大 2GB）';
    }
    return null;
  }, []);

  // 处理文件选择
  const handleFileSelect = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);

    // 创建视频预览
    const url = URL.createObjectURL(file);
    setVideoPreview(url);

    // 获取视频时长
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
    };
  }, [validateFile]);

  // 拖拽事件处理
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // 文件输入改变
  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // 上传文件
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);

    try {
      // 1. 获取临时密钥
      console.log('[Upload] Step 1: Getting COS credentials...');
      const credentials = await uploadApi.getCredentials();
      console.log('[Upload] Step 1 completed: Credentials obtained');

      // 2. 生成上传路径
      console.log('[Upload] Step 2: Generating upload key...');
      const { key } = await uploadApi.generateKey(selectedFile.name);
      console.log('[Upload] Step 2 completed: Key =', key);

      // 3. 初始化 COS 客户端
      console.log('[Upload] Step 3: Initializing COS client...');
      const cos = new COS({
        getAuthorization: (_, callback) => {
          callback({
            TmpSecretId: credentials.credentials.tmpSecretId,
            TmpSecretKey: credentials.credentials.tmpSecretKey,
            SecurityToken: credentials.credentials.sessionToken,
            StartTime: credentials.startTime,
            ExpiredTime: credentials.expiredTime,
          });
        },
      });

      // 4. 分片上传
      console.log('[Upload] Step 4: Starting COS upload...');
      await new Promise<void>((resolve, reject) => {
        cos.uploadFile({
          Bucket: credentials.bucket,
          Region: credentials.region,
          Key: key,
          Body: selectedFile,
          SliceSize: 5 * 1024 * 1024, // 5MB 分片
          onProgress: (progressData) => {
            setProgress({
              percent: Math.round(progressData.percent * 100),
              speed: progressData.speed,
              loaded: progressData.loaded,
              total: progressData.total,
            });
          },
        }, (err) => {
          if (err) {
            console.error('[Upload] Step 4 failed:', err);
            reject(err);
          } else {
            console.log('[Upload] Step 4 completed: File uploaded to COS');
            resolve();
          }
        });
      });

      // 5. 通知服务端上传完成
      console.log('[Upload] Step 5: Notifying server upload complete...');
      const uploadResult = await uploadApi.completeUpload(key, selectedFile.name, selectedFile.size);
      console.log('[Upload] Step 5 completed:', uploadResult);

      // 6. 根据选中的模板数量创建任务
      console.log('[Upload] Step 6: Creating tasks...', { autoEnhanceEnabled, selectedTemplateIds });
      const createdTaskIds: string[] = [];
      
      if (autoEnhanceEnabled && selectedTemplateIds.length > 0) {
        // 为每个选中的模板创建独立的任务
        for (const templateId of selectedTemplateIds) {
          // 获取模板信息
          const template = RESOLUTION_TEMPLATES.find(t => t.id === templateId);
          const templateName = template?.label || `模板 ${templateId}`;
          
          console.log('[Upload] Creating task for template:', { templateId, templateName });
          
          // 创建任务（带模板信息）
          const task = await taskApi.create(
            uploadResult.url,
            selectedFile.name,
            selectedFile.size,
            templateId,
            templateName
          );
          console.log('[Upload] Task created:', task.id);
          
          // 提交 MPS 任务
          console.log('[Upload] Submitting MPS task...');
          await mpsApi.submit(task.id, templateId);
          console.log('[Upload] MPS task submitted for task:', task.id);
          
          createdTaskIds.push(task.id);
        }
      } else {
        // 不自动增强时，只创建一个任务（不带模板信息）
        console.log('[Upload] Creating task without auto-enhance...');
        const task = await taskApi.create(uploadResult.url, selectedFile.name, selectedFile.size);
        console.log('[Upload] Task created:', task.id);
        createdTaskIds.push(task.id);
      }

      // 7. 回调 - 返回第一个任务的 ID（或者可以返回所有任务 ID）
      console.log('[Upload] Step 7: All tasks created, IDs:', createdTaskIds);
      if (createdTaskIds.length > 0) {
        console.log('[Upload] Calling onUploadComplete with taskId:', createdTaskIds[0]);
        onUploadComplete?.(createdTaskIds[0]);
      }

      // 重置状态
      setSelectedFile(null);
      setVideoPreview(null);
      setVideoDuration(null);
      setProgress(null);
    } catch (err) {
      console.error('[Upload] Error occurred:', err);
      const errorMessage = err instanceof Error ? err.message : '上传失败，请重试';
      console.error('[Upload] Error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, autoEnhanceEnabled, selectedTemplateIds, onUploadComplete]);

  // 取消选择
  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setVideoPreview(null);
    setVideoDuration(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* 上传区域 */}
      {!selectedFile && !uploading && (
        <div
          className={`upload-dropzone border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            isDragging ? 'dragover border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi"
            className="hidden"
            onChange={handleInputChange}
          />
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            拖拽视频文件到此处
          </h3>
          <p className="text-gray-500 mb-4">或点击选择文件</p>
          <p className="text-sm text-gray-400">
            支持 MP4、MOV、AVI 格式，最大 2GB
          </p>
        </div>
      )}

      {/* 文件预览 */}
      {selectedFile && !uploading && (
        <div className="border rounded-xl p-6 bg-white shadow-sm">
          <div className="flex gap-6">
            {/* 视频预览 */}
            {videoPreview && (
              <div className="w-48 h-32 bg-black rounded-lg overflow-hidden flex-shrink-0">
                <video
                  ref={videoRef}
                  src={videoPreview}
                  className="w-full h-full object-contain"
                  muted
                />
              </div>
            )}

            {/* 文件信息 */}
            <div className="flex-1">
              <h4 className="font-semibold text-gray-800 mb-2 truncate" title={selectedFile.name}>
                {selectedFile.name}
              </h4>
              <div className="text-sm text-gray-500 space-y-1">
                <p>大小: {formatSize(selectedFile.size)}</p>
                {videoDuration && <p>时长: {formatDuration(videoDuration)}</p>}
              </div>
            </div>
          </div>

          {/* 自动增强选项 */}
          <div className="mt-4 pt-4 border-t">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoEnhanceEnabled}
                onChange={(e) => setAutoEnhanceEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-gray-700">上传后自动开始增强处理</span>
            </label>

            {/* 分辨率选择器 - 仅在开启自动增强时显示 */}
            {autoEnhanceEnabled && (
              <div className="mt-4 pl-6">
                <ResolutionSelector
                  value={selectedTemplateIds}
                  onChange={setSelectedTemplateIds}
                />
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleUpload}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              开始上传
            </button>
            <button
              onClick={handleCancel}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 上传进度 */}
      {uploading && progress && (
        <div className="border rounded-xl p-6 bg-white shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-2xl">📤</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-800">
                正在上传: {selectedFile?.name}
              </h4>
              <p className="text-sm text-gray-500">
                {formatSize(progress.loaded)} / {formatSize(progress.total)}
              </p>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {progress.percent}%
            </div>
          </div>

          {/* 进度条 */}
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          {progress.speed > 0 && (
            <p className="mt-2 text-sm text-gray-500 text-right">
              速度: {formatSize(progress.speed)}/s
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoUploader;
