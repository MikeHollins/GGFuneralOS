import { query } from '../../db/client';
import { PHASE_TASKS, PhaseTaskTemplate } from './case-phases';

/**
 * Generates tasks for a case when it enters a new phase.
 * Calculates deadlines based on date_of_death and/or phase entry time.
 * Skips task generation if tasks already exist for this case+phase.
 */
export async function generatePhaseTasks(
  caseId: string,
  phase: string,
  dateOfDeath: string | null
): Promise<void> {
  const templates = PHASE_TASKS[phase];
  if (!templates || templates.length === 0) return;

  // Check if tasks already exist for this phase (idempotent)
  const existing = await query(
    'SELECT COUNT(*) as count FROM case_tasks WHERE case_id = $1 AND phase = $2',
    [caseId, phase]
  );
  if (Number((existing[0] as any).count) > 0) return;

  const now = new Date();
  const dod = dateOfDeath ? new Date(dateOfDeath) : null;

  for (const t of templates) {
    let deadline: Date | null = null;

    if (t.deadline_days_from_death !== null && dod) {
      deadline = new Date(dod.getTime() + t.deadline_days_from_death * 86400000);
      // If deadline is in the past (late first call), set to today + 1 day minimum
      if (deadline < now) {
        deadline = new Date(now.getTime() + 86400000);
      }
    } else if (t.deadline_days_from_entry !== null) {
      deadline = new Date(now.getTime() + t.deadline_days_from_entry * 86400000);
    }

    await query(
      `INSERT INTO case_tasks (case_id, phase, task_name, description, priority, deadline, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [caseId, phase, t.task_name, t.description, t.priority, deadline?.toISOString() || null, t.sort_order]
    );
  }

  console.log(`[orchestrator] Generated ${templates.length} tasks for case ${caseId} phase ${phase}`);
}
