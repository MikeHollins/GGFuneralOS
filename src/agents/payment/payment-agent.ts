import { query, queryOne } from '../../db/client';
import { createCustomer, createInvoice, createPaymentPlan } from '../../services/stripe';
import { logTimeline } from '../../api/routes/timeline-helper';

/**
 * Payment Agent — handles all financial operations after arrangement conference.
 *
 * Triggered when: case phase moves to ACTIVE and contract is signed.
 * Responsibilities:
 * - Create Stripe customer from family contact
 * - Generate invoice from case merchandise/service selections
 * - Support Apple Pay / Google Pay / card payments
 * - Track insurance assignments
 * - Follow up on outstanding balances
 */

export async function initiatePayment(caseId: string): Promise<{
  success: boolean;
  invoiceUrl?: string;
  message: string;
}> {
  const caseData = await queryOne('SELECT * FROM cases WHERE id = $1', [caseId]);
  if (!caseData) return { success: false, message: 'Case not found' };

  const c = caseData as any;
  if (!c.total_charges || c.total_charges <= 0) {
    return { success: false, message: 'No charges on this case' };
  }

  // Find NOK contact for billing
  const nok = await queryOne(
    'SELECT * FROM case_contacts WHERE case_id = $1 AND is_nok = true LIMIT 1',
    [caseId]
  );

  if (!nok) return { success: false, message: 'No next-of-kin contact found' };

  const contact = nok as any;
  const name = `${contact.first_name} ${contact.last_name || ''}`.trim();

  try {
    // Create Stripe customer
    const customerId = await createCustomer(name, contact.email, contact.phone);

    // Build line items from case data
    const lineItems: { description: string; amount: number }[] = [];

    if (c.casket_price) lineItems.push({ description: `Casket: ${c.casket_selection || 'Selected'}`, amount: Math.round(c.casket_price * 100) });
    if (c.vault_price) lineItems.push({ description: `Vault: ${c.vault_selection || 'Selected'}`, amount: Math.round(c.vault_price * 100) });
    if (c.urn_price) lineItems.push({ description: `Urn: ${c.urn_selection || 'Selected'}`, amount: Math.round(c.urn_price * 100) });

    // If no individual items, use total as single line item
    if (lineItems.length === 0) {
      lineItems.push({
        description: `Funeral Services — ${c.decedent_first_name} ${c.decedent_last_name}`,
        amount: Math.round(c.total_charges * 100),
      });
    }

    // Create and send invoice
    const { invoiceId, invoiceUrl, total } = await createInvoice(customerId, caseId, lineItems);

    // Record transaction
    await query(
      `INSERT INTO payment_transactions (case_id, amount, method, stripe_invoice_id, stripe_customer_id, description, status)
       VALUES ($1, $2, 'stripe_card', $3, $4, $5, 'pending')`,
      [caseId, c.total_charges, invoiceId, customerId, 'Funeral services invoice']
    );

    await logTimeline(caseId, 'payment_initiated', `Invoice sent: $${c.total_charges.toFixed(2)} → ${contact.email || contact.phone}`, 'payment-agent');

    return { success: true, invoiceUrl, message: `Invoice sent for $${c.total_charges.toFixed(2)}` };
  } catch (err: any) {
    console.error(`[payment-agent] Failed for case ${caseId}: ${err.message}`);
    return { success: false, message: err.message };
  }
}

/**
 * Set up a monthly payment plan for a case.
 */
export async function setupPaymentPlan(
  caseId: string,
  months: number
): Promise<{ success: boolean; monthlyAmount?: number; message: string }> {
  const caseData = await queryOne('SELECT * FROM cases WHERE id = $1', [caseId]);
  if (!caseData) return { success: false, message: 'Case not found' };

  const c = caseData as any;
  const nok = await queryOne('SELECT * FROM case_contacts WHERE case_id = $1 AND is_nok = true LIMIT 1', [caseId]);
  if (!nok) return { success: false, message: 'No NOK contact' };

  const contact = nok as any;
  const name = `${contact.first_name} ${contact.last_name || ''}`.trim();

  try {
    const customerId = await createCustomer(name, contact.email, contact.phone);
    const totalCents = Math.round(c.total_charges * 100);

    const { subscriptionId, monthlyAmount } = await createPaymentPlan(
      customerId, caseId, totalCents, months,
      `Payment plan for ${c.decedent_first_name} ${c.decedent_last_name}`
    );

    await query(
      `INSERT INTO payment_transactions (case_id, amount, method, stripe_payment_id, stripe_customer_id, description, status, metadata)
       VALUES ($1, $2, 'payment_plan', $3, $4, $5, 'processing', $6)`,
      [caseId, c.total_charges, subscriptionId, customerId,
       `Payment plan: ${months} months`, JSON.stringify({ months, monthly_amount: monthlyAmount / 100 })]
    );

    await query('UPDATE cases SET payment_status = $1 WHERE id = $2', ['PAYMENT_PLAN', caseId]);
    await logTimeline(caseId, 'payment_plan_created', `Payment plan: $${(monthlyAmount / 100).toFixed(2)}/mo x ${months} months`, 'payment-agent');

    return { success: true, monthlyAmount: monthlyAmount / 100, message: `Payment plan created: $${(monthlyAmount / 100).toFixed(2)}/mo x ${months} months` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Check for cases with outstanding payments needing follow-up.
 */
export async function checkPaymentFollowUps(): Promise<number> {
  const outstanding = await query(
    `SELECT c.id, c.case_number, c.decedent_first_name, c.decedent_last_name,
            c.total_charges, c.amount_paid, c.payment_status,
            cc.phone, cc.email, cc.first_name as nok_first
     FROM cases c
     LEFT JOIN case_contacts cc ON cc.case_id = c.id AND cc.is_nok = true
     WHERE c.payment_status IN ('PENDING', 'INSURANCE_PENDING', 'PARTIAL')
       AND c.phase IN ('POST_SERVICE', 'AFTERCARE')
       AND c.total_charges > c.amount_paid`
  );

  console.log(`[payment-agent] ${outstanding.length} cases with outstanding balances`);
  return outstanding.length;
}
