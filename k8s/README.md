# Kubernetes 部署配置

本目录包含在腾讯云 TKE (Tencent Kubernetes Engine) 上部署 MPS 视频增强系统所需的 Kubernetes 配置文件。

## 架构说明

```
┌─────────────────────────────────────────────────────────────────┐
│                        TKE 集群                                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Deployment (RollingUpdate)                               │   │
│  │                                                           │   │
│  │  ┌─────────────┐    ┌─────────────┐                      │   │
│  │  │   Pod A     │    │   Pod B     │                      │   │
│  │  │  (副本 1)   │    │  (副本 2)   │                      │   │
│  │  └──────┬──────┘    └──────┬──────┘                      │   │
│  │         │                   │                             │   │
│  │         └─────────┬─────────┘                             │   │
│  │                   │                                       │   │
│  └───────────────────┼───────────────────────────────────────┘   │
│                      │                                           │
│                      ▼                                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Service (ClusterIP)                                      │   │
│  │  → 负载均衡到多个 Pod                                     │   │
│  └───────────────────────────────────────────────────────────┘   │
│                      │                                           │
└──────────────────────┼───────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  腾讯云 MySQL (CynosDB)                                          │
│  → 多副本共享数据库                                              │
│  → 支持连接池、高可用                                            │
└─────────────────────────────────────────────────────────────────┘
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `deployment.yaml` | Deployment 和 Service 配置 |
| `secret.yaml.example` | 腾讯云凭证 Secret 模板 |
| `mysql-secret.yaml.example` | MySQL 数据库凭证 Secret 模板 |

## 部署步骤

### 1. 准备腾讯云 MySQL 数据库

1. 登录 [腾讯云 MySQL 控制台](https://console.cloud.tencent.com/cdb)
2. 创建 MySQL 实例（推荐使用 CynosDB MySQL 版，性价比更高）
3. 配置：
   - **规格**：1核1G 即可满足基础需求
   - **网络**：选择与 TKE 集群相同的 VPC
   - **字符集**：utf8mb4
4. 创建数据库 `mps`
5. 记录内网连接地址、端口、用户名和密码

### 2. 创建 Secret

```bash
# 创建腾讯云凭证 Secret
kubectl create secret generic mps-tencent-credentials \
  --from-literal=TENCENT_SECRET_ID='YOUR_SECRET_ID' \
  --from-literal=TENCENT_SECRET_KEY='YOUR_SECRET_KEY' \
  -n default

# 创建 MySQL 凭证 Secret
kubectl create secret generic mps-mysql-credentials \
  --from-literal=MYSQL_HOST='YOUR_MYSQL_HOST' \
  --from-literal=MYSQL_PORT='3306' \
  --from-literal=MYSQL_USER='YOUR_USER' \
  --from-literal=MYSQL_PASSWORD='YOUR_PASSWORD' \
  --from-literal=MYSQL_DATABASE='mps' \
  -n default
```

### 3. 部署应用

```bash
# 部署 Deployment 和 Service
kubectl apply -f deployment.yaml
```

### 4. 验证部署

```bash
# 查看 Pod 状态
kubectl get pods -l app=mps-for-manju

# 查看日志
kubectl logs -l app=mps-for-manju --tail=100

# 测试数据库连接
kubectl exec -it $(kubectl get pod -l app=mps-for-manju -o jsonpath='{.items[0].metadata.name}') -- /bin/sh -c "echo 'SELECT 1' | mysql -h \$MYSQL_HOST -u \$MYSQL_USER -p\$MYSQL_PASSWORD"
```

## 更新部署

使用 RollingUpdate 策略实现零停机更新：

```bash
# 更新镜像版本
kubectl set image deployment/mps-for-manju mps-for-manju=xiongfei-test.tencentcloudcr.com/xiongfei/mps-for-manju:v0502

# 查看更新状态
kubectl rollout status deployment/mps-for-manju

# 回滚到上一版本（如果有问题）
kubectl rollout undo deployment/mps-for-manju
```

## 扩缩容

```bash
# 扩容到 3 个副本
kubectl scale deployment/mps-for-manju --replicas=3

# 缩容到 1 个副本
kubectl scale deployment/mps-for-manju --replicas=1
```

## 对比：SQLite vs MySQL

| 特性 | SQLite + CBS | MySQL |
|------|--------------|-------|
| 多副本支持 | ❌ 不支持 | ✅ 支持 |
| 更新策略 | Recreate（有停机） | RollingUpdate（零停机） |
| 数据持久化 | CBS 云硬盘 | 云数据库 |
| 成本 | 低（CBS ~4元/月） | 中（MySQL ~30元/月） |
| 运维复杂度 | 低 | 中 |
| 适用场景 | 开发/测试/小规模 | 生产环境 |

## 注意事项

1. **VPC 网络**：确保 TKE 集群和 MySQL 实例在同一 VPC 中
2. **安全组**：MySQL 安全组需要允许来自 TKE 节点的连接（3306 端口）
3. **连接池**：应用使用 10 个连接的连接池，MySQL 实例需要支持相应的并发连接数
4. **备份**：建议开启 MySQL 自动备份功能
