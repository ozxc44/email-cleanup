import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

/**
 * 扫描 Gmail 邮件，识别订阅邮件
 * @param {Object} credentials - OAuth 凭证
 * @returns {Array} 订阅列表
 */
export async function scanSubscriptions(credentials) {
  const auth = getAuthenticatedClient(credentials);
  const gmail = google.gmail({ version: 'v1', auth });

  // 搜索最近 30 天的邮件
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const query = `after:${thirtyDaysAgo.getTime() / 1000}`;

  try {
    // 分批获取邮件
    const subscriptions = new Map();
    let pageToken = null;
    let scannedCount = 0;

    do {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 500,
        pageToken
      });

      const messages = response.data.messages || [];
      scannedCount += messages.length;

      // 获取每封邮件的详情
      for (const message of messages) {
        try {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe']
          });

          const headers = msg.data.payload.headers;
          const fromHeader = getHeader(headers, 'From');
          const unsubscribeHeader = getHeader(headers, 'List-Unsubscribe');
          const dateHeader = getHeader(headers, 'Date');

          if (!fromHeader) continue;

          // 解析发件人信息
          const sender = parseSender(fromHeader);
          const hasUnsubscribe = unsubscribeHeader && (
            unsubscribeHeader.includes('<') ||
            unsubscribeHeader.includes('http')
          );

          // 只保留有退订选项的邮件
          if (hasUnsubscribe) {
            const key = sender.email;

            if (!subscriptions.has(key)) {
              subscriptions.set(key, {
                id: generateId(),
                name: sender.name || sender.email,
                email: sender.email,
                unsubscribeUrl: extractUnsubscribeUrl(unsubscribeHeader),
                unsubscribeMethod: unsubscribeHeader?.includes('<mailto:')
                  ? 'email'
                  : 'url',
                frequency: 0,
                lastEmail: new Date(dateHeader).getTime(),
                emails: []
              });
            }

            const sub = subscriptions.get(key);
            sub.frequency++;
            sub.emails.push({
              id: message.id,
              subject: getHeader(headers, 'Subject'),
              date: new Date(dateHeader).getTime()
            });
          }
        } catch (error) {
          console.error(`Error fetching message ${message.id}:`, error.message);
        }
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken && scannedCount < 5000); // 最多扫描 5000 封

    // 转换为数组并计算频率标签
    const results = Array.from(subscriptions.values()).map(sub => ({
      ...sub,
      frequencyLabel: getFrequencyLabel(sub.frequency),
      lastEmailLabel: getTimeAgo(sub.lastEmail)
    }));

    // 按频率排序
    results.sort((a, b) => b.frequency - a.frequency);

    return results;
  } catch (error) {
    console.error('Scan error:', error);
    throw new Error('Failed to scan emails: ' + error.message);
  }
}

/**
 * 获取邮件头
 */
function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

/**
 * 解析发件人信息
 */
function parseSender(from) {
  // 格式: "Name <email@domain.com>" 或 email@domain.com
  const match = from.match(/^(.*?)\s*<([^>]+)>$/) || [null, '', from];
  return {
    name: match[1]?.replace(/"/g, '').trim(),
    email: match[2]?.trim().toLowerCase()
  };
}

/**
 * 提取退订 URL
 */
function extractUnsubscribeUrl(header) {
  if (!header) return null;

  // 提取 URL
  const urlMatch = header.match(/<https?:\/\/[^>]+>/);
  if (urlMatch) {
    return urlMatch[1].replace(/[<>]/g, '');
  }

  // 提取 mailto 链接
  const mailtoMatch = header.match(/<mailto:([^>]+)>/);
  if (mailtoMatch) {
    return mailtoMatch[1].replace(/[<>]/g, '');
  }

  return null;
}

/**
 * 根据数量返回频率标签
 */
function getFrequencyLabel(count) {
  if (count >= 20) return '每天';
  if (count >= 8) return '每周';
  if (count >= 2) return '每月';
  return '偶尔';
}

/**
 * 返回相对时间标签
 */
function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 3600) {
    const hours = Math.floor(seconds / 60);
    return `${hours} 分钟前`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} 小时前`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days} 天前`;
  }
  if (seconds < 2592000) {
    const weeks = Math.floor(seconds / 604800);
    return `${weeks} 周前`;
  }
  const months = Math.floor(seconds / 2592000);
  return `${months} 月前`;
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}
