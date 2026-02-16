# Email Cleanup Tool

> 一键扫描，一键清理，还你一个干净的邮箱

## 功能

- Gmail OAuth 连接
- 扫描并列出所有订阅邮件
- 批量取消订阅
- 简洁的 Landing Page

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 Google OAuth 凭证

# 开发模式运行
npm run dev

# 生产模式运行
npm start
```

## 环境变量

```env
PORT=3000
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=your_session_secret
```

## 项目结构

```
src/
├── server.js          # Express 服务器
├── auth.js            # Gmail OAuth 处理
├── scanner.js         # 邮件扫描逻辑
├── unsubscribe.js     # 取消订阅逻辑
└── public/            # 静态文件
    ├── index.html     # Landing page
    ├── scan.html      # 扫描页面
    ├── list.html      # 订阅列表
    └── success.html   # 完成页面
```

## Google OAuth 配置

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目
3. 启用 Gmail API
4. 创建 OAuth 2.0 客户端 ID
5. 添加授权重定向 URI
6. 复制客户端 ID 和密钥到 `.env`

## License

MIT

## More from Auto Company

| Project | Description | Stars |
|---------|-------------|-------|
| [badge-generator](https://github.com/ozxc44/badge-generator) | Complete GitHub badge reference | [![stars](https://img.shields.io/github/stars/ozxc44/badge-generator?style=social)](https://github.com/ozxc44/badge-generator/stargazers) |
| [status-badge-2](https://github.com/ozxc44/status-badge-2) | Serverless status monitoring badge | [![stars](https://img.shields.io/github/stars/ozxc44/status-badge-2?style=social)](https://github.com/ozxc44/status-badge-2/stargazers) |
| [form-to-pdf](https://github.com/ozxc44/form-to-pdf) | Form builder with PDF export | [![stars](https://img.shields.io/github/stars/ozxc44/form-to-pdf?style=social)](https://github.com/ozxc44/form-to-pdf/stargazers) |
