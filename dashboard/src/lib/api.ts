const API_BASE = '/api';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// ─── Cases ──────────────────────────────────────────────────────────────────

export const getCases = (phase?: string) =>
  apiFetch<{ data: Case[] }>(`/cases${phase ? `?phase=${phase}` : ''}`);

export const getCase = (id: string) =>
  apiFetch<CaseDetail>(`/cases/${id}`);

export const createCase = (data: Partial<Case>) =>
  apiFetch<Case>('/cases', { method: 'POST', body: JSON.stringify(data) });

export const updateCase = (id: string, data: Partial<Case>) =>
  apiFetch<Case>(`/cases/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const advancePhase = (id: string, targetPhase: string) =>
  apiFetch<Case>(`/cases/${id}/advance-phase`, { method: 'POST', body: JSON.stringify({ target_phase: targetPhase }) });

// ─── Dashboard ──────────────────────────────────────────────────────────────

export const getBoard = () =>
  apiFetch<{ board: Record<string, Case[]> }>('/dashboard/board');

export const getMetrics = () =>
  apiFetch<DashboardMetrics>('/dashboard/metrics');

export const getCalendar = (start?: string, end?: string) =>
  apiFetch<{ data: Case[] }>(`/dashboard/calendar${start ? `?start=${start}&end=${end}` : ''}`);

export const getOperationalStatuses = (itemIds?: string[]) =>
  apiFetch<{ data: OperationalStatus[]; audit: OperationalStatusAudit[] }>(
    itemIds?.length ? `/dashboard/operational-status?item_ids=${encodeURIComponent(itemIds.join(','))}` : '/dashboard/operational-status'
  );

export const getOperationsFeed = (params?: { q?: string; caseKey?: string; limit?: number }) => {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.caseKey) search.set('case_key', params.caseKey);
  if (params?.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  return apiFetch<OperationsFeed>(`/dashboard/operations${query ? `?${query}` : ''}`);
};

export const updateOperationItem = (itemId: string, field: string, value: string) =>
  apiFetch<{ data: OperationsFeed['items'][number]; audit: OperationalItemAudit | null; changed: boolean }>(
    `/dashboard/operations/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', body: JSON.stringify({ field, value }) }
  );

export const getWorkflowStates = () =>
  apiFetch<{ data: CaseWorkflowState[]; audit: CaseWorkflowAudit[] }>('/dashboard/workflow-state');

export const saveWorkflowState = (data: {
  case_key: string;
  case_name: string;
  step_id: string;
  state: 'done' | 'pending' | 'auto';
  staff_initials: string;
  note?: string;
}) =>
  apiFetch<{ data: CaseWorkflowState | null; audit: CaseWorkflowAudit | null; changed: boolean }>(
    '/dashboard/workflow-state',
    { method: 'POST', body: JSON.stringify(data) },
  );

export const getMilestones = () =>
  apiFetch<{ data: CaseMilestone[]; audit: CaseMilestoneAudit[] }>('/dashboard/milestones');

export const saveMilestone = (data: {
  case_key: string;
  case_name: string;
  milestone_key: string;
  value: string;
  is_na: boolean;
  staff_initials: string;
}) =>
  apiFetch<{ data: CaseMilestone | null; audit: CaseMilestoneAudit | null; changed: boolean }>(
    '/dashboard/milestones',
    { method: 'POST', body: JSON.stringify(data) },
  );

export const syncWeeklyServiceSchedule = () =>
  apiFetch<{ data: { imported: number; source: string } }>(
    '/dashboard/sync/weekly-service',
    { method: 'POST', body: '{}' }
  );

export const saveOperationalStatus = (data: {
  item_id: string;
  item_label: string;
  area?: string;
  source?: string;
  status: string;
  staff_initials: string;
  note?: string;
}) =>
  apiFetch<{ data: OperationalStatus; audit: OperationalStatusAudit | null; changed: boolean }>(
    '/dashboard/operational-status',
    { method: 'POST', body: JSON.stringify(data) }
  );

// ─── Tasks ──────────────────────────────────────────────────────────────────

export const getCaseTasks = (caseId: string, phase?: string) =>
  apiFetch<{ data: CaseTask[] }>(`/tasks/case/${caseId}${phase ? `?phase=${phase}` : ''}`);

export const completeTask = (taskId: string) =>
  apiFetch<CaseTask>(`/tasks/${taskId}/complete`, { method: 'POST', body: '{}' });

export const skipTask = (taskId: string) =>
  apiFetch<CaseTask>(`/tasks/${taskId}/skip`, { method: 'POST' });

export const getOverdueTasks = () =>
  apiFetch<{ data: CaseTask[] }>('/tasks/overdue');

// ─── Contacts ───────────────────────────────────────────────────────────────

export const getCaseContacts = (caseId: string) =>
  apiFetch<{ data: CaseContact[] }>(`/contacts/case/${caseId}`);

export const createContact = (data: Partial<CaseContact>) =>
  apiFetch<CaseContact>('/contacts', { method: 'POST', body: JSON.stringify(data) });

// ─── Documents ──────────────────────────────────────────────────────────────

export const generateObituary = (caseId: string) =>
  apiFetch<any>(`/documents/obituary/${caseId}`, { method: 'POST', body: '{}' });

// ─── SMS ────────────────────────────────────────────────────────────────────

export const sendText = (to: string, body: string) =>
  apiFetch<{ success: boolean }>('/max/send-text', { method: 'POST', body: JSON.stringify({ to, body }) });

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Case {
  id: string;
  case_number: number;
  phase: string;
  decedent_first_name: string;
  decedent_middle_name: string | null;
  decedent_last_name: string;
  date_of_birth: string | null;
  date_of_death: string | null;
  disposition_type: string | null;
  service_type: string | null;
  service_date: string | null;
  service_location: string | null;
  visitation_date: string | null;
  first_call_date: string | null;
  payment_status: string;
  death_cert_filed: boolean;
  burial_permit_obtained: boolean;
  contract_signed: boolean;
  total_charges: number;
  amount_paid: number;
  director_first_name?: string;
  director_last_name?: string;
  tasks_completed?: number;
  tasks_total?: number;
  tasks_overdue?: number;
  [key: string]: any;
}

export interface CaseDetail extends Case {
  contacts: CaseContact[];
  tasks: CaseTask[];
  timeline: TimelineEvent[];
  obituary: any;
  program: any;
}

export interface CaseTask {
  id: string;
  case_id: string;
  phase: string;
  task_name: string;
  description: string;
  status: string;
  priority: string;
  deadline: string | null;
  completed_at: string | null;
  sort_order: number;
}

export interface CaseContact {
  id: string;
  case_id: string;
  first_name: string;
  last_name: string | null;
  relationship: string;
  is_nok: boolean;
  phone: string | null;
  email: string | null;
}

export interface TimelineEvent {
  id: string;
  event_type: string;
  description: string;
  actor: string;
  created_at: string;
}

export interface DashboardMetrics {
  active_cases: number;
  cases_this_month: number;
  cases_this_year: number;
  avg_revenue_per_case: number;
  cremation_rate_pct: number;
  overdue_tasks: number;
  pending_payments: number;
  pending_death_certs: number;
}

export interface OperationalStatus {
  item_id: string;
  item_label: string;
  area: string | null;
  source: string | null;
  status: string;
  staff_initials: string;
  updated_at: string;
}

export interface OperationalStatusAudit {
  id: string;
  item_id: string;
  item_label: string;
  area: string | null;
  source: string | null;
  old_status: string | null;
  new_status: string;
  staff_initials: string;
  note: string | null;
  created_at: string;
}

export interface OperationsFeed {
  items: Array<{
    id: string;
    area: string;
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
  }>;
  meta?: {
    total: number;
    returned: number;
    limit: number;
    limited: boolean;
    query: string;
    case_key: string;
  };
  item_audit: OperationalItemAudit[];
  sources: Array<{
    id: string;
    label: string;
    status: 'connected' | 'not_configured' | 'unavailable';
    mode: 'read_only';
    detail: string;
    checked_at: string;
  }>;
}

export interface OperationalItemAudit {
  id: string;
  item_id: string;
  item_label: string;
  area: string | null;
  source: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  staff_id: string | null;
  staff_name: string;
  created_at: string;
}


export interface CaseWorkflowState {
  case_key: string;
  step_id: string;
  state: 'done' | 'pending';
  staff_initials: string;
  note: string;
  updated_at: string;
}

export interface CaseWorkflowAudit {
  id: string;
  case_key: string;
  case_name: string;
  step_id: string;
  old_state: string | null;
  new_state: string;
  staff_initials: string;
  created_at: string;
}


export interface CaseMilestone {
  case_key: string;
  milestone_key: string;
  value: string;
  is_na: boolean;
  staff_initials: string;
  updated_at: string;
}

export interface CaseMilestoneAudit {
  id: string;
  case_key: string;
  case_name: string;
  milestone_key: string;
  old_value: string | null;
  new_value: string;
  staff_initials: string;
  created_at: string;
}
