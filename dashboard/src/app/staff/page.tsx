'use client';

import { useEffect, useState } from 'react';

type Invite = {
  id: string;
  first_name: string;
  last_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  expires_at: string;
  created_at: string;
};

export default function StaffPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [claimUrl, setClaimUrl] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function loadInvites() {
    fetch('/api/auth/invites')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load invites');
        setInvites(data.data);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadInvites();
  }, []);

  async function createInvite() {
    setError('');
    setClaimUrl('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create invite');
      setClaimUrl(data.claim_url);
      setFirstName('');
      setLastName('');
      setPhone('');
      loadInvites();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#faf9f9] p-6 text-neutral-950">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a77d00]">Owner Permission</p>
        <h1 className="mt-1 text-2xl font-bold text-black">Staff Access</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Create a claim link for a staff member. Staff accounts get full dashboard access; only the owner can create more staff.
        </p>
      </header>

      <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-base font-bold">Create Staff Invite</h2>
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">First name</span>
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Last name</span>
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Phone</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20" />
            </label>
          </div>

          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

          <button type="button" onClick={createInvite} disabled={loading} className="mt-4 h-10 w-full rounded-md bg-black text-sm font-bold text-[#efb70c] hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? 'Creating...' : 'Create claim link'}
          </button>

          {claimUrl ? (
            <div className="mt-4 rounded-md border border-[#efb70c]/40 bg-[#efb70c]/10 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#6f5200]">Claim link</div>
              <input readOnly value={claimUrl} className="mt-2 w-full rounded-md border border-[#efb70c]/40 bg-white px-2 py-2 text-xs text-neutral-800" onFocus={(event) => event.currentTarget.select()} />
              <p className="mt-2 text-xs text-neutral-600">Send this link by text. It expires in 14 days.</p>
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h2 className="text-base font-bold">Recent Invites</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-t border-neutral-100">
                    <td className="px-3 py-3 text-sm font-semibold">{invite.first_name} {invite.last_name}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{invite.contact_email || invite.contact_phone}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{invite.status}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{new Date(invite.expires_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {!invites.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-neutral-500">No invites yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
