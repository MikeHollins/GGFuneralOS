import { query, queryOne } from '../../db/client';
import { logTimeline } from '../../api/routes/timeline-helper';
import { createPortalSession } from '../../services/portal-tokens';
import { sendSms } from '../../services/twilio';
import { deployIntakeAgent } from '../intake/intake-agent';

/**
 * Phase Hooks — triggered when a case moves between phases.
 * Connects the orchestrator to all agents.
 */

export async function onPhaseTransition(
  caseId: string,
  fromPhase: string,
  toPhase: string
): Promise<void> {
  const caseData = await queryOne('SELECT * FROM cases WHERE id = $1', [caseId]);
  if (!caseData) return;
  const c = caseData as any;
  const name = `${c.decedent_first_name} ${c.decedent_last_name}`;

  console.log(`[phase-hooks] Case GG-${c.case_number} (${name}): ${fromPhase} → ${toPhase}`);

  switch (toPhase) {
    case 'PENDING_ARRANGEMENTS':
      await handlePendingArrangements(caseId, c);
      break;
    case 'ACTIVE':
      await handleActive(caseId, c);
      break;
    case 'POST_SERVICE':
      await handlePostService(caseId, c);
      break;
    case 'AFTERCARE':
      await handleAftercare(caseId, c);
      break;
  }
}

/**
 * PENDING_ARRANGEMENTS: Deploy intake agent + portal to family
 */
async function handlePendingArrangements(caseId: string, c: any): Promise<void> {
  // Find NOK contact
  const nok = await queryOne(
    'SELECT * FROM case_contacts WHERE case_id = $1 AND is_nok = true LIMIT 1',
    [caseId]
  );

  if (!nok) {
    console.log(`[phase-hooks] No NOK contact for case ${caseId} — skipping intake deployment`);
    return;
  }

  const contact = nok as any;
  if (!contact.phone) {
    console.log(`[phase-hooks] NOK has no phone for case ${caseId} — skipping`);
    return;
  }

  // Create secure portal session
  const contactName = `${contact.first_name} ${contact.last_name || ''}`.trim();
  const { portalUrl } = await createPortalSession(caseId, contact.phone, contactName);

  // Deploy intake agent
  const decedentName = `${c.decedent_first_name} ${c.decedent_last_name}`;
  await deployIntakeAgent(
    caseId,
    contact.phone,
    decedentName,
    contact.first_name,
    async (to, body) => { await sendSms(to, body); }
  );

  // Send portal link after a delay (agent sends greeting first)
  setTimeout(async () => {
    try {
      await sendSms(
        contact.phone,
        `For photos, documents, and sensitive information, you can use this secure link: ${portalUrl}\n\nYou can also continue texting us here — whatever is easiest for you.`
      );
    } catch (err: any) {
      console.error(`[phase-hooks] Portal link send failed: ${err.message}`);
    }
  }, 10000); // 10 second delay after greeting

  await logTimeline(caseId, 'intake_deployed', `Intake agent + portal deployed to ${contactName} (${contact.phone})`, 'orchestrator');
}

/**
 * ACTIVE: After arrangement conference — trigger DocuSign + design agent
 */
async function handleActive(caseId: string, c: any): Promise<void> {
  // Auto-generate obituary draft
  try {
    const contacts = await query('SELECT * FROM case_contacts WHERE case_id = $1', [caseId]);
    const { generateObituary } = await import('../design/obituary-generator');
    await generateObituary(c, contacts as any[]);
    await logTimeline(caseId, 'obituary_drafted', 'Obituary draft auto-generated from intake data', 'design-agent');
  } catch (err: any) {
    console.error(`[phase-hooks] Obituary generation failed: ${err.message}`);
  }

  // Trigger DocuSign for service contract (if contract not already signed)
  if (!c.contract_signed) {
    try {
      const { isDocuSignConfigured, sendEnvelope } = await import('../../services/docusign');
      if (isDocuSignConfigured()) {
        const nok = await queryOne('SELECT * FROM case_contacts WHERE case_id = $1 AND is_nok = true AND email IS NOT NULL LIMIT 1', [caseId]);
        if (nok) {
          const contact = nok as any;
          const { generateAuthDocument } = await import('../compliance/auth-document-generator');
          const { pdfBuffer, documentName } = await generateAuthDocument(c, contact, 'service_contract');
          await sendEnvelope(caseId, 'service_contract', `${contact.first_name} ${contact.last_name || ''}`.trim(), contact.email, pdfBuffer, documentName);
          await logTimeline(caseId, 'docusign_sent', 'Service contract sent for e-signature', 'orchestrator');
        }
      }
    } catch (err: any) {
      console.error(`[phase-hooks] DocuSign trigger failed: ${err.message}`);
    }
  }
}

/**
 * POST_SERVICE: Trigger payment, file insurance, send thank-you
 */
async function handlePostService(caseId: string, c: any): Promise<void> {
  // Initiate payment if charges exist and not yet paid
  if (c.total_charges > 0 && c.payment_status !== 'PAID') {
    try {
      const { initiatePayment } = await import('../payment/payment-agent');
      const result = await initiatePayment(caseId);
      if (result.success) {
        await logTimeline(caseId, 'payment_initiated', result.message, 'payment-agent');
      }
    } catch (err: any) {
      console.error(`[phase-hooks] Payment initiation failed: ${err.message}`);
    }
  }

  // Send thank-you email
  try {
    const nok = await queryOne('SELECT * FROM case_contacts WHERE case_id = $1 AND is_nok = true AND email IS NOT NULL LIMIT 1', [caseId]);
    if (nok) {
      const { sendAftercareTouchpoint } = await import('../../services/email');
      const contact = nok as any;
      await sendAftercareTouchpoint(
        contact.email,
        contact.first_name,
        `${c.decedent_first_name} ${c.decedent_last_name}`,
        `We hope today's service honored ${c.decedent_first_name}'s memory in the way your family envisioned. If there is anything else we can help with in the days and weeks ahead, please don't hesitate to reach out.`
      );
    }
  } catch (err: any) {
    console.error(`[phase-hooks] Thank-you email failed: ${err.message}`);
  }
}

/**
 * AFTERCARE: Start aftercare touchpoint sequence
 */
async function handleAftercare(caseId: string, c: any): Promise<void> {
  await logTimeline(caseId, 'aftercare_started', 'Aftercare program initiated — follow-up touchpoints scheduled', 'orchestrator');

  // Social media memorial auto-publish
  try {
    const obit = await queryOne('SELECT * FROM obituaries WHERE case_id = $1 AND status IN (\'APPROVED\', \'PUBLISHED\') LIMIT 1', [caseId]);
    if (obit) {
      const { generateMemorialPost } = await import('../design/social-post-generator');
      const posts = generateMemorialPost(
        `${c.decedent_first_name} ${c.decedent_last_name}`,
        (obit as any).summary_text || (obit as any).full_text?.slice(0, 300) || '',
        c.service_date,
        c.service_location
      );
      const { schedulePost } = await import('./../../agents/webmaster/social-publisher');
      // Schedule posts for tomorrow morning 9am
      const tomorrow9am = new Date();
      tomorrow9am.setDate(tomorrow9am.getDate() + 1);
      tomorrow9am.setHours(9, 0, 0, 0);

      for (const post of posts) {
        await schedulePost(caseId, post.platform, post.content, post.post_type, post.cta_text, post.cta_url, tomorrow9am);
      }
      await logTimeline(caseId, 'social_scheduled', `Memorial posts scheduled for ${posts.length} platforms`, 'webmaster-agent');
    }
  } catch (err: any) {
    console.error(`[phase-hooks] Social media scheduling failed: ${err.message}`);
  }
}
