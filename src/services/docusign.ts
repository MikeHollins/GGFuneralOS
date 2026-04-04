import 'dotenv/config';
import { query, queryOne } from '../db/client';

/**
 * DocuSign E-Signature Service
 *
 * Uses DocuSign eSignature REST API v2.1.
 * Handles envelope creation, status tracking, and webhook processing.
 *
 * Auth: JWT grant flow (server-to-server, no user interaction needed).
 */

const DOCUSIGN_BASE = process.env.DOCUSIGN_BASE_URL || 'https://demo.docusign.net/restapi';
const DOCUSIGN_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;
const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY;
const USER_ID = process.env.DOCUSIGN_USER_ID;

// Simple in-memory token cache
let accessToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  if (!INTEGRATION_KEY || !USER_ID) {
    throw new Error('[docusign] DOCUSIGN_INTEGRATION_KEY and DOCUSIGN_USER_ID required');
  }

  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY;
  if (!privateKey) throw new Error('[docusign] DOCUSIGN_PRIVATE_KEY required');

  // JWT grant — construct assertion
  const now = Math.floor(Date.now() / 1000);
  const jwt = await import('jsonwebtoken');
  const assertion = jwt.default.sign(
    {
      iss: INTEGRATION_KEY,
      sub: USER_ID,
      aud: 'account-d.docusign.com',
      iat: now,
      exp: now + 3600,
      scope: 'signature impersonation',
    },
    privateKey.replace(/\\n/g, '\n'),
    { algorithm: 'RS256' }
  );

  const res = await fetch('https://account-d.docusign.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(`[docusign] Auth failed: ${data.error || JSON.stringify(data)}`);

  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken!;
}

// ─── Send Envelope ──────────────────────────────────────────────────────────

export async function sendEnvelope(
  caseId: string,
  docType: string,
  signerName: string,
  signerEmail: string,
  pdfBuffer: Buffer,
  documentName: string
): Promise<{ envelopeId: string }> {
  const token = await getAccessToken();

  const envelopeDefinition = {
    emailSubject: `KC Golden Gate — Document for Signature: ${documentName}`,
    emailBlurb: 'Please review and sign the attached document at your convenience.',
    documents: [
      {
        documentBase64: pdfBuffer.toString('base64'),
        name: documentName,
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: {
      signers: [
        {
          email: signerEmail,
          name: signerName,
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            signHereTabs: [{ anchorString: '/sig1/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-10' }],
            dateSignedTabs: [{ anchorString: '/date1/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-10' }],
          },
        },
      ],
    },
    status: 'sent',
  };

  const res = await fetch(`${DOCUSIGN_BASE}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelopeDefinition),
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(`[docusign] Send failed: ${data.message || JSON.stringify(data)}`);

  const envelopeId = data.envelopeId;

  // Record in DB
  await query(
    `INSERT INTO docusign_envelopes (case_id, doc_type, envelope_id, signer_name, signer_email, status, sent_at)
     VALUES ($1, $2, $3, $4, $5, 'sent', now())`,
    [caseId, docType, envelopeId, signerName, signerEmail]
  );

  console.log(`[docusign] Envelope ${envelopeId} sent for ${docType} — ${signerName}`);
  return { envelopeId };
}

// ─── Get Envelope Status ────────────────────────────────────────────────────

export async function getEnvelopeStatus(envelopeId: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${DOCUSIGN_BASE}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: any = await res.json();
  return data.status;
}

// ─── Process Webhook (DocuSign Connect) ─────────────────────────────────────

export async function processWebhook(payload: any): Promise<void> {
  const envelopeId = payload.envelopeId || payload.data?.envelopeId;
  const status = payload.status || payload.data?.envelopeSummary?.status;

  if (!envelopeId) return;

  const updates: Record<string, any> = { status };
  if (status === 'completed') updates.signed_at = new Date().toISOString();
  if (status === 'declined') updates.declined_at = new Date().toISOString();
  if (status === 'delivered') updates.viewed_at = new Date().toISOString();

  const setClauses = Object.entries(updates).map(([k], i) => `${k} = $${i + 1}`);
  const values = Object.values(updates);
  values.push(envelopeId);

  await query(
    `UPDATE docusign_envelopes SET ${setClauses.join(', ')} WHERE envelope_id = $${values.length}`,
    values
  );

  console.log(`[docusign] Webhook: envelope ${envelopeId} → ${status}`);
}

// ─── Resend Reminder ────────────────────────────────────────────────────────

export async function resendReminder(envelopeId: string): Promise<void> {
  const token = await getAccessToken();
  await fetch(`${DOCUSIGN_BASE}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'sent' }),
  });

  await query(
    `UPDATE docusign_envelopes SET reminder_count = reminder_count + 1, last_reminder_at = now() WHERE envelope_id = $1`,
    [envelopeId]
  );

  console.log(`[docusign] Reminder sent for envelope ${envelopeId}`);
}

// ─── Get All Envelopes for a Case ───────────────────────────────────────────

export async function getCaseEnvelopes(caseId: string) {
  return query('SELECT * FROM docusign_envelopes WHERE case_id = $1 ORDER BY created_at DESC', [caseId]);
}

// ─── Check if DocuSign is configured ────────────────────────────────────────

export function isDocuSignConfigured(): boolean {
  return !!(DOCUSIGN_ACCOUNT_ID && INTEGRATION_KEY && USER_ID && process.env.DOCUSIGN_PRIVATE_KEY);
}
