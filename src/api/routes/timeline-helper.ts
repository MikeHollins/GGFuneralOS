import { query } from '../../db/client';

export async function logTimeline(
  caseId: string,
  eventType: string,
  description: string,
  actor: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  await query(
    `INSERT INTO case_timeline (case_id, event_type, description, actor, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [caseId, eventType, description, actor, JSON.stringify(metadata)]
  );
}
