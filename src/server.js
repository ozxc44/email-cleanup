import express from 'express';
import cookieParser from 'cookie-parser';
import { authHandler, authCallback, getAuthUrl } from './auth.js';
import { scanSubscriptions } from './scanner.js';
import { unsubscribeHandler } from './unsubscribe.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(cookieParser());
app.use(express.static(join(__dirname, 'public')));

// 视图引擎（简单模板）
app.set('views', join(__dirname, 'views'));
app.set('view engine', 'html');

// 路由
// 首页 - Landing Page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// 获取授权 URL
app.get('/auth/url', (req, res) => {
  const url = getAuthUrl();
  res.json({ url });
});

// OAuth 回调
app.get('/auth/callback', authCallback);

// 获取用户信息
app.get('/api/user', authHandler, async (req, res) => {
  res.json({
    email: req.user.email,
    connected: true
  });
});

// 扫描订阅
app.get('/api/scan', authHandler, async (req, res) => {
  try {
    const subscriptions = await scanSubscriptions(req.user.credentials);
    res.json({
      success: true,
      count: subscriptions.length,
      subscriptions
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 取消订阅
app.post('/api/unsubscribe', authHandler, async (req, res) => {
  try {
    const { subscriptionIds } = req.body;
    const results = await unsubscribeHandler(req.user.credentials, subscriptionIds);
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 登出
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Email Cleanup Tool running on http://localhost:${PORT}`);
  console.log(`OAuth callback: http://localhost:${PORT}/auth/callback`);
});
