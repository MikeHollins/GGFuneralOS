import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// ─── Route Imports ──────────────────────────────────────────────────────────
import { casesRouter } from './api/routes/cases';
import { contactsRouter } from './api/routes/contacts';
import { tasksRouter } from './api/routes/tasks';
import { dashboardRouter } from './api/routes/dashboard';
import { maxBridgeRouter } from './api/routes/max-bridge';
import { documentsRouter } from './api/routes/documents';
import { authRouter } from './api/routes/auth';
import { portalRouter } from './api/routes/portal';
import { paymentsRouter } from './api/routes/payments';
import { docusignRouter } from './api/routes/docusign';
import { publicProgramRouter } from './api/routes/public-program';
import { smsWebhookRouter } from './api/routes/sms-webhook';

// ─── Services ───────────────────────────────────────────────────────────────
import { startCronJobs } from './services/cron';
import { sendSms } from './services/twilio';

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());

// Stripe webhook needs raw body — must be before express.json()
app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }));

// All other routes use JSON
app.use(express.json({ limit: '10mb' }));

// Twilio webhooks send form-encoded data
app.use('/api/sms', express.urlencoded({ extended: false }));

// ─── Public Routes (no auth) ────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/portal', portalRouter);
app.use('/program', publicProgramRouter); // QR-accessible program viewer — no /api prefix for clean URLs
app.use('/api/sms', smsWebhookRouter);
app.use('/api/payments/webhook', paymentsRouter); // Stripe webhook
app.use('/api/docusign/webhook', docusignRouter); // DocuSign Connect webhook

// ─── Protected Routes ─────────────────────────────────────────────────��─────
// Auth middleware is applied per-route in each router (requireJWT or API_SECRET)
app.use('/api/cases', casesRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/max', maxBridgeRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/docusign', docusignRouter);

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'GGFuneralOS',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    features: {
      payments: !!process.env.STRIPE_SECRET_KEY,
      docusign: !!process.env.DOCUSIGN_INTEGRATION_KEY,
      email: !!process.env.SENDGRID_API_KEY,
      sms: !!process.env.TWILIO_ACCOUNT_SID,
      ai_obituary: !!process.env.GOOGLE_AI_API_KEY,
    },
  });
});

// ─── Static files (chat widget) ─────────────────────────────────────────────
import * as path from 'path';
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// ─── Start Server ───────────────────────────────────────────────────────────
import { createServer } from 'http';
import { initChatServer } from './services/chat-server';

const httpServer = createServer(app);
initChatServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[ggfuneralos] ✅ Server running on http://localhost:${PORT}`);
  console.log(`[ggfuneralos] Dashboard: http://localhost:3000`);
  console.log(`[ggfuneralos] API: http://localhost:${PORT}/api`);
  console.log(`[ggfuneralos] Max Bridge: http://localhost:${PORT}/api/max`);
  console.log(`[ggfuneralos] Portal: http://localhost:3000/portal/{token}`);
  console.log(`[ggfuneralos] Chat widget: http://localhost:${PORT}/public/chat-widget.js`);

  // ─── Start Cron Jobs ────────────────────────────────────────────────────
  startCronJobs(async (to, body) => { await sendSms(to, body); });
});
