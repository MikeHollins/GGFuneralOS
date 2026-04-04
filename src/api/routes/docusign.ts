import { Router, Request, Response } from 'express';
import { sendEnvelope, getCaseEnvelopes, resendReminder, processWebhook, isDocuSignConfigured } from '../../services/docusign';
import { queryOne } from '../../db/client';

export const docusignRouter = Router();

// ─── Send document for signing ───────────────────��──────────────────────────

docusignRouter.post('/send/:caseId', async (req: Request, res: Response) => {
  try {
    if (!isDocuSignConfigured()) {
      return res.status(503).json({ error: 'DocuSign not configured' });
    }

    const { doc_type } = req.body; // embalming_auth, cremation_auth, service_contract, insurance_assignment
    if (!doc_type) return res.status(400).json({ error: 'doc_type required' });

    const caseData = await queryOne('SELECT * FROM cases WHERE id = $1', [req.params.caseId]);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    // Find signer (NOK)
    const nok = await queryOne(
      'SELECT * FROM case_contacts WHERE case_id = $1 AND is_nok = true LIMIT 1',
      [req.params.caseId]
    );
    if (!nok) return res.status(400).json({ error: 'No next-of-kin contact with email' });

    const contact = nok as any;
    if (!contact.email) return res.status(400).json({ error: 'NOK contact has no email address' });

    // Generate the document PDF
    const { generateAuthDocument } = await import('../../agents/compliance/auth-document-generator');
    const { pdfBuffer, documentName } = await generateAuthDocument(caseData as any, contact, doc_type);

    const result = await sendEnvelope(
      req.params.caseId,
      doc_type,
      `${contact.first_name} ${contact.last_name || ''}`.trim(),
      contact.email,
      pdfBuffer,
      documentName
    );

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get envelope status for a case ─────────────────��───────────────────────

docusignRouter.get('/case/:caseId', async (req: Request, res: Response) => {
  try {
    const envelopes = await getCaseEnvelopes(req.params.caseId);
    res.json({ data: envelopes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─��─ Resend reminder ──────────────��─────────────────────────────────────────

docusignRouter.post('/remind/:envelopeId', async (req: Request, res: Response) => {
  try {
    await resendReminder(req.params.envelopeId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DocuSign Connect Webhook ───────────────────────────────────────────────

docusignRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    await processWebhook(req.body);
    res.json({ received: true });
  } catch (err: any) {
    console.error(`[docusign-webhook] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});
