# TKE 部署指南

## 持久化存储配置

本项目使用腾讯云 CBS 云硬盘实现 SQLite 数据库持久化存储，确保 Pod 重启后数据不丢失。

### 文件说明

| 文件 | 说明 |
|------|------|
| `pvc.yaml` | PVC 持久卷配置（StorageClass + PersistentVolumeClaim） |
| `deployment.yaml` | 应用部署配置（已配置卷挂载） |
| `secret.yaml` | 腾讯云密钥配置 |

### 部署步骤

#### 1. 检查集群是否已有 CBS StorageClass

```bash
kubectl get storageclass
```

如果已存在 `cbs-ssd` 或类似的 StorageClass，可以跳过 StorageClass 创建，直接修改 `pvc.yaml` 中的 `storageClassName` 为已有的名称。

#### 2. 创建 PVC（持久卷声明）

```bash
# 如果集群没有 cbs-ssd StorageClass，先创建完整配置
kubectl apply -f k8s/pvc.yaml

# 或者只创建 PVC 部分（如果 StorageClass 已存在）
# 编辑 pvc.yaml，只保留 PersistentVolumeClaim 部分，然后应用
```

#### 3. 验证 PVC 状态

```bash
kubectl get pvc mps-data-pvc
```

状态应为 `Pending`（等待 Pod 调度）或 `Bound`（已绑定）。

> **注意**：由于配置了 `volumeBindingMode: WaitForFirstConsumer`，PVC 会在 Pod 首次调度时才绑定云硬盘。

#### 4. 部署应用

```bash
# 创建 Secret（如果尚未创建）
kubectl apply -f k8s/secret.yaml

# 部署应用
kubectl apply -f k8s/deployment.yaml
```

#### 5. 验证部署

```bash
# 查看 Pod 状态
kubectl get pods -l app=mps-for-manju

# 查看 PVC 是否已绑定
kubectl get pvc mps-data-pvc

# 查看 Pod 详情（检查卷挂载）
kubectl describe pod -l app=mps-for-manju
```

### 验证数据持久化

1. **创建测试数据**：在应用中创建一些任务
2. **删除 Pod**：`kubectl delete pod -l app=mps-for-manju`
3. **等待 Pod 重建**：`kubectl get pods -w`
4. **验证数据**：检查之前创建的任务是否仍然存在

### 常见问题

#### Q: PVC 一直处于 Pending 状态？

**A**: 可能原因：
- StorageClass 不存在或名称不匹配
- 集群没有安装 CBS CSI 插件
- 配额不足

检查命令：
```bash
kubectl describe pvc mps-data-pvc
kubectl get events --field-selector involvedObject.name=mps-data-pvc
```

#### Q: Pod 启动失败，提示卷挂载错误？

**A**: 检查：
1. PVC 是否创建成功
2. PVC 名称是否与 Deployment 中引用的一致
3. namespace 是否一致

#### Q: 如何扩容存储？

**A**: 修改 PVC 的 `spec.resources.requests.storage`：
```bash
kubectl patch pvc mps-data-pvc -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'
```

### 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                        Pod                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │   Container: mps-for-manju                           │    │
│  │                                                       │    │
│  │   /app/backend/data/ ← volumeMount                   │    │
│  │         │                                             │    │
│  └─────────│─────────────────────────────────────────────┘    │
│            │                                                  │
│            ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │   Volume: data-volume                                │    │
│  │   persistentVolumeClaim: mps-data-pvc               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         PVC: mps-data-pvc (10Gi, cbs-ssd)                   │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              腾讯云 CBS 云硬盘 (SSD)                          │
│              数据持久化存储                                   │
└─────────────────────────────────────────────────────────────┘
```

### 注意事项

1. **副本数限制**：CBS 云硬盘只支持 `ReadWriteOnce`（单节点读写），因此 `replicas` 必须保持为 `1`
2. **可用区限制**：CBS 云硬盘与 Pod 必须在同一可用区
3. **数据备份**：建议定期备份重要数据，可使用腾讯云快照功能
