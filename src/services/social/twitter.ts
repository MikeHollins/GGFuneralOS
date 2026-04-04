import 'dotenv/config';
import * as crypto from 'crypto';

const API_KEY = process.env.TWITTER_API_KEY;
const API_SECRET = process.env.TWITTER_API_SECRET;
const ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const ACCESS_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

/**
 * Twitter/X API v2 — tweet posting with OAuth 1.0a.
 */

export async function publishToTwitter(content: string): Promise<string | undefined> {
  if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET) {
    console.log('[twitter] Not configured — skipping');
    return undefined;
  }

  try {
    // Twitter API v2 requires OAuth 1.0a for user-context tweets
    const url = 'https://api.twitter.com/2/tweets';
    const method = 'POST';
    const body = JSON.stringify({ text: content.slice(0, 280) });

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: API_KEY,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: String(Math.floor(Date.now() / 1000)),
      oauth_token: ACCESS_TOKEN,
      oauth_version: '1.0',
    };

    // Build signature base string
    const sortedParams = Object.entries(oauthParams).sort(([a], [b]) => a.localeCompare(b));
    const paramString = sortedParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(API_SECRET)}&${encodeURIComponent(ACCESS_SECRET)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

    oauthParams.oauth_signature = signature;

    const authHeader = 'OAuth ' + Object.entries(oauthParams)
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ');

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json();
    if (!res.ok) throw new Error(data.detail || data.title || JSON.stringify(data));

    console.log(`[twitter] Tweet published: ${data.data?.id}`);
    return data.data?.id;
  } catch (err: any) {
    console.error(`[twitter] Publish failed: ${err.message}`);
    throw err;
  }
}
