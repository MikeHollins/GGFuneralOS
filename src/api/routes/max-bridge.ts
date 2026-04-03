import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db/client';
import { generatePhaseTasks } from '../../agents/orchestrator/task-scheduler';
import { logTimeline } from './timeline-helper';

/**
 * Max Bridge — the API Max uses to interact with GGFuneralOS.
 * Max texts brother → brother texts Max → Max calls these endpoints.
 *
 * Designed for natural language → structured API translation.
 */
export const maxBridgeRouter = Router();

// ─── Create a new case from first call ──────────────────────────────────────
// Max: "new case, John Smith, wife is Mary at 816-555-1234"

maxBridgeRouter.post('/new-case', async (req: Request, res: Response) => {
  try {
    const {
      decedent_first_name, decedent_last_name, decedent_middle_name,
      date_of_death, disposition_type,
      contact_name, contact_phone, contact_relationship,
      notes
    } = req.body;

    // Create the case
    const caseRow = await queryOne(
      `INSERT INTO cases (
        decedent_first_name, decedent_last_name, decedent_middle_name,
        date_of_death, disposition_type, first_call_date, phase, notes
      ) VALUES ($1,$2,$3,$4,$5,now(),'FIRST_CALL',$6) RETURNING *`,
      [decedent_first_name, decedent_last_name, decedent_middle_name || null,
       date_of_death || null, disposition_type || null, notes || null]
    );

    const caseId = (caseRow as any).id;
    const caseNumber = (caseRow as any).case_number;

    // Create family contact if provided
    if (contact_name && contact_phone) {
      const [firstName, ...rest] = contact_name.split(' ');
      const lastName = rest.join(' ') || null;
      await query(
        `INSERT INTO case_contacts (case_id, first_name, last_name, relationship, is_nok, phone)
         VALUES ($1,$2,$3,$4,true,$5)`,
        [caseId, firstName, lastName, contact_relationship || 'NEXT_OF_KIN', contact_phone]
      );
    }

    // Generate first call tasks
    await generatePhaseTasks(caseId, 'FIRST_CALL', date_of_death || null);
    await logTimeline(caseId, 'case_created', `Case created via Max: ${decedent_first_name} ${decedent_last_name}`, 'max');

    res.status(201).json({
      message: `Case GG-${caseNumber} created for ${decedent_first_name} ${decedent_last_name}. Phase: First Call.`,
      case_id: caseId,
      case_number: caseNumber,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get active cases summary ───────────────────────────────────────────────
// Max: "what cases are active?"

maxBridgeRouter.get('/active', async (_req: Request, res: Response) => {
  try {
    const cases = await query(
      `SELECT case_number, decedent_first_name, decedent_last_name, phase,
              service_date, disposition_type, payment_status
       FROM cases WHERE phase NOT IN ('ARCHIVED')
       ORDER BY first_call_date DESC`
    );

    if (cases.length === 0) {
      return res.json({ message: 'No active cases right now.', cases: [] });
    }

    const lines = cases.map((c: any) =>
      `GG-${c.case_number}: ${c.decedent_first_name} ${c.decedent_last_name} — ${c.phase}${c.service_date ? ` | Service: ${new Date(c.service_date).toLocaleDateString()}` : ''}${c.disposition_type ? ` | ${c.disposition_type}` : ''}`
    );

    res.json({
      message: `${cases.length} active case(s):\n${lines.join('\n')}`,
      cases,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update a case by number or name ────────────────────────────────────────
// Max: "update the Smith case — service is Saturday at 2pm"

maxBridgeRouter.patch('/update-case', async (req: Request, res: Response) => {
  try {
    const { case_number, last_name, updates } = req.body;

    let caseRow;
    if (case_number) {
      caseRow = await queryOne('SELECT * FROM cases WHERE case_number = $1', [case_number]);
    } else if (last_name) {
      caseRow = await queryOne(
        `SELECT * FROM cases WHERE LOWER(decedent_last_name) = LOWER($1) AND phase != 'ARCHIVED' ORDER BY created_at DESC LIMIT 1`,
        [last_name]
      );
    }

    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'case_number' || key === 'created_at') continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (setClauses.length === 0) return res.status(400).json({ error: 'No updates provided' });

    values.push((caseRow as any).id);
    const updated = await queryOne(
      `UPDATE cases SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    const fields = Object.keys(updates).join(', ');
    await logTimeline((caseRow as any).id, 'case_updated', `Updated via Max: ${fields}`, 'max');

    res.json({
      message: `GG-${(caseRow as any).case_number} updated: ${fields}`,
      case: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Advance phase ──────────────────────────────────────────────────────────
// Max: "move Smith to active"

maxBridgeRouter.post('/advance', async (req: Request, res: Response) => {
  try {
    const { case_number, last_name, target_phase } = req.body;

    let caseRow;
    if (case_number) {
      caseRow = await queryOne('SELECT * FROM cases WHERE case_number = $1', [case_number]);
    } else if (last_name) {
      caseRow = await queryOne(
        `SELECT * FROM cases WHERE LOWER(decedent_last_name) = LOWER($1) AND phase != 'ARCHIVED' ORDER BY created_at DESC LIMIT 1`,
        [last_name]
      );
    }

    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const updated = await queryOne(
      'UPDATE cases SET phase = $1 WHERE id = $2 RETURNING *',
      [target_phase, (caseRow as any).id]
    );

    await generatePhaseTasks((caseRow as any).id, target_phase, (caseRow as any).date_of_death);
    await logTimeline((caseRow as any).id, 'phase_change', `Phase advanced via Max: ${(caseRow as any).phase} → ${target_phase}`, 'max');

    res.json({
      message: `GG-${(caseRow as any).case_number} moved to ${target_phase}`,
      case: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get overdue items ──────────────────────────────────────────────────────
// Max: "what's overdue?"

maxBridgeRouter.get('/overdue', async (_req: Request, res: Response) => {
  try {
    const tasks = await query(
      `SELECT t.task_name, t.deadline, t.priority,
              c.case_number, c.decedent_first_name, c.decedent_last_name
       FROM case_tasks t JOIN cases c ON c.id = t.case_id
       WHERE t.status IN ('PENDING','IN_PROGRESS') AND t.deadline < now()
       ORDER BY t.deadline LIMIT 20`
    );

    if (tasks.length === 0) {
      return res.json({ message: 'Nothing overdue. All clear.', tasks: [] });
    }

    const lines = tasks.map((t: any) =>
      `⚠️ ${t.task_name} — GG-${t.case_number} (${t.decedent_last_name}) — due ${new Date(t.deadline).toLocaleDateString()}`
    );

    res.json({
      message: `${tasks.length} overdue item(s):\n${lines.join('\n')}`,
      tasks,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
