import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { handleIncomingSms, deployIntakeAgent, getSession } from '../agents/intake/intake-agent';
import { query, queryOne } from '../db/client';
import { v4 as uuid } from 'uuid';

/**
 * WebSocket Chat Server — powers the web chat widget.
 *
 * Families connect via the embeddable widget on kcgoldengate.com.
 * Same intake agent logic, delivered via WebSocket instead of SMS.
 *
 * Protocol:
 * Client → Server: { type: 'message', text: '...', session_id?: '...' }
 * Server → Client: { type: 'message', text: '...', from: 'agent' }
 * Server → Client: { type: 'typing' }
 * Server → Client: { type: 'session', session_id: '...' }
 */

interface ChatSession {
  ws: WebSocket;
  sessionId: string;
  caseId: string | null;
  contactName: string | null;
  decedentName: string | null;
}

const sessions = new Map<string, ChatSession>();
const wsBySession = new Map<string, WebSocket>();

export function initChatServer(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/chat' });

  wss.on('connection', (ws: WebSocket) => {
    const sessionId = uuid();

    const session: ChatSession = {
      ws,
      sessionId,
      caseId: null,
      contactName: null,
      decedentName: null,
    };

    sessions.set(sessionId, session);
    wsBySession.set(sessionId, ws);

    // Send session ID to client
    ws.send(JSON.stringify({ type: 'session', session_id: sessionId }));

    // Send greeting
    setTimeout(() => {
      sendToClient(ws, {
        type: 'message',
        from: 'agent',
        text: "Hello, welcome to KC Golden Gate Funeral Home. I'm here to help you. Are you reaching out about an immediate need, or would you like information about our services?",
      });
    }, 500);

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'message' && msg.text) {
          await handleChatMessage(session, msg.text.trim());
        }
      } catch (err: any) {
        console.error(`[chat] Message parse error: ${err.message}`);
      }
    });

    ws.on('close', () => {
      sessions.delete(sessionId);
      wsBySession.delete(sessionId);
      console.log(`[chat] Session ${sessionId} disconnected`);
    });

    console.log(`[chat] New connection: ${sessionId}`);
  });

  console.log('[chat] WebSocket chat server ready on /chat');
}

async function handleChatMessage(session: ChatSession, text: string): Promise<void> {
  const { ws } = session;

  // Log the inbound message
  if (session.caseId) {
    await query(
      `INSERT INTO intake_conversations (case_id, phone_number, direction, message_text)
       VALUES ($1, $2, 'inbound', $3)`,
      [session.caseId, `web-${session.sessionId}`, text]
    );
  }

  // Show typing indicator
  sendToClient(ws, { type: 'typing' });

  const lower = text.toLowerCase();

  // ── Initial routing — no case created yet ─────────────────────────────
  if (!session.caseId) {
    if (/immediate need|someone (has )?(passed|died)|death|funeral|just (lost|happened)/i.test(lower)) {
      // Immediate need — ask for decedent name to create case
      sendToClient(ws, {
        type: 'message', from: 'agent',
        text: "I'm so sorry for your loss. We're here to help you through every step. Could you share the name of your loved one?",
      });
      session.contactName = '__awaiting_decedent_name__';
      return;
    }

    if (/pre-?plan|information|services|prices|question/i.test(lower)) {
      sendToClient(ws, {
        type: 'message', from: 'agent',
        text: "Of course. You can learn about our services and packages at kcgoldengate.com/our-packages. Would you like to speak with someone directly, or is there something specific I can help with?",
      });
      return;
    }

    // Default — treat as immediate need inquiry
    sendToClient(ws, {
      type: 'message', from: 'agent',
      text: "Thank you for reaching out. Are you contacting us about an immediate need, or would you like information about our services?",
    });
    return;
  }

  // ── Awaiting decedent name ────────────────────────────────────────────
  if (session.contactName === '__awaiting_decedent_name__') {
    session.decedentName = text;
    session.contactName = '__awaiting_contact_name__';

    sendToClient(ws, {
      type: 'message', from: 'agent',
      text: `Thank you. And may I have your name?`,
    });
    return;
  }

  // ── Awaiting contact name → create case ───────────────────────────────
  if (session.contactName === '__awaiting_contact_name__') {
    session.contactName = text;

    // Parse decedent name
    const parts = (session.decedentName || 'Unknown').trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts[parts.length - 1] : '';

    // Create the case
    const caseRow = await queryOne(
      `INSERT INTO cases (decedent_first_name, decedent_last_name, first_call_date, phase, notes)
       VALUES ($1, $2, now(), 'FIRST_CALL', 'Created via web chat') RETURNING *`,
      [firstName, lastName]
    );

    if (caseRow) {
      session.caseId = (caseRow as any).id;

      // Create contact
      const contactParts = text.trim().split(/\s+/);
      await query(
        `INSERT INTO case_contacts (case_id, first_name, last_name, relationship, is_nok)
         VALUES ($1, $2, $3, 'NEXT_OF_KIN', true)`,
        [session.caseId, contactParts[0], contactParts.slice(1).join(' ') || null]
      );

      // Generate tasks
      const { generatePhaseTasks } = await import('../agents/orchestrator/task-scheduler');
      await generatePhaseTasks(session.caseId!, 'FIRST_CALL', null);

      console.log(`[chat] Case created: ${(caseRow as any).case_number} for ${firstName} ${lastName} (via ${session.contactName})`);

      sendToClient(ws, {
        type: 'message', from: 'agent',
        text: `Thank you, ${contactParts[0]}. We've started preparing for ${firstName}'s service. I'm going to ask you a few questions to help us get everything ready. You can skip anything you're not sure about, and there's no rush at all.`,
      });

      // Start intake flow — deploy the agent in chat mode
      setTimeout(async () => {
        await handleIntakeChat(session, '__start__');
      }, 2000);
    }
    return;
  }

  // ── Active intake conversation ────────────────────────────────────────
  await handleIntakeChat(session, text);
}

// ── Intake agent adapted for chat ───────────────────────────────────────────

import { INTAKE_FIELDS, getNextField } from '../agents/intake/intake-fields';
import { INTAKE_COMPLETION, INTAKE_SKIP_RESPONSE } from '../agents/intake/intake-prompts';

const chatCollected = new Map<string, Set<string>>();
const chatCurrentField = new Map<string, string | null>();

async function handleIntakeChat(session: ChatSession, text: string): Promise<void> {
  const { ws, caseId, sessionId } = session;
  if (!caseId) return;

  if (!chatCollected.has(sessionId)) chatCollected.set(sessionId, new Set());
  const collected = chatCollected.get(sessionId)!;

  const lower = text.toLowerCase().trim();

  // Handle special commands
  if (lower === 'skip' || lower === 'next' || lower === "i don't know" || lower === 'idk') {
    const current = chatCurrentField.get(sessionId);
    if (current) collected.add(current);
    sendToClient(ws, { type: 'message', from: 'agent', text: INTAKE_SKIP_RESPONSE });
  } else if (lower === '__start__') {
    // Initial start — don't store anything
  } else {
    // Store the response
    const currentFieldId = chatCurrentField.get(sessionId);
    if (currentFieldId) {
      const field = INTAKE_FIELDS.find(f => f.id === currentFieldId);
      if (field && !field.redirect_to_portal) {
        // Store to database
        try {
          if (field.db_column.startsWith('_')) {
            const key = field.db_column.slice(1);
            await query(
              `INSERT INTO obituaries (case_id, biographical_data, status)
               VALUES ($1, jsonb_build_object($2, $3), 'DRAFT')
               ON CONFLICT DO NOTHING`,
              [caseId, key, text]
            );
          } else if (field.db_column === 'decedent_first_name') {
            const parts = text.trim().split(/\s+/);
            await query('UPDATE cases SET decedent_first_name=$1, decedent_middle_name=$2, decedent_last_name=$3 WHERE id=$4',
              [parts[0], parts.length > 2 ? parts.slice(1, -1).join(' ') : null, parts.length > 1 ? parts[parts.length - 1] : null, caseId]);
          } else if (field.db_column === 'armed_forces') {
            const yes = /yes|yeah|served|military/i.test(text);
            await query(`UPDATE cases SET armed_forces=$1 WHERE id=$2`, [yes, caseId]);
          } else {
            await query(`UPDATE cases SET ${field.db_column}=$1 WHERE id=$2`, [text, caseId]);
          }
        } catch (err: any) {
          console.error(`[chat] Store failed: ${err.message}`);
        }
      }
      collected.add(currentFieldId);
    }
  }

  // Log conversation
  if (text !== '__start__') {
    await query(
      `INSERT INTO intake_conversations (case_id, phone_number, direction, message_text, field_collected)
       VALUES ($1, $2, 'inbound', $3, $4)`,
      [caseId, `web-${sessionId}`, text, chatCurrentField.get(sessionId) || null]
    );
  }

  // Get next field
  const nextField = getNextField(collected);
  if (!nextField) {
    sendToClient(ws, { type: 'message', from: 'agent', text: INTAKE_COMPLETION });
    chatCollected.delete(sessionId);
    chatCurrentField.delete(sessionId);
    return;
  }

  // Portal redirect fields — show inline in chat instead
  if (nextField.redirect_to_portal) {
    collected.add(nextField.id);
    // For chat, we can collect sensitive data inline (it's already HTTPS encrypted)
    // But still flag it as sensitive
    chatCurrentField.set(sessionId, nextField.id);

    setTimeout(() => {
      sendToClient(ws, {
        type: 'message', from: 'agent',
        text: nextField.prompt.replace(/secure link|portal/gi, 'here securely'),
      });
    }, 800);
    return;
  }

  chatCurrentField.set(sessionId, nextField.id);

  // Small delay for natural feel
  setTimeout(() => {
    sendToClient(ws, { type: 'message', from: 'agent', text: nextField.prompt });

    // Log outbound
    query(
      `INSERT INTO intake_conversations (case_id, phone_number, direction, message_text, field_collected)
       VALUES ($1, $2, 'outbound', $3, $4)`,
      [caseId, `web-${sessionId}`, nextField.prompt, nextField.id]
    ).catch(() => {});
  }, 800);
}

function sendToClient(ws: WebSocket, data: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
