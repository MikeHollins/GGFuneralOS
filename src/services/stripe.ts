import Stripe from 'stripe';
import 'dotenv/config';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    if (!STRIPE_SECRET) throw new Error('[stripe] STRIPE_SECRET_KEY not configured');
    stripeClient = new Stripe(STRIPE_SECRET);
  }
  return stripeClient;
}

// ─── Customers ──────────────────────────────────────────────────────────────

export async function createCustomer(name: string, email?: string, phone?: string): Promise<string> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name,
    email: email || undefined,
    phone: phone || undefined,
    metadata: { source: 'ggfuneralos' },
  });
  console.log(`[stripe] Customer created: ${customer.id}`);
  return customer.id;
}

// ─── Payment Intents (one-time payments, supports Apple Pay / Google Pay) ───

export async function createPaymentIntent(
  amount: number, // in cents
  customerId: string,
  caseId: string,
  description: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    customer: customerId,
    description,
    metadata: { case_id: caseId },
    automatic_payment_methods: { enabled: true }, // enables Apple Pay, Google Pay, cards
  });
  console.log(`[stripe] PaymentIntent created: ${intent.id} for $${(amount / 100).toFixed(2)}`);
  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
}

// ─── Invoices (emailed payment links) ───────────────────────────────────────

export async function createInvoice(
  customerId: string,
  caseId: string,
  lineItems: { description: string; amount: number }[], // amounts in cents
  daysUntilDue = 30
): Promise<{ invoiceId: string; invoiceUrl: string; total: number }> {
  const stripe = getStripe();

  for (const item of lineItems) {
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: item.amount,
      currency: 'usd',
      description: item.description,
    });
  }

  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: daysUntilDue,
    metadata: { case_id: caseId },
    auto_advance: true,
  });

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  console.log(`[stripe] Invoice ${finalized.id} sent — $${((finalized.amount_due ?? 0) / 100).toFixed(2)}`);
  return {
    invoiceId: finalized.id,
    invoiceUrl: finalized.hosted_invoice_url || '',
    total: finalized.amount_due ?? 0,
  };
}

// ─── Payment Plans (Stripe subscriptions with installments) ─────────────────

export async function createPaymentPlan(
  customerId: string,
  caseId: string,
  totalAmount: number, // in cents
  months: number,
  description: string
): Promise<{ subscriptionId: string; monthlyAmount: number }> {
  const stripe = getStripe();
  const monthlyAmount = Math.ceil(totalAmount / months);

  // Create a product for this payment plan
  const product = await stripe.products.create({
    name: `Payment Plan — Case ${caseId}`,
    metadata: { case_id: caseId },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: monthlyAmount,
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1 },
    metadata: { case_id: caseId, total_amount: String(totalAmount) },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: price.id }],
    metadata: { case_id: caseId, description },
    cancel_at: new Date(Date.now() + months * 30 * 86400000).toISOString() as any,
  });

  console.log(`[stripe] Payment plan created: ${subscription.id} — $${(monthlyAmount / 100).toFixed(2)}/mo x ${months}`);
  return { subscriptionId: subscription.id, monthlyAmount };
}

// ─── Payment Status ─────────────────────────────────────────────────────────

export async function getPaymentStatus(paymentIntentId: string): Promise<string> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return intent.status;
}

// ─── Webhook Verification ───────────────────────────────────────────────────

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('[stripe] STRIPE_WEBHOOK_SECRET not configured');
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
