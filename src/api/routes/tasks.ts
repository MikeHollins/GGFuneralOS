import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db/client';
import { logTimeline } from './timeline-helper';

export const tasksRouter = Router();

tasksRouter.get('/case/:caseId', async (req: Request, res: Response) => {
  try {
    const { phase, status } = req.query;
    let sql = 'SELECT * FROM case_tasks WHERE case_id = $1';
    const params: any[] = [req.params.caseId];

    if (phase) { sql += ` AND phase = $${params.length + 1}`; params.push(phase); }
    if (status) { sql += ` AND status = $${params.length + 1}`; params.push(status); }

    sql += ' ORDER BY sort_order, deadline';
    const rows = await query(sql, params);
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Complete a task
tasksRouter.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { completed_by } = req.body;
    const row = await queryOne(
      `UPDATE case_tasks SET status = 'COMPLETED', completed_at = now(), completed_by = $1
       WHERE id = $2 RETURNING *`,
      [completed_by || null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Task not found' });

    await logTimeline((row as any).case_id, 'task_completed', `Task completed: ${(row as any).task_name}`, completed_by || 'system');
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Skip a task
tasksRouter.post('/:id/skip', async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      `UPDATE case_tasks SET status = 'SKIPPED' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Task not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get overdue tasks across all cases
tasksRouter.get('/overdue', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT t.*, c.decedent_first_name, c.decedent_last_name, c.case_number
       FROM case_tasks t
       JOIN cases c ON c.id = t.case_id
       WHERE t.status IN ('PENDING', 'IN_PROGRESS')
         AND t.deadline < now()
       ORDER BY t.deadline`
    );
    res.json({ data: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
