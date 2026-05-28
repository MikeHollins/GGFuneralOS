'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  getOperationalStatuses,
  getOperationsFeed,
  saveOperationalStatus,
  syncWeeklyServiceSchedule,
  updateOperationItem,
  type OperationsFeed,
} from '@/lib/api';
import { type DashboardItem, type OperationArea } from '@/lib/operation-items';

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
type FeedMeta = NonNullable<OperationsFeed['meta']>;
type ViewId = 'active' | 'today' | 'cases' | 'service' | 'arrangements' | 'death-certs' | 'cremains' | 'belongings' | 'files';
type EditableItemField = 'label' | 'detail' | 'owner' | 'due' | 'priority';

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
  nextAction: string;
  blocker: string;
  updatedAt: string;
  areaCounts: Partial<Record<OperationArea, number>>;
  searchText: string;
};

type WorkflowStepDefinition = {
  id: string;
  label: string;
  shortLabel: string;
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
    terms: ['first call', '1st call', 'call sheet', 'initial call', 'intake', 'hospice', 'place of death'],
    areas: ['death-cert', 'paperwork'],
    keys: ['case', 'place_of_death', 'hospice_nurse', 'phone', 'other_info'],
  },
  {
    id: 'first-meeting',
    label: 'First meeting',
    shortLabel: 'Meet',
    terms: ['arrangement', 'appointment', 'meeting', 'conference'],
    areas: ['arrangement'],
    keys: ['arrangement_date', 'appointment_date', 'appointment_time', 'arrangement_location', 'package', 'contract'],
  },
  {
    id: 'pickup',
    label: 'Body pickup',
    shortLabel: 'Pick',
    terms: ['pickup', 'pick up', 'removal', 'body', 'transfer', 'mokan'],
    areas: ['crematory'],
    keys: ['date_of_cremation', 'pick_up_date', 'place_of_death', 'mokan', 'column_3', 'other_info'],
  },
  {
    id: 'selection',
    label: 'Service selection',
    shortLabel: 'Svc',
    terms: ['service selection', 'service type', 'chapel', 'church', 'cemetery', 'cremation', 'burial'],
    areas: ['service', 'arrangement'],
    keys: ['service_type', 'disposition_type', 'service_date', 'service_time', 'service_location', 'cemetery', 'crematory', 'date', 'time', 'location', 'lead', 'lady', 'call', 'hearse', 'limo'],
  },
  {
    id: 'media-program',
    label: 'Media and program',
    shortLabel: 'Media',
    terms: ['media', 'photo', 'program', 'obituary', 'design', 'print', 'production'],
    areas: ['production'],
    keys: ['relative_path', 'parent_path', 'extension', 'modified_at', 'size_bytes'],
  },
  {
    id: 'death-cert',
    label: 'Death certificate',
    shortLabel: 'DC',
    terms: ['death cert', 'certificate', 'doctor', 'medical', 'registrar', 'filed', 'dr name'],
    areas: ['death-cert'],
    keys: ['case', 'dr_name', 'hospice_nurse', 'place_of_death', 'state', 'c_j_email_dc'],
  },
  {
    id: 'disposition',
    label: 'Service / disposition',
    shortLabel: 'Disp',
    terms: ['service', 'cremation', 'crematory', 'cremains', 'burial', 'cemetery', 'committal'],
    areas: ['service', 'crematory', 'cremains'],
    keys: ['date_of_cremation', 'date_of_return', 'pick_up_date', 'mokan', 'paid', 'urn', 'property'],
  },
  {
    id: 'closeout',
    label: 'Closeout',
    shortLabel: 'Close',
    terms: ['payment', 'contract', 'belongings', 'release', 'aftercare', 'picked up', 'paperwork'],
    areas: ['belongings', 'cremains'],
    keys: ['paid', 'property', 'urn', 'date_of_return', 'pick_up_date', 'signature_of_receiver'],
  },
];

function sourcePayload(item: DashboardItem) {
  return item.sourcePayload ?? {};
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
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

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function itemOperationalDates(item: DashboardItem) {
  const businessDates = itemBusinessDates(item);
  if (businessDates.length) return businessDates;

  const createdAt = parseOperationalDate(item.createdAt);
  return createdAt ? [createdAt] : [];
}

function recordIsActive(record: CaseRecord) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - activeCaseWindowDays);
  cutoff.setHours(0, 0, 0, 0);
  return record.items.some((item) => itemOperationalDates(item).some((date) => date >= cutoff));
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

function ownerFor(items: DashboardItem[]) {
  return items.find((item) => item.owner && item.owner !== 'Staff')?.owner || items[0]?.owner || 'Staff';
}

function nextActionFor(items: DashboardItem[]) {
  const urgent = [...items].sort((a, b) => priorityRank(b) - priorityRank(a))[0];
  if (!urgent) return 'Review case';
  const status = urgent.status.toLowerCase();
  if (status.includes('not started') || status.includes('needs') || status.includes('missing')) return `Resolve ${urgent.source}`;
  if (status.includes('pending') || status.includes('called') || status.includes('requested')) return `Follow up on ${urgent.source}`;
  if (urgent.area === 'death-cert') return 'Check death certificate';
  if (urgent.area === 'cremains' || urgent.area === 'crematory') return 'Check cremains status';
  if (urgent.area === 'belongings') return 'Check belongings release';
  if (urgent.source.startsWith('SMB:')) return 'Review related file';
  return urgent.detail || 'Review case';
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

function lastUpdatedFor(items: DashboardItem[], auditEntries: AuditEntry[]) {
  const itemIds = new Set(items.map((item) => item.id));
  const audit = auditEntries.find((entry) => itemIds.has(entry.itemId));
  if (audit) return formatStamp(audit.changedAt);

  const modified = items
    .map((item) => cleanDisplay(sourcePayload(item).modified_at))
    .filter(Boolean)
    .sort()
    .at(-1);
  if (modified) return safeFieldValue('modified_at', modified);
  return 'No staff edits';
}

function buildCases(items: DashboardItem[], auditEntries: AuditEntry[]) {
  const groups = new Map<string, DashboardItem[]>();
  const knownCases: Array<{ key: string; name: string }> = [];

  for (const item of items) {
    if (isServerMediaItem(item)) continue;
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
      nextAction: nextActionFor(sortedItems),
      blocker: blockerFor(sortedItems),
      updatedAt: lastUpdatedFor(sortedItems, auditEntries),
      areaCounts,
      searchText: '',
    };

    record.searchText = [
      record.name,
      record.owner,
      record.nextAction,
      record.blocker,
      key,
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

function readinessBadges(record: CaseRecord) {
  return [
    { label: 'Arr', active: Boolean(record.areaCounts.arrangement), tone: 'bg-blue-50 text-blue-800 border-blue-200' },
    { label: 'DC', active: Boolean(record.areaCounts['death-cert']), tone: 'bg-red-50 text-red-800 border-red-200' },
    { label: 'Crem', active: Boolean(record.areaCounts.cremains || record.areaCounts.crematory), tone: 'bg-amber-50 text-amber-900 border-amber-200' },
    { label: 'Bel', active: Boolean(record.areaCounts.belongings), tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { label: 'Files', active: record.items.some((item) => item.source.startsWith('SMB:')), tone: 'bg-neutral-100 text-neutral-700 border-neutral-200' },
  ];
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

function WorkflowGlyph({ stepId }: { stepId: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };
  const paths: Record<string, ReactNode> = {
    'first-call': <path {...common} d="M7 5h4l1 4-2 1a12 12 0 0 0 4 4l1-2 4 1v4c0 1-1 2-2 2A14 14 0 0 1 5 7c0-1 1-2 2-2Z" />,
    'first-meeting': <path {...common} d="M8 6V4m8 2V4M5 9h14M7 6h10a2 2 0 0 1 2 2v10H5V8a2 2 0 0 1 2-2Zm3 7h4" />,
    pickup: <path {...common} d="M4 13V7h9v6m0-3h4l3 3v4h-2m-12 0H4v-4h16m-12 4a2 2 0 1 0 4 0m4 0a2 2 0 1 0 4 0" />,
    selection: <path {...common} d="M6 19V9l6-4 6 4v10m-9 0v-6h6v6" />,
    'media-program': <path {...common} d="M5 6h14v12H5zM8 15l3-3 2 2 2-3 3 4M9 9h.01" />,
    'death-cert': <path {...common} d="M7 4h8l4 4v12H7zM15 4v5h4M10 13h6M10 17h4" />,
    disposition: <path {...common} d="M12 4v16m-6-6h12M8 8l4-4 4 4M8 16l4 4 4-4" />,
    closeout: <path {...common} d="m5 13 4 4L19 7M6 6h10M6 10h7" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0">
      {paths[stepId] ?? <circle {...common} cx="12" cy="12" r="7" />}
    </svg>
  );
}

function WorkflowProgressCell({
  record,
  statusOverrides,
  onOpenDetails,
}: {
  record: CaseRecord;
  statusOverrides: Record<string, StatusOverride>;
  onOpenDetails: () => void;
}) {
  const states = workflowStepStates(record, statusOverrides);
  const doneCount = states.filter((state) => state.done).length;
  const needed = states.filter((state) => !state.done);

  return (
    <div className="px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {states.map((state) => (
          <button
            key={state.step.id}
            type="button"
            onClick={onOpenDetails}
            title={`${state.step.label}: ${state.summary}`}
            aria-label={`${state.step.label} ${state.done ? 'done' : 'needed'} for ${record.name}`}
            className={`inline-flex h-7 items-center gap-1 rounded-md border px-1.5 text-[10px] font-bold transition ${
              state.done
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : state.item
                  ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
              state.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-current bg-white/70 text-transparent'
            }`}>
              ✓
            </span>
            <WorkflowGlyph stepId={state.step.id} />
            <span className="hidden 2xl:inline">{state.step.shortLabel}</span>
          </button>
        ))}
      </div>
      <div className="mt-1 truncate text-[11px] font-semibold text-neutral-500">
        {doneCount}/{states.length} done{needed[0] ? ` · next: ${needed[0].step.shortLabel}` : ''}
      </div>
    </div>
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
  onUpdate,
}: {
  label: string;
  value: string;
  itemId: string;
  field: Exclude<EditableItemField, 'priority'>;
  multiline?: boolean;
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
          value={draft}
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
  onCommit,
  onUpdate,
}: {
  record: CaseRecord;
  statusOverrides: Record<string, StatusOverride>;
  onCommit: (item: DashboardItem, nextStatus: string, initials: string) => Promise<void>;
  onUpdate: (itemId: string, field: EditableItemField, value: string) => Promise<void>;
}) {
  const [openStep, setOpenStep] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-3 py-2">
        <h3 className="text-sm font-bold text-neutral-950">Family checklist</h3>
      </div>
      <div className="columns-1 gap-2 p-3 md:columns-2 xl:columns-4">
        {familyWorkflow.map((step) => {
          const relatedItems = workflowItemsFor(record, step);
          const primary = relatedItems[0] ?? null;
          const done = primary ? isWorkflowDone(primary, statusOverrides[primary.id]) : false;
          const open = openStep === step.id;
          const summary = workflowSummary(primary, step, primary ? statusOverrides[primary.id] : undefined);
          const facts = primary ? workflowFacts(primary, step) : [];
          const detailItems = relatedItems.filter((item) => item.id !== primary?.id).slice(0, 5);

          return (
            <div
              key={step.id}
              className={`relative mb-2 break-inside-avoid rounded-lg border transition focus-within:z-10 focus-within:shadow-lg ${
                done ? 'border-emerald-200 bg-emerald-50/40' : 'border-neutral-200 bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenStep(open ? null : step.id)}
                className="flex min-h-16 w-full items-start gap-2 p-2 text-left"
                aria-expanded={open}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-black ${
                  done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300 bg-white text-transparent'
                }`}>
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-neutral-950">{step.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-600">{summary}</span>
                </span>
              </button>

              <div className={`${open ? 'block' : 'hidden'} absolute left-0 top-[calc(100%+4px)] z-50 w-[min(28rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-neutral-200 bg-white p-2 shadow-xl`}>
                  {primary ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Update</span>
                        <StatusChip item={primary} override={statusOverrides[primary.id]} onCommit={onCommit} />
                      </div>
                      {facts.length ? (
                        <div className="grid gap-1">
                          {facts.map((fact) => (
                            <div key={`${step.id}-${fact.label}`} className="rounded-md bg-neutral-50 px-2 py-1 text-xs">
                              <span className="font-semibold text-neutral-500">{fact.label}: </span>
                              <span className="text-neutral-900">{fact.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <EditableField label="Staff note" value={primary.detail} itemId={primary.id} field="detail" multiline onUpdate={onUpdate} />
                      {detailItems.length ? (
                        <div className="space-y-1">
                          {detailItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-2 py-1 text-xs">
                              <span className="min-w-0 truncate font-semibold text-neutral-700">
                                {isServerMediaItem(item) ? item.sourceRef ?? item.label : item.source}
                              </span>
                              <StatusChip item={item} override={statusOverrides[item.id]} onCommit={onCommit} />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-md bg-neutral-50 px-2 py-2 text-xs text-neutral-500">
                      No linked dashboard item was found for this stage yet.
                    </div>
                  )}
                </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MenuCell({
  label,
  entries,
}: {
  label: string;
  entries: MenuEntry[];
}) {
  const [open, setOpen] = useState(false);
  const primary = entries[0];

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-neutral-100"
        aria-label={`${label} options`}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-neutral-900">{primary?.label ?? 'None'}</span>
          <span className="block truncate text-neutral-600">{primary?.value ?? 'No value found'}</span>
        </span>
        <span className="shrink-0 text-[10px] font-bold text-neutral-400">{entries.length > 1 ? `+${entries.length - 1}` : 'v'}</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 w-80 rounded-lg border border-neutral-200 bg-white p-2 shadow-xl">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
          <div className="max-h-72 overflow-auto">
            {entries.length ? entries.map((entry, index) => (
              <div key={`${entry.label}-${entry.value}-${index}`} className="rounded-md px-2 py-1.5 text-xs hover:bg-neutral-50">
                <div className="font-semibold text-neutral-950">{entry.label}</div>
                <div className="mt-0.5 break-words text-neutral-700">{entry.value}</div>
                <div className="mt-0.5 text-[10px] text-neutral-400">{entry.source}</div>
              </div>
            )) : (
              <div className="px-2 py-3 text-xs text-neutral-500">No related values were found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailDrawer({
  record,
  statusOverrides,
  auditEntries,
  detailLoading,
  onClose,
  onCommit,
  onUpdate,
}: {
  record: CaseRecord | null;
  statusOverrides: Record<string, StatusOverride>;
  auditEntries: AuditEntry[];
  detailLoading: boolean;
  onClose: () => void;
  onCommit: (item: DashboardItem, nextStatus: string, initials: string) => Promise<void>;
  onUpdate: (itemId: string, field: EditableItemField, value: string) => Promise<void>;
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
      if (event.key === 'Escape') onCloseRef.current();
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

        <div className="grid h-[calc(100dvh-73px)] gap-3 overflow-auto p-3 xl:grid-cols-[minmax(460px,1.15fr)_minmax(420px,1fr)_minmax(360px,0.85fr)] xl:grid-rows-[auto_minmax(0,1fr)] xl:overflow-hidden">
          {detailLoading ? (
            <div className="xl:col-span-3 -mb-1 rounded-md border border-[#efb70c]/30 bg-[#fff8dc] px-3 py-2 text-xs font-semibold text-neutral-800">
              Loading all linked rows and files for this family.
            </div>
          ) : null}
          <div className="min-h-0 xl:col-span-2">
            <WorkflowChecklist
              record={record}
              statusOverrides={statusOverrides}
              onCommit={onCommit}
              onUpdate={onUpdate}
            />
          </div>

          <section className="grid min-h-0 gap-3 overflow-auto xl:col-start-3 xl:row-span-2">
            <div className="rounded-lg border border-neutral-200 p-3">
              <h3 className="text-sm font-bold text-neutral-950">Date and time options</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {record.dateEntries.length ? record.dateEntries.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="rounded-md bg-neutral-50 px-2 py-1.5 text-sm">
                    <div className="font-semibold text-neutral-900">{entry.label}</div>
                    <div className="text-neutral-700">{entry.value}</div>
                    <div className="text-xs text-neutral-400">{entry.source}</div>
                  </div>
                )) : <div className="py-3 text-sm text-neutral-500">No date or time values found.</div>}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3">
              <h3 className="text-sm font-bold text-neutral-950">Location options</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {record.locationEntries.length ? record.locationEntries.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="rounded-md bg-neutral-50 px-2 py-1.5 text-sm">
                    <div className="font-semibold text-neutral-900">{entry.label}</div>
                    <div className="break-words text-neutral-700">{entry.value}</div>
                    <div className="text-xs text-neutral-400">{entry.source}</div>
                  </div>
                )) : <div className="py-3 text-sm text-neutral-500">No location values found.</div>}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3">
              <h3 className="text-sm font-bold text-neutral-950">Service staff</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                {record.serviceStaffEntries.length ? record.serviceStaffEntries.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="rounded-md bg-neutral-50 px-2 py-1.5 text-sm">
                    <div className="font-semibold text-neutral-900">{entry.label}</div>
                    <div className="break-words text-neutral-700">{entry.value}</div>
                    <div className="text-xs text-neutral-400">{entry.source}</div>
                  </div>
                )) : <div className="py-3 text-sm text-neutral-500">No service staff values found.</div>}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3">
              <h3 className="text-sm font-bold text-neutral-950">Service logistics</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {record.serviceLogisticsEntries.length ? record.serviceLogisticsEntries.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="rounded-md bg-neutral-50 px-2 py-1.5 text-sm">
                    <div className="font-semibold text-neutral-900">{entry.label}</div>
                    <div className="break-words text-neutral-700">{entry.value}</div>
                    <div className="text-xs text-neutral-400">{entry.source}</div>
                  </div>
                )) : <div className="py-3 text-sm text-neutral-500">No service logistics values found.</div>}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-200">
              <div className="border-b border-neutral-200 px-3 py-2 text-sm font-bold text-neutral-950">Recent audit</div>
              <div className="max-h-64 divide-y divide-neutral-100 overflow-auto">
                {auditEntries.filter((entry) => record.items.some((item) => item.id === entry.itemId)).slice(0, 12).map((entry) => (
                  <div key={`${entry.changedAt}-${entry.itemId}-${entry.fieldName ?? entry.to}`} className="px-3 py-2 text-xs text-neutral-600">
                    <span className="font-semibold text-neutral-900">{entry.fieldName ? displayKey(entry.fieldName) : 'Status'}</span>
                    {' changed '}
                    {entry.from ? <span>from {entry.from} </span> : null}
                    {entry.to ? <span>to {entry.to} </span> : null}
                    <span>on {formatStamp(entry.changedAt)}</span>
                    {entry.initials ? <span> by {entry.initials}</span> : null}
                    {entry.staffName ? <span> by {entry.staffName}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="min-h-0 overflow-auto rounded-lg border border-neutral-200 xl:col-span-2">
            <div className="border-b border-neutral-200 px-3 py-2 text-sm font-bold text-neutral-950">Related work</div>
            <div className="divide-y divide-neutral-100">
              {record.items.map((item) => (
                <div key={item.id} className="grid gap-3 p-3 xl:grid-cols-[minmax(280px,0.9fr)_minmax(420px,1.4fr)_minmax(150px,auto)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">{item.source}</span>
                      <span className="text-[11px] text-neutral-400">{sourceRowLabel(item)}</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <EditableField label="Work item" value={item.label} itemId={item.id} field="label" onUpdate={onUpdate} />
                      <EditableField label="Owner" value={item.owner} itemId={item.id} field="owner" onUpdate={onUpdate} />
                      <EditableField label="Due / time" value={item.due} itemId={item.id} field="due" onUpdate={onUpdate} />
                      <PrioritySelect item={item} onUpdate={onUpdate} />
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
          </section>
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
    getOperationalStatuses(items.map((item) => item.id).slice(0, 1000))
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
  const matchingRecords = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return caseRecords
      .filter((record) => recordMatchesView(record, activeView, statusOverrides))
      .filter((record) => !normalized || record.searchText.includes(normalized))
      .sort((a, b) => priorityRank(b.primaryItem) - priorityRank(a.primaryItem) || a.name.localeCompare(b.name));
  }, [activeView, caseRecords, search, statusOverrides]);
  const visibleRecords = useMemo(() => matchingRecords.slice(0, visibleRecordLimit), [matchingRecords]);
  const selectedRecord = selectedKey ? caseRecords.find((record) => record.key === selectedKey) ?? null : null;
  const hasSourceIssue = sources.some((source) => source.status === 'unavailable');
  const visibleSummary = operationsLoading
    ? 'Loading dashboard records'
    : feedMeta
      ? `${visibleRecords.length} families shown from ${feedMeta.returned.toLocaleString()} loaded records${feedMeta.limited ? ` of ${feedMeta.total.toLocaleString()} matches` : ''}`
      : `${visibleRecords.length} families shown`;

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
          <div className="flex flex-wrap gap-1">
            {(Object.keys(viewLabels) as ViewId[]).map((view) => (
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
          <div className="grid grid-cols-[minmax(170px,1.2fr)_minmax(145px,0.8fr)_minmax(145px,0.85fr)_minmax(90px,0.45fr)_minmax(270px,1.55fr)_minmax(160px,0.9fr)_minmax(95px,0.5fr)] border-b border-neutral-200 bg-neutral-50 text-[11px] font-bold uppercase tracking-wide text-neutral-500 max-xl:grid-cols-[minmax(180px,1.35fr)_minmax(150px,0.9fr)_minmax(130px,0.85fr)_minmax(250px,1.45fr)_minmax(150px,0.9fr)] max-lg:hidden">
            <div className="px-2 py-2">Deceased</div>
            <div className="px-2 py-2">Date / Time</div>
            <div className="px-2 py-2">Location</div>
            <div className="px-2 py-2 max-xl:hidden">Owner</div>
            <div className="px-2 py-2">Progress</div>
            <div className="px-2 py-2">Next Action</div>
            <div className="px-2 py-2 max-xl:hidden">Updated</div>
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
                className="grid w-full grid-cols-[minmax(170px,1.2fr)_minmax(145px,0.8fr)_minmax(145px,0.85fr)_minmax(90px,0.45fr)_minmax(270px,1.55fr)_minmax(160px,0.9fr)_minmax(95px,0.5fr)] items-stretch text-left transition hover:bg-[#faf9f9] max-xl:grid-cols-[minmax(180px,1.35fr)_minmax(150px,0.9fr)_minmax(130px,0.85fr)_minmax(250px,1.45fr)_minmax(150px,0.9fr)] max-lg:block"
              >
                <button
                  type="button"
                  onClick={() => setSelectedKey(record.key)}
                  className="min-w-0 border-l-4 border-l-neutral-300 px-2 py-1.5 text-left outline-none transition focus:border-l-[#efb70c] focus:bg-[#fff7d7]"
                  aria-label={`Open details for ${record.name}`}
                >
                  <div className="truncate text-sm font-bold text-neutral-950">{record.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {readinessBadges(record).filter((badge) => badge.active).map((badge) => (
                      <span key={badge.label} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.tone}`}>{badge.label}</span>
                    ))}
                  </div>
                </button>
                <div className="px-1 py-1.5"><MenuCell label="Date and time options" entries={record.dateEntries} /></div>
                <div className="px-1 py-1.5"><MenuCell label="Location options" entries={record.locationEntries} /></div>
                <div className="truncate px-2 py-2 text-xs font-semibold text-neutral-700 max-xl:hidden">{record.owner}</div>
                <WorkflowProgressCell
                  record={record}
                  statusOverrides={statusOverrides}
                  onOpenDetails={() => setSelectedKey(record.key)}
                />
                <div className="line-clamp-2 px-2 py-2 text-xs leading-5 text-neutral-700">{record.nextAction}</div>
                <div className="px-2 py-2 text-xs text-neutral-500 max-xl:hidden">{record.updatedAt}</div>
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
        auditEntries={auditEntries}
        detailLoading={detailLoading}
        onClose={() => setSelectedKey(null)}
        onCommit={commitStatus}
        onUpdate={updateItemField}
      />

      {syncState === 'unavailable' ? (
        <div className="fixed bottom-4 right-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 shadow">
          Dashboard database unavailable
        </div>
      ) : null}
    </div>
  );
}
