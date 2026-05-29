import { createSign } from 'crypto';
import { readFile } from 'fs/promises';

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type CachedToken = {
  token: string;
  expiresAt: number;
  scope: string;
};

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const GOOGLE_FETCH_ATTEMPTS = 4;

let cachedAccessToken: CachedToken | null = null;

export function hasGoogleServiceAccountConfig() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  );
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function retryDelayMs(attempt: number, response?: Response) {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 10_000);
  }
  return Math.min(500 * 2 ** attempt, 5_000);
}

function shouldRetryGoogleResponse(response: Response) {
  return response.status === 429 || response.status >= 500;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function googleFetch(url: URL | string, init: RequestInit, label: string) {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < GOOGLE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok || !shouldRetryGoogleResponse(response) || attempt === GOOGLE_FETCH_ATTEMPTS - 1) {
        return response;
      }

      lastResponse = response;
      await wait(retryDelayMs(attempt, response));
    } catch (error) {
      lastError = error;
      if (attempt === GOOGLE_FETCH_ATTEMPTS - 1) break;
      await wait(retryDelayMs(attempt));
    }
  }

  if (lastResponse) return lastResponse;
  if (lastError instanceof Error) throw new Error(`${label} failed after retries: ${lastError.message}`);
  throw new Error(`${label} did not return a response`);
}

async function loadCredentials(): Promise<ServiceAccountCredentials> {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const rawBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  let raw = rawJson;
  if (!raw && rawBase64) raw = Buffer.from(rawBase64, 'base64').toString('utf8');
  if (!raw && keyFile) raw = await readFile(keyFile, 'utf8');
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, or GOOGLE_SERVICE_ACCOUNT_KEY_FILE is required');
  }

  const credentials = JSON.parse(raw) as ServiceAccountCredentials;
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google service account credentials are missing client_email or private_key');
  }

  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return credentials;
}

export async function getGoogleAccessToken(scope: string) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken?.scope === scope && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }

  const credentials = await loadCredentials();
  const tokenUri = credentials.token_uri || TOKEN_URI;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope,
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsignedJwt = `${header}.${claim}`;
  const signature = createSign('RSA-SHA256').update(unsignedJwt).sign(credentials.private_key, 'base64url');
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await googleFetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  }, 'Google OAuth token request');

  if (!response.ok) {
    throw new Error(`Google OAuth token request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google OAuth token response did not include an access token');
  cachedAccessToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600), scope };
  return data.access_token;
}
