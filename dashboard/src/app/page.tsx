'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  getMilestones,
  getOperationalStatuses,
  getOperationsFeed,
  getWorkflowStates,
  saveMilestone,
  saveOperationalStatus,
  saveWorkflowState,
  syncWeeklyServiceSchedule,
  updateOperationItem,
  type OperationsFeed,
} from '@/lib/api';
import { deathCertDeadline, type DashboardItem, type OperationArea } from '@/lib/operation-items';

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

// Merge audit entries from multiple sources (status, workflow, milestone), dedupe by
// timestamp+item+value, newest first.
function mergeAudit(incoming: AuditEntry[], existing: AuditEntry[]): AuditEntry[] {
  const seen = new Set<string>();
  const all: AuditEntry[] = [];
  for (const entry of [...incoming, ...existing]) {
    const key = `${entry.changedAt}|${entry.itemId}|${entry.to ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(entry);
  }
  return all.sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1)).slice(0, 200);
}

type StatusOverride = {
  status: string;
  initials: string;
  changedAt: string;
  history: AuditEntry[];
};

type SourceHealth = OperationsFeed['sources'][number];
type FeedMeta = NonNullable<OperationsFeed['meta']>;
type ViewId = 'active' | 'today' | 'cases' | 'service' | 'arrangements' | 'death-certs' | 'cremains' | 'belongings' | 'files';
type EditableItemField = 'label' | 'detail' | 'owner' | 'due' | 'priority' | 'date_of_death';

type MenuEntry = {
  label: string;
  value: string;
  source: string;
};

type CaseRecord = {
  key: string;
  name: string;
  items: DashboardItem[];
  primaryItem: DashboardItem;
  statusItem: DashboardItem;
  dateEntries: MenuEntry[];
  locationEntries: MenuEntry[];
  serviceStaffEntries: MenuEntry[];
  serviceLogisticsEntries: MenuEntry[];
  owner: string;
  dateOfTransition: string | null;
  blocker: string;
  updatedAt: string;
  areaCounts: Partial<Record<OperationArea, number>>;
  searchText: string;
};

type WorkflowStepDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  gridLabel: string;
  hint: string;
  terms: string[];
  areas: OperationArea[];
  keys: string[];
};

type WorkflowStepState = {
  step: WorkflowStepDefinition;
  item: DashboardItem | null;
  done: boolean;
  summary: string;
};

const viewLabels: Record<ViewId, string> = {
  active: 'Active Cases',
  today: 'Today',
  cases: 'All Cases',
  service: 'Service',
  arrangements: 'Arrangements',
  'death-certs': 'Death Certs',
  cremains: 'Cremation',
  belongings: 'Belongings',
  files: 'Production',
};

// Primary navigation answers "which set of families do I look at?" — kept as buttons.
const primaryViews: ViewId[] = ['active', 'today', 'cases'];
// Category views are loose filters over the same table — collapsed into a compact menu.
const categoryViews: ViewId[] = ['service', 'arrangements', 'death-certs', 'cremains', 'belongings', 'files'];

const appTopLinks = [
  { href: '/texts', label: 'Texts' },
  { href: '/payments', label: 'Payments' },
  { href: '/staff', label: 'Staff/Admin' },
];

const visibleRecordLimit = 200;
const activeCaseWindowDays = 45;

const receivedDateKeys = [
  'date_received',
  'received_date',
  'received',
  'first_call_date',
  'first_call',
  'date_of_death',
  'death_date',
  'date',
  'service_date',
  'arrangement_date',
  'appointment_date',
  'date_of_cremation',
  'pick_up_date',
  'pickup_date',
  'modified_at',
];

const dateGroups: Array<{ label: string; keys: string[] }> = [
  { label: 'Arrangement', keys: ['arrangement_date', 'appointment_date', 'appointment_time'] },
  { label: 'Visitation', keys: ['visitation_date', 'visitation_time'] },
  { label: 'Service', keys: ['service_date', 'service_time', 'date', 'time'] },
  { label: 'Committal', keys: ['committal_date', 'committal_time'] },
  { label: 'Cremation', keys: ['cremation_date', 'date_of_cremation'] },
  { label: 'Cremains returned', keys: ['date_of_return', 'return_date'] },
  { label: 'Pickup', keys: ['pick_up_date', 'pickup_date', 'release_date'] },
  { label: 'Death cert', keys: ['date_of_death', 'death_date', 'date_sent', 'sent', 'date_filed', 'filed'] },
  { label: 'File', keys: ['modified_at'] },
];

const locationGroups: Array<{ label: string; keys: string[] }> = [
  { label: 'Service place', keys: ['service_location', 'location', 'chapel', 'church'] },
  { label: 'Cemetery', keys: ['cemetery', 'cemetery_name', 'committal_location'] },
  { label: 'Arrangement place', keys: ['arrangement_location', 'appointment_location'] },
  { label: 'Crematory', keys: ['crematory', 'crematory_name'] },
  { label: 'Cremains storage', keys: ['storage_location'] },
  { label: 'Belongings storage', keys: ['property_location', 'belongings_location'] },
  { label: 'Doctor / facility', keys: ['doctor', 'physician', 'certifier', 'facility', 'place_of_death_facility'] },
  { label: 'Server folder', keys: ['top_level', 'parent_path', 'relative_path'] },
];

// Structured scheduling/location milestones shown as compact grid slots and edited in the
// drawer. Source-derived values are the default; staff overrides (incl. N/A) live in Neon.
type MilestoneDef = { key: string; label: string; full: string; kind: 'date' | 'location'; sourceKeys: string[] };
const DATE_MILESTONES: MilestoneDef[] = [
  { key: 'first_call', label: 'Call', full: 'First call', kind: 'date', sourceKeys: ['first_call_date', 'first_call', 'date_received', 'received_date'] },
  { key: 'service', label: 'Service', full: 'Service', kind: 'date', sourceKeys: ['service_date', 'service_time', 'date', 'time'] },
  { key: 'cremation', label: 'Cremation', full: 'Cremation', kind: 'date', sourceKeys: ['cremation_date', 'date_of_cremation'] },
  { key: 'burial', label: 'Burial', full: 'Burial', kind: 'date', sourceKeys: ['committal_date', 'committal_time'] },
];
const LOCATION_MILESTONES: MilestoneDef[] = [
  { key: 'service_location', label: 'Service', full: 'Service location', kind: 'location', sourceKeys: ['service_location', 'location', 'chapel', 'church'] },
  { key: 'cremation_location', label: 'Cremation', full: 'Cremation location', kind: 'location', sourceKeys: ['crematory', 'crematory_name'] },
  { key: 'burial_location', label: 'Burial', full: 'Burial location', kind: 'location', sourceKeys: ['cemetery', 'cemetery_name', 'committal_location'] },
];
const ALL_MILESTONES = [...DATE_MILESTONES, ...LOCATION_MILESTONES];

type MilestoneOverride = { value: string; isNa: boolean; initials: string };
type MilestoneOverrideMap = Record<string, Record<string, MilestoneOverride>>;
type MilestoneState = { def: MilestoneDef; state: 'set' | 'na' | 'source' | 'empty'; value: string; overridden: boolean };

const serviceStaffGroups: Array<{ label: string; keys: string[] }> = [
  { label: 'Lead', keys: ['lead'] },
  { label: 'Lady', keys: ['lady', 'lead_lady'] },
  { label: 'Call', keys: ['call'] },
];

const serviceLogisticsGroups: Array<{ label: string; keys: string[] }> = [
  { label: 'Arrival', keys: ['arrival'] },
  { label: 'Hearse', keys: ['hearse'] },
  { label: 'Limo', keys: ['limo'] },
  { label: 'Casket', keys: ['casket'] },
  { label: 'Flowers', keys: ['flowers'] },
  { label: 'Programs', keys: ['programs'] },
  { label: 'Color', keys: ['color'] },
  { label: 'Extra', keys: ['extra'] },
];

const viewAreaFilters: Record<ViewId, Array<OperationArea | 'smb'> | null> = {
  active: null,
  today: null,
  cases: null,
  service: ['service'],
  arrangements: ['arrangement'],
  'death-certs': ['death-cert'],
  cremains: ['cremains', 'crematory'],
  belongings: ['belongings'],
  files: ['smb', 'production', 'paperwork'],
};

const familyWorkflow: WorkflowStepDefinition[] = [
  {
    id: 'first-call',
    label: 'First call',
    shortLabel: 'Call',
    gridLabel: 'First Call',
    hint: 'Initial call / removal request received',
    terms: ['first call', '1st call', 'call sheet', 'initial call', 'intake', 'hospice', 'place of death'],
    areas: ['death-cert', 'paperwork'],
    keys: ['case', 'place_of_death', 'hospice_nurse', 'phone', 'other_info'],
  },
  {
    id: 'first-meeting',
    label: 'First meeting',
    shortLabel: 'Meet',
    gridLabel: 'Meeting',
    hint: 'Family arrangement conference held',
    terms: ['arrangement', 'appointment', 'meeting', 'conference'],
    areas: ['arrangement'],
    keys: ['arrangement_date', 'appointment_date', 'appointment_time', 'arrangement_location', 'package', 'contract'],
  },
  {
    id: 'pickup',
    label: 'Body pickup',
    shortLabel: 'Pick',
    gridLabel: 'Pickup',
    hint: 'Body in our custody / at crematory',
    terms: ['pickup', 'pick up', 'removal', 'body', 'transfer', 'mokan'],
    areas: ['crematory'],
    keys: ['date_of_cremation', 'pick_up_date', 'place_of_death', 'mokan', 'column_3', 'other_info'],
  },
  {
    id: 'selection',
    label: 'Service selection',
    shortLabel: 'Svc',
    gridLabel: 'Service',
    hint: 'Service type & merchandise selected',
    terms: ['service selection', 'service type', 'chapel', 'church', 'cemetery', 'cremation', 'burial'],
    areas: ['service', 'arrangement'],
    keys: ['service_type', 'disposition_type', 'service_date', 'service_time', 'service_location', 'cemetery', 'crematory', 'date', 'time', 'location', 'lead', 'lady', 'call', 'hearse', 'limo'],
  },
  {
    id: 'media-program',
    label: 'Media and program',
    shortLabel: 'Media',
    gridLabel: 'Media',
    hint: 'Program / obituary / media prepared',
    terms: ['media', 'photo', 'program', 'obituary', 'design', 'print', 'production'],
    areas: ['production'],
    keys: ['relative_path', 'parent_path', 'extension', 'modified_at', 'size_bytes'],
  },
  {
    id: 'death-cert',
    label: 'Death certificate',
    shortLabel: 'DC',
    gridLabel: 'Death Certificate',
    hint: 'MoEVR death certificate filed',
    terms: ['death cert', 'certificate', 'doctor', 'medical', 'registrar', 'filed', 'dr name'],
    areas: ['death-cert'],
    keys: ['case', 'dr_name', 'hospice_nurse', 'place_of_death', 'state', 'c_j_email_dc'],
  },
  {
    id: 'disposition',
    label: 'Service / disposition',
    shortLabel: 'Disp',
    gridLabel: 'Disposition',
    hint: 'Cremation or burial completed',
    terms: ['service', 'cremation', 'crematory', 'cremains', 'burial', 'cemetery', 'committal'],
    areas: ['service', 'crematory', 'cremains'],
    keys: ['date_of_cremation', 'date_of_return', 'pick_up_date', 'mokan', 'paid', 'urn', 'property'],
  },
  {
    id: 'closeout',
    label: 'Closeout',
    shortLabel: 'Close',
    gridLabel: 'Closeout',
    hint: 'Cremains/belongings released, paid, closed',
    terms: ['payment', 'contract', 'belongings', 'release', 'aftercare', 'picked up', 'paperwork'],
    areas: ['belongings', 'cremains'],
    keys: ['paid', 'property', 'urn', 'date_of_return', 'pick_up_date', 'signature_of_receiver'],
  },
];

function sourcePayload(item: DashboardItem) {
  return item.sourcePayload ?? {};
}

function normalizeKey(value: string) {
  // Keep generational suffixes (Jr/Sr/II/III) — they distinguish different people
  // ("Abernathy, John" vs "Abernathy, John Jr."), so stripping them wrongly merged cases.
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(value: string) {
  return normalizeKey(value)
    .split(' ')
    .filter((token) => token.length > 1 && !['the', 'and', 'for', 'with'].includes(token));
}

function tokenMatchScore(candidate: string, target: string) {
  const candidateTokens = Array.from(new Set(nameTokens(candidate)));
  const targetTokens = new Set(nameTokens(target));
  if (candidateTokens.length < 2 || targetTokens.size < 2) return 0;
  const matches = candidateTokens.filter((token) => targetTokens.has(token)).length;
  return Math.min(matches / candidateTokens.length, matches / targetTokens.size);
}

function isServerMediaItem(item: DashboardItem) {
  const payload = sourcePayload(item);
  if (cleanDisplay(payload.scan_root) === 'true' || cleanDisplay(payload.item_type) === 'directory') return false;
  const text = `${item.source} ${item.sourceRef ?? ''} ${payload.top_level ?? ''} ${payload.extension ?? ''}`.toLowerCase();
  return item.source.startsWith('SMB:') && (
    item.area === 'production' ||
    text.includes('program') ||
    text.includes('publisher') ||
    text.includes('picture') ||
    text.includes('photo') ||
    text.includes('video') ||
    text.includes('register') ||
    ['.pdf', '.pub', '.jpg', '.jpeg', '.png', '.heic', '.webp', '.mp4', '.pptx', '.doc', '.docx', '.zip'].includes(cleanDisplay(payload.extension).toLowerCase())
  );
}

function cleanDisplay(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isTimeOnlyLabel(value: string) {
  return /^\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?$/i.test(cleanDisplay(value));
}

function isPseudoCaseItem(item: DashboardItem) {
  const payload = sourcePayload(item);
  const normalizedLabel = normalizeKey(item.label);
  if (item.source === 'Arrangements' && isTimeOnlyLabel(item.label)) return true;
  if (item.source === 'Arrangements' && ['time', 'date', 'day', 'block', 'lunch'].includes(normalizedLabel)) return true;
  if (item.source === 'Arrangements' && cleanDisplay(payload.case_match_basis) !== 'arrangement calendar cell' && isTimeOnlyLabel(itemName(item))) return true;
  return false;
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

function displayKey(key: string) {
  return key
    .replace(/^_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
  return 'border-neutral-200 bg-neutral-50 text-neutral-800';
}

function priorityRank(item: DashboardItem) {
  if (item.priority === 'critical') return 4;
  if (item.priority === 'high') return 3;
  if (item.priority === 'normal') return 2;
  return 1;
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

function parseOperationalDate(value: unknown) {
  const text = cleanDisplay(value);
  if (!text) return null;

  const relative = text.toLowerCase();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (relative === 'today' || relative.includes('due today')) return today;
  if (relative === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slash = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/);
  if (slash) {
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    const parsed = new Date(year, Number(slash[1]) - 1, Number(slash[2]), 12);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // No unguarded `new Date(text)` fallback: JS Date.parse is locale/heuristic-driven
  // and will silently coerce ambiguous or garbled strings (a lone year, "March", a
  // mis-ordered MM/DD) into a wrong date, which then mis-buckets a case into/out of the
  // active window. Anything not matched by the explicit formats above is treated as
  // "no date" (null) rather than guessed.
  return null;
}

function itemBusinessDates(item: DashboardItem) {
  const payload = sourcePayload(item);
  return [
    item.due,
    ...receivedDateKeys.map((key) => payload[key]),
  ]
    .map(parseOperationalDate)
    .filter((date): date is Date => Boolean(date));
}

function recordIsActive(record: CaseRecord) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - activeCaseWindowDays);
  cutoff.setHours(0, 0, 0, 0);
  // Active requires at least one REAL business date within the window. Rows with no
  // parseable date are treated as unknown (not active) rather than falling back to the
  // DB sync timestamp (item.createdAt), which is refreshed to now() on every re-sync and
  // therefore always "recent" — that fallback kept every undated/closed case (e.g. a 2024
  // belongings row) permanently on the primary board.
  return record.items.some((item) => itemBusinessDates(item).some((date) => date >= cutoff));
}

function recordHasTodayWork(record: CaseRecord, statusOverrides: Record<string, StatusOverride>) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const datedToday = record.items.some((item) => itemBusinessDates(item).some((date) => date >= start && date <= end));
  if (datedToday) return true;

  return workflowStepStates(record, statusOverrides).some((state) => {
    if (state.done || !state.item) return false;
    return state.item.priority === 'critical' || state.item.status.toLowerCase().includes('needed') || state.item.status.toLowerCase().includes('missing');
  });
}

function isSameLocalDay(date: Date, compareTo: Date) {
  return date.getFullYear() === compareTo.getFullYear() &&
    date.getMonth() === compareTo.getMonth() &&
    date.getDate() === compareTo.getDate();
}

function isSameLocalMonth(date: Date, compareTo: Date) {
  return date.getFullYear() === compareTo.getFullYear() && date.getMonth() === compareTo.getMonth();
}

function firstCallsTodayCount(records: CaseRecord[]) {
  const today = new Date();
  const firstCallStep = familyWorkflow.find((step) => step.id === 'first-call');
  if (!firstCallStep) return 0;

  return records.filter((record) => {
    const item = workflowItemsFor(record, firstCallStep)[0];
    if (!item) return false;
    return itemBusinessDates(item).some((date) => isSameLocalDay(date, today));
  }).length;
}

function completedServicesThisMonthCount(records: CaseRecord[], statusOverrides: Record<string, StatusOverride>) {
  const today = new Date();
  return records.filter((record) => record.items.some((item) => (
    item.area === 'service' &&
    isWorkflowDone(item, statusOverrides[item.id]) &&
    itemBusinessDates(item).some((date) => isSameLocalMonth(date, today))
  ))).length;
}

function itemName(item: DashboardItem) {
  const payload = sourcePayload(item);
  return (
    cleanDisplay(payload.name_of_deceased) ||
    cleanDisplay(payload.deceased) ||
    cleanDisplay(payload.name) ||
    cleanDisplay(item.label) ||
    'Unknown'
  );
}

function caseKeyForItem(item: DashboardItem) {
  const payload = sourcePayload(item);
  const matchKey = cleanDisplay(payload.case_match_key);
  if (matchKey) return matchKey;
  return normalizeKey(itemName(item)) || item.id;
}

function compactValues(item: DashboardItem, keys: string[]) {
  const payload = sourcePayload(item);
  return keys.map((key) => safeFieldValue(key, cleanDisplay(payload[key]))).filter(Boolean);
}

function collectGroupedEntries(item: DashboardItem, groups: Array<{ label: string; keys: string[] }>) {
  const entries: MenuEntry[] = [];
  for (const group of groups) {
    const values = compactValues(item, group.keys);
    if (values.length) {
      entries.push({
        label: group.label,
        value: Array.from(new Set(values)).join(' / '),
        source: item.source,
      });
    }
  }
  if (!entries.length && item.due) {
    entries.push({ label: 'Dashboard due', value: item.due, source: item.source });
  }
  return entries;
}

function dedupeMenuEntries(entries: MenuEntry[]) {
  const byValue = new Map<string, { label: string; value: string; sources: Set<string> }>();
  for (const entry of entries) {
    const key = `${normalizeKey(entry.label)}|${normalizeKey(entry.value)}`;
    const current = byValue.get(key);
    if (current) {
      current.sources.add(entry.source);
      continue;
    }
    byValue.set(key, {
      label: entry.label,
      value: entry.value,
      sources: new Set([entry.source]),
    });
  }

  return Array.from(byValue.values()).map((entry) => {
    const sources = Array.from(entry.sources);
    return {
      label: entry.label,
      value: entry.value,
      source: sources.length > 1 ? `${sources[0]} +${sources.length - 1}` : sources[0],
    };
  });
}

function collectTextEntries(item: DashboardItem) {
  const redundantKeys = new Set([
    'name',
    'name_of_deceased',
    'deceased_name_last_first',
    'case_match_key',
    'case_match_basis',
  ]);
  return Object.entries(sourcePayload(item))
    .filter(([key, value]) => !key.startsWith('_') && !redundantKeys.has(key) && cleanDisplay(value))
    .map(([key, value]) => [key, safeFieldValue(key, cleanDisplay(value))] as const);
}

function isContactLike(value: string | null | undefined) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Reject timestamps/dates/bare numbers that leak in from time columns — a contact is a person.
  if (/^\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\s*$/i.test(trimmed)) return false;
  if (/^\d{1,4}([\/-]\d{1,4}){1,2}$/.test(trimmed)) return false;
  if (!/[a-z]/i.test(trimmed)) return false;
  return true;
}

// Internal teams/roles and logistics flags — never a family contact / next of kin.
const NON_CONTACT_OWNERS = new Set([
  'Staff', 'Hearse', 'Limo', 'Programs', 'Flowers', 'Casket', 'Color', 'No', 'Yes', 'N/A', 'NA',
  'Front desk', 'Crematory', 'Death Certificate', 'Service team', 'Arranger', 'Director', 'Dispatch',
  'Media', 'Design', 'Office', 'Staff team',
]);
// The real family-contact model (case_contact) is a separate build; until then we only show
// a value here when it is plausibly a person AND not an internal team. Otherwise empty, so the
// column never misrepresents an internal team as the grieving family's contact.
function ownerFor(items: DashboardItem[]) {
  return items.find((item) => item.owner && !NON_CONTACT_OWNERS.has(item.owner) && isContactLike(item.owner))?.owner || '';
}

// Human-readable Date of Transition (date of death). Input is canonical YYYY-MM-DD.
function formatTransitionDate(raw: string) {
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// First non-empty source-derived value for a milestone, across the case's source rows.
function sourceMilestoneValue(record: CaseRecord, sourceKeys: string[]) {
  for (const item of record.items) {
    const payload = sourcePayload(item);
    for (const key of sourceKeys) {
      const value = cleanDisplay(payload[key]);
      if (value) return value;
    }
  }
  return '';
}

// Effective milestone = staff override (value or N/A) ?? source-derived default ?? empty.
function effectiveMilestone(record: CaseRecord, def: MilestoneDef, overrides: MilestoneOverrideMap): MilestoneState {
  const override = overrides[record.key]?.[def.key];
  if (override) {
    if (override.isNa) return { def, state: 'na', value: '', overridden: true };
    if (override.value) return { def, state: 'set', value: override.value, overridden: true };
  }
  const source = sourceMilestoneValue(record, def.sourceKeys);
  if (source) return { def, state: 'source', value: source, overridden: false };
  return { def, state: 'empty', value: '', overridden: false };
}

function milestoneSearchText(record: CaseRecord, overrides: MilestoneOverrideMap) {
  return ALL_MILESTONES.map((def) => {
    const state = effectiveMilestone(record, def, overrides);
    return state.state === 'na' ? `${def.full} n/a` : state.value;
  })
    .filter(Boolean)
    .join(' ');
}

// Compact grid display: one labeled micro-row per populated/N/A milestone; empties hidden.
function MilestoneChips({
  record,
  defs,
  overrides,
  onOpen,
}: {
  record: CaseRecord;
  defs: MilestoneDef[];
  overrides: MilestoneOverrideMap;
  onOpen: () => void;
}) {
  const states = defs.map((def) => effectiveMilestone(record, def, overrides)).filter((state) => state.state !== 'empty');
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open case to edit scheduling & locations"
      className="block w-full rounded-md px-1 py-1 text-left text-[11px] leading-tight outline-none transition hover:bg-neutral-100 focus:bg-[#fff7d7]"
    >
      {states.length ? (
        <div className="flex flex-col gap-0.5">
          {states.map((state) => (
            <span key={state.def.key} className="truncate">
              <span className="text-neutral-400">{state.def.label}: </span>
              <span className={state.state === 'na' ? 'italic text-neutral-400' : 'font-semibold text-neutral-800'}>
                {state.state === 'na' ? 'N/A' : state.value}
              </span>
              {state.overridden ? <span className="text-[#a77d00]" title="Staff override"> •</span> : null}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-neutral-400">—</span>
      )}
    </button>
  );
}

type CommitMilestone = (record: CaseRecord, def: MilestoneDef, value: string, isNa: boolean, initials: string) => Promise<void>;

// One editable milestone field in the drawer: shows source default + staff override, with
// inline edit, an N/A toggle, and a "use source" revert. Initials-gated on save.
function MilestoneField({ record, def, overrides, onCommit }: { record: CaseRecord; def: MilestoneDef; overrides: MilestoneOverrideMap; onCommit: CommitMilestone }) {
  const effective = effectiveMilestone(record, def, overrides);
  const source = sourceMilestoneValue(record, def.sourceKeys);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function begin() {
    setDraft(effective.state === 'set' ? effective.value : '');
    setError('');
    setEditing(true);
  }
  async function run(value: string, isNa: boolean, needInitials: boolean) {
    const initials = needInitials ? promptInitials() : rememberedInitials();
    if (needInitials && !initials) return;
    setBusy(true);
    setError('');
    try {
      await onCommit(record, def, value, isNa, initials);
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" onClick={begin} className="block rounded-md bg-neutral-50 px-2 py-1.5 text-left text-xs transition hover:bg-[#fff7d7]">
        <span className="block font-semibold text-neutral-500">
          {def.full}
          {effective.overridden ? (
            <span className="ml-1 text-[10px] text-[#a77d00]">staff</span>
          ) : source ? (
            <span className="ml-1 text-[10px] text-neutral-400">source</span>
          ) : null}
        </span>
        <span className={`block break-words ${effective.state === 'na' ? 'italic text-neutral-400' : effective.state === 'empty' ? 'text-neutral-400' : 'text-neutral-900'}`}>
          {effective.state === 'na' ? 'N/A' : effective.state === 'empty' ? 'Set…' : effective.value}
        </span>
      </button>
    );
  }
  return (
    <div className="rounded-md border border-[#efb70c]/40 bg-[#fffaf0] p-2 text-xs">
      <div className="font-semibold text-neutral-500">{def.full}</div>
      {source ? <div className="truncate text-[10px] text-neutral-400">Source: {source}</div> : null}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={def.kind === 'date' ? 'e.g. Jun 3, 11a' : 'Location'}
        className="mt-1 h-8 w-full rounded-md border border-neutral-300 px-2 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
        autoFocus
      />
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" disabled={busy} onClick={() => run(draft, false, true)} className="h-7 rounded-md bg-black px-2 font-semibold text-[#efb70c] disabled:opacity-60">Save</button>
        <button type="button" disabled={busy} onClick={() => run('', true, true)} className="h-7 rounded-md bg-neutral-200 px-2 font-semibold text-neutral-700 disabled:opacity-60">N/A</button>
        {effective.overridden ? <button type="button" disabled={busy} onClick={() => run('', false, false)} className="h-7 rounded-md px-2 font-semibold text-neutral-500 hover:bg-neutral-100">Use source</button> : null}
        <button type="button" onClick={() => setEditing(false)} className="h-7 rounded-md px-2 font-semibold text-neutral-500 hover:bg-neutral-100">Cancel</button>
      </div>
      {error ? <div className="mt-1 text-red-700">{error}</div> : null}
    </div>
  );
}

function MilestoneEditor({ record, overrides, onCommit }: { record: CaseRecord; overrides: MilestoneOverrideMap; onCommit: CommitMilestone }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-3 py-2">
        <h3 className="text-sm font-bold text-neutral-950">Scheduling &amp; locations</h3>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
        {ALL_MILESTONES.map((def) => (
          <MilestoneField key={def.key} record={record} def={def} overrides={overrides} onCommit={onCommit} />
        ))}
      </div>
    </section>
  );
}

function blockerFor(items: DashboardItem[]) {
  const blockingWords = ['hold', 'missing', 'needed', 'tbd', 'pending', 'waiting', 'incomplete'];
  for (const item of items) {
    const text = `${item.status} ${item.detail} ${Object.values(sourcePayload(item)).join(' ')}`.toLowerCase();
    if (blockingWords.some((word) => text.includes(word))) {
      return item.status.includes('Complete') || item.status.includes('Filed') ? 'None' : item.status;
    }
  }
  return 'None';
}

// Returns a timestamp only when a real STAFF edit exists for this case; '' otherwise so the
// grid doesn't repeat "No staff edits" on every untouched row.
function lastUpdatedFor(items: DashboardItem[], auditEntries: AuditEntry[]) {
  const itemIds = new Set(items.map((item) => item.id));
  const caseKeys = new Set(items.map((item) => caseKeyForItem(item)));
  const audit = auditEntries.find(
    (entry) => itemIds.has(entry.itemId) || [...caseKeys].some((key) => entry.itemId.startsWith(`${key}:`)),
  );
  return audit ? formatStamp(audit.changedAt) : '';
}

function buildCases(items: DashboardItem[], auditEntries: AuditEntry[]) {
  const groups = new Map<string, DashboardItem[]>();
  const knownCases: Array<{ key: string; name: string }> = [];

  for (const item of items) {
    if (isServerMediaItem(item) || isPseudoCaseItem(item)) continue;
    const key = caseKeyForItem(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
    const name = itemName(item);
    if (!knownCases.some((known) => known.key === key)) {
      knownCases.push({ key, name });
    }
  }

  for (const item of items) {
    if (!isServerMediaItem(item)) continue;
    const payload = sourcePayload(item);
    const mediaName = [
      cleanDisplay(payload.case_match_key),
      cleanDisplay(payload.name),
      item.label,
      item.sourceRef ?? '',
    ].join(' ');
    let best = { key: caseKeyForItem(item), score: 0 };
    for (const knownCase of knownCases) {
      const score = Math.max(
        tokenMatchScore(knownCase.name, mediaName),
        tokenMatchScore(knownCase.key, mediaName),
      );
      if (score > best.score) best = { key: knownCase.key, score };
    }
    const key = best.score >= 0.6 ? best.key : caseKeyForItem(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return Array.from(groups.entries()).map(([key, groupedItems]) => {
    const sortedItems = [...groupedItems].sort((a, b) => priorityRank(b) - priorityRank(a));
    const primaryItem = sortedItems[0];
    const statusItem = sortedItems.find((item) => item.area !== 'paperwork' && !item.source.startsWith('SMB:')) ?? primaryItem;
    const dateEntries = dedupeMenuEntries(sortedItems.flatMap((item) => collectGroupedEntries(item, dateGroups)));
    const locationEntries = dedupeMenuEntries(sortedItems.flatMap((item) => collectGroupedEntries(item, locationGroups)));
    const serviceItems = sortedItems.filter((item) => item.area === 'service');
    const serviceStaffEntries = dedupeMenuEntries(serviceItems.flatMap((item) => collectGroupedEntries(item, serviceStaffGroups)));
    const serviceLogisticsEntries = dedupeMenuEntries(serviceItems.flatMap((item) => collectGroupedEntries(item, serviceLogisticsGroups)));
    const areaCounts = sortedItems.reduce<Partial<Record<OperationArea, number>>>((counts, item) => {
      counts[item.area] = (counts[item.area] ?? 0) + 1;
      return counts;
    }, {});
    // Date of Transition (date of death): prefer the death-cert row's captured value, else
    // any row that carries one. Stays null until staff capture it (no guessing).
    const dateOfTransition =
      sortedItems.find((item) => item.area === 'death-cert' && item.dateOfDeath)?.dateOfDeath ||
      sortedItems.find((item) => item.dateOfDeath)?.dateOfDeath ||
      null;

    const record: CaseRecord = {
      key,
      name: itemName(statusItem),
      items: sortedItems,
      primaryItem,
      statusItem,
      dateEntries,
      locationEntries,
      serviceStaffEntries,
      serviceLogisticsEntries,
      owner: ownerFor(sortedItems),
      dateOfTransition,
      blocker: blockerFor(sortedItems),
      updatedAt: lastUpdatedFor(sortedItems, auditEntries),
      areaCounts,
      searchText: '',
    };

    record.searchText = [
      record.name,
      record.owner,
      record.blocker,
      key,
      // Make the displayed Date of Transition searchable (raw + human-readable).
      dateOfTransition ?? '',
      dateOfTransition ? formatTransitionDate(dateOfTransition) : '',
      ...sortedItems.flatMap((item) => [item.label, item.detail, item.source, item.sourceRef ?? '', ...Object.values(sourcePayload(item))]),
    ].join(' ').toLowerCase();
    return record;
  });
}

function recordMatchesView(record: CaseRecord, view: ViewId, statusOverrides: Record<string, StatusOverride>) {
  if (view === 'active') return recordIsActive(record);
  if (view === 'today') return recordHasTodayWork(record, statusOverrides);
  if (view === 'cases') return true;
  const filters = viewAreaFilters[view];
  if (!filters) return true;
  return record.items.some((item) => filters.includes(item.area) || (filters.includes('smb') && item.source.startsWith('SMB:')));
}

function searchableItemText(item: DashboardItem) {
  return [
    item.area,
    item.label,
    item.detail,
    item.owner,
    item.due,
    item.source,
    item.status,
    ...Object.entries(sourcePayload(item)).flatMap(([key, value]) => [key, cleanDisplay(value)]),
  ].join(' ').toLowerCase();
}

function isWorkflowDone(item: DashboardItem, override?: StatusOverride) {
  const status = (override?.status ?? item.status).toLowerCase();
  return (
    status.includes('complete') ||
    status.includes('filed') ||
    status.includes('verified') ||
    status.includes('approved') ||
    status.includes('published') ||
    status.includes('printed') ||
    status.includes('returned') ||
    status.includes('released') ||
    status.includes('picked up')
  );
}

function workflowItemsFor(record: CaseRecord, step: WorkflowStepDefinition) {
  const scored = record.items.map((item) => {
    const text = searchableItemText(item);
    const payload = sourcePayload(item);
    const keyHits = step.keys.filter((key) => cleanDisplay(payload[key])).length;
    const termHits = step.terms.filter((term) => text.includes(term)).length;
    const areaHit = step.areas.includes(item.area) ? 2 : 0;
    const mediaBoost = step.id === 'media-program' && isServerMediaItem(item) ? 3 : 0;
    return { item, score: keyHits * 2 + termHits + areaHit + mediaBoost };
  });
  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || priorityRank(b.item) - priorityRank(a.item))
    .map(({ item }) => item);
}

function workflowFacts(item: DashboardItem, step: WorkflowStepDefinition) {
  const payload = sourcePayload(item);
  const facts: Array<{ label: string; value: string }> = [];
  for (const key of step.keys) {
    const value = safeFieldValue(key, cleanDisplay(payload[key]));
    if (!value) continue;
    if (['case_match_key', 'case_match_basis', 'name', 'name_of_deceased', 'deceased_name_last_first'].includes(key)) continue;
    facts.push({ label: displayKey(key), value });
  }

  if (step.id === 'media-program' && isServerMediaItem(item)) {
    const extension = cleanDisplay(payload.extension).replace('.', '').toUpperCase();
    const folder = cleanDisplay(payload.top_level) || cleanDisplay(payload.parent_path);
    return [
      { label: 'File', value: item.label },
      extension ? { label: 'Type', value: extension } : null,
      folder ? { label: 'Folder', value: folder } : null,
      item.sourceRef ? { label: 'Path', value: item.sourceRef } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }

  return facts.slice(0, 5);
}

function workflowSummary(item: DashboardItem | null, step: WorkflowStepDefinition, override?: StatusOverride) {
  if (!item) return 'No linked item yet';
  const facts = workflowFacts(item, step);
  const status = override?.status ?? item.status;
  if (facts[0]) return facts[0].value;
  if (item.due) return item.due;
  return status;
}

function workflowStepStates(record: CaseRecord, statusOverrides: Record<string, StatusOverride>) {
  return familyWorkflow.map<WorkflowStepState>((step) => {
    const item = workflowItemsFor(record, step)[0] ?? null;
    const override = item ? statusOverrides[item.id] : undefined;
    return {
      step,
      item,
      done: item ? isWorkflowDone(item, override) : false,
      summary: workflowSummary(item, step, override),
    };
  });
}

type WorkflowOverride = { state: 'done' | 'pending'; initials: string; updatedAt: string };
type WorkflowOverrideMap = Record<string, Record<string, WorkflowOverride>>;

function effectiveItemStatus(item: DashboardItem, statusOverrides: Record<string, StatusOverride>) {
  return (statusOverrides[item.id]?.status ?? item.status ?? '').toLowerCase();
}

// Evidence already present in a case's data, used to AUTO-derive workflow steps. Principle:
// reaching a later milestone (a service date, a cremation date, a filed cert) proves the
// prerequisite steps happened — "milestone backfill".
function caseEvidence(record: CaseRecord, statusOverrides: Record<string, StatusOverride>) {
  const items = record.items;
  const payloads = items.map(sourcePayload);
  const anyPayload = (keys: string[]) => payloads.some((payload) => keys.some((key) => cleanDisplay(payload[key])));
  const statusIn = (area: OperationArea, needles: string[]) =>
    items.some((item) => item.area === area && needles.some((needle) => effectiveItemStatus(item, statusOverrides).includes(needle)));
  const hasArea = (...areas: OperationArea[]) => items.some((item) => areas.includes(item.area));

  const serviceScheduled = items.some(
    (item) => item.area === 'service' && (itemBusinessDates(item).length > 0 || Boolean(cleanDisplay(item.due))),
  );
  const hasLocation = anyPayload(['cemetery', 'cemetery_name', 'committal_location', 'service_location', 'crematory']);
  const bodyInCustody = anyPayload(['at_mokan_since', 'date_of_cremation', 'pick_up_date', 'mokan']);
  const hasSelection = anyPayload(['casket', 'package', 'contract', 'disposition_type', 'service_type', 'urn']) || serviceScheduled;
  const cremationDone = anyPayload(['date_of_cremation']);
  const cremainsBack = statusIn('cremains', ['returned', 'picked up']) || anyPayload(['date_of_return', 'pick_up_date']);
  const dispositionDone = cremationDone || cremainsBack || statusIn('crematory', ['completed', 'returned']);

  return {
    exists: items.length > 0,
    hasArrangement: hasArea('arrangement'),
    serviceScheduled,
    hasLocation,
    bodyInCustody,
    hasSelection,
    hasMedia: items.some(isServerMediaItem),
    dcFiled: statusIn('death-cert', ['filed']),
    dispositionDone,
    cremainsBack,
    belongingsReleased: statusIn('belongings', ['released']),
    hasCremains: hasArea('cremains'),
    hasBelongings: hasArea('belongings'),
  };
}

type CaseEvidence = ReturnType<typeof caseEvidence>;

function autoStepDone(stepId: string, evidence: CaseEvidence): boolean {
  switch (stepId) {
    case 'first-call':
      return evidence.exists; // a case only exists because someone called
    case 'first-meeting':
      return evidence.hasArrangement || evidence.serviceScheduled || evidence.hasLocation || evidence.hasSelection || evidence.dispositionDone;
    case 'pickup':
      return evidence.bodyInCustody || evidence.serviceScheduled || evidence.dispositionDone;
    case 'selection':
      return evidence.hasSelection || evidence.serviceScheduled;
    case 'media-program':
      return evidence.hasMedia;
    case 'death-cert':
      return evidence.dcFiled;
    case 'disposition':
      return evidence.dispositionDone;
    case 'closeout':
      return (
        evidence.dcFiled &&
        evidence.dispositionDone &&
        (evidence.cremainsBack || !evidence.hasCremains) &&
        (evidence.belongingsReleased || !evidence.hasBelongings)
      );
    default:
      return false;
  }
}

type EffectiveStepState = {
  step: WorkflowStepDefinition;
  item: DashboardItem | null;
  auto: boolean;
  overridden: boolean;
  done: boolean;
  gap: boolean;
  summary: string;
};

function effectiveWorkflowStates(
  record: CaseRecord,
  statusOverrides: Record<string, StatusOverride>,
  workflowOverrides: WorkflowOverrideMap,
): EffectiveStepState[] {
  const evidence = caseEvidence(record, statusOverrides);
  const caseOverrides = workflowOverrides[record.key] ?? {};

  const base = familyWorkflow.map((step) => {
    const item = workflowItemsFor(record, step)[0] ?? null;
    const override = caseOverrides[step.id];
    const auto = autoStepDone(step.id, evidence) || (item ? isWorkflowDone(item, statusOverrides[item.id]) : false);
    const done = override ? override.state === 'done' : auto;
    return {
      step,
      item,
      auto,
      overridden: Boolean(override),
      done,
      summary: workflowSummary(item, step, item ? statusOverrides[item.id] : undefined),
    };
  });

  // Gap flag: an earlier step not done while a LATER step is done — a likely missed step.
  const lastDoneIdx = base.reduce((max, state, index) => (state.done ? index : max), -1);
  return base.map((state, index) => ({ ...state, gap: !state.done && index < lastDoneIdx }));
}


type ToggleStep = (
  record: CaseRecord,
  step: WorkflowStepDefinition,
  state: 'done' | 'pending' | 'auto',
  initials: string,
) => Promise<void>;

function rememberedInitials() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('ggfc_staff_initials') ?? '';
}

// Return the staff initials, prompting once if none are remembered. Returns '' if the user
// cancels — callers must not record a change without initials (audit-trail requirement).
function promptInitials() {
  let initials = rememberedInitials();
  if (!initials && typeof window !== 'undefined') {
    initials = (window.prompt('Enter your initials to record this change') ?? '').trim().toUpperCase().slice(0, 5);
    if (initials) window.localStorage.setItem('ggfc_staff_initials', initials);
  }
  return initials;
}

function WorkflowStepButton({
  record,
  state,
  onToggleStep,
  onOpenDetails,
}: {
  record: CaseRecord;
  state: EffectiveStepState;
  onToggleStep: ToggleStep;
  onOpenDetails: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 240)) });
    setInitials(rememberedInitials());
    setError('');
    setOpen(true);
  }

  async function apply(next: 'done' | 'pending' | 'auto') {
    const clean = initials.trim().toUpperCase();
    if (next !== 'auto' && !clean) {
      setError('Initials required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (clean && typeof window !== 'undefined') window.localStorage.setItem('ggfc_staff_initials', clean);
      await onToggleStep(record, state.step, next, clean);
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  const tone = state.gap
    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
    : state.done
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
      : state.item || state.auto
        ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
        : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        title={`${state.step.label} — ${state.step.hint}. ${
          state.done ? 'Done' : state.gap ? 'Needs attention — a later step is already done' : 'Not done'
        }${state.overridden ? ' (set by staff)' : ' (auto-detected)'}. ${state.summary}. Click to set.`}
        aria-label={`${state.step.label}: ${state.step.hint}. ${state.done ? 'done' : state.gap ? 'gap' : 'not done'} for ${record.name}. Click to set.`}
        className={`flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold leading-tight transition ${tone}`}
      >
        <span
          className={`flex h-3 w-3 shrink-0 items-center justify-center rounded border text-[8px] ${
            state.done
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : state.gap
                ? 'border-red-500 bg-red-500 text-white'
                : 'border-neutral-400 bg-white text-neutral-300'
          }`}
        >
          {state.gap && !state.done ? '!' : '✓'}
        </span>
        <span className="min-w-0 flex-1 truncate">{state.step.gridLabel}</span>
        {state.overridden ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={`${state.step.label} status`}
            className="fixed z-50 w-56 rounded-lg border border-neutral-200 bg-white p-2 text-xs shadow-xl"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="px-1 pb-0.5 font-bold text-neutral-900">{state.step.label}</div>
            <div className="px-1 pb-2 text-[11px] text-neutral-500">
              {state.summary}
              {!state.overridden ? ` · auto: ${state.auto ? 'done' : 'pending'}` : ' · set by staff'}
            </div>
            <input
              value={initials}
              onChange={(event) => setInitials(event.target.value)}
              placeholder="Your initials"
              maxLength={5}
              className="mb-2 h-8 w-full rounded-md border border-neutral-300 px-2 text-sm uppercase outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
            />
            <div className="grid grid-cols-3 gap-1">
              <button type="button" disabled={busy} onClick={() => apply('done')} className="h-8 rounded-md bg-emerald-600 px-1 font-semibold text-white disabled:opacity-60">Done</button>
              <button type="button" disabled={busy} onClick={() => apply('pending')} className="h-8 rounded-md bg-amber-500 px-1 font-semibold text-white disabled:opacity-60">Not done</button>
              <button type="button" disabled={busy} onClick={() => apply('auto')} className="h-8 rounded-md bg-neutral-200 px-1 font-semibold text-neutral-700 disabled:opacity-60">Auto</button>
            </div>
            {error ? <div className="mt-1 px-1 text-red-700">{error}</div> : null}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenDetails();
              }}
              className="mt-2 w-full rounded-md px-1 py-1 text-left text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100"
            >
              Open case details →
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

function WorkflowProgressCell({
  record,
  states,
  statusOverrides,
  onToggleStep,
  onOpenDetails,
}: {
  record: CaseRecord;
  states: EffectiveStepState[];
  statusOverrides: Record<string, StatusOverride>;
  onToggleStep: ToggleStep;
  onOpenDetails: () => void;
}) {
  const doneCount = states.filter((state) => state.done).length;

  return (
    <div className="px-2 py-1.5">
      <GridDeathCertPill record={record} statusOverrides={statusOverrides} />
      {/* Compact checklist of funeral-home work items (click any to toggle). The open/red
          boxes ARE the next action — no separate next-action line. */}
      <div className="grid grid-cols-2 gap-1">
        {states.map((state) => (
          <WorkflowStepButton
            key={state.step.id}
            record={record}
            state={state}
            onToggleStep={onToggleStep}
            onOpenDetails={onOpenDetails}
          />
        ))}
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-2 text-[10px] font-medium text-neutral-400">
        <span className="shrink-0">{doneCount}/{states.length} done</span>
        {record.updatedAt ? <span className="ml-auto shrink-0">{record.updatedAt}</span> : null}
      </div>
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="h-8 rounded-md border border-neutral-200 bg-white px-2 py-1 text-right leading-tight">
      <div className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="text-sm font-black text-neutral-950">{value}</div>
    </div>
  );
}

// Compact dropdown for the category filter-views, replacing six always-on header buttons.
function ViewFilterMenu({ activeView, onChoose }: { activeView: ViewId; onChoose: (view: ViewId) => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const activeIsCategory = categoryViews.includes(activeView);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 200)) });
    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Filter the list by category"
        className={`flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-bold transition ${
          activeIsCategory ? 'bg-black text-[#efb70c]' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
        }`}
      >
        {activeIsCategory ? viewLabels[activeView] : 'Categories'}
        <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" className="fixed z-50 w-48 rounded-lg border border-neutral-200 bg-white p-1 text-xs shadow-xl" style={{ top: pos.top, left: pos.left }}>
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">Filter by category</div>
            {categoryViews.map((view) => (
              <button
                key={view}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChoose(view);
                  setOpen(false);
                }}
                className={`block w-full rounded-md px-2 py-1.5 text-left font-semibold transition ${
                  activeView === view ? 'bg-black text-[#efb70c]' : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {viewLabels[view]}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
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
        onClick={(event) => {
          event.stopPropagation();
          const rect = triggerRef.current?.getBoundingClientRect();
          if (rect) {
            setMenuPosition({
              top: rect.bottom + 6,
              left: Math.max(12, Math.min(rect.right - 288, window.innerWidth - 304)),
            });
          }
          setNextStatus(currentStatus);
          setOpen((value) => !value);
        }}
        className={`inline-flex h-6 max-w-36 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold leading-none shadow-sm transition hover:shadow ${statusTone(currentStatus)}`}
      >
        <span className="truncate">{currentStatus}</span>
        {override?.initials ? <span className="rounded bg-white/70 px-1 text-[10px]">{override.initials}</span> : null}
      </button>

      {open ? (
        <div
          id={`${controlId}-menu`}
          role="dialog"
          aria-label={`Status editor for ${item.label}`}
          onClick={(event) => event.stopPropagation()}
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
            placeholder="DP"
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

function EditableField({
  label,
  value,
  itemId,
  field,
  multiline = false,
  inputType = 'text',
  placeholder,
  onUpdate,
}: {
  label: string;
  value: string;
  itemId: string;
  field: Exclude<EditableItemField, 'priority'>;
  multiline?: boolean;
  inputType?: 'text' | 'date';
  placeholder?: string;
  onUpdate: (itemId: string, field: EditableItemField, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  async function save() {
    const nextValue = draft.trim();
    if (nextValue === value) {
      setEditing(false);
      setError('');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onUpdate(itemId, field, nextValue);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group block w-full rounded-md bg-neutral-50 px-2 py-1.5 text-left text-xs transition hover:bg-[#fff7d7] hover:ring-1 hover:ring-[#efb70c]/40"
        title={`Edit ${label}`}
      >
        <span className="block font-semibold text-neutral-500">{label}</span>
        <span className={`block whitespace-pre-wrap break-words text-neutral-900 ${value ? '' : 'text-neutral-400'}`}>
          {value || 'Click to set'}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-md border border-[#efb70c]/40 bg-[#fffaf0] p-2">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</label>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') save();
            if (event.key === 'Escape') setEditing(false);
          }}
          rows={3}
          className="mt-1 w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
          autoFocus
        />
      ) : (
        <input
          type={inputType}
          value={draft}
          placeholder={placeholder}
          max={inputType === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
            if (event.key === 'Escape') setEditing(false);
          }}
          className="mt-1 h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
          autoFocus
        />
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-red-700">{error}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(false)} className="h-8 rounded-md px-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-8 rounded-md bg-black px-3 text-xs font-semibold text-[#efb70c] disabled:opacity-60"
          >
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Missouri MoEVR death-cert filing deadline (5 days from death, RSMo 193.145). Fail-closed:
// if there is no Date of Death captured, prompt for it rather than inventing a deadline.
function DeathCertDeadline({ item, effectiveStatus }: { item: DashboardItem; effectiveStatus: string }) {
  if (item.area !== 'death-cert') return null;
  const filed = (effectiveStatus || '').toLowerCase() === 'filed';
  const deadline = deathCertDeadline(item.dateOfDeath);

  if (!deadline) {
    return (
      <div className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
        Add date of death to track the MoEVR 5-day filing deadline.
      </div>
    );
  }
  if (filed) {
    return (
      <div className="mt-1 rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-500">
        Filed · MoEVR deadline was {deadline.deadlineLabel}
      </div>
    );
  }
  const tone =
    deadline.status === 'overdue'
      ? 'border-red-300 bg-red-50 text-red-800'
      : deadline.status === 'due-soon'
        ? 'border-amber-300 bg-amber-50 text-amber-800'
        : 'border-emerald-300 bg-emerald-50 text-emerald-800';
  const text =
    deadline.status === 'overdue'
      ? `MoEVR filing OVERDUE by ${Math.abs(deadline.daysRemaining)} day${Math.abs(deadline.daysRemaining) === 1 ? '' : 's'} (was due ${deadline.deadlineLabel})`
      : `MoEVR filing due ${deadline.deadlineLabel} · ${deadline.daysRemaining} day${deadline.daysRemaining === 1 ? '' : 's'} left`;
  return <div className={`mt-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${tone}`}>{text}</div>;
}

// Compact board pill surfacing the most-urgent unfiled death-cert deadline for a case,
// so overdue/imminent MoEVR filings are visible without opening the drawer. Renders
// nothing unless a death-cert item has a real DOD and is past/within the window.
function GridDeathCertPill({
  record,
  statusOverrides,
}: {
  record: CaseRecord;
  statusOverrides: Record<string, StatusOverride>;
}) {
  let worst: { status: 'overdue' | 'due-soon'; daysRemaining: number } | null = null;
  for (const item of record.items) {
    if (item.area !== 'death-cert') continue;
    const effective = (statusOverrides[item.id]?.status ?? item.status ?? '').toLowerCase();
    if (effective === 'filed') continue;
    const deadline = deathCertDeadline(item.dateOfDeath);
    if (!deadline || deadline.status === 'ok') continue;
    if (!worst || deadline.daysRemaining < worst.daysRemaining) {
      worst = { status: deadline.status, daysRemaining: deadline.daysRemaining };
    }
  }
  if (!worst) return null;
  const tone = worst.status === 'overdue' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white';
  const label =
    worst.status === 'overdue'
      ? `DC filing overdue ${Math.abs(worst.daysRemaining)}d`
      : `DC due ${worst.daysRemaining}d`;
  return <span className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>;
}

function PrioritySelect({
  item,
  onUpdate,
}: {
  item: DashboardItem;
  onUpdate: (itemId: string, field: EditableItemField, value: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function changePriority(value: string) {
    if (value === item.priority) return;
    setSaving(true);
    try {
      await onUpdate(item.id, 'priority', value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="block rounded-md bg-neutral-50 px-2 py-1.5 text-xs">
      <span className="block font-semibold text-neutral-500">Priority</span>
      <select
        value={item.priority}
        disabled={saving}
        onChange={(event) => changePriority(event.target.value)}
        className="mt-1 h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs font-semibold capitalize outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
      >
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="normal">Normal</option>
        <option value="done">Done</option>
      </select>
    </label>
  );
}

function WorkflowChecklist({
  record,
  statusOverrides,
  workflowOverrides,
  onCommit,
  onUpdate,
  onToggleStep,
}: {
  record: CaseRecord;
  statusOverrides: Record<string, StatusOverride>;
  workflowOverrides: WorkflowOverrideMap;
  onCommit: (item: DashboardItem, nextStatus: string, initials: string) => Promise<void>;
  onUpdate: (itemId: string, field: EditableItemField, value: string) => Promise<void>;
  onToggleStep: ToggleStep;
}) {
  const [openStep, setOpenStep] = useState<string | null>(null);
  const effectiveStates = effectiveWorkflowStates(record, statusOverrides, workflowOverrides);
  const stateById = new Map(effectiveStates.map((state) => [state.step.id, state]));

  const openState = openStep ? stateById.get(openStep) : null;
  const openStepDef = openState?.step ?? null;
  const openRelated = openStepDef ? workflowItemsFor(record, openStepDef) : [];
  const openPrimary = openRelated[0] ?? null;
  const openFacts = openPrimary && openStepDef ? workflowFacts(openPrimary, openStepDef) : [];
  const openDetailItems = openRelated.filter((item) => item.id !== openPrimary?.id).slice(0, 5);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-3 py-2">
        <h3 className="text-sm font-bold text-neutral-950">Family checklist</h3>
      </div>
      {/* Compact multi-column boxes — all 8 steps visible at a glance. Click one to edit below. */}
      <div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-3 xl:grid-cols-4">
        {effectiveStates.map((st) => {
          const open = openStep === st.step.id;
          const tone = st.gap
            ? 'border-red-300 bg-red-50'
            : st.done
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-neutral-200 bg-white hover:bg-neutral-50';
          return (
            <button
              key={st.step.id}
              type="button"
              onClick={() => setOpenStep(open ? null : st.step.id)}
              aria-expanded={open}
              title={`${st.step.label} — ${st.step.hint}`}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs font-semibold transition ${tone} ${open ? 'ring-2 ring-[#efb70c]' : ''}`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] ${
                st.done ? 'border-emerald-600 bg-emerald-600 text-white' : st.gap ? 'border-red-500 bg-red-500 text-white' : 'border-neutral-400 bg-white text-neutral-300'
              }`}>{st.gap && !st.done ? '!' : '✓'}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-900">{st.step.gridLabel}</span>
              {st.overridden ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a77d00]" title="Staff override" /> : null}
            </button>
          );
        })}
      </div>
      {openStepDef ? (
        <div className="space-y-2 border-t border-neutral-200 p-3">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-sm font-bold text-neutral-900">{openStepDef.label}</span>
            <span className="text-[10px] font-semibold text-neutral-400">{openState?.overridden ? 'staff-set' : 'auto'}</span>
            <button type="button" onClick={() => { const i = promptInitials(); if (i) onToggleStep(record, openStepDef, 'done', i); }} className="ml-auto h-7 rounded-md bg-emerald-600 px-2 text-[11px] font-semibold text-white">Done</button>
            <button type="button" onClick={() => { const i = promptInitials(); if (i) onToggleStep(record, openStepDef, 'pending', i); }} className="h-7 rounded-md bg-amber-500 px-2 text-[11px] font-semibold text-white">Not done</button>
            {openState?.overridden ? <button type="button" onClick={() => { const i = promptInitials(); if (i) onToggleStep(record, openStepDef, 'auto', i); }} className="h-7 rounded-md bg-neutral-200 px-2 text-[11px] font-semibold text-neutral-700">Revert to auto</button> : null}
          </div>
          {openPrimary ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Linked status</span>
                <StatusChip item={openPrimary} override={statusOverrides[openPrimary.id]} onCommit={onCommit} />
              </div>
              {openFacts.length ? (
                <div className="grid gap-1 sm:grid-cols-2">
                  {openFacts.map((fact) => (
                    <div key={`${openStepDef.id}-${fact.label}`} className="rounded-md bg-neutral-50 px-2 py-1 text-xs">
                      <span className="font-semibold text-neutral-500">{fact.label}: </span>
                      <span className="text-neutral-900">{fact.value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <EditableField label="Staff note" value={openPrimary.detail} itemId={openPrimary.id} field="detail" multiline onUpdate={onUpdate} />
              {openDetailItems.length ? (
                <div className="grid gap-1 sm:grid-cols-2">
                  {openDetailItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-2 py-1 text-xs">
                      <span className="min-w-0 truncate font-semibold text-neutral-700">{isServerMediaItem(item) ? item.sourceRef ?? item.label : item.source}</span>
                      <StatusChip item={item} override={statusOverrides[item.id]} onCommit={onCommit} />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-md bg-neutral-50 px-2 py-2 text-xs text-neutral-500">No linked dashboard item was found for this stage yet.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function DetailDrawer({
  record,
  statusOverrides,
  workflowOverrides,
  milestoneOverrides,
  auditEntries,
  detailLoading,
  onClose,
  onCommit,
  onUpdate,
  onToggleStep,
  onCommitMilestone,
}: {
  record: CaseRecord | null;
  statusOverrides: Record<string, StatusOverride>;
  workflowOverrides: WorkflowOverrideMap;
  milestoneOverrides: MilestoneOverrideMap;
  auditEntries: AuditEntry[];
  detailLoading: boolean;
  onClose: () => void;
  onCommit: (item: DashboardItem, nextStatus: string, initials: string) => Promise<void>;
  onUpdate: (itemId: string, field: EditableItemField, value: string) => Promise<void>;
  onToggleStep: ToggleStep;
  onCommitMilestone: CommitMilestone;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!record) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeButton = closeButtonRef.current;
    window.setTimeout(() => closeButton?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // Let a nested editor/menu cancel itself first: if a field is focused or a
        // popover menu is open, don't close the whole drawer.
        const active = document.activeElement as HTMLElement | null;
        const inField = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
        const menuOpen = Boolean(document.querySelector('[role="dialog"] [role="menu"], [role="dialog"] [role="dialog"]'));
        if (!inField && !menuOpen) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const drawer = closeButtonRef.current?.closest('[role="dialog"]');
      const focusable = Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null || element === closeButtonRef.current);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [record]);

  if (!record) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        className="h-dvh w-[95vw] max-w-[1840px] overflow-hidden border-l border-neutral-200 bg-white shadow-2xl max-sm:w-[98vw]"
        onClick={(event) => event.stopPropagation()}
        aria-label={`Details for ${record.name}`}
      >
        <div className="border-b border-neutral-200 bg-white px-5 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#a77d00]">Family detail</div>
              <h2 className="mt-1 truncate text-xl font-bold text-neutral-950">{record.name}</h2>
              <div className="mt-1 text-xs text-neutral-500">{record.items.length} related source rows and files</div>
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} className="h-8 rounded-md border border-neutral-200 px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-100">
              Close
            </button>
          </div>
        </div>

        {/* No page scroll: fixed-height body. Primary editables (Schedule + Status) are
            always visible; secondary sections are collapsed boxes that expand in place and
            scroll only inside themselves when opened on a large case. */}
        <div className="flex h-[calc(100dvh-73px)] flex-col overflow-hidden">
          {detailLoading ? (
            <div className="mx-3 mt-3 rounded-md border border-[#efb70c]/30 bg-[#fff8dc] px-3 py-1.5 text-xs font-semibold text-neutral-800">
              Loading all linked rows and files for this family.
            </div>
          ) : null}
          {/* ONE primary scroll for the whole drawer. Collapsible sections expand inline. */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <MilestoneEditor record={record} overrides={milestoneOverrides} onCommit={onCommitMilestone} />
            <WorkflowChecklist
              record={record}
              statusOverrides={statusOverrides}
              workflowOverrides={workflowOverrides}
              onCommit={onCommit}
              onUpdate={onUpdate}
              onToggleStep={onToggleStep}
            />

            <div className="space-y-3">
              <details open className="shrink-0 rounded-lg border border-neutral-200">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-neutral-950">Recent audit</summary>
                <div className="divide-y divide-neutral-100 border-t border-neutral-200">
                  {(() => {
                    const caseAudit = auditEntries
                      .filter((entry) => record.items.some((item) => item.id === entry.itemId) || entry.itemId.startsWith(`${record.key}:`))
                      .slice(0, 20);
                    return caseAudit.length ? (
                      caseAudit.map((entry) => (
                        <div key={`${entry.changedAt}-${entry.itemId}-${entry.fieldName ?? entry.to}`} className="px-3 py-2 text-xs text-neutral-600">
                          <span className="font-semibold text-neutral-900">{entry.fieldName ? displayKey(entry.fieldName) : 'Status'}</span>
                          {' changed '}
                          {entry.from ? <span>from {entry.from} </span> : null}
                          {entry.to ? <span>to {entry.to} </span> : null}
                          <span>on {formatStamp(entry.changedAt)}</span>
                          {entry.initials ? <span> by {entry.initials}</span> : null}
                          {entry.staffName ? <span> by {entry.staffName}</span> : null}
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-xs italic text-neutral-400">No staff edits recorded for this family yet.</div>
                    );
                  })()}
                </div>
              </details>

              <details className="shrink-0 rounded-lg border border-neutral-200">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-neutral-950">Source details (read-only)</summary>
                <div className="space-y-2 border-t border-neutral-200 p-2">
                  {[
                    { t: 'Dates & times', e: record.dateEntries, empty: 'No date or time values found.' },
                    { t: 'Locations', e: record.locationEntries, empty: 'No location values found.' },
                    { t: 'Service staff', e: record.serviceStaffEntries, empty: 'No service staff values found.' },
                    { t: 'Service logistics', e: record.serviceLogisticsEntries, empty: 'No service logistics values found.' },
                  ].map((grp) => (
                    <div key={grp.t} className="rounded-md border border-neutral-200 p-2">
                      <h4 className="text-xs font-bold text-neutral-700">{grp.t}</h4>
                      <div className="mt-1 grid gap-1">
                        {grp.e.length ? grp.e.map((entry, index) => (
                          <div key={`${entry.label}-${index}`} className="rounded bg-neutral-50 px-2 py-1 text-xs">
                            <span className="font-semibold text-neutral-600">{entry.label}: </span>
                            <span className="break-words text-neutral-800">{entry.value}</span>
                            <span className="ml-1 text-[10px] text-neutral-400">{entry.source}</span>
                          </div>
                        )) : <div className="text-xs italic text-neutral-400">{grp.empty}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              <details className="flex min-h-0 flex-col rounded-lg border border-neutral-200">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-neutral-950">Related work ({record.items.length})</summary>
                <div className="divide-y divide-neutral-100 border-t border-neutral-200">
              {record.items.map((item) => (
                <div key={item.id} className="grid gap-3 p-3 xl:grid-cols-[minmax(280px,0.9fr)_minmax(420px,1.4fr)_minmax(150px,auto)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">{item.source}</span>
                      <span className="text-[11px] text-neutral-400">{sourceRowLabel(item)}</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <EditableField label="Work item" value={item.label} itemId={item.id} field="label" onUpdate={onUpdate} />
                      <EditableField label="Assigned to" value={item.owner} itemId={item.id} field="owner" onUpdate={onUpdate} />
                      <EditableField label="Due / time" value={item.due} itemId={item.id} field="due" onUpdate={onUpdate} />
                      <PrioritySelect item={item} onUpdate={onUpdate} />
                      {item.area === 'death-cert' ? (
                        <div className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                          <EditableField
                            label="Date of death"
                            value={item.dateOfDeath ?? ''}
                            itemId={item.id}
                            field="date_of_death"
                            inputType="date"
                            placeholder="YYYY-MM-DD"
                            onUpdate={onUpdate}
                          />
                          <DeathCertDeadline item={item} effectiveStatus={statusOverrides[item.id]?.status ?? item.status} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <EditableField label="Staff note" value={item.detail} itemId={item.id} field="detail" multiline onUpdate={onUpdate} />
                    <div className="mt-2 grid gap-1 md:grid-cols-2 2xl:grid-cols-3">
                      {collectTextEntries(item).slice(0, 10).map(([key, value]) => (
                        <div key={`${item.id}-${key}`} className="rounded-md bg-neutral-50 px-2 py-1 text-xs">
                          <span className="font-semibold text-neutral-500">{displayKey(key)}: </span>
                          <span className="text-neutral-800">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start justify-start xl:justify-end">
                    <StatusChip item={item} override={statusOverrides[item.id]} onCommit={onCommit} />
                  </div>
                </div>
              ))}
                </div>
              </details>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function BoardPage() {
  const [activeView, setActiveView] = useState<ViewId>('active');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [feedMeta, setFeedMeta] = useState<FeedMeta | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusOverride>>({});
  const [workflowOverrides, setWorkflowOverrides] = useState<WorkflowOverrideMap>({});
  const [milestoneOverrides, setMilestoneOverrides] = useState<MilestoneOverrideMap>({});
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [syncState, setSyncState] = useState<'loading' | 'connected' | 'unavailable'>('loading');
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [operationsError, setOperationsError] = useState('');
  const [sheetSyncMessage, setSheetSyncMessage] = useState('');
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const operationsRequestRef = useRef(0);

  useEffect(() => {
    const syncView = () => {
      const view = new URLSearchParams(window.location.search).get('view') as ViewId | null;
      setActiveView(view && viewLabels[view] ? view : 'active');
    };
    syncView();
    window.addEventListener('popstate', syncView);
    window.addEventListener('ggfo-view-change', syncView);
    return () => {
      window.removeEventListener('popstate', syncView);
      window.removeEventListener('ggfo-view-change', syncView);
    };
  }, []);

  useEffect(() => {
    const delay = search.trim() ? 250 : 0;
    const timeout = window.setTimeout(() => {
      loadOperationsFeed({ query: search.trim() });
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!selectedKey) return;
    loadOperationsFeed({ caseKey: selectedKey, merge: true, limit: 2000 });
  }, [selectedKey]);

  function chooseView(view: ViewId) {
    setActiveView(view);
    const url = new URL(window.location.href);
    if (view === 'active') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    window.history.replaceState({}, '', url);
    window.dispatchEvent(new CustomEvent('ggfo-view-change'));
  }

  function loadOperationsFeed(options: { query?: string; caseKey?: string; merge?: boolean; limit?: number } = {}) {
    const requestId = options.merge ? operationsRequestRef.current : operationsRequestRef.current + 1;
    if (!options.merge) operationsRequestRef.current = requestId;
    const isDetailFetch = Boolean(options.merge && options.caseKey);

    if (isDetailFetch) setDetailLoading(true);
    else setOperationsLoading(true);
    setOperationsError('');

    return getOperationsFeed({
      q: options.query || undefined,
      caseKey: options.caseKey || undefined,
      limit: options.limit,
    })
      .then((response) => {
        if (!options.merge && requestId !== operationsRequestRef.current) return;
        setItems((current) => {
          const nextItems = response.items as DashboardItem[];
          if (!options.merge) return nextItems;
          const byId = new Map(current.map((item) => [item.id, item]));
          for (const item of nextItems) byId.set(item.id, item);
          return Array.from(byId.values());
        });
        if (!options.merge && response.meta) setFeedMeta(response.meta);
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
          .slice(0, 100));
        setSyncState('connected');
      })
      .catch((error: any) => {
        if (!options.merge && requestId !== operationsRequestRef.current) return;
        if (!options.merge) {
          setItems([]);
          setFeedMeta(null);
          setSources([]);
        }
        setSyncState('unavailable');
        setOperationsError(error?.message || (isDetailFetch ? 'Family detail could not load.' : 'Dashboard records could not load.'));
      })
      .finally(() => {
        if (isDetailFetch) setDetailLoading(false);
        else if (requestId === operationsRequestRef.current) setOperationsLoading(false);
      });
  }

  useEffect(() => {
    if (!items.length) return;
    // Load ALL status overrides, not the first 1,000 item IDs. Overrides are bounded by
    // what staff have actually changed (small), so fetching the full set avoids stale
    // status / wrong checklist counts for records beyond the old cap as the index grows.
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

        const nextAuditEntries = response.audit.map((entry) => ({
          kind: 'status' as const,
          itemId: entry.item_id,
          label: entry.item_label,
          from: entry.old_status ?? 'Unset',
          to: entry.new_status,
          initials: entry.staff_initials,
          changedAt: entry.created_at,
        }));

        setStatusOverrides(nextOverrides);
        setAuditEntries((entries) => [...nextAuditEntries, ...entries.filter((entry) => entry.kind === 'edit')]
          .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt))
          .slice(0, 100));
      })
      .catch(() => {
        setStatusOverrides({});
      });
  }, [items]);

  useEffect(() => {
    // Durable per-family workflow checklist overrides (small, bounded by what staff set).
    getWorkflowStates()
      .then((response) => {
        const next: WorkflowOverrideMap = {};
        for (const row of response.data) {
          if (row.state !== 'done' && row.state !== 'pending') continue;
          (next[row.case_key] = next[row.case_key] ?? {})[row.step_id] = {
            state: row.state,
            initials: row.staff_initials,
            updatedAt: row.updated_at,
          };
        }
        setWorkflowOverrides(next);
        const stepLabel = (id: string) => familyWorkflow.find((s) => s.id === id)?.label ?? id;
        const audit: AuditEntry[] = response.audit.map((a) => ({
          kind: 'status',
          itemId: `${a.case_key}:${a.step_id}`,
          label: `${a.case_name || ''} — ${stepLabel(a.step_id)}`,
          fieldName: stepLabel(a.step_id),
          from: a.old_state ?? 'auto',
          to: a.new_state,
          initials: a.staff_initials,
          changedAt: a.created_at,
        }));
        setAuditEntries((prev) => mergeAudit(audit, prev));
      })
      .catch(() => {
        setWorkflowOverrides({});
      });
  }, []);

  useEffect(() => {
    // Per-family scheduling/location milestone overrides (small, bounded by what staff set).
    getMilestones()
      .then((response) => {
        const next: MilestoneOverrideMap = {};
        for (const row of response.data) {
          (next[row.case_key] = next[row.case_key] ?? {})[row.milestone_key] = {
            value: row.value,
            isNa: row.is_na,
            initials: row.staff_initials,
          };
        }
        setMilestoneOverrides(next);
        const msLabel = (key: string) => ALL_MILESTONES.find((m) => m.key === key)?.full ?? key;
        const audit: AuditEntry[] = response.audit.map((a) => ({
          kind: 'status',
          itemId: `${a.case_key}:${a.milestone_key}`,
          label: `${a.case_name || ''} — ${msLabel(a.milestone_key)}`,
          fieldName: msLabel(a.milestone_key),
          from: a.old_value ?? 'source',
          to: a.new_value,
          initials: a.staff_initials,
          changedAt: a.created_at,
        }));
        setAuditEntries((prev) => mergeAudit(audit, prev));
      })
      .catch(() => {
        setMilestoneOverrides({});
      });
  }, []);

  async function syncWeeklySheet() {
    setSheetSyncing(true);
    setSheetSyncMessage('');
    try {
      const response = await syncWeeklyServiceSchedule();
      setSheetSyncMessage(`Imported ${response.data.imported} master sheet rows.`);
      await loadOperationsFeed({ query: search.trim() });
    } catch (error: any) {
      setSheetSyncMessage(error.message || 'Master sheet sync failed.');
    } finally {
      setSheetSyncing(false);
    }
  }

  async function commitWorkflowStep(
    record: CaseRecord,
    step: WorkflowStepDefinition,
    state: 'done' | 'pending' | 'auto',
    initials: string,
  ) {
    const saved = await saveWorkflowState({
      case_key: record.key,
      case_name: record.name,
      step_id: step.id,
      state,
      staff_initials: initials,
    });
    setWorkflowOverrides((current) => {
      const next = { ...current };
      const caseMap = { ...(next[record.key] ?? {}) };
      if (state === 'auto') {
        delete caseMap[step.id];
      } else {
        caseMap[step.id] = { state, initials, updatedAt: saved.data?.updated_at ?? new Date().toISOString() };
      }
      next[record.key] = caseMap;
      return next;
    });
    if (saved.audit) {
      const entry: AuditEntry = {
        kind: 'status',
        itemId: `${record.key}:${step.id}`,
        label: `${record.name} — ${step.label}`,
        fieldName: step.label,
        from: saved.audit.old_state ?? 'auto',
        to: saved.audit.new_state,
        initials: saved.audit.staff_initials,
        changedAt: saved.audit.created_at,
      };
      setAuditEntries((entries) => [entry, ...entries.filter((existing) => existing.changedAt !== entry.changedAt)].slice(0, 100));
    }
  }

  async function commitMilestone(record: CaseRecord, def: MilestoneDef, value: string, isNa: boolean, initials: string) {
    const saved = await saveMilestone({
      case_key: record.key,
      case_name: record.name,
      milestone_key: def.key,
      value,
      is_na: isNa,
      staff_initials: initials,
    });
    setMilestoneOverrides((current) => {
      const next = { ...current };
      const caseMap = { ...(next[record.key] ?? {}) };
      if (!isNa && !value.trim()) {
        delete caseMap[def.key];
      } else {
        caseMap[def.key] = { value: isNa ? '' : value.trim(), isNa, initials };
      }
      next[record.key] = caseMap;
      return next;
    });
    const audit = saved.audit;
    if (audit) {
      const entry: AuditEntry = {
        kind: 'status',
        itemId: `${record.key}:${def.key}`,
        label: `${record.name} — ${def.full}`,
        fieldName: def.full,
        from: audit.old_value ?? 'source',
        to: audit.new_value,
        initials: audit.staff_initials,
        changedAt: audit.created_at,
      };
      setAuditEntries((entries) => [entry, ...entries.filter((existing) => existing.changedAt !== entry.changedAt)].slice(0, 100));
    }
  }

  async function commitStatus(item: DashboardItem, nextStatus: string, initials: string) {
    const saved = await saveOperationalStatus({
      item_id: item.id,
      item_label: item.label,
      area: item.area,
      source: item.source,
      status: nextStatus,
      staff_initials: initials,
    });
    if (!saved.audit && saved.changed) throw new Error('Status audit was not created');

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
      setAuditEntries((entries) => [entry, ...entries.filter((existing) => existing.changedAt !== entry.changedAt)].slice(0, 100));
      return {
        ...current,
        [item.id]: {
          status: nextStatus,
          initials,
          changedAt: entry.changedAt,
          history: saved.audit ? [entry, ...(previous?.history ?? [])] : previous?.history ?? [],
        },
      };
    });
  }

  async function updateItemField(itemId: string, field: EditableItemField, value: string) {
    const saved = await updateOperationItem(itemId, field, value);
    setItems((current) => current.map((item) => (item.id === itemId ? saved.data as DashboardItem : item)));

    if (saved.audit) {
      const entry: AuditEntry = {
        kind: 'edit',
        itemId: saved.audit.item_id,
        label: saved.audit.item_label,
        from: saved.audit.old_value,
        to: saved.audit.new_value,
        staffName: saved.audit.staff_name,
        fieldName: saved.audit.field_name,
        changedAt: saved.audit.created_at,
      };
      setAuditEntries((entries) => [entry, ...entries.filter((existing) => existing.changedAt !== entry.changedAt)].slice(0, 100));
    }
  }

  const caseRecords = useMemo(() => buildCases(items, auditEntries), [items, auditEntries]);
  // Compute each case's workflow states ONCE per data change, not per render/keystroke —
  // effectiveWorkflowStates scores every item against 8 steps, so recomputing it inside
  // each row on every search keystroke would freeze the board. Consumers read this map.
  const workflowStateByKey = useMemo(() => {
    const map = new Map<string, EffectiveStepState[]>();
    for (const record of caseRecords) {
      map.set(record.key, effectiveWorkflowStates(record, statusOverrides, workflowOverrides));
    }
    return map;
  }, [caseRecords, statusOverrides, workflowOverrides]);
  const matchingRecords = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return caseRecords
      .filter((record) => recordMatchesView(record, activeView, statusOverrides))
      .filter(
        (record) =>
          !normalized ||
          record.searchText.includes(normalized) ||
          milestoneSearchText(record, milestoneOverrides).toLowerCase().includes(normalized),
      )
      .sort((a, b) => priorityRank(b.primaryItem) - priorityRank(a.primaryItem) || a.name.localeCompare(b.name));
  }, [activeView, caseRecords, search, statusOverrides, milestoneOverrides]);
  const visibleRecords = useMemo(() => matchingRecords.slice(0, visibleRecordLimit), [matchingRecords]);
  const selectedRecord = selectedKey ? caseRecords.find((record) => record.key === selectedKey) ?? null : null;
  const hasSourceIssue = sources.some((source) => source.status === 'unavailable');
  const visibleSummary = operationsLoading
    ? 'Loading dashboard records'
    : feedMeta
      ? `${visibleRecords.length} families shown from ${feedMeta.returned.toLocaleString()} loaded records${feedMeta.limited ? ` of ${feedMeta.total.toLocaleString()} matches` : ''}`
      : `${visibleRecords.length} families shown`;
  const firstCallsToday = useMemo(() => firstCallsTodayCount(caseRecords), [caseRecords]);
  const servicesCompletedThisMonth = useMemo(
    () => completedServicesThisMonthCount(caseRecords, statusOverrides),
    [caseRecords, statusOverrides],
  );

  return (
    <div className="h-full bg-[#faf9f9] text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white p-1">
              <img src="/brand/gg-logo.png" alt="Golden Gate Funeral & Cremation Services" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#a77d00]">KC Golden Gate</div>
              <h1 className="truncate text-lg font-bold text-black">{viewLabels[activeView]}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {primaryViews.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => chooseView(view)}
                className={`h-8 rounded-md px-2.5 text-xs font-bold transition ${
                  activeView === view ? 'bg-black text-[#efb70c]' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {viewLabels[view]}
              </button>
            ))}
            <ViewFilterMenu activeView={activeView} onChoose={chooseView} />
            <span className="mx-1 h-8 border-l border-neutral-200" aria-hidden="true" />
            {appTopLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex h-8 items-center rounded-md px-2.5 text-xs font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex min-w-[190px] items-center justify-end gap-2">
            <span className="hidden whitespace-nowrap text-[11px] font-semibold text-neutral-500 2xl:inline">{visibleSummary}</span>
            <div className="hidden items-center gap-1 lg:flex">
              <HeaderMetric label="Calls today" value={firstCallsToday} />
              <HeaderMetric label="Services month" value={servicesCompletedThisMonth} />
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search family"
              className="h-8 w-48 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20 sm:w-56"
              aria-label="Search family or deceased"
            />
            <button
              type="button"
              onClick={() => setShowSources((value) => !value)}
              title="Source diagnostics"
              className={`h-8 rounded-md border px-2.5 text-xs font-bold ${hasSourceIssue ? 'border-red-300 bg-red-50 text-red-800' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100'}`}
            >
              Sources
            </button>
          </div>
        </div>
        {showSources ? (
          <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {sources.map((source) => (
                <div key={source.id} className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700">
                  <span className="font-bold">{source.label}: </span>
                  <span>{source.status}</span>
                </div>
              ))}
              <button
                type="button"
                onClick={syncWeeklySheet}
                disabled={sheetSyncing}
                className="h-8 rounded-md bg-black px-3 text-xs font-bold text-[#efb70c] disabled:opacity-60"
              >
                {sheetSyncing ? 'Syncing' : 'Sync master sheet'}
              </button>
              {sheetSyncMessage ? <span className="text-xs text-neutral-500">{sheetSyncMessage}</span> : null}
            </div>
          </div>
        ) : null}
      </header>

      <main className="p-3">
        <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="grid grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(150px,1fr)_minmax(120px,0.7fr)_minmax(300px,1.8fr)] border-b border-neutral-200 bg-neutral-50 text-[11px] font-bold uppercase tracking-wide text-neutral-500 max-xl:grid-cols-[minmax(180px,1.3fr)_minmax(160px,1fr)_minmax(150px,1fr)_minmax(300px,1.8fr)] max-lg:hidden">
            <div className="px-2 py-2">Deceased</div>
            <div className="px-2 py-2">Date / Time</div>
            <div className="px-2 py-2">Location</div>
            <div className="px-2 py-2 max-xl:hidden">Family Contact</div>
            <div className="px-2 py-2 text-center">Status</div>
          </div>

          <div className="divide-y divide-neutral-100">
            {operationsLoading ? (
              <div className="px-4 py-12 text-center text-sm text-neutral-500">
                Loading families.
              </div>
            ) : operationsError ? (
              <div className="px-4 py-12 text-center text-sm text-red-700">
                {operationsError}
              </div>
            ) : visibleRecords.length ? visibleRecords.map((record) => (
              <div
                key={record.key}
                className="grid w-full grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(150px,1fr)_minmax(120px,0.7fr)_minmax(300px,1.8fr)] items-stretch text-left transition hover:bg-[#faf9f9] max-xl:grid-cols-[minmax(180px,1.3fr)_minmax(160px,1fr)_minmax(150px,1fr)_minmax(300px,1.8fr)] max-lg:block"
              >
                <button
                  type="button"
                  onClick={() => setSelectedKey(record.key)}
                  className="min-w-0 border-l-4 border-l-neutral-300 px-2 py-1.5 text-left outline-none transition focus:border-l-[#efb70c] focus:bg-[#fff7d7]"
                  aria-label={`Open details for ${record.name}`}
                >
                  <div className="truncate text-sm font-bold text-neutral-950">{record.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-600">
                    <span className="text-neutral-400">Date of transition: </span>
                    {record.dateOfTransition ? (
                      formatTransitionDate(record.dateOfTransition)
                    ) : (
                      <span className="italic text-neutral-400">Date pending</span>
                    )}
                  </div>
                </button>
                <div className="px-1 py-1.5">
                  <MilestoneChips record={record} defs={DATE_MILESTONES} overrides={milestoneOverrides} onOpen={() => setSelectedKey(record.key)} />
                </div>
                <div className="px-1 py-1.5">
                  <MilestoneChips record={record} defs={LOCATION_MILESTONES} overrides={milestoneOverrides} onOpen={() => setSelectedKey(record.key)} />
                </div>
                <div className="truncate px-2 py-2 text-xs font-semibold text-neutral-700 max-xl:hidden">
                  {record.owner || <span className="font-normal italic text-neutral-400">No contact on file</span>}
                </div>
                <WorkflowProgressCell
                  record={record}
                  states={workflowStateByKey.get(record.key) ?? []}
                  statusOverrides={statusOverrides}
                  onToggleStep={commitWorkflowStep}
                  onOpenDetails={() => setSelectedKey(record.key)}
                />
              </div>
            )) : (
              <div className="px-4 py-12 text-center text-sm text-neutral-500">
                {search.trim() ? 'No families matched this search.' : 'No families matched this view.'}
              </div>
            )}
          </div>
        </section>
      </main>

      <DetailDrawer
        record={selectedRecord}
        statusOverrides={statusOverrides}
        workflowOverrides={workflowOverrides}
        milestoneOverrides={milestoneOverrides}
        auditEntries={auditEntries}
        detailLoading={detailLoading}
        onClose={() => setSelectedKey(null)}
        onCommit={commitStatus}
        onUpdate={updateItemField}
        onToggleStep={commitWorkflowStep}
        onCommitMilestone={commitMilestone}
      />

      {syncState === 'unavailable' ? (
        <div className="fixed bottom-4 right-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 shadow">
          Dashboard database unavailable
        </div>
      ) : null}
    </div>
  );
}
