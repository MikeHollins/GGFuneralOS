import { generateSecureToken } from './crypto';
import { query, queryOne } from '../db/client';

const PORTAL_EXPIRY_DAYS = 7;

/**
 * Generate a secure portal session for a family member.
 * Returns a URL-safe token that gives access to the intake portal.
 */
export async function createPortalSession(
  caseId: string,
  phone: string,
  contactName: string
): Promise<{ token: string; portalUrl: string }> {
  const token = generateSecureToken(48);
  const expiresAt = new Date(Date.now() + PORTAL_EXPIRY_DAYS * 86400000);

  await query(
    `INSERT INTO intake_portal_sessions (case_id, token, phone, contact_name, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [caseId, token, phone, contactName, expiresAt.toISOString()]
  );

  const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const portalUrl = `${baseUrl}/portal/${token}`;

  console.log(`[portal] Session created for case ${caseId} → ${portalUrl}`);
  return { token, portalUrl };
}

/**
 * Validate a portal token. Returns session data or null if invalid/expired.
 */
export async function validatePortalToken(token: string): Promise<any | null> {
  const session = await queryOne(
    `SELECT ps.*, c.decedent_first_name, c.decedent_last_name, c.case_number
     FROM intake_portal_sessions ps
     JOIN cases c ON c.id = ps.case_id
     WHERE ps.token = $1 AND ps.status = 'active' AND ps.expires_at > now()`,
    [token]
  );
  return session;
}

/**
 * Update fields completed in a portal session.
 */
export async function updatePortalProgress(token: string, fieldId: string, value: string): Promise<void> {
  await query(
    `UPDATE intake_portal_sessions
     SET fields_completed = fields_completed || jsonb_build_object($1, $2)
     WHERE token = $3`,
    [fieldId, value ? 'completed' : 'skipped', token]
  );
}

/**
 * Mark portal session as completed.
 */
export async function completePortalSession(token: string): Promise<void> {
  await query(
    `UPDATE intake_portal_sessions SET status = 'completed' WHERE token = $1`,
    [token]
  );
}

/**
 * Set scheduled arrangement conference date from portal.
 */
export async function setScheduledDate(token: string, date: string): Promise<void> {
  await query(
    `UPDATE intake_portal_sessions SET scheduled_date = $1 WHERE token = $2`,
    [date, token]
  );
}
