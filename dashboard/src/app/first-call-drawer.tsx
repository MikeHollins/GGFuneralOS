'use client';

import { useEffect, useRef, useState } from 'react';
import { createFirstCall, getFirstCallSuggestion } from '@/lib/api';

// Stable, module-level field components so typing never loses focus (re-created components remount).
function Field({ label, value, onChange, required, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-semibold text-neutral-600">
        {label}{required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-0.5 h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-900 outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
      />
    </label>
  );
}

function Select({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>; required?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-semibold text-neutral-600">
        {label}{required ? <span className="text-red-600"> *</span> : null}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-0.5 h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-900 outline-none focus:border-[#efb70c]"
      >
        {options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm text-neutral-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
      {label}
    </label>
  );
}

function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1 flex items-center gap-2 border-b border-neutral-100 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#a77d00]">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#efb70c] text-[10px] text-black">{n}</span>
      {children}
    </div>
  );
}

export function FirstCallDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (r: { case_key: string; name: string }) => void }) {
  const [f, setF] = useState<Record<string, any>>({ disposition_intent: 'undecided', embalm_permission: 'pending', pacemaker_present: 'unknown' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const upd = (k: string) => (v: any) => setF((cur) => ({ ...cur, [k]: v }));
  const val = (k: string) => String(f[k] ?? '');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Pre-fill the suggested next case number (editable — Golden Gate may be on a different counter).
  useEffect(() => {
    let active = true;
    getFirstCallSuggestion()
      .then((r) => { if (active) setF((cur) => (cur.case_number ? cur : { ...cur, case_number: r.data.suggested_case_number })); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function submit() {
    setError('');
    if (!val('deceased_last').trim()) return setError("Deceased's last name is required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val('date_of_death'))) return setError('Date of death is required (YYYY-MM-DD) — it starts the Missouri filing clock.');
    if (!val('nok_name').trim()) return setError('Legal next of kin name is required.');
    if (!val('created_by_initials').trim()) return setError('Your initials are required.');
    setBusy(true);
    try {
      const res = await createFirstCall(f);
      onCreated(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record first call.');
      setBusy(false);
    }
  }

  const isCremation = val('disposition_intent') === 'cremation' || val('disposition_intent') === 'undecided';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="New first call intake"
        className="flex h-dvh w-full flex-col border-l border-neutral-200 bg-white shadow-2xl sm:w-[560px] sm:max-w-[96vw]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-3 py-3 sm:px-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700">New first call</div>
            <h2 className="text-lg font-bold text-neutral-950">Open a case</h2>
          </div>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-neutral-200 px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-100">Close</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
          <p className="mt-2 rounded-md bg-neutral-50 px-2 py-1.5 text-[11px] text-neutral-500">
            Capture the essentials to get the deceased into care and start the legal clock. Full arrangement detail comes at the arrangement conference.
          </p>

          <SectionTitle n={1}>The deceased</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Case number (suggested — edit if Golden Gate is on a different one)" value={val('case_number')} onChange={upd('case_number')} placeholder="YY-NNN" />
            </div>
            <Field label="First name" value={val('deceased_first')} onChange={upd('deceased_first')} />
            <Field label="Middle" value={val('deceased_middle')} onChange={upd('deceased_middle')} />
            <Field label="Last name" value={val('deceased_last')} onChange={upd('deceased_last')} required />
            <Field label="Suffix (Jr/Sr/II)" value={val('deceased_suffix')} onChange={upd('deceased_suffix')} />
            <Field label="Date of death" type="date" value={val('date_of_death')} onChange={upd('date_of_death')} required />
            <Field label="Time of death" type="time" value={val('time_of_death')} onChange={upd('time_of_death')} />
            <Field label="Date of birth" type="date" value={val('date_of_birth')} onChange={upd('date_of_birth')} />
            <Select label="Sex" value={val('sex')} onChange={upd('sex')} options={[['', '—'], ['female', 'Female'], ['male', 'Male'], ['other', 'Other']]} />
          </div>

          <SectionTitle n={2}>Place of death / location of body</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select label="Where" value={val('death_place_type')} onChange={upd('death_place_type')} options={[['', '—'], ['home', 'Home'], ['hospital', 'Hospital'], ['hospice', 'Hospice'], ['nursing_facility', 'Nursing facility'], ['medical_examiner', 'Medical examiner'], ['other', 'Other']]} />
            <Field label="Facility name" value={val('death_facility_name')} onChange={upd('death_facility_name')} />
            <div className="sm:col-span-2"><Field label="Address" value={val('death_address')} onChange={upd('death_address')} /></div>
            <Field label="Pronounced by" value={val('pronounced_by')} onChange={upd('pronounced_by')} placeholder="Physician / coroner" />
            <div className="flex flex-col justify-end gap-0.5">
              <Check label="Death pronounced" checked={!!f.pronounced} onChange={upd('pronounced')} />
              <Check label="Medical examiner / coroner involved" checked={!!f.me_involved} onChange={upd('me_involved')} />
            </div>
          </div>

          <SectionTitle n={3}>Caller &amp; legal next of kin</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Caller name" value={val('caller_name')} onChange={upd('caller_name')} />
            <Field label="Caller phone" type="tel" value={val('caller_phone')} onChange={upd('caller_phone')} />
            <Field label="Caller relationship" value={val('caller_relationship')} onChange={upd('caller_relationship')} />
            <div className="hidden sm:block" />
            <Field label="Next of kin (legal)" value={val('nok_name')} onChange={upd('nok_name')} required />
            <Field label="NOK relationship" value={val('nok_relationship')} onChange={upd('nok_relationship')} />
            <Field label="NOK phone" type="tel" value={val('nok_phone')} onChange={upd('nok_phone')} />
            <Field label="NOK email" type="email" value={val('nok_email')} onChange={upd('nok_email')} />
          </div>

          <SectionTitle n={4}>Removal / transfer</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Pickup location" value={val('pickup_location')} onChange={upd('pickup_location')} placeholder="Same as place of death, or address" /></div>
            <Select label="Permission to embalm" value={val('embalm_permission')} onChange={upd('embalm_permission')} options={[['pending', 'Pending'], ['yes', 'Granted'], ['no', 'Declined']]} />
            <Field label="Removal team" value={val('removal_team')} onChange={upd('removal_team')} />
            <div className="flex flex-col justify-end gap-0.5">
              <Check label="Ready for pickup now" checked={!!f.ready_for_pickup} onChange={upd('ready_for_pickup')} />
              <Check label="Release authorized" checked={!!f.release_authorized} onChange={upd('release_authorized')} />
            </div>
          </div>

          <SectionTitle n={5}>Disposition intent</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select label="Intent (preliminary)" value={val('disposition_intent')} onChange={upd('disposition_intent')} options={[['undecided', 'Undecided'], ['burial', 'Burial'], ['cremation', 'Cremation']]} />
            {isCremation ? (
              <Select label="Pacemaker / implant?" value={val('pacemaker_present')} onChange={upd('pacemaker_present')} options={[['unknown', 'Unknown'], ['yes', 'Yes — must remove'], ['no', 'No']]} />
            ) : <div className="hidden sm:block" />}
            <div className="sm:col-span-2"><Check label="Prearrangement on file" checked={!!f.prearrangement} onChange={upd('prearrangement')} /></div>
          </div>
          {isCremation && val('pacemaker_present') === 'yes' ? (
            <p className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">Pacemaker present — must be removed before cremation.</p>
          ) : null}

          <SectionTitle n={6}>Next step</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Arrangement conference" type="datetime-local" value={val('arrangement_conference_at')} onChange={upd('arrangement_conference_at')} />
            <Field label="Director assigned" value={val('director_assigned')} onChange={upd('director_assigned')} />
            <div className="sm:col-span-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-neutral-600">Notes / special instructions</span>
                <textarea value={val('notes')} onChange={(e) => upd('notes')(e.target.value)} rows={2}
                  className="mt-0.5 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm outline-none focus:border-[#efb70c]" />
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-200 px-3 py-3 sm:px-4">
          {error ? <div className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{error}</div> : null}
          <div className="flex items-center gap-2">
            <input
              ref={firstFieldRef}
              value={val('created_by_initials')}
              onChange={(e) => upd('created_by_initials')(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="Your initials *"
              className="h-9 w-28 rounded-md border border-neutral-300 px-2 text-sm font-bold uppercase outline-none focus:border-[#efb70c]"
              aria-label="Your initials"
            />
            <button type="button" onClick={submit} disabled={busy}
              className="h-9 flex-1 rounded-md bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
              {busy ? 'Opening case…' : 'Open case'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
