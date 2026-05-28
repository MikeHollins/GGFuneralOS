'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      const next = new URLSearchParams(window.location.search).get('next') || '/';
      router.replace(next);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-neutral-200 bg-white p-1.5">
            <img src="/brand/gg-logo.png" alt="Golden Gate Funeral & Cremation Services" className="max-h-full max-w-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-black">Golden Gate</h1>
            <p className="text-xs text-neutral-500">Staff dashboard</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              onKeyDown={(event) => event.key === 'Enter' && handleLogin()}
              className="mt-1 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
              placeholder="dimond"
              autoComplete="username"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">6-digit PIN</span>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => event.key === 'Enter' && handleLogin()}
              className="mt-1 h-12 w-full rounded-md border border-neutral-300 px-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="mt-6 h-11 w-full rounded-md bg-[#efb70c] text-sm font-bold text-black hover:bg-[#d2a006] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
