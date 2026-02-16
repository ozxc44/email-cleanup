#!/bin/bash
# ==============================================
# Email Cleanup Tool - 部署脚本
# 目标服务器: 腾讯云轻量应用服务器 (139.199.2.76)
# 域名: www.zhuzeyang.xyz
# ==============================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 服务器配置
SERVER_HOST="139.199.2.76"
SERVER_USER="root"  # 根据实际情况修改
APP_NAME="email-cleanup"
DEPLOY_PATH="/root/apps/$APP_NAME"
PORT=3000

# echo 工具函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ==============================================
# 1. 检查本地环境
# ==============================================
log_info "Step 1: 检查本地环境..."

if [ ! -f "package.json" ]; then
    log_error "请在项目根目录运行此脚本"
    exit 1
fi

# 检查 SSH 连接
log_info "测试 SSH 连接..."
if ! ssh -o ConnectTimeout=5 ${SERVER_USER}@${SERVER_HOST} "echo 'SSH 连接成功'" 2>/dev/null; then
    log_error "SSH 连接失败，请检查:"
    echo "  - 服务器地址: $SERVER_HOST"
    echo "  - 用户名: $SERVER_USER"
    echo "  - SSH 密钥是否配置"
    exit 1
fi

# ==============================================
# 2. 在服务器上准备环境
# ==============================================
log_info "Step 2: 准备服务器环境..."

ssh ${SERVER_USER}@${SERVER_HOST} << 'ENDSSH'
set -e

echo "检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "Node.js 未安装，正在安装..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "检查 PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "PM2 未安装，正在安装..."
    npm install -g pm2
fi

echo "创建应用目录..."
mkdir -p /root/apps/email-cleanup

ENDSSH

# ==============================================
# 3. 上传代码
# ==============================================
log_info "Step 3: 上传代码..."

# 创建临时打包目录
TEMP_DIR=$(mktemp -d)
echo "临时目录: $TEMP_DIR"

# 复制必要文件
mkdir -p "$TEMP_DIR/src"
cp package.json "$TEMP_DIR/"
cp src/*.js "$TEMP_DIR/src/"
cp -r src/public "$TEMP_DIR/src/" 2>/dev/null || true

# 上传到服务器
log_info "通过 SCP 上传文件..."
scp -r "$TEMP_DIR"/* ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/

# 清理临时目录
rm -rf "$TEMP_DIR"

# ==============================================
# 4. 安装依赖
# ==============================================
log_info "Step 4: 安装服务器依赖..."

ssh ${SERVER_USER}@${SERVER_HOST} << ENDSSH
cd ${DEPLOY_PATH}

# 安装生产依赖
npm install --production

ENDSSH

# ==============================================
# 5. 配置环境变量
# ==============================================
log_info "Step 5: 检查环境变量..."

ssh ${SERVER_USER}@${SERVER_HOST} << ENDSSH
cd ${DEPLOY_PATH}

if [ ! -f .env ]; then
    echo "创建 .env 文件模板..."
    cat > .env << 'EOF'
# Server
PORT=3000
NODE_ENV=production

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=https://www.zhuzeyang.xyz/auth/callback

# Session
SESSION_SECRET=$(openssl rand -base64 32)
EOF
    echo "请手动编辑 .env 文件，填入正确的 Google OAuth 凭证"
    echo "文件位置: ${DEPLOY_PATH}/.env"
else
    echo ".env 文件已存在，跳过创建"
fi

ENDSSH

# ==============================================
# 6. 配置 PM2
# ==============================================
log_info "Step 6: 配置 PM2..."

ssh ${SERVER_USER}@${SERVER_HOST} << ENDSSH
cd ${DEPLOY_PATH}

# 创建 PM2 配置文件
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'email-cleanup',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# 创建日志目录
mkdir -p logs

ENDSSH

# ==============================================
# 7. 启动/重启应用
# ==============================================
log_info "Step 7: 启动应用..."

ssh ${SERVER_USER}@${SERVER_HOST} << ENDSSH
cd ${DEPLOY_PATH}

# 停止旧进程（如果存在）
if pm2 describe email-cleanup &> /dev/null; then
    echo "重启现有应用..."
    pm2 restart email-cleanup
else
    echo "启动新应用..."
    pm2 start ecosystem.config.js
fi

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup | tail -n 1 | sudo bash || true

# 显示状态
pm2 status

ENDSSH

# ==============================================
# 8. 配置 Nginx 反向代理
# ==============================================
log_info "Step 8: 配置 Nginx..."

ssh ${SERVER_USER}@${SERVER_HOST} << 'ENDSSH'

# 创建 Nginx 配置
cat > /etc/nginx/sites-available/email-cleanup << 'EOF'
server {
    listen 80;
    server_name www.zhuzeyang.xyz zhuzeyang.xyz;

    # 日志
    access_log /var/log/nginx/email-cleanup-access.log;
    error_log /var/log/nginx/email-cleanup-error.log;

    # 反向代理
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 健康检查
    location /health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}
EOF

# 启用站点
ln -sf /etc/nginx/sites-available/email-cleanup /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重新加载 Nginx
systemctl reload nginx

ENDSSH

# ==============================================
# 部署完成
# ==============================================
log_info "========================================"
log_info "部署完成!"
log_info "========================================"
echo ""
echo "应用信息:"
echo "  URL: http://www.zhuzeyang.xyz"
echo "  健康检查: http://www.zhuzeyang.xyz/health"
echo ""
echo "重要操作:"
echo "  1. SSH 登录服务器: ssh ${SERVER_USER}@${SERVER_HOST}"
echo "  2. 编辑环境变量: vi ${DEPLOY_PATH}/.env"
echo "  3. 重启应用: pm2 restart email-cleanup"
echo "  4. 查看日志: pm2 logs email-cleanup"
echo "  5. 查看状态: pm2 status"
echo ""
log_warn "请确保已在 Google Cloud Console 配置以下 OAuth 重定向 URI:"
echo "  https://www.zhuzeyang.xyz/auth/callback"
echo ""
