import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

/**
 * 批量取消订阅
 * @param {Object} credentials - OAuth 凭证
 * @param {Array} subscriptions - 要取消的订阅列表
 * @returns {Array} 处理结果
 */
export async function unsubscribeHandler(credentials, subscriptions) {
  const auth = getAuthenticatedClient(credentials);
  const gmail = google.gmail({ version: 'v1', auth });

  const results = [];

  for (const sub of subscriptions) {
    try {
      if (sub.unsubscribeMethod === 'url' && sub.unsubscribeUrl) {
        // HTTP 方式退订
        const success = await unsubscribeViaUrl(sub.unsubscribeUrl);
        results.push({
          ...sub,
          status: success ? 'success' : 'failed',
          method: 'url'
        });
      } else if (sub.unsubscribeMethod === 'email' && sub.unsubscribeUrl) {
        // 邮件方式退订 - 发送退订邮件
        const success = await unsubscribeViaEmail(gmail, sub);
        results.push({
          ...sub,
          status: success ? 'success' : 'manual',
          method: 'email'
        });
      } else {
        // 需要手动处理
        results.push({
          ...sub,
          status: 'manual',
          method: 'manual'
        });
      }
    } catch (error) {
      console.error(`Unsubscribe error for ${sub.name}:`, error.message);
      results.push({
        ...sub,
        status: 'failed',
        error: error.message
      });
    }
  }

  return results;
}

/**
 * 通过 URL 退订
 */
async function unsubscribeViaUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmailCleanup/1.0)'
      }
    });
    return response.ok || response.status < 400;
  } catch (error) {
    console.error('URL unsubscribe error:', error);
    return false;
  }
}

/**
 * 通过邮件退订
 * 发送退订请求邮件
 */
async function unsubscribeViaEmail(gmail, subscription) {
  try {
    // List-Unsubscribe 邮件头通常是 mailto:address?subject=...
    // 我们构建一封退订邮件
    const to = subscription.unsubscribeUrl.split('?')[0].replace('mailto:', '');
    const subjectMatch = subscription.unsubscribeUrl.match(/subject=([^&]+)/);
    const subject = subjectMatch
      ? decodeURIComponent(subjectMatch[1])
      : 'Unsubscribe';

    // 发送退订邮件
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: Buffer.from(
          `To: ${to}\n` +
          `Subject: ${subject}\n` +
          `Content-Type: text/plain; charset=utf-8\n\n` +
          `Please unsubscribe me from your mailing list.`
        ).toString('base64url')
      }
    });

    return true;
  } catch (error) {
    console.error('Email unsubscribe error:', error);
    return false;
  }
}
