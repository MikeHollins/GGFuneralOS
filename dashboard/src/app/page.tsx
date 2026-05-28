'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getOperationalStatuses, getOperationsFeed, saveOperationalStatus, syncWeeklyServiceSchedule, updateOperationItem, type OperationsFeed } from '@/lib/api';
import { type DashboardItem } from '@/lib/operation-items';

type AuditEntry = {
  kind: 'status' | 'edit';
  itemId: string;
  label: string;
  from: string | null;
  to: string | null;
  initials?: string;
  staffName?: string;
  fieldName?: string;
  changedAt: string;
};

type StatusOverride = {
  status: string;
  initials: string;
  changedAt: string;
  history: AuditEntry[];
};

type SourceHealth = OperationsFeed['sources'][number];

type SheetTab = {
  id: string;
  label: string;
  source?: string;
  sourcePrefix?: string;
  area?: DashboardItem['area'];
};

type SheetColumn = {
  label: string;
  keys: string[];
  fallback?: 'label' | 'detail' | 'owner' | 'due' | 'source';
  className?: string;
};

const tabs: SheetTab[] = [
  { id: 'schedule', label: 'Weekly Service Schedule', source: 'Weekly Service Schedule' },
  { id: 'arrangements', label: 'Arrangements', source: 'Arrangements' },
  { id: 'death-certificates-2026', label: 'Death Certificate 2026', source: 'Death Certificate 2026' },
  { id: 'death-certificates-2025', label: 'Death Certificate 2025', source: 'Death Certificate 2025' },
  { id: 'cremains', label: 'Cremains Log', source: 'Cremains Log' },
  { id: 'picked-up-cremains', label: 'Picked Up Cremains Log', source: 'Picked UP Cremains Log' },
  { id: 'crematory-2026', label: '2026 Crematory Log', source: '2026 Crematory Log' },
  { id: 'crematory-2025', label: '2025 Crematory Log', source: '2025 Crematory Log' },
  { id: 'belongings', label: 'Belongings', source: 'Belongings' },
  { id: 'server-packages', label: 'Server Packages', source: 'SMB: Funeral Packages' },
  { id: 'server-production', label: 'Server Production Files', area: 'production', sourcePrefix: 'SMB:' },
  { id: 'server-paperwork', label: 'Server Paperwork', area: 'paperwork', sourcePrefix: 'SMB:' },
];

const defaultColumns: SheetColumn[] = [
  { label: 'Name', keys: ['name_of_deceased', 'deceased', 'name'], fallback: 'label', className: 'min-w-56' },
  { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
  { label: 'Date / Time', keys: ['date', 'service_date', 'arrangement_date', 'time', 'service_time', 'appointment_time'], fallback: 'due' },
  { label: 'Staff / Receiver', keys: ['lead', 'lead_lady', 'director', 'arranger', 'staff', 'receiver', 'signature_of_receiver'], fallback: 'owner' },
  { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
];

const columnsByTab: Record<string, SheetColumn[]> = {
  schedule: [
    { label: 'Date', keys: ['date', 'service_date'], fallback: 'due' },
    { label: 'Time', keys: ['time', 'service_time'] },
    { label: 'Deceased', keys: ['deceased', 'name_of_deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Service', keys: ['service', 'service_type', 'type'] },
    { label: 'Location', keys: ['location', 'service_location', 'chapel'] },
    { label: 'Cemetery', keys: ['cemetery'] },
    { label: 'Casket', keys: ['casket'] },
    { label: 'Flowers', keys: ['flowers'] },
    { label: 'Programs', keys: ['programs', 'program'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  arrangements: [
    { label: 'Appointment date', keys: ['appointment_date', 'arrangement_date', 'date'], fallback: 'due' },
    { label: 'Time', keys: ['appointment_time', 'time'] },
    { label: 'Deceased', keys: ['deceased', 'name_of_deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Family / Contact', keys: ['family', 'contact', 'next_of_kin', 'nok', 'phone', 'cell'] },
    { label: 'Arranger', keys: ['arranger', 'director', 'staff'], fallback: 'owner' },
    { label: 'Package / Payment', keys: ['package', 'payment', 'paid', 'balance'] },
    { label: 'Contract', keys: ['contract', 'contract_signed'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  'death-certificates-2026': [
    { label: 'Deceased', keys: ['deceased', 'name_of_deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Date of death', keys: ['date_of_death', 'death_date'], fallback: 'due' },
    { label: 'Doctor / Certifier', keys: ['doctor', 'physician', 'certifier'], fallback: 'owner' },
    { label: 'Called', keys: ['called', 'doctor_called'] },
    { label: 'Sent', keys: ['sent', 'date_sent'] },
    { label: 'Filed', keys: ['filed', 'date_filed'] },
    { label: 'Permit', keys: ['permit', 'burial_permit'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  'death-certificates-2025': [
    { label: 'Deceased', keys: ['deceased', 'name_of_deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Date of death', keys: ['date_of_death', 'death_date'], fallback: 'due' },
    { label: 'Doctor / Certifier', keys: ['doctor', 'physician', 'certifier'], fallback: 'owner' },
    { label: 'Called', keys: ['called', 'doctor_called'] },
    { label: 'Sent', keys: ['sent', 'date_sent'] },
    { label: 'Filed', keys: ['filed', 'date_filed'] },
    { label: 'Permit', keys: ['permit', 'burial_permit'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  cremains: [
    { label: 'Deceased', keys: ['name_of_deceased', 'deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Date returned', keys: ['date_of_return', 'return_date'], fallback: 'due' },
    { label: 'Location', keys: ['location', 'storage_location'] },
    { label: 'Paid', keys: ['paid', 'payment'] },
    { label: 'Authorized pickup', keys: ['authorized_pickup', 'authorization'] },
    { label: 'Receiver', keys: ['receiver', 'signature_of_receiver'], fallback: 'owner' },
    { label: 'Pickup date', keys: ['pick_up_date', 'pickup_date'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  'picked-up-cremains': [
    { label: 'Deceased', keys: ['name_of_deceased', 'deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Pickup date', keys: ['pick_up_date', 'pickup_date', 'date'], fallback: 'due' },
    { label: 'Receiver', keys: ['receiver', 'signature_of_receiver'], fallback: 'owner' },
    { label: 'Paid', keys: ['paid', 'payment'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  'crematory-2026': [
    { label: 'Date', keys: ['cremation_date', 'date', 'date_of_cremation'], fallback: 'due' },
    { label: 'Deceased', keys: ['name_of_deceased', 'deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Operator', keys: ['operator', 'staff', 'director'], fallback: 'owner' },
    { label: 'Permit', keys: ['permit', 'cremation_permit'] },
    { label: 'Authorization', keys: ['authorization', 'cremation_authorization'] },
    { label: 'Return date', keys: ['return_date', 'date_of_return'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  'crematory-2025': [
    { label: 'Date', keys: ['cremation_date', 'date', 'date_of_cremation'], fallback: 'due' },
    { label: 'Deceased', keys: ['name_of_deceased', 'deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Operator', keys: ['operator', 'staff', 'director'], fallback: 'owner' },
    { label: 'Permit', keys: ['permit', 'cremation_permit'] },
    { label: 'Authorization', keys: ['authorization', 'cremation_authorization'] },
    { label: 'Return date', keys: ['return_date', 'date_of_return'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  belongings: [
    { label: 'Deceased', keys: ['name_of_deceased', 'deceased', 'name'], fallback: 'label', className: 'min-w-56' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Items', keys: ['items', 'item', 'property', 'belongings'], className: 'min-w-72' },
    { label: 'Storage location', keys: ['storage_location', 'location'] },
    { label: 'Released to', keys: ['released_to', 'receiver'], fallback: 'owner' },
    { label: 'Release date', keys: ['release_date', 'pick_up_date', 'pickup_date', 'date'], fallback: 'due' },
    { label: 'Signature', keys: ['signature', 'signature_of_receiver'] },
    { label: 'Notes', keys: ['notes', 'note', 'remarks', 'comments'], className: 'min-w-72' },
  ],
  'server-packages': [
    { label: 'File', keys: ['name'], fallback: 'label', className: 'min-w-64' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Folder', keys: ['parent_path'], fallback: 'source', className: 'min-w-56' },
    { label: 'Type', keys: ['extension', 'item_type'] },
    { label: 'Size', keys: ['size_bytes'] },
    { label: 'Modified', keys: ['modified_at'], fallback: 'due', className: 'min-w-44' },
    { label: 'Path', keys: ['relative_path'], className: 'min-w-96' },
  ],
  'server-production': [
    { label: 'File', keys: ['name'], fallback: 'label', className: 'min-w-64' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Source folder', keys: ['top_level'], fallback: 'source', className: 'min-w-48' },
    { label: 'Folder', keys: ['parent_path'], className: 'min-w-56' },
    { label: 'Type', keys: ['extension', 'item_type'] },
    { label: 'Modified', keys: ['modified_at'], fallback: 'due', className: 'min-w-44' },
    { label: 'Path', keys: ['relative_path'], className: 'min-w-96' },
  ],
  'server-paperwork': [
    { label: 'File', keys: ['name'], fallback: 'label', className: 'min-w-64' },
    { label: 'Match key', keys: ['case_match_key'], className: 'min-w-44' },
    { label: 'Source folder', keys: ['top_level'], fallback: 'source', className: 'min-w-48' },
    { label: 'Folder', keys: ['parent_path'], className: 'min-w-56' },
    { label: 'Type', keys: ['extension', 'item_type'] },
    { label: 'Modified', keys: ['modified_at'], fallback: 'due', className: 'min-w-44' },
    { label: 'Path', keys: ['relative_path'], className: 'min-w-96' },
  ],
};

function priorityClass(priority: DashboardItem['priority']) {
  if (priority === 'critical') return 'border-l-red-600 bg-red-50/70';
  if (priority === 'high') return 'border-l-amber-500 bg-amber-50/60';
  if (priority === 'done') return 'border-l-emerald-600 bg-emerald-50/60';
  return 'border-l-neutral-300 bg-white';
}

function statusTone(status: string) {
  const lower = status.toLowerCase();
  if (lower.includes('missing') || lower.includes('needs') || lower.includes('not started')) {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  if (lower.includes('pending') || lower.includes('called') || lower.includes('requested') || lower.includes('needed')) {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }
  if (lower.includes('ready') || lower.includes('proof') || lower.includes('confirmed')) {
    return 'border-blue-200 bg-blue-50 text-blue-900';
  }
  if (lower.includes('complete') || lower.includes('filed') || lower.includes('picked') || lower.includes('published') || lower.includes('verified')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (lower.includes('approved') || lower.includes('printed') || lower.includes('design')) {
    return 'border-purple-200 bg-purple-50 text-purple-800';
  }
  return 'border-neutral-200 bg-neutral-50 text-neutral-800';
}

function displayKey(key: string) {
  return key
    .replace(/^_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function safeFieldValue(key: string, value: string) {
  const lowerKey = key.toLowerCase();
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!trimmed) return '';
  if (lowerKey.includes('ssn') || lowerKey.includes('social_security')) {
    return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : 'masked';
  }
  if (lowerKey.includes('phone') || lowerKey.includes('cell') || lowerKey.includes('telephone')) {
    return digits.length >= 4 ? `ending ${digits.slice(-4)}` : 'masked';
  }
  if (/^\D*\d{3}\D*\d{2}\D*\d{4}\D*$/.test(trimmed)) {
    return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : 'masked';
  }
  return trimmed;
}

function sourcePayload(item: DashboardItem) {
  return item.sourcePayload ?? {};
}

function sourceEntries(item: DashboardItem) {
  return Object.entries(sourcePayload(item))
    .filter(([key, value]) => !key.startsWith('_') && String(value ?? '').trim())
    .map(([key, value]) => [key, safeFieldValue(key, String(value))] as const);
}

function fallbackValue(item: DashboardItem, fallback?: SheetColumn['fallback']) {
  if (!fallback) return '';
  if (fallback === 'source') return item.source;
  return item[fallback] ?? '';
}

function valueForColumn(item: DashboardItem, column: SheetColumn) {
  const payload = sourcePayload(item);
  for (const key of column.keys) {
    const value = payload[key]?.trim();
    if (value) return safeFieldValue(key, value);
  }
  return fallbackValue(item, column.fallback);
}

function itemMatchesTab(item: DashboardItem, tab: SheetTab) {
  if (tab.source && item.source.trim() !== tab.source) return false;
  if (tab.sourcePrefix && !item.source.trim().startsWith(tab.sourcePrefix)) return false;
  if (tab.area && item.area !== tab.area) return false;
  if (tab.source || tab.sourcePrefix || tab.area) return true;
  return true;
}

function columnsForTab(tabId: string, rows: DashboardItem[]): SheetColumn[] {
  const configured = columnsByTab[tabId] ?? defaultColumns;
  if (configured.length) return configured;

  const seen = new Set<string>();
  for (const item of rows) {
    for (const [key] of sourceEntries(item)) {
      if (seen.size >= 8) break;
      seen.add(key);
    }
  }
  return [...seen].map((key) => ({ label: displayKey(key), keys: [key] }));
}

function sourceRowLabel(item: DashboardItem) {
  const rowNumber = item.sourcePayload?._row_number || item.sourceRef?.split('!').pop()?.trim();
  return rowNumber ? `Row ${rowNumber}` : item.source.trim();
}

function formatStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function StatusChip({
  item,
  override,
  onCommit,
}: {
  item: DashboardItem;
  override?: StatusOverride;
  onCommit: (item: DashboardItem, nextStatus: string, initials: string) => Promise<void>;
}) {
  const controlId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState(override?.status ?? item.status);
  const [initials, setInitials] = useState('');
  const [error, setError] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const currentStatus = override?.status ?? item.status;
  const hasChanged = nextStatus !== currentStatus;
  const title = override
    ? `${currentStatus} changed by ${override.initials} on ${formatStamp(override.changedAt)}`
    : `${currentStatus}. No staff initials recorded yet.`;

  async function save() {
    const cleanInitials = initials.trim().toUpperCase();
    if (!hasChanged) {
      setError('Choose a new status');
      return;
    }
    if (!cleanInitials) {
      setError('Initials required');
      return;
    }
    try {
      await onCommit(item, nextStatus, cleanInitials.slice(0, 5));
      setInitials('');
      setError('');
      setOpen(false);
    } catch {
      setError('Could not save');
    }
  }

  return (
    <div className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        title={title}
        aria-label={`Change status for ${item.label}. Current status is ${currentStatus}.`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${controlId}-menu`}
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect();
          if (rect) {
            setMenuPosition({
              top: rect.bottom + 8,
              left: Math.max(12, Math.min(rect.right - 288, window.innerWidth - 304)),
            });
          }
          setNextStatus(currentStatus);
          setOpen((value) => !value);
        }}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold leading-none shadow-sm transition hover:-translate-y-px hover:shadow ${statusTone(currentStatus)}`}
      >
        <span>{currentStatus}</span>
        {override?.initials ? <span className="rounded bg-white/70 px-1 text-[10px]">{override.initials}</span> : null}
      </button>

      {open ? (
        <div
          id={`${controlId}-menu`}
          role="dialog"
          aria-label={`Status editor for ${item.label}`}
          className="fixed z-50 w-72 rounded-lg border border-neutral-200 bg-white p-3 text-left shadow-xl"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Status</div>
          <div role="listbox" aria-label="Available statuses" className="mt-2 grid grid-cols-1 gap-1">
            {item.options.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={nextStatus === option}
                onClick={() => setNextStatus(option)}
                className={`rounded-md px-2 py-1.5 text-left text-xs font-medium transition ${
                  nextStatus === option ? 'bg-black text-[#efb70c]' : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <label htmlFor={`${controlId}-initials`} className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Staff initials required
          </label>
          <input
            id={`${controlId}-initials`}
            value={initials}
            onChange={(event) => {
              setInitials(event.target.value);
              setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
              if (event.key === 'Escape') setOpen(false);
            }}
            maxLength={5}
            placeholder="DH"
            aria-describedby={`${controlId}-error`}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <span id={`${controlId}-error`} aria-live="polite" className="text-xs text-red-700">{error}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-md px-3 text-xs font-semibold text-neutral-500 hover:bg-neutral-100">
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!hasChanged}
                className="h-8 rounded-md bg-black px-3 text-xs font-semibold text-[#efb70c] hover:bg-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditableText({
  value,
  field,
  multiline = false,
  className = '',
  onSave,
}: {
  value: string;
  field: 'label' | 'detail' | 'owner' | 'due';
  multiline?: boolean;
  className?: string;
  onSave: (field: 'label' | 'detail' | 'owner' | 'due', value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value), [value]);

  async function save() {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(field, draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    const inputClass = 'w-full rounded-md border border-[#efb70c]/60 bg-white px-2 py-1 text-sm outline-none ring-2 ring-[#efb70c]/20';
    return (
      <div className="min-w-36">
        {multiline ? (
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className={`${inputClass} min-h-20 resize-y text-xs leading-5`} autoFocus />
        ) : (
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
              if (event.key === 'Escape') setEditing(false);
            }}
            className={inputClass}
            autoFocus
          />
        )}
        <div className="mt-1 flex gap-1">
          <button type="button" onClick={save} disabled={saving} className="rounded bg-black px-2 py-1 text-[11px] font-bold text-[#efb70c] disabled:opacity-60">
            {saving ? 'Saving' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded px-2 py-1 text-[11px] font-bold text-neutral-500 hover:bg-neutral-100">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`block w-full rounded-md text-left transition hover:bg-[#efb70c]/10 hover:outline hover:outline-1 hover:outline-[#efb70c]/30 ${className}`}
      title="Click to edit"
    >
      {value || 'Click to add'}
    </button>
  );
}

function PrioritySelect({
  value,
  onSave,
}: {
  value: DashboardItem['priority'];
  onSave: (field: 'priority', value: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function save(nextValue: DashboardItem['priority']) {
    if (nextValue === value) return;
    setSaving(true);
    try {
      await onSave('priority', nextValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {(['critical', 'high', 'normal', 'done'] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={saving}
          onClick={() => save(option)}
          className={`h-7 rounded-md px-2 text-[11px] font-bold capitalize transition disabled:opacity-60 ${
            value === option ? 'bg-black text-[#efb70c]' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function WorkItem({
  item,
  columns,
  auditEntries,
  override,
  onCommit,
  onUpdate,
}: {
  item: DashboardItem;
  columns: SheetColumn[];
  auditEntries: AuditEntry[];
  override?: StatusOverride;
  onCommit: (item: DashboardItem, nextStatus: string, initials: string) => Promise<void>;
  onUpdate: (itemId: string, field: 'label' | 'detail' | 'owner' | 'due' | 'priority', value: string) => Promise<void>;
}) {
  const saveField = (field: 'label' | 'detail' | 'owner' | 'due' | 'priority', value: string) => onUpdate(item.id, field, value);
  const [expanded, setExpanded] = useState(false);
  const fields = sourceEntries(item);
  const colSpan = columns.length + 2;

  return (
    <>
      <tr className="border-b border-neutral-200 align-top hover:bg-[#faf9f9]">
        <td className={`sticky left-0 z-10 w-28 min-w-28 border-l-4 bg-white px-3 py-2 ${priorityClass(item.priority)}`}>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="h-8 whitespace-nowrap rounded-md border border-neutral-200 px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
            aria-expanded={expanded}
            title={expanded ? 'Hide sheet fields' : 'View all sheet fields'}
          >
            {expanded ? 'Hide' : 'Fields'}
          </button>
          <div className="mt-1 text-[11px] text-neutral-500">{sourceRowLabel(item)}</div>
        </td>
        {columns.map((column) => (
          <td key={`${item.id}-${column.label}`} className={`max-w-80 px-3 py-2 text-sm leading-5 text-neutral-800 ${column.className ?? ''}`}>
            <div className="line-clamp-3 whitespace-pre-wrap break-words">{valueForColumn(item, column) || '-'}</div>
          </td>
        ))}
        <td className="px-3 py-2">
          <StatusChip item={item} override={override} onCommit={onCommit} />
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-neutral-200 bg-[#faf9f9]">
          <td colSpan={colSpan} className="px-4 py-4">
            <div className="grid gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-neutral-950">All sheet fields</h3>
                  <span className="text-xs text-neutral-500">{item.sourceRef ?? item.source}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {fields.length ? fields.map(([key, value]) => (
                    <div key={key} className="rounded-md border border-neutral-200 bg-white p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{displayKey(key)}</div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-900">{value}</div>
                    </div>
                  )) : (
                    <div className="rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-500">No source fields were stored for this row.</div>
                  )}
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-neutral-200 bg-white p-3">
                  <h3 className="text-sm font-bold text-neutral-950">GGFuneralOS fields</h3>
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Display name</div>
                      <EditableText value={item.label} field="label" onSave={saveField} className="mt-1 px-1 py-0.5 text-sm font-semibold text-neutral-950" />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Dashboard detail</div>
                      <EditableText value={item.detail} field="detail" multiline onSave={saveField} className="mt-1 px-1 py-0.5 text-xs leading-5 text-neutral-700" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Staff</div>
                        <EditableText value={item.owner} field="owner" onSave={saveField} className="mt-1 px-1 py-0.5 text-sm text-neutral-700" />
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Date / time</div>
                        <EditableText value={item.due} field="due" onSave={saveField} className="mt-1 px-1 py-0.5 text-sm text-neutral-700" />
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Priority</div>
                      <PrioritySelect value={item.priority} onSave={saveField} />
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-neutral-200 bg-white p-3">
                  <h3 className="text-sm font-bold text-neutral-950">Audit trail</h3>
                  <div className="mt-2 space-y-2">
                    {auditEntries.length ? auditEntries.slice(0, 6).map((entry) => (
                      <div key={`${entry.changedAt}-${entry.fieldName ?? entry.to}`} className="text-xs leading-5 text-neutral-600">
                        <span className="font-semibold text-neutral-900">{entry.fieldName ? displayKey(entry.fieldName) : 'Status'}</span>
                        {' changed '}
                        {entry.from ? <span>from {entry.from} </span> : null}
                        {entry.to ? <span>to {entry.to} </span> : null}
                        <span>on {formatStamp(entry.changedAt)}</span>
                      </div>
                    )) : (
                      <div className="text-xs text-neutral-500">No staff changes recorded yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function BoardPage() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusOverride>>({});
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [syncState, setSyncState] = useState<'loading' | 'connected' | 'unavailable'>('loading');
  const [sheetSyncMessage, setSheetSyncMessage] = useState('');
  const [sheetSyncing, setSheetSyncing] = useState(false);

  useEffect(() => {
    loadOperationsFeed();
  }, []);

  function loadOperationsFeed() {
    return getOperationsFeed()
      .then((response) => {
        setItems(response.items as DashboardItem[]);
        setSources(response.sources ?? []);
        const itemAuditEntries: AuditEntry[] = (response.item_audit ?? []).map((entry) => ({
          kind: 'edit',
          itemId: entry.item_id,
          label: entry.item_label,
          from: entry.old_value,
          to: entry.new_value,
          staffName: entry.staff_name,
          fieldName: entry.field_name,
          changedAt: entry.created_at,
        }));
        setAuditEntries((entries) => [...entries.filter((entry) => entry.kind === 'status'), ...itemAuditEntries]
          .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt))
          .slice(0, 50));
        setSyncState('connected');
      })
      .catch(() => {
        setItems([]);
        setSources([]);
        setSyncState('unavailable');
      });
  }

  async function syncWeeklySheet() {
    setSheetSyncing(true);
    setSheetSyncMessage('');
    try {
      const response = await syncWeeklyServiceSchedule();
      setSheetSyncMessage(`Imported ${response.data.imported} master sheet rows.`);
      await loadOperationsFeed();
    } catch (error: any) {
      setSheetSyncMessage(error.message || 'Weekly Service Schedule sync failed.');
    } finally {
      setSheetSyncing(false);
    }
  }

  useEffect(() => {
    if (!items.length) return;
    getOperationalStatuses()
      .then((response) => {
        const nextOverrides: Record<string, StatusOverride> = {};
        for (const status of response.data) {
          nextOverrides[status.item_id] = {
            status: status.status,
            initials: status.staff_initials,
            changedAt: status.updated_at,
            history: [],
          };
        }

        const historyByItem = new Map<string, AuditEntry[]>();
        const nextAuditEntries = response.audit.map((entry) => ({
          kind: 'status' as const,
          itemId: entry.item_id,
          label: entry.item_label,
          from: entry.old_status ?? 'Unset',
          to: entry.new_status,
          initials: entry.staff_initials,
          changedAt: entry.created_at,
        }));

        for (const entry of nextAuditEntries) {
          const existing = historyByItem.get(entry.itemId) ?? [];
          existing.push(entry);
          historyByItem.set(entry.itemId, existing);
        }

        for (const [itemId, history] of historyByItem.entries()) {
          if (nextOverrides[itemId]) nextOverrides[itemId].history = history;
        }

        setStatusOverrides(nextOverrides);
        setAuditEntries((entries) => [...nextAuditEntries, ...entries.filter((entry) => entry.kind === 'edit')]
          .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt))
          .slice(0, 50));
        setSyncState('connected');
      })
      .catch(() => {
        setStatusOverrides({});
      });
  }, [items]);

  async function commitStatus(item: DashboardItem, nextStatus: string, initials: string) {
    const saved = await saveOperationalStatus({
      item_id: item.id,
      item_label: item.label,
      area: item.area,
      source: item.source,
      status: nextStatus,
      staff_initials: initials,
    });
    if (!saved.audit && saved.changed) {
      throw new Error('Status audit was not created');
    }

    setStatusOverrides((current) => {
      const previous = current[item.id];
      const from = previous?.status ?? item.status;
      const entry: AuditEntry = saved.audit
        ? {
            kind: 'status',
            itemId: saved.audit.item_id,
            label: saved.audit.item_label,
            from: saved.audit.old_status ?? 'Unset',
            to: saved.audit.new_status,
            initials: saved.audit.staff_initials,
            changedAt: saved.audit.created_at,
          }
        : {
            kind: 'status',
            itemId: item.id,
            label: item.label,
            from,
            to: nextStatus,
            initials,
            changedAt: saved.data.updated_at,
          };
      const next = {
        ...current,
        [item.id]: {
          status: nextStatus,
          initials,
          changedAt: entry.changedAt,
          history: saved.audit ? [entry, ...(previous?.history ?? [])] : previous?.history ?? [],
        },
      };
      setAuditEntries((entries) => [entry, ...entries.filter((existing) => existing.changedAt !== entry.changedAt)].slice(0, 50));
      return next;
    });
  }

  async function updateItemField(itemId: string, field: 'label' | 'detail' | 'owner' | 'due' | 'priority', value: string) {
    const previous = items;
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));

    try {
      const response = await updateOperationItem(itemId, field, value);
      setItems((current) => current.map((item) => (item.id === itemId ? { ...(response.data as DashboardItem) } : item)));
      if (response.audit) {
        const entry: AuditEntry = {
          kind: 'edit',
          itemId: response.audit.item_id,
          label: response.audit.item_label,
          from: response.audit.old_value,
          to: response.audit.new_value,
          staffName: response.audit.staff_name,
          fieldName: response.audit.field_name,
          changedAt: response.audit.created_at,
        };
        setAuditEntries((entries) => [entry, ...entries.filter((existing) => existing.changedAt !== entry.changedAt)].slice(0, 50));
      }
    } catch {
      setItems(previous);
      throw new Error('Could not save item');
    }
  }

  const visibleItems = useMemo(() => {
    const tab = tabs.find((entry) => entry.id === activeTab) ?? tabs[0];
    let filteredItems = items.filter((item) => itemMatchesTab(item, tab));

    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return filteredItems;
    return filteredItems.filter((item) =>
      [item.label, item.detail, item.owner, item.due, item.source, item.status, ...Object.values(sourcePayload(item))]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [activeTab, items, search]);
  const visibleColumns = useMemo(() => columnsForTab(activeTab, visibleItems), [activeTab, visibleItems]);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? 'Weekly Service Schedule';

  function tabCount(tab: SheetTab) {
    return items.filter((item) => itemMatchesTab(item, tab)).length;
  }

  return (
    <div className="min-h-screen bg-[#faf9f9] text-neutral-950">
      <header className="border-b border-neutral-200 bg-white">
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a77d00]">KC Golden Gate Operations</p>
              <h1 className="mt-1 text-2xl font-bold tracking-normal text-black">{activeTabLabel}</h1>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-[#faf9f9] px-3 py-2 text-xs text-neutral-600">
              <span className={`h-2 w-2 rounded-full ${syncState === 'connected' ? 'bg-emerald-600' : syncState === 'loading' ? 'bg-amber-500' : 'bg-neutral-400'}`} />
              {syncState === 'connected' ? 'Database connected' : syncState === 'loading' ? 'Checking database' : 'Database unavailable'}
            </div>
          </div>
          {sources.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {sources.map((source) => (
                <div
                  key={source.id}
                  title={source.detail}
                  className={`rounded-md border px-3 py-2 text-xs ${
                    source.status === 'connected'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : source.status === 'not_configured'
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  <div className="font-bold">{source.label}</div>
                  <div className="mt-0.5 max-w-96 truncate">{source.detail}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-neutral-100 px-6 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                activeTab === tab.id ? 'bg-black text-[#efb70c]' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${activeTab === tab.id ? 'bg-white/10 text-[#efb70c]' : 'bg-neutral-100 text-neutral-500'}`}>
                {tabCount(tab)}
              </span>
            </button>
          ))}
        </div>
      </header>

      <main className="p-6">
        <section>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
              <div>
                <h2 className="text-base font-bold">{activeTabLabel}</h2>
                <p className="mt-0.5 text-xs text-neutral-500">Rows are imported from the master Google Sheet. Sheet fields are read-only; staff statuses and dashboard edits are saved in GGFuneralOS.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={syncWeeklySheet}
                  disabled={sheetSyncing}
                  className="h-9 rounded-md bg-black px-3 text-xs font-bold text-[#efb70c] hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sheetSyncing ? 'Syncing...' : 'Sync master sheet'}
                </button>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search rows"
                  className="h-9 w-56 rounded-md border border-neutral-200 bg-neutral-50 px-3 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
                  aria-label="Search rows"
                />
              </div>
            </div>
            {sheetSyncMessage ? <div className="border-b border-neutral-200 bg-[#faf9f9] px-4 py-2 text-xs text-neutral-600">{sheetSyncMessage}</div> : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="sticky left-0 z-20 w-28 min-w-28 bg-neutral-50 px-3 py-2 font-semibold">Source Row</th>
                    {visibleColumns.map((column) => (
                      <th key={column.label} className={`px-3 py-2 font-semibold ${column.className ?? ''}`}>{column.label}</th>
                    ))}
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length ? (
                    visibleItems.map((item) => (
                      <WorkItem
                        key={item.id}
                        item={item}
                        columns={visibleColumns}
                        auditEntries={auditEntries.filter((entry) => entry.itemId === item.id)}
                        override={statusOverrides[item.id]}
                        onCommit={commitStatus}
                        onUpdate={updateItemField}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={visibleColumns.length + 2} className="px-4 py-10 text-center text-sm text-neutral-500">
                        No rows found for this master sheet view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
