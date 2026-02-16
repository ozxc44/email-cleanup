import { google } from 'googleapis';
import { URLSearchParams } from 'url';

// OAuth 2.0 配置
const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback'
);

// 存储会话（生产环境应使用 Redis 等）
const sessions = new Map();

// 生成授权 URL
export function getAuthUrl() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent'
  });
  return authUrl;
}

// 处理 OAuth 回调
export async function authCallback(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const { tokens } = await oauth2Client.getAccessToken(code);
    const sessionId = generateSessionId();

    // 获取用户信息
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // 存储会话
    sessions.set(sessionId, {
      credentials: tokens,
      email: userInfo.email,
      createdAt: Date.now()
    });

    // 设置 cookie 并重定向
    res.cookie('session', sessionId, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 小时
    });

    res.redirect('/?connected=true');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed');
  }
}

// 中间件：验证会话
export function authHandler(req, res, next) {
  const sessionId = req.cookies?.session;

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated'
    });
  }

  const session = sessions.get(sessionId);

  // 检查会话是否过期（24小时）
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(sessionId);
    return res.status(401).json({
      success: false,
      error: 'Session expired'
    });
  }

  req.user = session;
  req.sessionId = sessionId;
  next();
}

// 获取已认证的 OAuth 客户端
export function getAuthenticatedClient(credentials) {
  const client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials(credentials);
  return client;
}

// 生成会话 ID
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export { sessions };
