import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'ggfo_session';

function publicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname.startsWith('/claim/') ||
    pathname.startsWith('/portal/') ||
    pathname.startsWith('/program/') ||
    pathname.startsWith('/brand/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  );
}

function publicApi(pathname: string) {
  return (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/claim' ||
    pathname === '/api/auth/bootstrap-owner'
  );
}

function getSecret() {
  return process.env.JWT_SECRET || process.env.API_SECRET || '';
}

function base64url(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return decodeURIComponent(
    Array.from(atob(base64))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

async function hmac(input: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input)));
}

async function verifyToken(token?: string) {
  const secret = getSecret();
  if (!secret || !token) return null;

  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;
  const expected = await hmac(`${header}.${body}`, secret);
  if (signature !== expected) return null;

  const payload = JSON.parse(decodeBase64url(body));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.role !== 'owner' && payload.role !== 'staff') return null;
  return payload as { role: 'owner' | 'staff' };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPath(pathname) || publicApi(pathname)) return NextResponse.next();

  const session = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === '/staff' || pathname.startsWith('/api/auth/invites')) && session.role !== 'owner') {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Owner permission required' }, { status: 403 });
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
