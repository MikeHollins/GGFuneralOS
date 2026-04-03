import { query, queryOne } from '../../db/client';
import { INTAKE_FIELDS, getNextField } from './intake-fields';
import {
  INTAKE_SYSTEM_PROMPT, INTAKE_GREETING, INTAKE_NUDGE_1H,
  INTAKE_NUDGE_24H, INTAKE_COMPLETION, INTAKE_SKIP_RESPONSE
} from './intake-prompts';

/**
 * Golden Gate Intake Agent
 *
 * Deployed via SMS (Twilio) to families after first call.
 * Collects information conversationally for death certificate and program.
 *
 * Flow:
 * 1. Staff/Max creates case → deploys agent with family phone
 * 2. Agent sends greeting
 * 3. Agent asks questions one at a time
 * 4. Family responses are parsed, stored in case, and logged
 * 5. Agent tracks progress and handles skip/pause/resume
 */

export interface IntakeSession {
  case_id: string;
  phone_number: string;
  decedent_name: string;
  contact_first_name: string;
  collected_fields: Set<string>;
  current_field: string | null;
  last_message_at: Date;
  nudge_1h_sent: boolean;
  nudge_24h_sent: boolean;
  completed: boolean;
}

// In-memory session store (could be moved to Redis/DB for persistence)
const sessions = new Map<string, IntakeSession>();

/**
 * Deploy the intake agent for a case.
 * Sends the initial greeting and first question.
 */
export async function deployIntakeAgent(
  caseId: string,
  phoneNumber: string,
  decedentName: string,
  contactFirstName: string,
  sendSms: (to: string, body: string) => Promise<void>
): Promise<void> {
  const session: IntakeSession = {
    case_id: caseId,
    phone_number: phoneNumber,
    decedent_name: decedentName,
    contact_first_name: contactFirstName,
    collected_fields: new Set(),
    current_field: null,
    last_message_at: new Date(),
    nudge_1h_sent: false,
    nudge_24h_sent: false,
    completed: false,
  };

  sessions.set(phoneNumber, session);

  // Update case
  await query(
    'UPDATE cases SET intake_agent_deployed = true, intake_agent_phone = $1 WHERE id = $2',
    [phoneNumber, caseId]
  );

  // Send greeting
  const greeting = INTAKE_GREETING(decedentName, contactFirstName);
  await sendSms(phoneNumber, greeting);
  await logConversation(caseId, phoneNumber, 'outbound', greeting);

  // Wait a moment, then send first question
  setTimeout(async () => {
    const nextField = getNextField(session.collected_fields);
    if (nextField) {
      session.current_field = nextField.id;
      await sendSms(phoneNumber, nextField.prompt);
      await logConversation(caseId, phoneNumber, 'outbound', nextField.prompt, nextField.id);
    }
  }, 3000);

  console.log(`[intake-agent] Deployed for case ${caseId} → ${phoneNumber}`);
}

/**
 * Handle an incoming SMS from a family member.
 * Parse the response, store it, and ask the next question.
 */
export async function handleIncomingSms(
  phoneNumber: string,
  messageText: string,
  sendSms: (to: string, body: string) => Promise<void>
): Promise<boolean> {
  const session = sessions.get(phoneNumber);
  if (!session || session.completed) return false;

  session.last_message_at = new Date();
  session.nudge_1h_sent = false;
  session.nudge_24h_sent = false;

  await logConversation(session.case_id, phoneNumber, 'inbound', messageText, session.current_field || undefined);

  const lower = messageText.toLowerCase().trim();

  // Handle skip requests
  if (lower === 'skip' || lower === 'next' || lower === "i don't know" || lower === 'idk' || lower === 'not sure') {
    if (session.current_field) {
      session.collected_fields.add(session.current_field); // mark as attempted
    }
    await sendSms(phoneNumber, INTAKE_SKIP_RESPONSE);
  } else if (lower === 'stop' || lower === 'pause' || lower === 'later') {
    await sendSms(phoneNumber, "No problem at all. Just text us whenever you're ready to continue. We'll pick up right where we left off.");
    return true;
  } else if (session.current_field) {
    // Store the response
    const field = INTAKE_FIELDS.find(f => f.id === session.current_field);
    if (field) {
      await storeFieldData(session.case_id, field.db_column, messageText);
      session.collected_fields.add(session.current_field);

      // Update intake progress on case
      const progress: Record<string, string> = {};
      for (const f of INTAKE_FIELDS) {
        progress[f.id] = session.collected_fields.has(f.id) ? 'collected' : 'pending';
      }
      await query('UPDATE cases SET intake_progress = $1 WHERE id = $2', [JSON.stringify(progress), session.case_id]);
    }
  }

  // Get next field
  const nextField = getNextField(session.collected_fields);
  if (!nextField) {
    // All fields collected or attempted
    session.completed = true;
    await sendSms(phoneNumber, INTAKE_COMPLETION);
    await logConversation(session.case_id, phoneNumber, 'outbound', INTAKE_COMPLETION);
    console.log(`[intake-agent] Completed intake for case ${session.case_id}`);
    return true;
  }

  session.current_field = nextField.id;
  await sendSms(phoneNumber, nextField.prompt);
  await logConversation(session.case_id, phoneNumber, 'outbound', nextField.prompt, nextField.id);

  return true;
}

/**
 * Check for sessions that need nudges (called periodically).
 */
export async function checkNudges(
  sendSms: (to: string, body: string) => Promise<void>
): Promise<void> {
  const now = Date.now();

  for (const [phone, session] of sessions) {
    if (session.completed) continue;

    const elapsed = now - session.last_message_at.getTime();

    if (elapsed > 24 * 3600000 && !session.nudge_24h_sent) {
      await sendSms(phone, INTAKE_NUDGE_24H);
      await logConversation(session.case_id, phone, 'outbound', INTAKE_NUDGE_24H);
      session.nudge_24h_sent = true;
    } else if (elapsed > 3600000 && !session.nudge_1h_sent) {
      await sendSms(phone, INTAKE_NUDGE_1H);
      await logConversation(session.case_id, phone, 'outbound', INTAKE_NUDGE_1H);
      session.nudge_1h_sent = true;
    }
  }
}

/** Get active session for a phone number */
export function getSession(phoneNumber: string): IntakeSession | undefined {
  return sessions.get(phoneNumber);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function logConversation(
  caseId: string, phone: string, direction: string,
  text: string, fieldCollected?: string
): Promise<void> {
  await query(
    `INSERT INTO intake_conversations (case_id, phone_number, direction, message_text, field_collected)
     VALUES ($1, $2, $3, $4, $5)`,
    [caseId, phone, direction, text, fieldCollected || null]
  );
}

async function storeFieldData(caseId: string, dbColumn: string, value: string): Promise<void> {
  // Columns starting with _ are stored in obituary/biographical data, not directly on the case
  if (dbColumn.startsWith('_')) {
    // Store as part of the obituary biographical_data JSONB
    const key = dbColumn.slice(1); // remove leading _
    await query(
      `INSERT INTO obituaries (case_id, biographical_data, status)
       VALUES ($1, jsonb_build_object($2, $3), 'DRAFT')
       ON CONFLICT (case_id) DO UPDATE
       SET biographical_data = obituaries.biographical_data || jsonb_build_object($2, $3)`,
      [caseId, key, value]
    );
    return;
  }

  // Handle special parsing
  if (dbColumn === 'date_of_birth') {
    // Try to parse various date formats
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      await query(`UPDATE cases SET ${dbColumn} = $1 WHERE id = $2`, [parsed.toISOString().split('T')[0], caseId]);
      return;
    }
  }

  if (dbColumn === 'armed_forces') {
    const yes = /yes|yeah|yep|served|military|army|navy|marines|air force|coast guard/i.test(value);
    await query(`UPDATE cases SET ${dbColumn} = $1 WHERE id = $2`, [yes, caseId]);
    return;
  }

  if (dbColumn === 'decedent_first_name') {
    // Parse full name into parts
    const parts = value.trim().split(/\s+/);
    const first = parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : null;
    const middle = parts.length > 2 ? parts.slice(1, -1).join(' ') : null;
    await query(
      'UPDATE cases SET decedent_first_name = $1, decedent_middle_name = $2, decedent_last_name = $3 WHERE id = $4',
      [first, middle, last, caseId]
    );
    return;
  }

  if (dbColumn === 'residence_street') {
    // Store full address as-is; can be parsed later
    await query('UPDATE cases SET residence_street = $1 WHERE id = $2', [value, caseId]);
    return;
  }

  // Default: store as text
  await query(`UPDATE cases SET ${dbColumn} = $1 WHERE id = $2`, [value, caseId]);
}
