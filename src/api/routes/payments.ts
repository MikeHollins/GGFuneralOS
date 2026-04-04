import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { initiatePayment, setupPaymentPlan } from '../../agents/payment/payment-agent';
import { constructWebhookEvent } from '../../services/stripe';
import { logTimeline } from './timeline-helper';

export const paymentsRouter = Router();

// ─── Initiate payment (generate invoice) ────────────────────────────────────

paymentsRouter.post('/initiate/:caseId', async (req: Request, res: Response) => {
  try {
    const result = await initiatePayment(req.params.caseId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Set up payment plan ────────────────────────────────────────────────────

paymentsRouter.post('/plan/:caseId', async (req: Request, res: Response) => {
  try {
    const { months = 6 } = req.body;
    const result = await setupPaymentPlan(req.params.caseId, months);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get transactions for a case ────────────────────────────────────────────

paymentsRouter.get('/case/:caseId', async (req: Request, res: Response) => {
  try {
    const rows = await query(
      'SELECT * FROM payment_transactions WHERE case_id = $1 ORDER BY created_at DESC',
      [req.params.caseId]
    );
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get all outstanding payments ───────────────────────────────────────────

paymentsRouter.get('/outstanding', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT c.id, c.case_number, c.decedent_first_name, c.decedent_last_name,
              c.total_charges, c.amount_paid, c.payment_status,
              c.total_charges - c.amount_paid as balance_due,
              c.service_date
       FROM cases c
       WHERE c.payment_status NOT IN ('PAID')
         AND c.total_charges > c.amount_paid
         AND c.phase NOT IN ('FIRST_CALL', 'ARCHIVED')
       ORDER BY (c.total_charges - c.amount_paid) DESC`
    );
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Insurance claims CRUD ──────────────────────────────────────────────────

paymentsRouter.get('/insurance', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT ic.*, c.case_number, c.decedent_first_name, c.decedent_last_name
       FROM insurance_claims ic
       JOIN cases c ON c.id = ic.case_id
       WHERE ic.status NOT IN ('paid', 'denied')
       ORDER BY ic.date_filed NULLS FIRST`
    );
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

paymentsRouter.post('/insurance', async (req: Request, res: Response) => {
  try {
    const { case_id, insurer_name, policy_number, face_amount, assigned_amount, beneficiary_name, insurer_phone } = req.body;
    const row = await query(
      `INSERT INTO insurance_claims (case_id, insurer_name, policy_number, face_amount, assigned_amount, beneficiary_name, insurer_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [case_id, insurer_name, policy_number || null, face_amount || null, assigned_amount || null, beneficiary_name || null, insurer_phone || null]
    );
    await logTimeline(case_id, 'insurance_claim_created', `Insurance claim filed: ${insurer_name}`, 'payment-agent');
    res.status(201).json(row[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

paymentsRouter.patch('/insurance/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'case_id' || key === 'created_at') continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
    if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    const rows = await query(`UPDATE insurance_claims SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (rows.length === 0) return res.status(404).json({ error: 'Claim not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stripe Webhook ─────────────────────────────────────────────────────────
// Note: This route needs raw body parsing — configured in index.ts

paymentsRouter.post('/webhook/stripe', async (req: Request, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const event = constructWebhookEvent(req.body, sig);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as any;
        await query(
          `UPDATE payment_transactions SET status = 'succeeded', receipt_url = $1 WHERE stripe_payment_id = $2`,
          [pi.charges?.data?.[0]?.receipt_url || null, pi.id]
        );
        // Update case payment status
        if (pi.metadata?.case_id) {
          const paid = await query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM payment_transactions WHERE case_id = $1 AND status = 'succeeded'`,
            [pi.metadata.case_id]
          );
          const totalPaid = Number((paid[0] as any).total);
          const caseData = await query('SELECT total_charges FROM cases WHERE id = $1', [pi.metadata.case_id]);
          const totalCharges = Number((caseData[0] as any)?.total_charges || 0);
          const newStatus = totalPaid >= totalCharges ? 'PAID' : 'PARTIAL';
          await query('UPDATE cases SET amount_paid = $1, payment_status = $2 WHERE id = $3', [totalPaid, newStatus, pi.metadata.case_id]);
          await logTimeline(pi.metadata.case_id, 'payment_received', `Payment received: $${(pi.amount / 100).toFixed(2)}`, 'stripe');
        }
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as any;
        await query(
          `UPDATE payment_transactions SET status = 'succeeded' WHERE stripe_invoice_id = $1`,
          [inv.id]
        );
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as any;
        await query(`UPDATE payment_transactions SET status = 'failed' WHERE stripe_payment_id = $1`, [pi.id]);
        break;
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error(`[stripe-webhook] Error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});
