import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { query, queryOne } from '../db/client';
import { v4 as uuid } from 'uuid';
import { INTAKE_SYSTEM_PROMPT } from '../agents/intake/intake-prompts';

/**
 * WebSocket Chat Server — LLM-Powered Intake Agent
 *
 * Every message goes through Gemini Flash with the intake system prompt.
 * The LLM handles conversation naturally — no regex routing.
 * It extracts data, asks follow-ups, handles edge cases, and knows
 * when someone is chatting vs providing intake information.
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  ws: WebSocket;
  sessionId: string;
  caseId: string | null;
  history: ChatMessage[];
  fieldsCollected: Record<string, string>;
}

const sessions = new Map<string, ChatSession>();

const CHAT_SYSTEM_PROMPT = `${INTAKE_SYSTEM_PROMPT}

BUSINESS KNOWLEDGE (use this to answer questions accurately):

KC Golden Gate Funeral & Cremation Services
Address: 2800 E 18th St, Kansas City, MO 64127
Phone: (816) 231-GATE / (816) 231-4283
Secondary: (816) 368-8409
Email: info@kcgoldengate.com
Website: kcgoldengate.com
Tagline: "Exchanging Your Grief for a Golden Experience"

STAFF:
- DiMond Piggie — Chief Operations Officer, Licensed Funeral Director (KS & MO), Licensed Insurance Agent
- Angela D. Husband — Missouri Licensed Funeral Director (30+ years experience)

PACKAGES (describe but NEVER state prices — prices are discussed in person per FTC Funeral Rule):
- The Direct — Basic cremation with dignity. Includes removal, cremation, basic container, website obituary.
- The Memorial — Memorial service (body not present). Includes cremation, service facility, register book, prayer cards.
- The Noble — Cremation with embalming and 1-hour visitation. Includes hearse, rental casket, program.
- The Formal — Traditional funeral with graveside service. Includes embalming, hearse, funeral escort.
- The Prestige — Enhanced funeral with casket included. 1-hour visitation, two escorts.
- The Gold — 2-hour visitation, family car, casket, minister honorarium, tri-fold program, casket spray.
- The Imperial — Premium with DVD tribute, custom casket panel, standing floral, 2 family cars, 3 escorts.
- The Royal — The complete experience: horse & carriage, Sprinter van, dove release, 8-page booklet, 4 death certificates.

For package details, direct people to: kcgoldengate.com/our-packages

SERVICES OFFERED:
- Traditional funeral services
- Cremation services
- Memorial services
- Celebration of life
- Graveside services
- Veterans services with military honors
- Pre-planning and pre-arrangement
- Grief support and resources

ADDITIONAL RULES FOR WEB CHAT:
- You are chatting with someone on the KC Golden Gate Funeral Home website.
- Your first priority is to understand what they need: immediate need (someone has passed) or general information.
- Be conversational and natural. People may say "hi", "hello", "are you real?", "are you a bot?" — respond warmly and honestly: "I'm an AI assistant for KC Golden Gate. I'm here to help you 24/7."
- Do NOT treat every message as an answer to your question. If someone says "are you real?" that is NOT a name.
- When collecting information, CONFIRM what you heard before moving on: "Just to confirm, the name is James Wilson — is that correct?"
- If you're unsure what someone means, ASK for clarification. Never guess.
- If someone hasn't indicated an immediate need yet, don't jump into the intake flow. Chat naturally first.
- When they do indicate someone has passed, transition gently and start collecting information one question at a time.
- Keep responses to 1-3 sentences. This is a chat, not an email.
- You can answer basic questions about the funeral home: address is 2800 E 18th St, Kansas City, MO 64127. Phone: (816) 231-GATE. Website: kcgoldengate.com.
- For pricing questions, say: "Our team will go over pricing options when you meet in person. You can also view our packages at kcgoldengate.com/our-packages."
- NEVER make up information you don't know.

When you collect a piece of intake data, output it as a structured tag at the END of your message (the user won't see these):
[FIELD:full_name=James Wilson]
[FIELD:date_of_birth=1955-03-15]
[FIELD:disposition=BURIAL]
[FIELD:contact_name=Mary Wilson]
[CASE_CREATED]

Only use [CASE_CREATED] when you've confirmed the decedent's name AND the caller's name and are ready to begin the formal intake.`;

export function initChatServer(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/chat' });

  wss.on('connection', (ws: WebSocket) => {
    const sessionId = uuid();
    const session: ChatSession = {
      ws,
      sessionId,
      caseId: null,
      history: [],
      fieldsCollected: {},
    };

    sessions.set(sessionId, session);

    // Send session ID
    ws.send(JSON.stringify({ type: 'session', session_id: sessionId }));

    // Greeting
    setTimeout(() => {
      const greeting = "Hello, and welcome to KC Golden Gate Funeral Home. I'm here to help — whether you have an immediate need or just have questions. How can I assist you today?";
      session.history.push({ role: 'assistant', content: greeting });
      sendToClient(ws, { type: 'message', from: 'agent', text: greeting });
    }, 500);

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message' && msg.text) {
          await handleMessage(session, msg.text.trim());
        }
      } catch (err: any) {
        console.error(`[chat] Error: ${err.message}`);
      }
    });

    ws.on('close', () => {
      sessions.delete(sessionId);
      console.log(`[chat] Session ${sessionId} closed`);
    });

    console.log(`[chat] New session: ${sessionId}`);
  });

  console.log('[chat] WebSocket chat server ready on /chat');
}

async function handleMessage(session: ChatSession, text: string): Promise<void> {
  const { ws } = session;

  // Add user message to history
  session.history.push({ role: 'user', content: text });

  // Show typing
  sendToClient(ws, { type: 'typing' });

  // Log inbound
  if (session.caseId) {
    await query(
      `INSERT INTO intake_conversations (case_id, phone_number, direction, message_text)
       VALUES ($1, $2, 'inbound', $3)`,
      [session.caseId, `web-${session.sessionId}`, text]
    ).catch(() => {});
  }

  try {
    // ── Local LLM via Ollama — all data stays on this machine ────────────
    const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
    const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';

    const ollamaMessages = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      ...session.history.map(m => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: false,
        options: { temperature: 0.7, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[chat] Ollama error ${res.status}`);
      // Fallback to Gemini if Ollama is down
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (apiKey) {
        const geminiMessages = session.history.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: geminiMessages,
              systemInstruction: { parts: [{ text: CHAT_SYSTEM_PROMPT }] },
              generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
            }),
            signal: AbortSignal.timeout(15000),
          }
        );
        if (geminiRes.ok) {
          const geminiData: any = await geminiRes.json();
          const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (geminiText) {
            console.log('[chat] Ollama down — fell back to Gemini');
            // Continue with geminiText below
          }
        }
      }
      sendToClient(ws, { type: 'message', from: 'agent', text: "I'm sorry, I'm having a brief issue. Please try again, or call us at (816) 231-GATE." });
      return;
    }

    const data: any = await res.json();
    let responseText = data.message?.content || '';

    // Extract structured field tags before showing to user
    const fieldMatches = responseText.matchAll(/\[FIELD:(\w+)=([^\]]+)\]/g);
    for (const match of fieldMatches) {
      const [, fieldName, fieldValue] = match;
      session.fieldsCollected[fieldName] = fieldValue;
      console.log(`[chat] Field collected: ${fieldName} = ${fieldValue}`);

      // Store to database if we have a case
      if (session.caseId) {
        await storeField(session.caseId, fieldName, fieldValue);
      }
    }

    // Check if case should be created
    if (responseText.includes('[CASE_CREATED]') && !session.caseId) {
      await createCaseFromChat(session);
    }

    // Strip tags from visible response
    const cleanResponse = responseText
      .replace(/\[FIELD:\w+=[^\]]+\]/g, '')
      .replace(/\[CASE_CREATED\]/g, '')
      .trim();

    if (cleanResponse) {
      session.history.push({ role: 'assistant', content: cleanResponse });
      sendToClient(ws, { type: 'message', from: 'agent', text: cleanResponse });

      // Log outbound
      if (session.caseId) {
        await query(
          `INSERT INTO intake_conversations (case_id, phone_number, direction, message_text)
           VALUES ($1, $2, 'outbound', $3)`,
          [session.caseId, `web-${session.sessionId}`, cleanResponse]
        ).catch(() => {});
      }
    }
  } catch (err: any) {
    console.error(`[chat] LLM error: ${err.message}`);
    sendToClient(ws, { type: 'message', from: 'agent', text: "I'm sorry, I'm experiencing a brief issue. Please try again in a moment, or call us at (816) 231-GATE." });
  }
}

async function createCaseFromChat(session: ChatSession): Promise<void> {
  const decedentName = session.fieldsCollected.full_name || session.fieldsCollected.decedent_name || 'Unknown';
  const contactName = session.fieldsCollected.contact_name || 'Web Chat Visitor';

  const parts = decedentName.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';

  const caseRow = await queryOne(
    `INSERT INTO cases (decedent_first_name, decedent_last_name, first_call_date, phase, notes)
     VALUES ($1, $2, now(), 'FIRST_CALL', 'Created via web chat') RETURNING *`,
    [firstName, lastName]
  );

  if (caseRow) {
    session.caseId = (caseRow as any).id;

    // Create contact
    const contactParts = contactName.trim().split(/\s+/);
    await query(
      `INSERT INTO case_contacts (case_id, first_name, last_name, relationship, is_nok)
       VALUES ($1, $2, $3, 'NEXT_OF_KIN', true)`,
      [session.caseId, contactParts[0], contactParts.slice(1).join(' ') || null]
    ).catch(() => {});

    // Generate tasks
    const { generatePhaseTasks } = await import('../agents/orchestrator/task-scheduler');
    await generatePhaseTasks(session.caseId!, 'FIRST_CALL', null);

    console.log(`[chat] Case GG-${(caseRow as any).case_number} created for ${firstName} ${lastName}`);
  }
}

async function storeField(caseId: string, fieldName: string, value: string): Promise<void> {
  const fieldMap: Record<string, string> = {
    full_name: 'decedent_first_name', // parsed specially
    date_of_birth: 'date_of_birth',
    birthplace: 'birthplace',
    sex: 'sex',
    marital_status: 'marital_status',
    surviving_spouse: 'surviving_spouse',
    residence: 'residence_street',
    occupation: 'occupation',
    education: 'education',
    race: 'race',
    armed_forces: 'armed_forces',
    father_name: 'father_name',
    mother_maiden_name: 'mother_maiden_name',
    disposition: 'disposition_type',
    service_type: 'service_type',
    special_requests: 'special_requests',
  };

  const dbColumn = fieldMap[fieldName];
  if (!dbColumn) return;

  try {
    if (fieldName === 'full_name') {
      const parts = value.trim().split(/\s+/);
      await query('UPDATE cases SET decedent_first_name=$1, decedent_middle_name=$2, decedent_last_name=$3 WHERE id=$4',
        [parts[0], parts.length > 2 ? parts.slice(1, -1).join(' ') : null, parts.length > 1 ? parts[parts.length - 1] : null, caseId]);
    } else if (fieldName === 'armed_forces') {
      await query(`UPDATE cases SET armed_forces=$1 WHERE id=$2`, [/yes/i.test(value), caseId]);
    } else {
      await query(`UPDATE cases SET ${dbColumn}=$1 WHERE id=$2`, [value, caseId]);
    }
  } catch (err: any) {
    console.error(`[chat] Store field failed: ${err.message}`);
  }
}

function sendToClient(ws: WebSocket, data: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
