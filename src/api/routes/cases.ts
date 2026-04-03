import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db/client';
import { generatePhaseTasks } from '../../agents/orchestrator/task-scheduler';
import { logTimeline } from './timeline-helper';

export const casesRouter = Router();

// ─── List cases (with optional phase filter) ────────────────────────────────

casesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { phase, limit = '50', offset = '0' } = req.query;
    let sql = `SELECT * FROM cases`;
    const params: any[] = [];

    if (phase) {
      sql += ` WHERE phase = $1`;
      params.push(phase);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));

    const rows = await query(sql, params);
    res.json({ data: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get single case ────────────────────────────────────────────────────────

casesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne('SELECT * FROM cases WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Case not found' });

    // Include contacts, tasks, timeline
    const contacts = await query('SELECT * FROM case_contacts WHERE case_id = $1', [req.params.id]);
    const tasks = await query('SELECT * FROM case_tasks WHERE case_id = $1 ORDER BY sort_order', [req.params.id]);
    const timeline = await query('SELECT * FROM case_timeline WHERE case_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]);
    const obituary = await queryOne('SELECT * FROM obituaries WHERE case_id = $1 ORDER BY version DESC LIMIT 1', [req.params.id]);
    const program = await queryOne('SELECT id, case_id, template_name, print_quantity, print_status, version, created_at FROM programs WHERE case_id = $1 ORDER BY version DESC LIMIT 1', [req.params.id]);

    res.json({ ...row, contacts, tasks, timeline, obituary, program });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Create case (first call) ───────────────────────────────────────────────

casesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      decedent_first_name, decedent_last_name, decedent_middle_name,
      date_of_death, date_of_birth, disposition_type,
      funeral_director_id, first_call_received_by,
      notes
    } = req.body;

    const row = await queryOne(
      `INSERT INTO cases (
        decedent_first_name, decedent_last_name, decedent_middle_name,
        date_of_death, date_of_birth, disposition_type,
        funeral_director_id, first_call_received_by,
        first_call_date, phase, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),'FIRST_CALL',$9)
      RETURNING *`,
      [
        decedent_first_name, decedent_last_name, decedent_middle_name || null,
        date_of_death || null, date_of_birth || null, disposition_type || null,
        funeral_director_id || null, first_call_received_by || null,
        notes || null
      ]
    );

    if (row) {
      // Auto-generate first call phase tasks
      await generatePhaseTasks((row as any).id, 'FIRST_CALL', (row as any).date_of_death);
      await logTimeline((row as any).id, 'case_created', `New case created: ${decedent_first_name} ${decedent_last_name}`, 'system');
    }

    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update case ────────────────────────────────────────────────────────────

casesRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'case_number' || key === 'created_at') continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (setClauses.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    values.push(req.params.id);
    const row = await queryOne(
      `UPDATE cases SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!row) return res.status(404).json({ error: 'Case not found' });

    // Log the update
    const fields = Object.keys(updates).join(', ');
    await logTimeline((row as any).id, 'case_updated', `Updated: ${fields}`, 'system');

    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Advance case phase ─────────────────────────────────────────────────────

casesRouter.post('/:id/advance-phase', async (req: Request, res: Response) => {
  try {
    const { target_phase } = req.body;
    const phases = ['FIRST_CALL', 'PENDING_ARRANGEMENTS', 'ACTIVE', 'PREPARATION', 'SERVICE', 'POST_SERVICE', 'AFTERCARE', 'ARCHIVED'];

    if (!phases.includes(target_phase)) {
      return res.status(400).json({ error: `Invalid phase: ${target_phase}` });
    }

    const current = await queryOne('SELECT * FROM cases WHERE id = $1', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Case not found' });

    const row = await queryOne(
      'UPDATE cases SET phase = $1 WHERE id = $2 RETURNING *',
      [target_phase, req.params.id]
    );

    // Generate tasks for the new phase
    await generatePhaseTasks(req.params.id, target_phase, (current as any).date_of_death);
    await logTimeline(req.params.id, 'phase_change', `Phase: ${(current as any).phase} → ${target_phase}`, 'system');

    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete case ────────────────────────────────────────────────────────────

casesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne('DELETE FROM cases WHERE id = $1 RETURNING id', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Case not found' });
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
