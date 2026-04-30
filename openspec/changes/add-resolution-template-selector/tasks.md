## 1. 前端 - 模版配置定义

- [x] 1.1 创建模版配置常量文件 `frontend/src/config/templates.ts`
  - 定义三个转码模版的配置：ID、名称、描述
  - 设置默认模版为 2K (327006)

## 2. 前端 - 分辨率选择组件

- [x] 2.1 创建 `ResolutionSelector` 组件 (`frontend/src/components/ResolutionSelector.tsx`)
  - 使用单选按钮组展示三个分辨率选项
  - 显示分辨率标签和简要说明
  - 支持 `value` 和 `onChange` props

## 3. 前端 - 集成到上传组件

- [x] 3.1 修改 `VideoUploader` 组件
  - 添加 `selectedTemplateId` state，默认值 327006
  - 在"自动增强"选项下方集成 `ResolutionSelector`
  - 仅当 `autoEnhanceEnabled` 为 true 时显示选择器

- [x] 3.2 修改 API 调用
  - 更新 `mpsApi.submit` 调用，传递 `templateId` 参数

## 4. 前端 - API 服务更新

- [x] 4.1 修改 `frontend/src/services/api.ts` 中的 mpsApi
  - `submit` 方法增加 `templateId` 参数
  - 默认值为 327006

## 5. 后端 - MPS 路由更新

- [x] 5.1 修改 `backend/src/routes/mps.ts` 的 submit 接口
  - 从请求体接收 `templateId` 参数
  - 传递给 MPS 服务

## 6. 后端 - MPS 服务更新

- [x] 6.1 修改 `backend/src/services/mps.ts` 的 `submitEnhanceTask` 函数
  - 增加 `templateId` 参数
  - 使用传入的 `templateId` 替代固定配置
  - 如未传入则使用默认值 327006
