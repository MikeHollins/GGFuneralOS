import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { casesRouter } from './api/routes/cases';
import { contactsRouter } from './api/routes/contacts';
import { tasksRouter } from './api/routes/tasks';
import { dashboardRouter } from './api/routes/dashboard';
import { maxBridgeRouter } from './api/routes/max-bridge';
import { documentsRouter } from './api/routes/documents';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/cases', casesRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/max', maxBridgeRouter);
app.use('/api/documents', documentsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'GGFuneralOS', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[ggfuneralos] ✅ Server running on http://localhost:${PORT}`);
  console.log(`[ggfuneralos] Dashboard: http://localhost:${PORT}`);
  console.log(`[ggfuneralos] API: http://localhost:${PORT}/api`);
  console.log(`[ggfuneralos] Max Bridge: http://localhost:${PORT}/api/max`);
});
