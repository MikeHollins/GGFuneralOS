'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Invite = {
  first_name: string;
  last_name: string;
  contact_email: string | null;
  contact_phone: string | null;
};

export default function ClaimInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/claim?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invite not found');
        setInvite(data.invite);
        setPhone(data.invite.contact_phone || '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function claim() {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, username, phone, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not claim invite');
      router.replace('/login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-neutral-200 p-1.5">
            <img src="/brand/gg-logo.png" alt="Golden Gate Funeral & Cremation Services" className="max-h-full max-w-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-black">Claim Staff Access</h1>
            <p className="text-xs text-neutral-500">Create your Golden Gate dashboard login.</p>
          </div>
        </div>

        {loading ? <p className="text-sm text-neutral-500">Checking invite...</p> : null}

        {invite ? (
          <div className="space-y-4">
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Invited staff member</div>
              <div className="mt-1 text-sm font-bold text-neutral-900">{invite.first_name} {invite.last_name}</div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} className="mt-1 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20" placeholder="firstlast" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Phone</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">6-digit PIN</span>
              <input type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 h-11 w-full rounded-md border border-neutral-300 px-3 text-center text-xl tracking-[0.35em] outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20" inputMode="numeric" placeholder="000000" />
            </label>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        {invite ? (
          <button type="button" onClick={claim} disabled={submitting} className="mt-6 h-11 w-full rounded-md bg-[#efb70c] text-sm font-bold text-black hover:bg-[#d2a006] disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
