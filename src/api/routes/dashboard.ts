import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db/client';

export const dashboardRouter = Router();

function normalizeItemIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(normalizeItemIds);
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 200);
}

// ─── Active Cases Board (Kanban data) ────────────────────────────────────────

dashboardRouter.get('/board', async (_req: Request, res: Response) => {
  try {
    const cases = await query(
      `SELECT c.id, c.case_number, c.phase,
              c.decedent_first_name, c.decedent_last_name,
              c.date_of_death, c.service_date, c.disposition_type, c.service_type,
              c.first_call_date, c.payment_status,
              c.death_cert_filed, c.burial_permit_obtained, c.contract_signed,
              s.first_name as director_first_name, s.last_name as director_last_name,
              (SELECT COUNT(*) FROM case_tasks t WHERE t.case_id = c.id AND t.status = 'COMPLETED') as tasks_completed,
              (SELECT COUNT(*) FROM case_tasks t WHERE t.case_id = c.id) as tasks_total,
              (SELECT COUNT(*) FROM case_tasks t WHERE t.case_id = c.id AND t.status IN ('PENDING','IN_PROGRESS') AND t.deadline < now()) as tasks_overdue
       FROM cases c
       LEFT JOIN staff s ON s.id = c.funeral_director_id
       WHERE c.phase != 'ARCHIVED'
       ORDER BY
         CASE c.phase
           WHEN 'FIRST_CALL' THEN 1
           WHEN 'PENDING_ARRANGEMENTS' THEN 2
           WHEN 'ACTIVE' THEN 3
           WHEN 'PREPARATION' THEN 4
           WHEN 'SERVICE' THEN 5
           WHEN 'POST_SERVICE' THEN 6
           WHEN 'AFTERCARE' THEN 7
         END,
         c.service_date NULLS LAST`
    );

    // Group by phase for Kanban columns
    const board: Record<string, any[]> = {
      FIRST_CALL: [],
      PENDING_ARRANGEMENTS: [],
      ACTIVE: [],
      PREPARATION: [],
      SERVICE: [],
      POST_SERVICE: [],
      AFTERCARE: [],
    };

    for (const c of cases) {
      const phase = (c as any).phase;
      if (board[phase]) board[phase].push(c);
    }

    res.json({ board });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Operational status chips and audit trail ───────────────────────────────

dashboardRouter.get('/operational-status', async (req: Request, res: Response) => {
  try {
    const itemIds = normalizeItemIds(req.query.item_ids);
    const params: any[] = [];
    let statusSql = 'SELECT * FROM operational_statuses';

    if (itemIds.length) {
      statusSql += ' WHERE item_id = ANY($1)';
      params.push(itemIds);
    }

    statusSql += ' ORDER BY updated_at DESC';

    const statuses = await query(statusSql, params);
    const audit = await query(
      `SELECT *
       FROM operational_status_audit
       ${itemIds.length ? 'WHERE item_id = ANY($1)' : ''}
       ORDER BY created_at DESC
       LIMIT 50`,
      itemIds.length ? [itemIds] : []
    );

    res.json({ data: statuses, audit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

dashboardRouter.post('/operational-status', async (req: Request, res: Response) => {
  try {
    const itemId = String(req.body.item_id || '').trim();
    const itemLabel = String(req.body.item_label || '').trim();
    const status = String(req.body.status || '').trim();
    const staffInitials = String(req.body.staff_initials || '').trim().toUpperCase();
    const area = req.body.area ? String(req.body.area).trim() : null;
    const source = req.body.source ? String(req.body.source).trim() : null;
    const note = req.body.note ? String(req.body.note).trim() : null;

    if (!itemId) return res.status(400).json({ error: 'item_id is required' });
    if (!itemLabel) return res.status(400).json({ error: 'item_label is required' });
    if (!status) return res.status(400).json({ error: 'status is required' });
    if (!staffInitials) return res.status(400).json({ error: 'staff_initials is required' });
    if (staffInitials.length > 5) return res.status(400).json({ error: 'staff_initials must be 5 characters or fewer' });

    const previous = await queryOne<{ status: string }>(
      'SELECT status FROM operational_statuses WHERE item_id = $1',
      [itemId]
    );

    if (previous?.status === status) {
      const current = await queryOne(
        'SELECT * FROM operational_statuses WHERE item_id = $1',
        [itemId]
      );
      return res.json({ data: current, audit: null, changed: false });
    }

    const current = await queryOne(
      `INSERT INTO operational_statuses
         (item_id, item_label, area, source, status, staff_initials, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (item_id) DO UPDATE SET
         item_label = EXCLUDED.item_label,
         area = EXCLUDED.area,
         source = EXCLUDED.source,
         status = EXCLUDED.status,
         staff_initials = EXCLUDED.staff_initials,
         updated_at = now()
       RETURNING *`,
      [itemId, itemLabel, area, source, status, staffInitials]
    );

    const audit = await queryOne(
      `INSERT INTO operational_status_audit
         (item_id, item_label, area, source, old_status, new_status, staff_initials, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [itemId, itemLabel, area, source, previous?.status ?? null, status, staffInitials, note]
    );

    res.status(201).json({ data: current, audit, changed: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Metrics / KPIs ─────────────────────────────────────────────────────────

dashboardRouter.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const [activeCases] = await query(`SELECT COUNT(*) as count FROM cases WHERE phase NOT IN ('ARCHIVED')`);
    const [monthCases] = await query(`SELECT COUNT(*) as count FROM cases WHERE first_call_date >= date_trunc('month', now())`);
    const [yearCases] = await query(`SELECT COUNT(*) as count FROM cases WHERE first_call_date >= date_trunc('year', now())`);
    const [avgRevenue] = await query(`SELECT COALESCE(AVG(total_charges), 0) as avg FROM cases WHERE total_charges > 0 AND first_call_date >= date_trunc('year', now())`);
    const [cremationRate] = await query(`SELECT
      CASE WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE disposition_type = 'CREMATION') / COUNT(*))
      END as rate
      FROM cases WHERE first_call_date >= date_trunc('year', now())`);
    const [overdueTasks] = await query(`SELECT COUNT(*) as count FROM case_tasks WHERE status IN ('PENDING','IN_PROGRESS') AND deadline < now()`);
    const [pendingPayments] = await query(`SELECT COUNT(*) as count FROM cases WHERE payment_status IN ('PENDING', 'INSURANCE_PENDING') AND phase NOT IN ('FIRST_CALL', 'ARCHIVED')`);
    const [pendingDeathCerts] = await query(`SELECT COUNT(*) as count FROM cases WHERE death_cert_filed = false AND phase NOT IN ('FIRST_CALL', 'ARCHIVED')`);

    res.json({
      active_cases: Number((activeCases as any).count),
      cases_this_month: Number((monthCases as any).count),
      cases_this_year: Number((yearCases as any).count),
      avg_revenue_per_case: Number(Number((avgRevenue as any).avg).toFixed(2)),
      cremation_rate_pct: Number((cremationRate as any).rate),
      overdue_tasks: Number((overdueTasks as any).count),
      pending_payments: Number((pendingPayments as any).count),
      pending_death_certs: Number((pendingDeathCerts as any).count),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Calendar events (services, visitations, removals) ──────────────────────

dashboardRouter.get('/calendar', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 7 * 86400000).toISOString();
    const endDate = end || new Date(Date.now() + 30 * 86400000).toISOString();

    const events = await query(
      `SELECT id, case_number, decedent_first_name, decedent_last_name,
              service_date, service_time, service_location, service_type,
              visitation_date, visitation_time, visitation_location,
              committal_date, committal_location, phase
       FROM cases
       WHERE (service_date BETWEEN $1 AND $2)
          OR (visitation_date BETWEEN $1 AND $2)
          OR (committal_date BETWEEN $1 AND $2)
       ORDER BY COALESCE(service_date, visitation_date, committal_date)`,
      [startDate, endDate]
    );

    res.json({ data: events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Quick summary for Max ──────────────────────────────────────────────────

dashboardRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const cases = await query(
      `SELECT case_number, decedent_first_name, decedent_last_name, phase,
              service_date, disposition_type, payment_status,
              death_cert_filed, contract_signed
       FROM cases WHERE phase NOT IN ('ARCHIVED')
       ORDER BY first_call_date DESC`
    );

    const overdue = await query(
      `SELECT t.task_name, t.deadline, c.decedent_last_name, c.case_number
       FROM case_tasks t JOIN cases c ON c.id = t.case_id
       WHERE t.status IN ('PENDING','IN_PROGRESS') AND t.deadline < now()
       ORDER BY t.deadline LIMIT 10`
    );

    res.json({
      active_cases: cases,
      overdue_tasks: overdue,
      total_active: cases.length,
      total_overdue: overdue.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
