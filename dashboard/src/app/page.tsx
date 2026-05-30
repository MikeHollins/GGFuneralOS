'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  getDashboardCaseContacts,
  getGoogleCalendarEvents,
  getMilestones,
  getOperationalStatuses,
  getOperationsFeed,
  getWorkflowStates,
  saveDashboardCaseContact,
  saveMilestone,
  saveOperationalStatus,
  saveWorkflowState,
  syncMasterSheet,
  updateOperationItem,
  type GoogleCalendarEvent,
  type OperationsFeed,
} from '@/lib/api';
import { deathCertDeadline, type DashboardItem, type OperationArea } from '@/lib/operation-items';
import { FirstCallDrawer } from './first-call-drawer';

type AuditEntry = {
  kind: 'status' | 'edit' | 'workflow' | 'milestone' | 'contact';
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
type ViewId = 'active' | 'cases' | 'recent-first-calls' | 'calendar' | 'service' | 'arrangements' | 'death-certs' | 'cremains' | 'belongings' | 'files';
type EditableItemField = 'label' | 'detail' | 'owner' | 'due' | 'date_of_birth' | 'date_of_death';

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
  contactCandidates: FamilyContactCandidate[];
  sourceContact: FamilyContactCandidate | null;
  mediaMatches: MediaMatch[];
  dateOfBirth: string | null;
  dateOfTransition: string | null;
  sourceCaseNumbers: string[];
  identityStatus: string;
  blocker: string;
  updatedAt: string;
  areaCounts: Partial<Record<OperationArea, number>>;
  searchText: string;
};

type FamilyContactCandidate = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  source: string;
  confidence: number;
  basis: string;
};

type ContactOverride = {
  contactName: string;
  relationship: string;
  phone: string;
  email: string;
  notes: string;
  initials: string;
  updatedAt: string;
};

type ContactOverrideMap = Record<string, ContactOverride>;

type FamilyContactDisplay = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  notes: string;
  source: string;
  confidence: number;
  overridden: boolean;
};

type MediaMatch = {
  item: DashboardItem;
  confidence: number;
  label: string;
  type: string;
  path: string;
  source: string;
  modified: string;
  basis: string;
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
  cases: 'All Cases',
  'recent-first-calls': 'Recent First Calls',
  calendar: 'Calendar',
  service: 'Service',
  arrangements: 'Arrangements',
  'death-certs': 'Death Certs',
  cremains: 'Cremation',
  belongings: 'Belongings',
  files: 'Production',
};

// Primary navigation answers "which set of families do I look at?" — kept as buttons.
const primaryViews: ViewId[] = ['active', 'cases', 'recent-first-calls', 'calendar'];
const appTopLinks = [
  { href: '/staff', label: 'Staff/Admin', ready: true },
  { href: '/texts', label: 'Texts', ready: false },
  { href: '/payments', label: 'Payments', ready: false },
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
type MilestoneDef = { key: string; label: string; full: string; kind: 'date' | 'location' | 'select'; areas: OperationArea[]; sourceKeys: string[]; options?: string[] };

// Golden Gate's service packages (from kcgoldengate.com/our-packages), cremation-tier first.
const GG_SERVICE_OPTIONS = [
  'Direct Cremation', 'The Direct', 'The Memorial', 'The Noble', 'The Formal',
  'The Prestige', 'The Gold', 'The Imperial', 'The Royal',
];
// areas: only pull this milestone's source value from rows of the relevant area (so a
// cremation date can't come from a service row, etc.). Date slots use date columns only
// (times are excluded — combining date+time is a future step).
const DATE_MILESTONES: MilestoneDef[] = [
  { key: 'first_call', label: 'Call', full: 'First call', kind: 'date', areas: ['death-cert', 'paperwork'], sourceKeys: ['first_call_date', 'first_call', 'date_received', 'received_date'] },
  { key: 'service', label: 'Service', full: 'Service', kind: 'date', areas: ['service', 'arrangement'], sourceKeys: ['service_date', 'date'] },
  { key: 'cremation', label: 'Cremation', full: 'Cremation', kind: 'date', areas: ['crematory', 'cremains'], sourceKeys: ['cremation_date', 'date_of_cremation'] },
  { key: 'burial', label: 'Burial', full: 'Burial', kind: 'date', areas: ['service'], sourceKeys: ['committal_date', 'burial_date'] },
];
const LOCATION_MILESTONES: MilestoneDef[] = [
  { key: 'service_location', label: 'Service', full: 'Service location', kind: 'location', areas: ['service', 'arrangement'], sourceKeys: ['service_location', 'location', 'chapel', 'church'] },
  { key: 'cremation_location', label: 'Cremation', full: 'Cremation location', kind: 'location', areas: ['crematory', 'cremains'], sourceKeys: ['crematory', 'crematory_name'] },
  { key: 'burial_location', label: 'Burial', full: 'Burial location', kind: 'location', areas: ['service'], sourceKeys: ['cemetery', 'cemetery_name', 'committal_location'] },
];
const SERVICE_MILESTONES: MilestoneDef[] = [
  { key: 'service_type', label: 'Service', full: 'Service / package', kind: 'select', areas: ['arrangement', 'service'], sourceKeys: ['service_type', 'package', 'disposition_type', 'contract_type'], options: GG_SERVICE_OPTIONS },
];
const ALL_MILESTONES = [...DATE_MILESTONES, ...LOCATION_MILESTONES, ...SERVICE_MILESTONES];

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
  cases: null,
  'recent-first-calls': null,
  calendar: null,
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

function isSupplementalEstimateText(value: string) {
  const text = cleanDisplay(value).toLowerCase();
  if (!text) return false;
  // Do not surface generic timeline guesses as dashboard facts. The board should
  // redistribute source facts, not add or amplify estimated wait-time guidance.
  return /\b\d+\s*[-–]\s*\d+\s+(?:business\s+)?(?:day|days|week|weeks|month|months)\b/.test(text);
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

function safeFieldValue(_key: string, value: string) {
  return value.trim();
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
  if (relative === 'today') return today;
  if (relative === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return exactLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/);
  if (slash) {
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    return exactLocalDate(year, Number(slash[1]), Number(slash[2]));
  }

  const named = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{2,4}))?\b/i);
  if (named) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.findIndex((m) => named[1].toLowerCase().startsWith(m)) + 1;
    const fallbackYear = new Date().getFullYear();
    const year = named[3] ? Number(named[3].length === 2 ? `20${named[3]}` : named[3]) : fallbackYear;
    return exactLocalDate(year, month, Number(named[2]));
  }

  // No unguarded `new Date(text)` fallback: JS Date.parse is locale/heuristic-driven
  // and will silently coerce ambiguous or garbled strings (a lone year, "March", a
  // mis-ordered MM/DD) into a wrong date, which then mis-buckets a case into/out of the
  // active window. Anything not matched by the explicit formats above is treated as
  // "no date" (null) rather than guessed.
  return null;
}

function exactLocalDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(year, month - 1, day, 12);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) return null;
  return parsed;
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
    return state.item.status.toLowerCase().includes('needed') || state.item.status.toLowerCase().includes('missing');
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

// Confidence of the canonical case identity, resolved in the sync (master-sheet-sync.ts).
// A group's status is its LOWEST-confidence row, so staff see the weakest link. `unverified`
// means the resolver could not place the case to a year (needs director review); `date-bridged`
// means it was placed by activity-date, not its own case number (lower confidence).
const IDENTITY_STATUS_RANK = ['unverified', 'name-only', 'date-bridged', 'date-year', 'bridged', 'resolved'];

function pickIdentityStatus(items: DashboardItem[]) {
  let worst = '';
  let worstRank = Infinity;
  for (const item of items) {
    const status = cleanDisplay(sourcePayload(item).identity_status);
    if (!status) continue;
    const rank = IDENTITY_STATUS_RANK.indexOf(status);
    const effectiveRank = rank === -1 ? IDENTITY_STATUS_RANK.length : rank;
    if (effectiveRank < worstRank) {
      worstRank = effectiveRank;
      worst = status;
    }
  }
  return worst;
}

// Numeric sort value for a case's highest Golden Gate ref (YY-NNN): (year*100000 + sequence), so
// higher = newer. -1 when the case has no ref yet (those sort last under "Case # new→old").
function caseNumberSortValue(record: CaseRecord) {
  const maxYear = new Date().getFullYear() + 1;
  let best = -1;
  for (const cn of record.sourceCaseNumbers) {
    const match = cn.match(/^(\d{2})-(\d{3,4})$/);
    if (!match) continue;
    const year = 2000 + Number(match[1]);
    // Ignore implausible future-year prefixes (data-entry typos like 32-/34-) so they don't sort
    // above legitimate current-year cases as if they were the newest.
    if (year > maxYear) continue;
    best = Math.max(best, year * 100000 + Number(match[2]));
  }
  return best;
}

// One stable, canonical Golden Gate ref to display per case: the lowest NN-NNN whose year matches
// the case's death-year (falling back to the lowest overall). Deterministic so it does NOT change
// when opening a case loads more of its rows (a case legitimately spans 2 registers, e.g. death-cert
// + crematory; the grid shows one canonical number, the drawer can show all).
function primaryCaseRef(record: CaseRecord): string {
  const refs = record.sourceCaseNumbers.filter((r) => /^\d{2}-\d{3,4}$/.test(r));
  if (!refs.length) return record.sourceCaseNumbers[0] ?? '';
  const year = (record.key.split('|')[1] ?? '').slice(2);
  const yearMatch = year ? refs.filter((r) => r.startsWith(`${year}-`)) : [];
  return (yearMatch.length ? yearMatch : refs).slice().sort()[0];
}

function caseKeyForItem(item: DashboardItem) {
  const payload = sourcePayload(item);
  // Canonical case identity = name + death-year, resolved in the sync (master-sheet-sync.ts).
  // Prefer it so two different same-name people in different years stay separate cases, and so
  // name-only logs (cremains/belongings) thread to the right year. Fall back to the name key,
  // then the raw name, for rows the resolver did not touch (e.g. SMB media).
  const groupKey = cleanDisplay(payload.case_group_key);
  if (groupKey) return groupKey;
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
  if (!entries.length && item.due && groups === dateGroups) {
    entries.push({ label: 'Date / time', value: item.due, source: item.source });
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
    .map(([key, value]) => [key, safeFieldValue(key, cleanDisplay(value))] as const)
    .filter(([, value]) => !isSupplementalEstimateText(value));
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

const CONTACT_NAME_KEYS = [
  'family_contact',
  'contact_name',
  'next_of_kin',
  'nok',
  'informant',
  'responsible_party',
  'signature_of_receiver',
  'picked_up_by',
  'received_by',
  'beneficiary_name',
  'rf',
];
const CONTACT_RELATIONSHIP_KEYS = ['relationship', 'relation', 'relationship_to_deceased'];
const CONTACT_PHONE_KEYS = ['phone', 'contact_phone', 'family_phone', 'nok_phone', 'cell', 'telephone'];
const CONTACT_EMAIL_KEYS = ['email', 'contact_email', 'family_email', 'nok_email'];
const DATE_OF_BIRTH_KEYS = ['date_of_birth', 'dob', 'birth_date', 'birthdate', 'd_o_b', 'sunrise', 'date_of_birth_dob'];
const DATE_OF_TRANSITION_KEYS = ['date_of_death', 'death_date', 'date_of_transition', 'date_of_trnasiiton', 'date_of_transiiton', 'transition', 'transition_date', 'trnasiiton', 'transiiton', 'dod', 'sunset'];
const SOURCE_CASE_NUMBER_KEYS = ['source_case_number', 'case_number', 'case_no', 'case_num', 'case'];

function firstPayloadValue(item: DashboardItem, keys: string[]) {
  const payload = sourcePayload(item);
  for (const key of keys) {
    const raw = cleanDisplay(payload[key]);
    if (raw) return safeFieldValue(key, raw);
  }
  return '';
}

function isLikelyFamilyContactName(value: string, deceasedName: string) {
  if (!isContactLike(value)) return false;
  const normalized = normalizeKey(value);
  if (!normalized || normalized === normalizeKey(deceasedName)) return false;
  if (NON_CONTACT_OWNERS.has(value)) return false;
  return true;
}

function contactCandidatesFor(items: DashboardItem[], deceasedName: string): FamilyContactCandidate[] {
  const candidates: FamilyContactCandidate[] = [];

  for (const item of items) {
    const payloadName = firstPayloadValue(item, CONTACT_NAME_KEYS);
    const ownerName = item.owner && !NON_CONTACT_OWNERS.has(item.owner) ? item.owner : '';
    const name = isLikelyFamilyContactName(payloadName, deceasedName)
      ? payloadName
      : isLikelyFamilyContactName(ownerName, deceasedName)
        ? ownerName
        : '';
    if (!name) continue;

    const relationship = firstPayloadValue(item, CONTACT_RELATIONSHIP_KEYS);
    const phone = firstPayloadValue(item, CONTACT_PHONE_KEYS);
    const email = firstPayloadValue(item, CONTACT_EMAIL_KEYS);
    const confidence = 0.55 + (relationship ? 0.15 : 0) + (phone || email ? 0.15 : 0) + (payloadName ? 0.1 : 0);
    candidates.push({
      name,
      relationship,
      phone,
      email,
      source: item.source,
      confidence: Math.min(confidence, 0.95),
      basis: payloadName ? 'source field' : 'assigned-to field',
    });
  }

  const deduped = new Map<string, FamilyContactCandidate>();
  for (const candidate of candidates) {
    const key = [normalizeKey(candidate.name), normalizeKey(candidate.relationship), candidate.phone, candidate.email].join('|');
    const current = deduped.get(key);
    if (!current || candidate.confidence > current.confidence) deduped.set(key, candidate);
  }
  return Array.from(deduped.values()).sort((a, b) => b.confidence - a.confidence);
}

function effectiveFamilyContact(record: CaseRecord, overrides: ContactOverrideMap): FamilyContactDisplay | null {
  const override = overrides[record.key];
  if (override && [override.contactName, override.relationship, override.phone, override.email, override.notes].some(Boolean)) {
    return {
      name: override.contactName,
      relationship: override.relationship,
      phone: override.phone,
      email: override.email,
      notes: override.notes,
      source: 'Staff override',
      confidence: 1,
      overridden: true,
    };
  }

  const source = record.sourceContact;
  if (!source) return null;
  return {
    name: source.name,
    relationship: source.relationship,
    phone: source.phone,
    email: source.email,
    notes: '',
    source: source.source,
    confidence: source.confidence,
    overridden: false,
  };
}

function contactSearchText(record: CaseRecord, overrides: ContactOverrideMap) {
  const contact = effectiveFamilyContact(record, overrides);
  const candidates = record.contactCandidates.flatMap((candidate) => [candidate.name, candidate.relationship, candidate.phone, candidate.email, candidate.source]);
  return [
    contact?.name ?? '',
    contact?.relationship ?? '',
    contact?.phone ?? '',
    contact?.email ?? '',
    contact?.notes ?? '',
    ...candidates,
  ].join(' ');
}

function contactGridText(contact: FamilyContactDisplay | null) {
  if (!contact) return null;
  const secondary = [contact.relationship, contact.phone, contact.email].filter(Boolean).join(' · ');
  return { primary: contact.name || 'Contact saved', secondary };
}

function sourceDateOfBirth(items: DashboardItem[]) {
  const preferred = [...items].sort((a, b) => Number(b.area === 'death-cert') - Number(a.area === 'death-cert'));
  for (const item of preferred) {
    const normalized = cleanDisplay(item.dateOfBirth);
    if (normalized) return canonicalKnownDate(normalized, 'birth') ?? normalized;
    const value = firstPayloadValue(item, DATE_OF_BIRTH_KEYS);
    if (value) return canonicalKnownDate(value, 'birth') ?? value;
  }
  return null;
}

function sourceDateOfTransition(items: DashboardItem[]) {
  const preferred = [...items].sort((a, b) => Number(b.area === 'death-cert') - Number(a.area === 'death-cert'));
  for (const item of preferred) {
    const normalized = cleanDisplay(item.dateOfDeath);
    if (normalized) return canonicalKnownDate(normalized, 'transition') ?? normalized;
    const value = firstPayloadValue(item, DATE_OF_TRANSITION_KEYS);
    if (value) return canonicalKnownDate(value, 'transition') ?? value;
  }
  return null;
}

function sourceCaseNumbersFor(items: DashboardItem[]) {
  return Array.from(new Set(items.flatMap((item) => {
    const direct = cleanDisplay(item.sourceCaseNumber);
    if (direct) return [direct];
    const payload = sourcePayload(item);
    return SOURCE_CASE_NUMBER_KEYS
      .map((key) => cleanDisplay(payload[key]))
      .filter(Boolean);
  })));
}

function mediaMatchForItem(item: DashboardItem, knownCase: { key: string; name: string }): MediaMatch {
  const payload = sourcePayload(item);
  const haystack = [
    cleanDisplay(payload.case_match_key),
    cleanDisplay(payload.name),
    item.label,
    item.detail,
    item.sourceRef ?? '',
    cleanDisplay(payload.relative_path),
    cleanDisplay(payload.parent_path),
  ].join(' ');
  const exactKey = normalizeKey(cleanDisplay(payload.case_match_key)) === knownCase.key;
  const normalizedName = normalizeKey(knownCase.name);
  const exactName = Boolean(normalizedName) && normalizeKey(haystack).includes(normalizedName);
  const tokenScore = Math.max(tokenMatchScore(knownCase.name, haystack), tokenMatchScore(knownCase.key, haystack));
  const confidence = exactKey ? 1 : exactName ? 0.95 : Math.min(Math.max(tokenScore, 0.6), 0.9);
  const extension = cleanDisplay(payload.extension).replace(/^\./, '').toUpperCase();
  const path = cleanDisplay(payload.relative_path) || cleanDisplay(payload.parent_path) || item.sourceRef || item.label;
  const label = confidence >= 0.9 ? 'Confirmed' : confidence >= 0.75 ? 'Likely' : 'Review';

  return {
    item,
    confidence,
    label,
    type: extension || item.area,
    path,
    source: item.source,
    modified: cleanDisplay(payload.modified_at) || item.due || '',
    basis: exactKey ? 'case key' : exactName ? 'name in path' : 'token match',
  };
}

function parseKnownDateText(raw: string, kind: 'birth' | 'transition' | 'generic' = 'generic') {
  const text = cleanDisplay(raw);
  if (!text) return null;
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const date = exactLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!date) return null;
    if (kind === 'birth' && date.getTime() > Date.now()) return null;
    return date;
  }
  const md = text.match(/\b(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})\b/);
  if (md) {
    const twoDigit = md[3].length === 2;
    let year = Number(twoDigit ? `20${md[3]}` : md[3]);
    if (twoDigit && kind === 'birth' && year > new Date().getFullYear()) year -= 100;
    const month = Number(md[1]);
    const day = Number(md[2]);
    const date = exactLocalDate(year, month, day);
    if (!date) return null;
    if (kind === 'birth' && date.getTime() > Date.now()) return null;
    return date;
  }
  return null;
}

function canonicalKnownDate(raw: string, kind: 'birth' | 'transition' | 'generic' = 'generic') {
  const date = parseKnownDateText(raw, kind);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Human-readable date display. Parses only explicit date formats; never guesses.
function formatTransitionDate(raw: string) {
  const date = parseKnownDateText(raw);
  if (!date) return raw;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Reject values that are clearly NOT a real milestone (booleans, prices, bare numbers).
function isMilestoneNoise(value: string) {
  const t = value.trim();
  if (/^(no|yes|n\/a|na|none|tbd|n|y|unknown)$/i.test(t)) return true; // e.g. "Burial: No"
  if (/\$/.test(t)) return true; // prices
  if (/^[\d.,]+$/.test(t)) return true; // number/price-only
  return false;
}

// Area-aware source-derived value for a milestone: pull only from rows of the relevant
// area, skip noise, and (for date slots) skip time-only values. Falls back to all rows
// only when no area-matched row exists, so the mapping never silently goes empty.
function sourceMilestoneValue(record: CaseRecord, def: MilestoneDef) {
  const inArea = def.areas.length ? record.items.filter((item) => def.areas.includes(item.area)) : [];
  const pool = inArea.length ? inArea : record.items;
  for (const item of pool) {
    const payload = sourcePayload(item);
    for (const key of def.sourceKeys) {
      const value = cleanDisplay(payload[key]).trim();
      if (!value || isMilestoneNoise(value)) continue;
      if (def.kind === 'date' && /^\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\s*$/i.test(value)) continue; // a time alone is not a date
      return value;
    }
  }
  return '';
}

// Effective milestone = staff override (value or N/A) ?? source-derived default ?? empty.
// Disposition from what we have: a case in the Crematory/Cremains logs is a cremation; a case with
// any burial/cemetery value is a burial. Families generally do one or the other, so the opposite
// disposition's empty date/location slots are shown N/A (derived, still overridable) — no clutter.
function caseDisposition(record: CaseRecord): 'cremation' | 'burial' | null {
  if (record.items.some((i) => i.area === 'cremains' || i.area === 'crematory')) return 'cremation';
  const hasBurial = record.items.some((i) => {
    const p = sourcePayload(i);
    return ['committal_date', 'burial_date', 'cemetery', 'cemetery_name', 'committal_location'].some((k) => cleanDisplay(p[k]));
  });
  return hasBurial ? 'burial' : null;
}

function effectiveMilestone(record: CaseRecord, def: MilestoneDef, overrides: MilestoneOverrideMap): MilestoneState {
  const override = overrides[record.key]?.[def.key];
  if (override) {
    if (override.isNa) return { def, state: 'na', value: '', overridden: true };
    if (override.value) return { def, state: 'set', value: override.value, overridden: true };
  }
  const source = sourceMilestoneValue(record, def);
  if (source) return { def, state: 'source', value: source, overridden: false };
  // Derived N/A for the disposition the family didn't choose (cremation ⇄ burial are exclusive).
  const disposition = caseDisposition(record);
  if (disposition === 'cremation' && (def.key === 'burial' || def.key === 'burial_location')) return { def, state: 'na', value: '', overridden: false };
  if (disposition === 'burial' && (def.key === 'cremation' || def.key === 'cremation_location')) return { def, state: 'na', value: '', overridden: false };
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

function milestoneCellTone(state: MilestoneState) {
  if (state.state === 'empty') return 'border-neutral-200 bg-neutral-50 text-neutral-400';
  if (state.state === 'na') return 'border-neutral-200 bg-neutral-50 text-neutral-500';
  if (state.overridden) return 'border-[#efb70c]/70 bg-[#fff7d7] text-neutral-950';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

// Compact grid display: populated milestones are visible at a glance; truly empty slots
// show a quiet ellipsis instead of repeating "Pending" through the board.
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
  const states = defs.map((def) => effectiveMilestone(record, def, overrides));
  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      title="Open case to edit scheduling & locations"
      className={`grid w-full gap-1 px-1 py-1 text-[10px] leading-tight ${defs.length > 3 ? 'grid-cols-2' : 'grid-cols-1 2xl:grid-cols-3'}`}
    >
      {states.map((state) => (
        <div
          key={state.def.key}
          className={`min-w-0 rounded-md border px-1.5 py-1 font-semibold ${milestoneCellTone(state)}`}
        >
          <div className="truncate text-[9px] uppercase tracking-wide opacity-70">{state.def.label}</div>
          <div className={`truncate ${state.state === 'empty' || state.state === 'na' ? 'italic' : ''}`}>
            {state.state === 'empty' ? '...' : state.state === 'na' ? 'N/A' : state.value}
          </div>
        </div>
      ))}
    </div>
  );
}

type CommitMilestone = (record: CaseRecord, def: MilestoneDef, value: string, isNa: boolean, initials: string) => Promise<void>;

// One editable milestone field in the drawer: shows source default + staff override, with
// inline edit, an N/A toggle, and a "use source" revert. Initials-gated on save.
function MilestoneField({ record, def, overrides, onCommit }: { record: CaseRecord; def: MilestoneDef; overrides: MilestoneOverrideMap; onCommit: CommitMilestone }) {
  const effective = effectiveMilestone(record, def, overrides);
  const source = sourceMilestoneValue(record, def);
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
      {def.kind === 'select' ? (
        <select
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false); }}
          className="mt-1 h-8 w-full rounded-md border border-neutral-300 px-2 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
          autoFocus
        >
          <option value="">Select a service…</option>
          {(def.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(false);
          }}
          placeholder={def.kind === 'date' ? 'MM/DD/YYYY or Jun 3, 2026' : 'Location'}
          className="mt-1 h-8 w-full rounded-md border border-neutral-300 px-2 text-sm outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
          autoFocus
        />
      )}
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
    <DrawerDisclosure title="Scheduling & locations" meta="First call, service, cremation, burial, and location slots" bodyClassName="p-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {ALL_MILESTONES.map((def) => (
          <MilestoneField key={def.key} record={record} def={def} overrides={overrides} onCommit={onCommit} />
        ))}
      </div>
    </DrawerDisclosure>
  );
}

type CommitContact = (record: CaseRecord, next: ContactOverride, initials: string) => Promise<void>;

function FamilyContactEditor({
  record,
  overrides,
  onCommitContact,
}: {
  record: CaseRecord;
  overrides: ContactOverrideMap;
  onCommitContact: CommitContact;
}) {
  const contact = effectiveFamilyContact(record, overrides);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContactOverride>({
    contactName: contact?.name ?? '',
    relationship: contact?.relationship ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    notes: contact?.notes ?? '',
    initials: '',
    updatedAt: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function begin(next?: Partial<ContactOverride>) {
    setDraft({
      contactName: next?.contactName ?? contact?.name ?? '',
      relationship: next?.relationship ?? contact?.relationship ?? '',
      phone: next?.phone ?? contact?.phone ?? '',
      email: next?.email ?? contact?.email ?? '',
      notes: next?.notes ?? contact?.notes ?? '',
      initials: '',
      updatedAt: '',
    });
    setError('');
    setEditing(true);
  }

  async function save(nextDraft = draft) {
    const initials = promptInitials();
    if (!initials) return;
    setBusy(true);
    setError('');
    try {
      await onCommitContact(record, nextDraft, initials);
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Could not save family contact');
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    const initials = promptInitials();
    if (!initials) return;
    setBusy(true);
    setError('');
    try {
      await onCommitContact(record, {
        contactName: '',
        relationship: '',
        phone: '',
        email: '',
        notes: '',
        initials: '',
        updatedAt: '',
      }, initials);
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Could not clear family contact');
    } finally {
      setBusy(false);
    }
  }

  const contactSummary = contact
    ? [contact.name || 'Contact saved', contact.phone, contact.relationship].filter(Boolean).join(' · ')
    : 'Name, phone, and relationship can be added here.';

  return (
    <DrawerDisclosure title="Family contact / next of kin" meta={contactSummary} bodyClassName="p-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-neutral-500">
            {contact?.overridden ? 'Staff-confirmed internal contact.' : contact ? `Source candidate from ${contact.source}.` : 'Internal contact fields.'}
          </div>
          {!editing ? (
            <button type="button" onClick={() => begin()} className="h-7 rounded-md bg-black px-2 text-[11px] font-semibold text-[#efb70c]">
              Edit contact
            </button>
          ) : null}
        </div>

        {editing ? (
          <div className="grid gap-2 xl:grid-cols-4">
            {[
              ['Name', 'contactName', 'Full name'],
              ['Relationship', 'relationship', 'Daughter, spouse, next of kin'],
              ['Phone', 'phone', 'Phone'],
              ['Email', 'email', 'Email'],
            ].map(([label, field, placeholder]) => (
              <label key={field} className="text-xs font-semibold text-neutral-500">
                {label}
                <input
                  value={String(draft[field as keyof ContactOverride] ?? '')}
                  onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setEditing(false);
                  }}
                  placeholder={placeholder}
                  className="mt-1 h-8 w-full rounded-md border border-neutral-300 px-2 text-sm font-normal text-neutral-950 outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
                />
              </label>
            ))}
            <label className="text-xs font-semibold text-neutral-500 xl:col-span-4">
              Internal notes
              <textarea
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditing(false);
                }}
                placeholder="Optional staff note"
                className="mt-1 min-h-12 w-full resize-y rounded-md border border-neutral-300 px-2 py-1.5 text-sm font-normal text-neutral-950 outline-none focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20"
              />
            </label>
            <div className="flex flex-wrap gap-1 xl:col-span-4">
              <button type="button" disabled={busy} onClick={() => save()} className="h-7 rounded-md bg-black px-2 text-[11px] font-semibold text-[#efb70c] disabled:opacity-60">Save</button>
              <button type="button" disabled={busy} onClick={clear} className="h-7 rounded-md bg-neutral-200 px-2 text-[11px] font-semibold text-neutral-700 disabled:opacity-60">Use source / clear</button>
              <button type="button" onClick={() => setEditing(false)} className="h-7 rounded-md px-2 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100">Cancel</button>
              {error ? <span className="px-2 py-1 text-[11px] text-red-700">{error}</span> : null}
            </div>
          </div>
        ) : (
          <div className="grid gap-2 xl:grid-cols-4">
            {[
              ['Name', contact?.name],
              ['Phone', contact?.phone],
              ['Relation', contact?.relationship],
              ['Email', contact?.email],
            ].map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => begin()}
                className="min-h-12 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-left text-xs transition hover:border-[#efb70c] hover:bg-[#fff7d7]"
              >
                <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-400">{label}</span>
                <span className={`block truncate font-semibold ${value ? 'text-neutral-950' : 'text-neutral-400'}`}>{value || '...'}</span>
              </button>
            ))}
            {record.contactCandidates.length ? (
              <div className="grid gap-1 xl:col-span-4 xl:grid-cols-4">
                {record.contactCandidates.slice(0, 4).map((candidate) => (
                <button
                  key={`${candidate.name}-${candidate.relationship}-${candidate.source}`}
                  type="button"
                  onClick={() => {
                    begin({
                      contactName: candidate.name,
                      relationship: candidate.relationship,
                      phone: candidate.phone,
                      email: candidate.email,
                    });
                  }}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-left text-xs transition hover:border-[#efb70c] hover:bg-[#fff7d7]"
                  title={`Candidate from ${candidate.source}; ${Math.round(candidate.confidence * 100)}% confidence`}
                >
                  <span className="block truncate font-bold text-neutral-900">{candidate.name}</span>
                  <span className="block truncate text-neutral-500">{[candidate.relationship, candidate.phone, candidate.email].filter(Boolean).join(' · ') || candidate.basis}</span>
                </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </DrawerDisclosure>
  );
}

function DrawerDisclosure({
  title,
  meta,
  defaultOpen = false,
  children,
  bodyClassName = 'p-3',
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm open:border-neutral-300">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#efb70c]/30">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-neutral-950">{title}</span>
          {meta ? <span className="mt-0.5 block truncate text-[11px] font-medium text-neutral-500">{meta}</span> : null}
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-500 group-open:hidden" aria-hidden="true">+</span>
        <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white text-sm font-bold text-neutral-700 group-open:flex" aria-hidden="true">-</span>
      </summary>
      <div className={`border-t border-neutral-200 ${bodyClassName}`}>
        {children}
      </div>
    </details>
  );
}

function MediaProgramMatches({ record }: { record: CaseRecord }) {
  return (
    <DrawerDisclosure
      title="Media & program matches"
      meta={`${record.mediaMatches.length} matched files from read-only server index`}
      bodyClassName="p-3"
    >
        {record.mediaMatches.length ? (
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {record.mediaMatches.slice(0, 12).map((match) => (
              <div key={match.item.id} className="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    match.confidence >= 0.9
                      ? 'bg-emerald-100 text-emerald-800'
                      : match.confidence >= 0.75
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-900'
                  }`}>
                    {match.label}
                  </span>
                  <span className="truncate font-bold text-neutral-900">{match.item.label}</span>
                </div>
                <div className="mt-1 truncate text-neutral-600" title={match.path}>{match.path}</div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-neutral-400">
                  <span>{match.type || 'File'}</span>
                  <span>{Math.round(match.confidence * 100)}%</span>
                  <span>{match.basis}</span>
                  {match.modified ? <span>{match.modified}</span> : null}
                </div>
              </div>
            ))}
            {record.mediaMatches.length > 12 ? (
              <div className="rounded-md border border-dashed border-neutral-200 px-2 py-1.5 text-xs italic text-neutral-400">
                {record.mediaMatches.length - 12} more matched files are loaded in related work below.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-xs italic text-neutral-400">No matched media or production files found in the read-only server index yet.</div>
        )}
    </DrawerDisclosure>
  );
}

function SourceAtGlance({
  record,
  sources,
  sheetSyncing,
  sheetSyncMessage,
  onSync,
  scrollBody = false,
}: {
  record: CaseRecord;
  sources: SourceHealth[];
  sheetSyncing: boolean;
  sheetSyncMessage: string;
  onSync: () => void;
  scrollBody?: boolean;
}) {
  const groups = [
    { title: 'Dates & times', entries: record.dateEntries },
    { title: 'Locations', entries: record.locationEntries },
    { title: 'Service staff', entries: record.serviceStaffEntries },
    { title: 'Service logistics', entries: record.serviceLogisticsEntries },
  ].filter((group) => group.entries.length);
  const sourceFacts = record.items.flatMap((item) =>
    collectTextEntries(item).slice(0, 12).map(([key, value]) => ({
      id: `${item.id}:${key}`,
      key: displayKey(key),
      value,
      source: item.source,
    })),
  ).slice(0, 80);
  const relatedWork = record.items.map((item) => {
    const facts = collectTextEntries(item).slice(0, 3);
    return {
      id: item.id,
      source: item.source,
      row: sourceRowLabel(item),
      label: item.label,
      status: item.status,
      due: item.due,
      facts,
    };
  });
  const visibleSourceFacts = sourceFacts.filter((fact) => fact.value).slice(0, 14);
  const sourceIssue = sources.some((source) => source.status === 'unavailable');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-neutral-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-neutral-950">Source evidence</h3>
          {sourceIssue ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Source check</span> : null}
        </div>
        <div className="text-[11px] text-neutral-500">Read-only source values for IT/debug review.</div>
      </div>
      <div className={`min-h-0 flex-1 space-y-2 p-3 ${scrollBody ? 'overflow-y-auto' : 'overflow-visible'}`}>
        {groups.map((group) => (
          <div key={group.title} className="rounded-md border border-neutral-200 bg-white p-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">{group.title}</div>
            <div className="mt-1 space-y-1">
              {group.entries.slice(0, 5).map((entry, index) => (
                <div key={`${group.title}-${entry.label}-${index}`} className="text-[11px] leading-tight">
                  <span className="font-bold text-neutral-600">{entry.label}: </span>
                  <span className="text-neutral-950">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-md border border-neutral-200 bg-white p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Related work</div>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500">{relatedWork.length}</span>
          </div>
          <div className="space-y-1">
            {relatedWork.slice(0, 7).map((item) => (
              <div key={item.id} className="rounded bg-neutral-50 px-2 py-1 text-[11px] leading-tight">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-bold text-neutral-950">{item.label}</span>
                  <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">{item.status}</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-neutral-500">{item.source} · {item.row}{item.due ? ` · ${item.due}` : ''}</div>
                {item.facts.length ? (
                  <div className="mt-0.5 space-y-0.5">
                    {item.facts.map(([key, value]) => (
                      <div key={`${item.id}-${key}`} className="truncate text-[10px] text-neutral-700">
                        <span className="font-bold text-neutral-500">{displayKey(key)}: </span>{value}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {visibleSourceFacts.length ? (
        <div className="rounded-md border border-neutral-200 bg-white p-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Source fields</div>
          <div className="mt-1 grid gap-1">
            {visibleSourceFacts.map((fact) => (
              <div key={fact.id} className="text-[11px] leading-tight">
                <span className="font-bold text-neutral-600">{fact.key}: </span>
                <span className="text-neutral-950">{fact.value}</span>
              </div>
            ))}
          </div>
        </div>
        ) : null}

        <details className="rounded-md border border-neutral-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1.5 text-[11px] font-bold text-neutral-600 hover:bg-neutral-50">
            Source rows
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px]">{record.items.length}</span>
          </summary>
          <div className="border-t border-neutral-100 p-2">
            <div className="space-y-1">
              {sourceFacts.length ? sourceFacts.map((fact) => (
                <div key={fact.id} className="rounded bg-neutral-50 px-2 py-1 text-[11px] leading-tight">
                  <div><span className="font-bold text-neutral-500">{fact.key}: </span><span className="text-neutral-900">{fact.value}</span></div>
                  <div className="mt-0.5 text-[10px] text-neutral-400">{fact.source}</div>
                </div>
              )) : <div className="text-[11px] italic text-neutral-400">No source fields found.</div>}
            </div>
          </div>
        </details>

        <details className="rounded-md border border-neutral-200 bg-white">
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-bold text-neutral-500 hover:bg-neutral-50">
            Sources
          </summary>
          <div className="space-y-1 border-t border-neutral-100 p-2">
            {sources.map((source) => (
              <div key={source.id} className="rounded bg-neutral-50 px-2 py-1 text-[11px] leading-tight">
                <span className="font-bold text-neutral-700">{source.label}: </span>
                <span>{source.status}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={onSync}
              disabled={sheetSyncing}
              className="mt-1 h-7 rounded-md bg-black px-2 text-[11px] font-bold text-[#efb70c] disabled:opacity-60"
            >
              {sheetSyncing ? 'Syncing' : 'Sync master sheet'}
            </button>
            {sheetSyncMessage ? <div className="text-[11px] text-neutral-500">{sheetSyncMessage}</div> : null}
          </div>
        </details>
      </div>
    </div>
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
    const sortedItems = [...groupedItems];
    const primaryItem = sortedItems[0];
    const statusItem = sortedItems.find((item) => item.area !== 'paperwork' && !item.source.startsWith('SMB:')) ?? primaryItem;
    const dateEntries = dedupeMenuEntries(sortedItems.flatMap((item) => collectGroupedEntries(item, dateGroups)));
    const locationEntries = dedupeMenuEntries(sortedItems.flatMap((item) => collectGroupedEntries(item, locationGroups)));
    const serviceItems = sortedItems.filter((item) => item.area === 'service');
    const serviceStaffEntries = dedupeMenuEntries(serviceItems.flatMap((item) => collectGroupedEntries(item, serviceStaffGroups)));
    const serviceLogisticsEntries = dedupeMenuEntries(serviceItems.flatMap((item) => collectGroupedEntries(item, serviceLogisticsGroups)));
    const recordName = itemName(statusItem);
    const contactCandidates = contactCandidatesFor(sortedItems, recordName);
    const sourceContact = contactCandidates[0] ?? null;
    const mediaMatches = sortedItems
      .filter(isServerMediaItem)
      .map((item) => mediaMatchForItem(item, { key, name: recordName }))
      .sort((a, b) => b.confidence - a.confidence || a.path.localeCompare(b.path));
    const areaCounts = sortedItems.reduce<Partial<Record<OperationArea, number>>>((counts, item) => {
      counts[item.area] = (counts[item.area] ?? 0) + 1;
      return counts;
    }, {});
    const dateOfBirth = sourceDateOfBirth(sortedItems);
    const dateOfTransition = sourceDateOfTransition(sortedItems);
    const sourceCaseNumbers = sourceCaseNumbersFor(sortedItems);
    const identityStatus = pickIdentityStatus(sortedItems);

    const record: CaseRecord = {
      key,
      name: recordName,
      items: sortedItems,
      primaryItem,
      statusItem,
      dateEntries,
      locationEntries,
      serviceStaffEntries,
      serviceLogisticsEntries,
      owner: sourceContact?.name || ownerFor(sortedItems),
      contactCandidates,
      sourceContact,
      mediaMatches,
      dateOfBirth,
      dateOfTransition,
      sourceCaseNumbers,
      identityStatus,
      blocker: blockerFor(sortedItems),
      updatedAt: lastUpdatedFor(sortedItems, auditEntries),
      areaCounts,
      searchText: '',
    };

    record.searchText = [
      record.name,
      record.owner,
      ...contactCandidates.flatMap((candidate) => [candidate.name, candidate.relationship, candidate.phone, candidate.email, candidate.source]),
      ...mediaMatches.flatMap((match) => [match.path, match.source, match.type, match.label]),
      record.blocker,
      key,
      ...sourceCaseNumbers,
      dateOfBirth ?? '',
      dateOfBirth ? formatTransitionDate(dateOfBirth) : '',
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
  if (view === 'cases') return true;
  if (view === 'calendar') return true;
  if (view === 'recent-first-calls') {
    // Cases we originated via the New First Call drawer in the last 72 hours. First-call rows carry
    // the explicit source 'First Call' (no sheet tab is named that — a more durable marker than the
    // default source_origin); createdAt is when the intake was recorded.
    const cutoff = Date.now() - 72 * 60 * 60 * 1000;
    return record.items.some(
      (item) => item.source === 'First Call' && item.createdAt != null && new Date(item.createdAt).getTime() >= cutoff,
    );
  }
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
    .sort((a, b) => b.score - a.score || a.item.source.localeCompare(b.item.source) || a.item.label.localeCompare(b.item.label))
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

  // Closeout is the terminal operational state. If staff (or source-derived evidence)
  // says a case is closed, the checklist should read as complete at a glance even when
  // earlier source rows were sparse or never existed in the imported sheets.
  const closeoutDone = base.some((state) => state.step.id === 'closeout' && state.done);
  if (closeoutDone) {
    return base.map((state) => ({
      ...state,
      auto: state.auto || !state.overridden,
      done: state.overridden ? state.done : true,
      gap: false,
    }));
  }

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
  onOpenDetails,
}: {
  record: CaseRecord;
  state: EffectiveStepState;
  onOpenDetails: () => void;
}) {
  const tone = state.gap
    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
    : state.done
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
      : state.item || state.auto
        ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
        : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpenDetails();
      }}
      title={`${state.step.label} — ${state.step.hint}. ${
        state.done ? 'Done' : state.gap ? 'Needs attention — a later step is already done' : 'Not done'
      }${state.overridden ? ' (set by staff)' : ' (auto-detected)'}. ${state.summary}. Click to open case details.`}
      aria-label={`${state.step.label}: ${state.step.hint}. ${state.done ? 'done' : state.gap ? 'gap' : 'not done'} for ${record.name}. Click to open case details.`}
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

type CalendarMode = 'day' | 'week' | 'month' | 'year';
type CaseCalendarEvent = {
  id: string;
  caseKey?: string;
  caseName: string;
  label: string;
  date: Date;
  dateLabel: string;
  location: string;
  source: string;
  externalUrl?: string;
};

function calendarRange(mode: CalendarMode, focusDate: Date) {
  const start = new Date(focusDate);
  start.setHours(0, 0, 0, 0);
  if (mode === 'day') {
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (mode === 'week') {
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (mode === 'month') {
    start.setDate(1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  start.setMonth(0, 1);
  const end = new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999);
  return { start, end };
}

function shiftCalendarDate(date: Date, mode: CalendarMode, amount: number) {
  const next = new Date(date);
  if (mode === 'day') next.setDate(next.getDate() + amount);
  else if (mode === 'week') next.setDate(next.getDate() + amount * 7);
  else if (mode === 'month') next.setMonth(next.getMonth() + amount);
  else next.setFullYear(next.getFullYear() + amount);
  return next;
}

function calendarTitle(mode: CalendarMode, focusDate: Date) {
  const { start, end } = calendarRange(mode, focusDate);
  if (mode === 'day') return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (mode === 'week') {
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  if (mode === 'month') return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return String(start.getFullYear());
}

function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calendarEventsFor(records: CaseRecord[], overrides: MilestoneOverrideMap): CaseCalendarEvent[] {
  const locationByDateKey: Record<string, string> = {
    service: 'service_location',
    cremation: 'cremation_location',
    burial: 'burial_location',
  };

  const events: CaseCalendarEvent[] = [];
  for (const record of records) {
    for (const def of DATE_MILESTONES) {
      const state = effectiveMilestone(record, def, overrides);
      if (state.state !== 'source' && state.state !== 'set') continue;
      const date = parseOperationalDate(state.value);
      if (!date) continue;
      const locationDef = ALL_MILESTONES.find((milestone) => milestone.key === locationByDateKey[def.key]);
      const locationState = locationDef ? effectiveMilestone(record, locationDef, overrides) : null;
      const location = locationState && (locationState.state === 'source' || locationState.state === 'set') ? locationState.value : '';
      events.push({
        id: `${record.key}:${def.key}:${calendarDateKey(date)}`,
        caseKey: record.key,
        caseName: record.name,
        label: def.full,
        date,
        dateLabel: state.value,
        location,
        source: state.overridden ? 'Staff' : 'Source',
      });
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.caseName.localeCompare(b.caseName));
}

function CalendarEventPill({ event, onOpen }: { event: CaseCalendarEvent; onOpen: (caseKey: string) => void }) {
  const clickable = Boolean(event.caseKey || event.externalUrl);
  const handleClick = () => {
    if (event.caseKey) onOpen(event.caseKey);
    else if (event.externalUrl) window.open(event.externalUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      data-case-calendar-event="true"
      onClick={handleClick}
      disabled={!clickable}
      className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:border-[#efb70c] hover:bg-[#fff7d7]"
      title={`${event.label}: ${event.caseName}${event.location ? `, ${event.location}` : ''}`}
    >
      <span className="block truncate font-bold text-neutral-950">{event.caseName}</span>
      <span className="block truncate text-neutral-600">{event.label}{event.location ? ` - ${event.location}` : ''}</span>
    </button>
  );
}

function googleCalendarEventsFor(events: GoogleCalendarEvent[]): CaseCalendarEvent[] {
  return events.flatMap((event) => {
      const date = new Date(event.start);
      if (Number.isNaN(date.getTime())) return [];
      const dateLabel = event.allDay
        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return [{
        id: event.id,
        caseName: event.title,
        label: event.calendarName,
        date,
        dateLabel,
        location: event.location,
        source: 'Google Calendar',
        externalUrl: event.htmlLink,
      } satisfies CaseCalendarEvent];
    });
}

function CalendarBoard({
  records,
  milestoneOverrides,
  onOpenCase,
}: {
  records: CaseRecord[];
  milestoneOverrides: MilestoneOverrideMap;
  onOpenCase: (caseKey: string) => void;
}) {
  const [mode, setMode] = useState<CalendarMode>('week');
  const [focusDate, setFocusDate] = useState(() => new Date());
  const { start, end } = calendarRange(mode, focusDate);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleCalendarUrl, setGoogleCalendarUrl] = useState('');
  const [googleCalendarConfigured, setGoogleCalendarConfigured] = useState(true);
  const [googleCalendarError, setGoogleCalendarError] = useState('');
  const rangeStart = start.toISOString();
  const rangeEnd = end.toISOString();
  const events = useMemo(() => {
    const sheetEvents = calendarEventsFor(records, milestoneOverrides);
    const realCalendarEvents = googleCalendarEventsFor(googleEvents);
    return [...realCalendarEvents, ...sheetEvents]
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.caseName.localeCompare(b.caseName));
  }, [records, milestoneOverrides, googleEvents]);

  useEffect(() => {
    let cancelled = false;
    setGoogleCalendarError('');
    getGoogleCalendarEvents(rangeStart, rangeEnd)
      .then((response) => {
        if (cancelled) return;
        setGoogleEvents(response.events);
        setGoogleCalendarUrl(response.calendar_url);
        setGoogleCalendarConfigured(response.configured);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setGoogleEvents([]);
        setGoogleCalendarError(error?.message || 'Google Calendar events could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd]);
  const visibleEvents = events.filter((event) => event.date >= start && event.date <= end);
  const eventsByDay = new Map<string, CaseCalendarEvent[]>();
  for (const event of visibleEvents) {
    const key = calendarDateKey(event.date);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(calendarRange('week', focusDate).start);
    day.setDate(day.getDate() + index);
    return day;
  });
  const monthStart = calendarRange('month', focusDate).start;
  const firstMonthCell = new Date(monthStart);
  firstMonthCell.setDate(1 - firstMonthCell.getDay());
  const monthDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstMonthCell);
    day.setDate(firstMonthCell.getDate() + index);
    return day;
  });
  const yearMonths = Array.from({ length: 12 }, (_, index) => new Date(focusDate.getFullYear(), index, 1));

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <h2 className="mr-auto text-sm font-black text-neutral-950">Calendar</h2>
        {googleCalendarUrl ? (
          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noreferrer"
            className="h-8 rounded-md border border-neutral-200 px-2 py-2 text-xs font-bold leading-none text-neutral-700 hover:bg-neutral-50"
          >
            Open Google Calendar
          </a>
        ) : null}
        <div className="flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5">
          {(['day', 'week', 'month', 'year'] as CalendarMode[]).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => setMode(nextMode)}
              className={`h-7 rounded px-2 text-[11px] font-bold capitalize ${mode === nextMode ? 'bg-black text-[#efb70c]' : 'text-neutral-600 hover:bg-white'}`}
            >
              {nextMode}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setFocusDate((date) => shiftCalendarDate(date, mode, -1))} className="h-8 rounded-md border border-neutral-200 px-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50">Prev</button>
        <button type="button" onClick={() => setFocusDate(new Date())} className="h-8 rounded-md border border-neutral-200 px-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50">Current</button>
        <button type="button" onClick={() => setFocusDate((date) => shiftCalendarDate(date, mode, 1))} className="h-8 rounded-md border border-neutral-200 px-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50">Next</button>
      </div>

      <div className="px-3 py-2 text-sm font-bold text-neutral-800">{calendarTitle(mode, focusDate)}</div>
      {!googleCalendarConfigured ? (
        <div className="mx-3 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Set GGFC_GOOGLE_CALENDAR_IDS to show the funeral home Google Calendar here.
        </div>
      ) : null}
      {googleCalendarError ? (
        <div className="mx-3 mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
          {googleCalendarError}
        </div>
      ) : null}

      {mode === 'day' ? (
        <div className="space-y-2 px-3 pb-3">
          {(eventsByDay.get(calendarDateKey(start)) ?? []).map((event) => <CalendarEventPill key={event.id} event={event} onOpen={onOpenCase} />)}
          {visibleEvents.length ? null : <div className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm italic text-neutral-400">No dated case milestones found for this day.</div>}
        </div>
      ) : null}

      {mode === 'week' ? (
        <div className="grid gap-px bg-neutral-200 md:grid-cols-7">
          {weekDays.map((day) => {
            const key = calendarDateKey(day);
            return (
              <div key={key} className="min-h-[360px] bg-white p-2">
                <div className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                  {day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="space-y-1.5">
                  {(eventsByDay.get(key) ?? []).map((event) => <CalendarEventPill key={event.id} event={event} onOpen={onOpenCase} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {mode === 'month' ? (
        <div className="grid grid-cols-7 gap-px bg-neutral-200">
          {monthDays.map((day) => {
            const key = calendarDateKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = day.getMonth() === focusDate.getMonth();
            return (
              <div key={key} className={`min-h-28 bg-white p-1.5 ${inMonth ? '' : 'opacity-40'}`}>
                <div className="mb-1 text-[11px] font-bold text-neutral-500">{day.getDate()}</div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((event) => <CalendarEventPill key={event.id} event={event} onOpen={onOpenCase} />)}
                  {dayEvents.length > 3 ? <div className="text-[10px] font-semibold text-neutral-400">+{dayEvents.length - 3} more</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {mode === 'year' ? (
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
          {yearMonths.map((month) => {
            const monthEvents = events.filter((event) => event.date.getFullYear() === month.getFullYear() && event.date.getMonth() === month.getMonth());
            return (
              <button
                key={month.toISOString()}
                type="button"
                onClick={() => {
                  setFocusDate(month);
                  setMode('month');
                }}
                className="min-h-28 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-left transition hover:border-[#efb70c] hover:bg-[#fff7d7]"
              >
                <div className="font-bold text-neutral-950">{month.toLocaleDateString('en-US', { month: 'long' })}</div>
                <div className="mt-1 text-xs text-neutral-500">{monthEvents.length} dated milestones</div>
                <div className="mt-2 space-y-1">
                  {monthEvents.slice(0, 3).map((event) => (
                    <div key={event.id} className="truncate text-[11px] text-neutral-700">{event.label}: {event.caseName}</div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function DeceasedCell({
  record,
  contactOverrides,
  onOpen,
}: {
  record: CaseRecord;
  contactOverrides: ContactOverrideMap;
  onOpen: () => void;
}) {
  const effective = effectiveFamilyContact(record, contactOverrides);
  const contact = contactGridText(effective);
  const hasCandidate = !contact && record.contactCandidates.length > 0;
  const infoLabel = contact
    ? effective?.overridden
      ? 'Staff contact'
      : 'Source contact'
    : hasCandidate
      ? 'Candidate'
      : 'Source coverage';
  const infoName = contact?.primary ||
    (hasCandidate ? record.contactCandidates[0].name : `${record.items.length} linked row${record.items.length === 1 ? '' : 's'}`);
  const infoSecondary = contact?.secondary ||
    (hasCandidate
      ? [record.contactCandidates[0].relationship, record.contactCandidates[0].phone, record.contactCandidates[0].email].filter(Boolean).join(' · ')
      : [
          primaryCaseRef(record) ? `GG ref ${primaryCaseRef(record)}` : '',
          record.mediaMatches.length ? `${record.mediaMatches.length} media match${record.mediaMatches.length === 1 ? '' : 'es'}` : '',
          record.primaryItem.source,
        ].filter(Boolean).join(' · '));
  const contactTone = contact
    ? effective?.overridden
      ? 'border-[#efb70c]/70 bg-[#fff7d7] text-neutral-950'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : hasCandidate
      ? 'border-blue-200 bg-blue-50 text-blue-800'
      : 'border-neutral-200 bg-neutral-50 text-neutral-700';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="min-w-0 border-l-4 border-l-neutral-300 px-2 py-1.5 text-left outline-none transition focus:border-l-[#efb70c] focus:bg-[#fff7d7]"
      aria-label={`Open details for ${record.name}`}
    >
      <div className="truncate text-sm font-bold text-neutral-950">{record.name}</div>
      <div className="mt-1 grid gap-1 text-[10px] leading-tight">
        <div className="grid grid-cols-2 gap-1">
          <div className="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-1 text-neutral-700">
            <div className="truncate text-[9px] font-bold uppercase tracking-wide text-neutral-400">DOB</div>
            <div className={`truncate font-semibold ${record.dateOfBirth ? '' : 'italic text-neutral-400'}`}>
              {record.dateOfBirth ? formatTransitionDate(record.dateOfBirth) : '...'}
            </div>
          </div>
          <div className="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-1 text-neutral-700">
            <div className="truncate text-[9px] font-bold uppercase tracking-wide text-neutral-400">Transition</div>
            <div className={`truncate font-semibold ${record.dateOfTransition ? '' : 'italic text-neutral-400'}`}>
              {record.dateOfTransition ? formatTransitionDate(record.dateOfTransition) : '...'}
            </div>
          </div>
        </div>
        <div className={`min-w-0 rounded-md border px-1.5 py-1 font-semibold ${contactTone}`}>
          <div className="truncate text-[9px] uppercase tracking-wide opacity-70">{infoLabel}</div>
          <div className="truncate">{infoName}</div>
          {infoSecondary ? <div className="truncate text-[10px] font-normal opacity-80">{infoSecondary}</div> : null}
        </div>
      </div>
    </button>
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
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id={`${controlId}-menu`}
            role="dialog"
            aria-label={`Status editor for ${item.label}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
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
        </>
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
  field: EditableItemField;
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
      ? `MoEVR filing overdue by ${Math.abs(deadline.daysRemaining)} day${Math.abs(deadline.daysRemaining) === 1 ? '' : 's'} (${deadline.deadlineLabel})`
      : `MoEVR filing target ${deadline.deadlineLabel} · ${deadline.daysRemaining} day${deadline.daysRemaining === 1 ? '' : 's'} left`;
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
    // Only flag the board pill for OPERATIONALLY LIVE deadlines. An unfiled cert whose death was
    // long ago (e.g. a backfilled historical DOD) is reference data, not an actionable filing
    // alert — gating by recency keeps the board's overdue pills meaningful instead of wallpaper.
    const dod = item.dateOfDeath && /^\d{4}-\d{2}-\d{2}$/.test(item.dateOfDeath)
      ? new Date(`${item.dateOfDeath}T12:00:00`)
      : null;
    if (dod && (Date.now() - dod.getTime()) / 86_400_000 > 45) continue;
    if (!worst || deadline.daysRemaining < worst.daysRemaining) {
      worst = { status: deadline.status, daysRemaining: deadline.daysRemaining };
    }
  }
  if (!worst) return null;
  const tone = worst.status === 'overdue' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white';
  const label =
    worst.status === 'overdue'
      ? `DC filing overdue ${Math.abs(worst.daysRemaining)}d`
      : `DC target ${worst.daysRemaining}d`;
  return <span className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>;
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
  const doneCount = effectiveStates.filter((state) => state.done).length;

  return (
    <DrawerDisclosure title="Family checklist" meta={`${doneCount}/${effectiveStates.length} complete`} defaultOpen>
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
    </DrawerDisclosure>
  );
}

function DetailDrawer({
  record,
  statusOverrides,
  workflowOverrides,
  milestoneOverrides,
  contactOverrides,
  sources,
  sheetSyncing,
  sheetSyncMessage,
  auditEntries,
  onClose,
  onCommit,
  onUpdate,
  onToggleStep,
  onCommitMilestone,
  onCommitContact,
  onSyncSources,
}: {
  record: CaseRecord | null;
  statusOverrides: Record<string, StatusOverride>;
  workflowOverrides: WorkflowOverrideMap;
  milestoneOverrides: MilestoneOverrideMap;
  contactOverrides: ContactOverrideMap;
  sources: SourceHealth[];
  sheetSyncing: boolean;
  sheetSyncMessage: string;
  auditEntries: AuditEntry[];
  onClose: () => void;
  onCommit: (item: DashboardItem, nextStatus: string, initials: string) => Promise<void>;
  onUpdate: (itemId: string, field: EditableItemField, value: string) => Promise<void>;
  onToggleStep: ToggleStep;
  onCommitMilestone: CommitMilestone;
  onCommitContact: CommitContact;
  onSyncSources: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [sourceEvidenceOpen, setSourceEvidenceOpen] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!record) return;
    setSourceEvidenceOpen(false);
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
        className="relative h-dvh w-[95vw] max-w-[1840px] overflow-hidden border-l border-neutral-200 bg-white shadow-2xl max-sm:w-[98vw]"
        onClick={(event) => event.stopPropagation()}
        aria-label={`Details for ${record.name}`}
      >
        <div className="border-b border-neutral-200 bg-white px-5 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#a77d00]">Family detail</div>
              <h2 className="mt-1 truncate text-xl font-bold text-neutral-950">{record.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <span>{record.items.length} related source rows and files</span>
                {record.sourceCaseNumbers.length > 0 && (
                  <span
                    className="rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600"
                    title="Golden Gate per-register case number (not a global ID)"
                  >
                    GG ref {primaryCaseRef(record)}
                  </span>
                )}
                {record.identityStatus === 'unverified' && (
                  <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
                    Unverified identity — review
                  </span>
                )}
                {record.identityStatus === 'date-bridged' && (
                  <span
                    className="rounded border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 font-medium text-neutral-600"
                    title="Year matched by activity date, not this case's own number — lower confidence"
                  >
                    Date-matched year
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setSourceEvidenceOpen((open) => !open)}
                className="h-8 rounded-md border border-neutral-200 px-2.5 text-xs font-bold text-neutral-500 hover:bg-neutral-100"
                aria-expanded={sourceEvidenceOpen}
              >
                Source evidence
              </button>
              <button ref={closeButtonRef} type="button" onClick={onClose} className="h-8 rounded-md border border-neutral-200 px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-100">
                Close
              </button>
            </div>
          </div>
        </div>
        {sourceEvidenceOpen ? (
          <div className="absolute right-4 top-[72px] z-50 h-[min(760px,calc(100dvh-96px))] w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl">
            <SourceAtGlance
              record={record}
              sources={sources}
              sheetSyncing={sheetSyncing}
              sheetSyncMessage={sheetSyncMessage}
              onSync={onSyncSources}
              scrollBody
            />
          </div>
        ) : null}

        {/* The overlay/body never scrolls behind the drawer. The content pane owns one
            controlled scroll path so expanded sections remain reachable on short screens. */}
        <div className="h-[calc(100dvh-73px)] overflow-hidden">
          <div className="h-full min-h-0 space-y-2 overflow-y-auto px-3 pb-3 pt-3">
            <FamilyContactEditor record={record} overrides={contactOverrides} onCommitContact={onCommitContact} />
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
              <MediaProgramMatches record={record} />

              <DrawerDisclosure title="Recent audit" meta="Staff edits for this family" bodyClassName="divide-y divide-neutral-100">
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
              </DrawerDisclosure>
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
  const [sortMode, setSortMode] = useState<'name' | 'recent' | 'count' | 'casenum'>('casenum');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [registerFilter, setRegisterFilter] = useState('');
  const [recordLimit, setRecordLimit] = useState(visibleRecordLimit);
  // 0 = use the server's default per-area window (250). "Show more" raises this to fetch deeper
  // history from the server on demand; the default page load never sends it, so normal load is
  // unchanged and only an explicit click pays the heavier fetch.
  const [feedPerArea, setFeedPerArea] = useState(0);
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [feedMeta, setFeedMeta] = useState<FeedMeta | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusOverride>>({});
  const [workflowOverrides, setWorkflowOverrides] = useState<WorkflowOverrideMap>({});
  const [milestoneOverrides, setMilestoneOverrides] = useState<MilestoneOverrideMap>({});
  const [contactOverrides, setContactOverrides] = useState<ContactOverrideMap>({});
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [syncState, setSyncState] = useState<'loading' | 'connected' | 'unavailable'>('loading');
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [operationsError, setOperationsError] = useState('');
  const [sheetSyncMessage, setSheetSyncMessage] = useState('');
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [firstCallOpen, setFirstCallOpen] = useState(false);
  const operationsRequestRef = useRef(0);
  const detailFetchedKeysRef = useRef<Set<string>>(new Set());
  const detailRequestRef = useRef(0);

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
      setFeedPerArea(0);
      setRegisterFilter('');
      loadOperationsFeed({ query: search.trim() });
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!selectedKey) return;
    if (detailFetchedKeysRef.current.has(selectedKey)) return;
    const key = selectedKey;
    const timer = window.setTimeout(() => {
      loadOperationsFeed({ caseKey: key, merge: true, limit: 2000 }).then((loaded) => {
        if (loaded) detailFetchedKeysRef.current.add(key);
      });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [selectedKey]);

  function chooseView(view: ViewId) {
    setActiveView(view);
    const url = new URL(window.location.href);
    if (view === 'active') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    window.history.replaceState({}, '', url);
    window.dispatchEvent(new CustomEvent('ggfo-view-change'));
  }

  function loadOperationsFeed(options: { query?: string; caseKey?: string; merge?: boolean; limit?: number; perArea?: number; source?: string } = {}) {
    const requestId = options.merge ? operationsRequestRef.current : operationsRequestRef.current + 1;
    if (!options.merge) operationsRequestRef.current = requestId;
    const isDetailFetch = Boolean(options.merge && options.caseKey);
    if (isDetailFetch) detailRequestRef.current += 1;

    if (!isDetailFetch) setOperationsLoading(true);
    setOperationsError('');

    return getOperationsFeed({
      q: options.query || undefined,
      caseKey: options.caseKey || undefined,
      limit: options.limit,
      perArea: options.perArea,
      source: options.source,
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
        if (!options.merge || response.sources?.length) setSources(response.sources ?? []);
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
        setAuditEntries((entries) => [...entries.filter((entry) => entry.kind !== 'edit'), ...itemAuditEntries]
          .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt))
          .slice(0, 100));
        setSyncState('connected');
        return true;
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
        return false;
      })
      .finally(() => {
        if (!isDetailFetch && requestId === operationsRequestRef.current) setOperationsLoading(false);
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
        setAuditEntries((entries) => [...nextAuditEntries, ...entries.filter((entry) => entry.kind !== 'status')]
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
          kind: 'workflow',
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
          kind: 'milestone',
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

  useEffect(() => {
    // Staff-confirmed family/NOK contacts. Source systems remain read-only.
    getDashboardCaseContacts()
      .then((response) => {
        const next: ContactOverrideMap = {};
        for (const row of response.data) {
          next[row.case_key] = {
            contactName: row.contact_name,
            relationship: row.relationship,
            phone: row.phone,
            email: row.email,
            notes: row.notes,
            initials: row.staff_initials,
            updatedAt: row.updated_at,
          };
        }
        setContactOverrides(next);
        const audit: AuditEntry[] = response.audit.map((a) => ({
          kind: 'contact',
          itemId: `${a.case_key}:family-contact`,
          label: `${a.case_name || ''} — Family contact`,
          fieldName: a.field_name || 'Family contact',
          from: a.old_value ?? 'source',
          to: a.new_value,
          initials: a.staff_initials,
          changedAt: a.created_at,
        }));
        setAuditEntries((prev) => mergeAudit(audit, prev));
      })
      .catch(() => {
        setContactOverrides({});
      });
  }, []);

  async function syncMasterSheetToDashboard() {
    setSheetSyncing(true);
    setSheetSyncMessage('');
    try {
      const response = await syncMasterSheet();
      setSheetSyncMessage(`Imported ${response.data.imported} items from ${response.data.raw_rows} staged master sheet rows.`);
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
        kind: 'workflow',
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
        kind: 'milestone',
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

  async function commitContact(record: CaseRecord, next: ContactOverride, initials: string) {
    const saved = await saveDashboardCaseContact({
      case_key: record.key,
      case_name: record.name,
      contact_name: next.contactName,
      relationship: next.relationship,
      phone: next.phone,
      email: next.email,
      notes: next.notes,
      staff_initials: initials,
    });

    setContactOverrides((current) => {
      const cleanNext = { ...current };
      if (!saved.data) {
        delete cleanNext[record.key];
        return cleanNext;
      }
      cleanNext[record.key] = {
        contactName: saved.data.contact_name,
        relationship: saved.data.relationship,
        phone: saved.data.phone,
        email: saved.data.email,
        notes: saved.data.notes,
        initials: saved.data.staff_initials,
        updatedAt: saved.data.updated_at,
      };
      return cleanNext;
    });

    if (saved.audit) {
      const entry: AuditEntry = {
        kind: 'contact',
        itemId: `${record.key}:family-contact`,
        label: `${record.name} — Family contact`,
        fieldName: saved.audit.field_name || 'Family contact',
        from: saved.audit.old_value ?? 'source',
        to: saved.audit.new_value,
        initials: saved.audit.staff_initials,
        changedAt: saved.audit.created_at,
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
          milestoneSearchText(record, milestoneOverrides).toLowerCase().includes(normalized) ||
          contactSearchText(record, contactOverrides).toLowerCase().includes(normalized),
      )
      .filter(
        // "Needs attention" = a workflow step was skipped (an earlier step is undone while a
        // later one is done) — the throughput signal for "no steps missed".
        (record) => !attentionOnly || (workflowStateByKey.get(record.key) ?? []).some((state) => state.gap),
      )
      .sort((a, b) => {
        if (sortMode === 'casenum') {
          return caseNumberSortValue(b) - caseNumberSortValue(a) || a.name.localeCompare(b.name);
        }
        if (sortMode === 'recent') {
          return (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.name.localeCompare(b.name);
        }
        if (sortMode === 'count') {
          return b.items.length - a.items.length || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
      });
  }, [activeView, caseRecords, search, sortMode, attentionOnly, workflowStateByKey, statusOverrides, milestoneOverrides, contactOverrides]);
  const visibleRecords = useMemo(() => matchingRecords.slice(0, recordLimit), [matchingRecords, recordLimit]);
  // Reset the visible window whenever the filtered/sorted set changes, so "Show more" never
  // leaves a stale large window applied to a freshly narrowed view.
  useEffect(() => {
    setRecordLimit(visibleRecordLimit);
  }, [activeView, search, sortMode, attentionOnly, registerFilter]);
  const selectedRecord = selectedKey ? caseRecords.find((record) => record.key === selectedKey) ?? null : null;
  const visibleSummary = operationsLoading
    ? 'Loading dashboard records'
    : feedMeta
      ? `${visibleRecords.length} families shown from ${feedMeta.returned.toLocaleString()} loaded records${feedMeta.limited ? ` of ${feedMeta.total.toLocaleString()} matches` : ''}`
      : `${visibleRecords.length} families shown`;
  // Locked header ticker contract:
  // - Cases this month is server-side distinct canonical case groups with business_date in the
  //   current month. It is best-available operational activity, not legal DOD volume.
  // - Cases this year is server-side distinct canonical case groups with resolver case_year equal
  //   to the current year. Do not replace these with feed-window counts.
  const headerMetrics = feedMeta?.metrics;
  const casesThisMonth = headerMetrics?.cases_this_month ?? 0;
  const casesThisYear = headerMetrics?.cases_this_year ?? 0;
  // "Show more": first reveal records already loaded on the client; once those are exhausted,
  // fetch a deeper per-area window from the server (capped at 2000/area). The server side is
  // read-only — this only widens how much of Golden Gate's data we mirror into our view.
  const moreLoadedClientSide = matchingRecords.length > recordLimit;
  const canFetchDeeper = Boolean(feedMeta?.limited) && (feedPerArea || 250) < 2000;
  const showMoreVisible = !operationsLoading && !operationsError && (moreLoadedClientSide || canFetchDeeper);
  // Per-register view: fetch one source tab (e.g. "Death Certificate 2024") whole from the server
  // and show all of it (switch to the all-cases view so the active-window filter doesn't hide it).
  function chooseRegister(src: string) {
    setRegisterFilter(src);
    setFeedPerArea(0);
    if (src) setActiveView('cases');
    loadOperationsFeed({ query: search.trim(), source: src || undefined });
  }
  function handleShowMore() {
    if (moreLoadedClientSide) {
      setRecordLimit((limit) => limit + visibleRecordLimit);
      return;
    }
    const next = Math.min((feedPerArea || 250) + 250, 2000);
    setFeedPerArea(next);
    setRecordLimit((limit) => limit + visibleRecordLimit);
    loadOperationsFeed({ query: search.trim(), perArea: next });
  }

  return (
    <div className="h-full bg-[#faf9f9] text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white p-1">
              <img src="/brand/gg-logo.png" alt="Golden Gate Funeral & Cremation Services" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-black">Golden Gate Dashboard</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setFirstCallOpen(true)}
              className="h-8 rounded-md bg-red-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-red-700"
            >
              + New First Call
            </button>
            <span className="mx-1 h-8 border-l border-neutral-200" aria-hidden="true" />
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
            <span className="mx-1 h-8 border-l border-neutral-200" aria-hidden="true" />
            {appTopLinks.map((link) =>
              link.ready ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex h-8 items-center rounded-md px-2.5 text-xs font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950"
                >
                  {link.label}
                </Link>
              ) : (
                <span
                  key={link.href}
                  title="Not connected yet"
                  className="flex h-8 cursor-not-allowed items-center gap-1 rounded-md px-2.5 text-xs font-bold text-neutral-300"
                >
                  {link.label}<span className="text-[9px] font-semibold uppercase">soon</span>
                </span>
              ),
            )}
          </div>
          <div className="ml-auto flex min-w-[190px] items-center justify-end gap-2">
            <span className="hidden whitespace-nowrap text-[11px] font-semibold text-neutral-500 2xl:inline">{visibleSummary}</span>
            <div className="hidden items-center gap-1 lg:flex">
              <HeaderMetric label="Cases this month" value={casesThisMonth} />
              <HeaderMetric label="Cases this year" value={casesThisYear} />
            </div>
            {(feedMeta?.registers?.length ?? 0) > 0 ? (
              <select
                value={registerFilter}
                onChange={(event) => chooseRegister(event.target.value)}
                className="hidden h-8 max-w-[190px] rounded-md border border-neutral-200 bg-neutral-50 px-2 text-xs font-semibold text-neutral-700 outline-none focus:border-[#efb70c] lg:block"
                aria-label="View a register"
              >
                <option value="">All registers</option>
                {feedMeta!.registers!.map((reg) => (
                  <option key={reg.source} value={reg.source}>
                    {reg.source} ({reg.count.toLocaleString()})
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => setAttentionOnly((on) => !on)}
              aria-pressed={attentionOnly}
              title="Show only cases with a skipped workflow step"
              className={`hidden h-8 rounded-md border px-2.5 text-xs font-bold transition sm:block ${
                attentionOnly
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Needs attention
            </button>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as 'name' | 'recent' | 'count' | 'casenum')}
              className="hidden h-8 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-xs font-semibold text-neutral-700 outline-none focus:border-[#efb70c] sm:block"
              aria-label="Sort families"
            >
              <option value="casenum">Sort: Case # (new→old)</option>
              <option value="name">Sort: Name A–Z</option>
              <option value="recent">Sort: Recently updated</option>
              <option value="count">Sort: Most records</option>
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search family"
              className="h-8 w-48 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#efb70c] focus:ring-2 focus:ring-[#efb70c]/20 sm:w-56"
              aria-label="Search family or deceased"
            />
          </div>
        </div>
      </header>

      <main className="p-3">
        {activeView === 'calendar' ? (
          <CalendarBoard records={caseRecords} milestoneOverrides={milestoneOverrides} onOpenCase={setSelectedKey} />
        ) : (
        <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="grid grid-cols-[minmax(88px,0.5fr)_minmax(240px,1.35fr)_minmax(160px,1fr)_minmax(150px,1fr)_minmax(300px,1.8fr)] border-b border-neutral-200 bg-neutral-50 text-center text-[11px] font-bold uppercase tracking-wide text-neutral-500 max-lg:hidden">
            <div className="px-2 py-2">Case #</div>
            <div className="px-2 py-2">Deceased</div>
            <div className="px-2 py-2">Date / Time</div>
            <div className="px-2 py-2">Location</div>
            <div className="px-2 py-2">Status</div>
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
                onClick={() => setSelectedKey(record.key)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedKey(record.key);
                  }
                }}
                role="button"
                tabIndex={0}
                className="grid w-full cursor-pointer grid-cols-[minmax(88px,0.5fr)_minmax(240px,1.35fr)_minmax(160px,1fr)_minmax(150px,1fr)_minmax(300px,1.8fr)] items-stretch text-left transition hover:bg-[#faf9f9] focus:bg-[#fff7d7] focus:outline-none max-lg:block"
                aria-label={`Open details for ${record.name}`}
              >
                <div className="flex items-center px-2 py-1.5 font-mono text-[11px] text-neutral-500 max-lg:hidden">
                  {primaryCaseRef(record) ? (
                    <span title="Golden Gate per-register reference (not a global ID)">
                      {primaryCaseRef(record)}
                    </span>
                  ) : record.items.some((item) => item.source === 'First Call') ? (
                    <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-800">New</span>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </div>
                <DeceasedCell record={record} contactOverrides={contactOverrides} onOpen={() => setSelectedKey(record.key)} />
                <div className="px-1 py-1.5">
                  <MilestoneChips record={record} defs={DATE_MILESTONES} overrides={milestoneOverrides} onOpen={() => setSelectedKey(record.key)} />
                </div>
                <div className="px-1 py-1.5">
                  <MilestoneChips record={record} defs={LOCATION_MILESTONES} overrides={milestoneOverrides} onOpen={() => setSelectedKey(record.key)} />
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
            {showMoreVisible ? (
              <div className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={handleShowMore}
                  className="h-8 rounded-md border border-neutral-200 bg-white px-4 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                >
                  {moreLoadedClientSide
                    ? `Show more (${(matchingRecords.length - recordLimit).toLocaleString()} more loaded)`
                    : 'Load more from source'}
                </button>
              </div>
            ) : null}
          </div>
        </section>
        )}
      </main>

      {firstCallOpen ? (
        <FirstCallDrawer
          onClose={() => setFirstCallOpen(false)}
          onCreated={(created) => {
            setFirstCallOpen(false);
            setSearch('');
            setActiveView('recent-first-calls');
            loadOperationsFeed({ query: '' });
            setSelectedKey(created.case_key);
          }}
        />
      ) : null}

      <DetailDrawer
        record={selectedRecord}
        statusOverrides={statusOverrides}
        workflowOverrides={workflowOverrides}
        milestoneOverrides={milestoneOverrides}
        contactOverrides={contactOverrides}
        sources={sources}
        sheetSyncing={sheetSyncing}
        sheetSyncMessage={sheetSyncMessage}
        auditEntries={auditEntries}
        onClose={() => setSelectedKey(null)}
        onCommit={commitStatus}
        onUpdate={updateItemField}
        onToggleStep={commitWorkflowStep}
        onCommitMilestone={commitMilestone}
        onCommitContact={commitContact}
        onSyncSources={syncMasterSheetToDashboard}
      />

      {syncState === 'unavailable' ? (
        <div className="fixed bottom-4 right-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 shadow">
          Dashboard database unavailable
        </div>
      ) : null}
    </div>
  );
}
