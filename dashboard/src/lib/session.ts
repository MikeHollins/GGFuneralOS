import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'ggfo_session';

export type StaffRole = 'owner' | 'staff';

export type StaffSession = {
  staff_id: string;
  role: StaffRole;
  first_name: string;
  last_name: string;
  username?: string | null;
  email?: string | null;
  exp: number;
};

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.API_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

function base64url(input: string | ArrayBuffer) {
  const bytes = typeof input === 'string' ? Buffer.from(input) : Buffer.from(input);
  return bytes.toString('base64url');
}

function fromBase64url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function hmac(input: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return base64url(signature);
}

export async function signSession(payload: Omit<StaffSession, 'exp'>, maxAgeSeconds = 60 * 60 * 12) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds }));
  const signature = await hmac(`${header}.${body}`, getSecret());
  return `${header}.${body}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<StaffSession | null> {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;

  const expected = await hmac(`${header}.${body}`, getSecret());
  if (signature !== expected) return null;

  const payload = JSON.parse(fromBase64url(body)) as StaffSession;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.role !== 'owner' && payload.role !== 'staff') return null;

  return payload;
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 12) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: maxAgeSeconds,
    path: '/',
  };
}
