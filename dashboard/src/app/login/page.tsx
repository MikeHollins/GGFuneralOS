'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const body = mode === 'pin' ? { pin } : { email, password };
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      setAuth(data.token, data.staff);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-dark">GGFuneralOS</h1>
          <p className="text-xs text-gray-400 mt-1">KC Golden Gate Funeral Home</p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
          <button
            onClick={() => setMode('password')}
            className={`flex-1 text-xs py-2 rounded-md transition-colors ${mode === 'password' ? 'bg-white shadow text-brand-dark font-medium' : 'text-gray-500'}`}
          >
            Email & Password
          </button>
          <button
            onClick={() => setMode('pin')}
            className={`flex-1 text-xs py-2 rounded-md transition-colors ${mode === 'pin' ? 'bg-white shadow text-brand-dark font-medium' : 'text-gray-500'}`}
          >
            Quick PIN
          </button>
        </div>

        {mode === 'password' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold"
                placeholder="you@kcgoldengate.com"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold"
                placeholder="Enter password"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">Staff PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-2xl text-center tracking-[0.5em] focus:outline-none focus:border-gold"
              placeholder="••••"
              maxLength={6}
              inputMode="numeric"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
        )}

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full mt-6 bg-gold text-white py-2.5 rounded-lg font-medium text-sm hover:bg-gold-dark transition-colors disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}
