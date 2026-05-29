export type OperationArea =
  | 'service'
  | 'arrangement'
  | 'death-cert'
  | 'cremains'
  | 'crematory'
  | 'belongings'
  | 'production'
  | 'paperwork';

export type DashboardItem = {
  id: string;
  area: OperationArea;
  label: string;
  detail: string;
  owner: string;
  due: string;
  source: string;
  sourceRef?: string | null;
  sourcePayload?: Record<string, string>;
  dateOfDeath?: string | null;
  createdAt?: string;
  status: string;
  priority: 'critical' | 'high' | 'normal' | 'done';
  options: string[];
};

// Missouri MoEVR death-certificate filing deadline: 5 days from date of death (RSMo 193.145).
// Mirrors the canonical rule in src/agents/compliance/mo-death-cert.ts. Fail-closed:
// returns null for any missing/unparseable date so the UI can never show an invented
// deadline.
export const DEATH_CERT_FILING_DAYS = 5;

export function deathCertDeadline(dateOfDeath: string | null | undefined): {
  daysRemaining: number;
  status: 'overdue' | 'due-soon' | 'ok';
  deadlineLabel: string;
} | null {
  const text = dateOfDeath?.trim();
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const dod = new Date(`${text}T12:00:00`);
  if (Number.isNaN(dod.getTime())) return null;
  const deadline = new Date(dod.getTime() + DEATH_CERT_FILING_DAYS * 86_400_000);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysRemaining = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
  const status = daysRemaining < 0 ? 'overdue' : daysRemaining <= 1 ? 'due-soon' : 'ok';
  const deadlineLabel = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return { daysRemaining, status, deadlineLabel };
}

// Canonical sensitive-value masking, used at every boundary that could expose raw source
// data (the API source_payload, the sync detail string). Mirrors the project rule: SSN and
// phone numbers are reduced to last-4; never emit them in full.
export function maskSensitiveValue(key: string, value: string): string {
  const lowerKey = key.toLowerCase();
  const trimmed = (value ?? '').trim();
  const digits = trimmed.replace(/\D/g, '');

  if (lowerKey.includes('ssn') || lowerKey.includes('social_security')) {
    return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : 'masked';
  }
  if (lowerKey.includes('phone') || lowerKey.includes('cell') || lowerKey.includes('telephone')) {
    return digits.length >= 4 ? `ending ${digits.slice(-4)}` : 'masked';
  }
  if (/^\D*\d{3}\D*\d{2}\D*\d{4}\D*$/.test(trimmed)) {
    return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : 'masked';
  }
  if (digits.length === 10 && /phone|cell|contact|number/.test(lowerKey)) {
    return `ending ${digits.slice(-4)}`;
  }
  return trimmed;
}

// Keys that carry no PII but ARE relied on for client-side logic (case grouping, row
// identity). Never run them through the masker.
const NEVER_MASK_KEYS = new Set(['case_match_key', 'case_match_basis', '_row_number']);

// Sanitize a raw source_payload before it leaves the server for an authenticated browser
// client. The UI only ever needs masked values; raw spreadsheet PII must not cross the wire.
export function sanitizeSourcePayload(payload?: Record<string, string> | null): Record<string, string> {
  if (!payload || typeof payload !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = NEVER_MASK_KEYS.has(key) ? String(value ?? '') : maskSensitiveValue(key, String(value ?? ''));
  }
  return out;
}

export const statusOptions = {
  service: ['Needs info', 'Ready', 'In service', 'Complete'],
  arrangement: ['Unconfirmed', 'Confirmed', 'Family arrived', 'Complete'],
  deathCert: ['Not started', 'Doctor called', 'ME pending', 'Ready to file', 'Filed'],
  cremains: ['Awaiting cremation', 'Returned', 'Ready pickup', 'Picked up'],
  crematory: ['Permit needed', 'Scheduled', 'In process', 'Completed', 'Returned'],
  belongings: ['Logged', 'Stored', 'Ready release', 'Released'],
  production: ['Needed', 'In design', 'Proof ready', 'Approved', 'Printed', 'Published'],
  paperwork: ['Missing', 'Requested', 'Received', 'Verified'],
};

export const dashboardItems: DashboardItem[] = [
  {
    id: 'svc-001',
    area: 'service',
    label: 'Morning chapel service',
    detail: 'Casket, flowers, programs, hearse, lead staff, and family arrival checklist.',
    owner: 'Director',
    due: 'Today 10:00 AM',
    source: 'Weekly Service Schedule',
    status: 'Ready',
    priority: 'high',
    options: statusOptions.service,
  },
  {
    id: 'svc-002',
    area: 'service',
    label: 'Afternoon cemetery committal',
    detail: 'Confirm cemetery time, hearse route, family car, and printed materials.',
    owner: 'Dispatch',
    due: 'Today 1:30 PM',
    source: 'Weekly Service Schedule',
    status: 'Needs info',
    priority: 'critical',
    options: statusOptions.service,
  },
  {
    id: 'arr-001',
    area: 'arrangement',
    label: 'At-need arrangement',
    detail: 'Family appointment slot from the Arrangements tab, package and documents pending.',
    owner: 'Arranger',
    due: 'Today 11:00 AM',
    source: 'Arrangements',
    status: 'Confirmed',
    priority: 'normal',
    options: statusOptions.arrangement,
  },
  {
    id: 'dc-001',
    area: 'death-cert',
    label: 'Death certificate follow-up',
    detail: 'Doctor contact needed before filing. Phone and medical details stay masked by default.',
    owner: 'Death Certificate',
    due: 'Due today',
    source: 'Death Certificate 2026',
    status: 'Doctor called',
    priority: 'critical',
    options: statusOptions.deathCert,
  },
  {
    id: 'dc-002',
    area: 'death-cert',
    label: 'Ready-to-file certificate',
    detail: 'All worksheet fields reviewed; director approval needed before filing.',
    owner: 'Death Certificate',
    due: 'Tomorrow',
    source: 'Death Certificate 2026',
    status: 'Ready to file',
    priority: 'high',
    options: statusOptions.deathCert,
  },
  {
    id: 'crem-001',
    area: 'cremains',
    label: 'Cremains pickup queue',
    detail: 'Returned to funeral home; verify paid status and pickup authorization.',
    owner: 'Front desk',
    due: 'This week',
    source: 'Cremains Log',
    status: 'Ready pickup',
    priority: 'high',
    options: statusOptions.cremains,
  },
  {
    id: 'crematory-001',
    area: 'crematory',
    label: 'Crematory authorization',
    detail: 'Permit, authorization, pacemaker confirmation, and transfer custody check.',
    owner: 'Crematory',
    due: 'Tomorrow',
    source: '2026 Crematory Log',
    status: 'Scheduled',
    priority: 'high',
    options: statusOptions.crematory,
  },
  {
    id: 'belong-001',
    area: 'belongings',
    label: 'Belongings release',
    detail: 'Itemized belongings should be verified before release signature.',
    owner: 'Front desk',
    due: 'Open',
    source: 'Belongings',
    status: 'Stored',
    priority: 'normal',
    options: statusOptions.belongings,
  },
  {
    id: 'prod-001',
    area: 'production',
    label: 'Program proof',
    detail: 'Publisher file and PDF export should match before family review.',
    owner: 'Design',
    due: 'Today 3:00 PM',
    source: '_Publisher Programs',
    status: 'Proof ready',
    priority: 'high',
    options: statusOptions.production,
  },
  {
    id: 'prod-002',
    area: 'production',
    label: 'Lobby TV slide',
    detail: 'Upcoming service slide should update once service date and photo are verified.',
    owner: 'Media',
    due: 'Tomorrow',
    source: '_Lobby TV Videos',
    status: 'Needed',
    priority: 'normal',
    options: statusOptions.production,
  },
  {
    id: 'paper-001',
    area: 'paperwork',
    label: 'Family documents',
    detail: 'Contract, authorization, and required family information checklist.',
    owner: 'Staff',
    due: 'Open',
    source: 'Atneed Folders',
    status: 'Requested',
    priority: 'normal',
    options: statusOptions.paperwork,
  },
];
