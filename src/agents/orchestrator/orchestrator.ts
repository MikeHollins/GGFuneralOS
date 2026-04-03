import { query, queryOne } from '../../db/client';
import { PHASE_ORDER, CasePhase } from './case-phases';
import { generatePhaseTasks } from './task-scheduler';

/**
 * Orchestrator — the brain of GGFuneralOS.
 * Manages case state machine, validates phase transitions, triggers agents.
 */

export function getNextPhase(current: CasePhase): CasePhase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

export function canAdvance(current: CasePhase, target: CasePhase): boolean {
  const currentIdx = PHASE_ORDER.indexOf(current);
  const targetIdx = PHASE_ORDER.indexOf(target);
  return targetIdx > currentIdx;
}

/**
 * Advance a case to the next phase.
 * - Validates the transition
 * - Updates the case
 * - Generates phase-specific tasks
 * - Logs timeline event
 */
export async function advanceCase(
  caseId: string,
  targetPhase?: CasePhase
): Promise<{ success: boolean; phase: string; message: string }> {
  const caseRow = await queryOne('SELECT * FROM cases WHERE id = $1', [caseId]);
  if (!caseRow) return { success: false, phase: '', message: 'Case not found' };

  const current = (caseRow as any).phase as CasePhase;
  const target = targetPhase || getNextPhase(current);

  if (!target) return { success: false, phase: current, message: 'Case is already at final phase' };
  if (!canAdvance(current, target)) {
    return { success: false, phase: current, message: `Cannot move from ${current} to ${target}` };
  }

  await query('UPDATE cases SET phase = $1 WHERE id = $2', [target, caseId]);
  await generatePhaseTasks(caseId, target, (caseRow as any).date_of_death);

  await query(
    `INSERT INTO case_timeline (case_id, event_type, description, actor)
     VALUES ($1, 'phase_change', $2, 'orchestrator')`,
    [caseId, `Phase: ${current} → ${target}`]
  );

  console.log(`[orchestrator] Case ${caseId}: ${current} → ${target}`);
  return { success: true, phase: target, message: `Advanced to ${target}` };
}

/**
 * Check all active cases for overdue tasks and flag them.
 * Run this on a schedule (e.g., every hour via cron).
 */
export async function flagOverdueTasks(): Promise<number> {
  const result = await query(
    `UPDATE case_tasks SET status = 'OVERDUE'
     WHERE status IN ('PENDING', 'IN_PROGRESS')
       AND deadline < now()
       AND deadline IS NOT NULL
     RETURNING id`
  );
  if (result.length > 0) {
    console.log(`[orchestrator] Flagged ${result.length} overdue tasks`);
  }
  return result.length;
}
