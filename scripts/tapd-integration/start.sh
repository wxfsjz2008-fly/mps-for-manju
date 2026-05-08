#!/bin/bash

# TAPD → CodeBuddy 自动编程启动脚本
# 
# 使用方法:
#   ./start.sh webhook   启动 Webhook 服务
#   ./start.sh cron      启动定时轮询守护进程
#   ./start.sh once      单次检测
#   ./start.sh status    查看状态

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 CodeBuddy CLI 是否安装
check_codebuddy() {
    if ! command -v codebuddy &> /dev/null; then
        log_error "CodeBuddy CLI 未安装"
        echo ""
        echo "请先安装 CodeBuddy CLI:"
        echo "  npm install -g @anthropic-ai/codebuddy"
        echo ""
        echo "或参考官方文档: https://www.codebuddy.cn/docs/zh/cli"
        exit 1
    fi
    
    log_info "CodeBuddy CLI 已安装: $(which codebuddy)"
}

# 检查依赖
check_deps() {
    if [ ! -d "node_modules" ]; then
        log_warn "依赖未安装，正在安装..."
        npm install
    fi
}

# 检查配置
check_config() {
    if [ ! -f ".env" ]; then
        log_error ".env 配置文件不存在"
        echo "请复制 .env.example 并填写配置:"
        echo "  cp .env.example .env"
        exit 1
    fi
    
    # 检查关键配置
    source .env
    
    if [ -z "$TAPD_API_USER" ] || [ -z "$TAPD_API_PASSWORD" ] || [ -z "$TAPD_WORKSPACE_ID" ]; then
        log_error "TAPD API 配置不完整，请检查 .env 文件"
        exit 1
    fi
    
    log_info "配置检查通过"
}

# 启动 Webhook 服务
start_webhook() {
    check_codebuddy
    check_deps
    check_config
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   TAPD Webhook → CodeBuddy 服务${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    source .env
    PORT=${WEBHOOK_PORT:-3000}
    
    log_info "启动 Webhook 服务，端口: $PORT"
    log_info "请在 TAPD 开放平台配置 Webhook URL:"
    echo ""
    echo "  URL: http://YOUR_PUBLIC_IP:$PORT/webhook"
    echo "  事件: story::create"
    echo ""
    log_warn "注意: 需要公网可访问的 IP 或使用内网穿透工具"
    echo ""
    
    npm run webhook
}

# 启动定时轮询守护进程
start_cron() {
    check_codebuddy
    check_deps
    check_config
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   TAPD 定时检测 → CodeBuddy 服务${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    source .env
    INTERVAL=${TAPD_POLL_INTERVAL:-300}
    
    log_info "启动定时检测守护进程"
    log_info "检测间隔: ${INTERVAL} 秒"
    echo ""
    
    npm run cron:daemon
}

# 单次检测
run_once() {
    check_codebuddy
    check_deps
    check_config
    
    log_info "执行单次检测..."
    npm run cron:once
}

# 查看状态
show_status() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   TAPD → CodeBuddy 状态${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # 检查配置
    if [ -f ".env" ]; then
        source .env
        log_info "项目 ID: $TAPD_WORKSPACE_ID"
        log_info "API 配置: ✅"
    else
        log_error "配置文件不存在"
    fi
    
    # 检查数据文件
    echo ""
    if [ -f "data/known-stories.json" ]; then
        count=$(cat data/known-stories.json | grep -o '"id"' | wc -l)
        log_info "已知需求数: $count"
    fi
    
    if [ -f "data/implemented-stories.json" ]; then
        count=$(cat data/implemented-stories.json | grep -o '"storyId"' | wc -l)
        log_info "已实现需求数: $count"
    fi
    
    if [ -f "data/task-queue.json" ]; then
        pending=$(cat data/task-queue.json | grep -o '"status":"pending"' | wc -l)
        log_info "待处理任务: $pending"
    fi
    
    # 检查进程
    echo ""
    if pgrep -f "webhook-server.ts" > /dev/null; then
        log_info "Webhook 服务: 运行中 ✅"
    else
        log_warn "Webhook 服务: 未运行"
    fi
    
    if pgrep -f "cron-trigger.ts" > /dev/null; then
        log_info "定时检测服务: 运行中 ✅"
    else
        log_warn "定时检测服务: 未运行"
    fi
    
    echo ""
}

# 显示帮助
show_help() {
    echo ""
    echo "TAPD → CodeBuddy 自动编程工具"
    echo ""
    echo "用法: ./start.sh <命令>"
    echo ""
    echo "命令:"
    echo "  webhook   启动 Webhook 服务（需要公网可访问）"
    echo "  cron      启动定时轮询守护进程（推荐）"
    echo "  once      单次检测新需求"
    echo "  status    查看运行状态"
    echo "  help      显示此帮助"
    echo ""
    echo "推荐使用方式:"
    echo ""
    echo "  方式一: 守护进程模式（推荐）"
    echo "    ./start.sh cron"
    echo "    # 或使用 nohup 后台运行:"
    echo "    nohup ./start.sh cron > /dev/null 2>&1 &"
    echo ""
    echo "  方式二: 系统 crontab"
    echo "    # 编辑 crontab"
    echo "    crontab -e"
    echo "    # 添加每5分钟检测一次"
    echo "    */5 * * * * cd $SCRIPT_DIR && ./start.sh once >> logs/cron.log 2>&1"
    echo ""
    echo "  方式三: Webhook 模式"
    echo "    ./start.sh webhook"
    echo "    # 需要公网 IP 或内网穿透"
    echo ""
}

# 主程序
case "$1" in
    webhook)
        start_webhook
        ;;
    cron)
        start_cron
        ;;
    once)
        run_once
        ;;
    status)
        show_status
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        log_error "未知命令: $1"
        show_help
        exit 1
        ;;
esac
