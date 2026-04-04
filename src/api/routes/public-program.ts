import { Router, Request, Response } from 'express';
import { queryOne, query } from '../../db/client';
import * as QRCode from 'qrcode';

/**
 * Public Program Viewer — no authentication required.
 *
 * Families and guests scan a QR code at the service → opens the funeral
 * program as a beautiful in-browser PDF. No app needed, no login.
 *
 * Endpoints:
 * - GET /program/:caseId      → serves program PDF inline (viewable in browser)
 * - GET /program/:caseId/qr   → returns QR code image (PNG) linking to the program
 * - GET /program/:caseId/card → returns a printable QR card for display at the service
 */

export const publicProgramRouter = Router();

// ─── View program in browser ────────────────────────────────────────────────

publicProgramRouter.get('/:caseId', async (req: Request, res: Response) => {
  try {
    const caseData = await queryOne('SELECT * FROM cases WHERE id = $1', [req.params.caseId]);
    if (!caseData) return res.status(404).send('Program not found');

    const c = caseData as any;
    const obituary = await queryOne('SELECT * FROM obituaries WHERE case_id = $1 ORDER BY version DESC LIMIT 1', [req.params.caseId]);

    // Get the appropriate template
    const { getTemplate, suggestTemplate } = await import('../../agents/design/template-registry');
    const program = await queryOne('SELECT template_name FROM programs WHERE case_id = $1 ORDER BY version DESC LIMIT 1', [req.params.caseId]);
    const templateId = (program as any)?.template_name;
    const template = templateId ? getTemplate(templateId) : suggestTemplate(c);

    if (!template) return res.status(500).send('Template not available');

    const pdfBuffer = await template.render(c, obituary as any);

    const fullName = [c.decedent_first_name, c.decedent_middle_name, c.decedent_last_name].filter(Boolean).join(' ');

    // Serve inline (viewable in browser) not as download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Program - ${fullName}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // cache 1 hour
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error(`[public-program] Error: ${err.message}`);
    res.status(500).send('Unable to generate program');
  }
});

// ─── QR Code (PNG image) ────────────────────────────────────────────────────

publicProgramRouter.get('/:caseId/qr', async (req: Request, res: Response) => {
  try {
    const caseData = await queryOne('SELECT id FROM cases WHERE id = $1', [req.params.caseId]);
    if (!caseData) return res.status(404).send('Case not found');

    const baseUrl = process.env.PUBLIC_URL || process.env.DASHBOARD_URL || `http://localhost:${process.env.PORT || 4000}`;
    const programUrl = `${baseUrl}/program/${req.params.caseId}`;

    const qrBuffer = await QRCode.toBuffer(programUrl, {
      type: 'png',
      width: 400,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
      errorCorrectionLevel: 'H', // high — works even if partially obscured
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(qrBuffer);
  } catch (err: any) {
    res.status(500).send('Unable to generate QR code');
  }
});

// ─── Printable QR Card (HTML page for printing) ─────────────────────────────
// Print this and display on an easel or table at the service entrance.

publicProgramRouter.get('/:caseId/card', async (req: Request, res: Response) => {
  try {
    const caseData = await queryOne('SELECT * FROM cases WHERE id = $1', [req.params.caseId]);
    if (!caseData) return res.status(404).send('Case not found');

    const c = caseData as any;
    const fullName = [c.decedent_first_name, c.decedent_middle_name, c.decedent_last_name].filter(Boolean).join(' ');
    const baseUrl = process.env.PUBLIC_URL || process.env.DASHBOARD_URL || `http://localhost:${process.env.PORT || 4000}`;
    const programUrl = `${baseUrl}/program/${c.id}`;
    const qrUrl = `${baseUrl}/program/${c.id}/qr`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Digital Program — ${fullName}</title>
  <style>
    @media print { body { margin: 0; } .no-print { display: none; } }
    body { font-family: Georgia, serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f7; }
    .card { background: white; width: 5in; padding: 40px; text-align: center; border: 2px solid #1a1a2e; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
    .header { color: #c9a96e; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
    .name { color: #1a1a2e; font-size: 24px; font-weight: bold; margin: 16px 0 8px; }
    .divider { width: 60px; height: 2px; background: #c9a96e; margin: 16px auto; }
    .qr { margin: 24px auto; }
    .qr img { width: 200px; height: 200px; }
    .instruction { color: #666; font-size: 13px; line-height: 1.6; margin-top: 16px; }
    .url { color: #999; font-size: 10px; margin-top: 12px; word-break: break-all; }
    .footer { color: #c9a96e; font-size: 10px; margin-top: 24px; }
    .print-btn { margin-top: 20px; padding: 10px 24px; background: #1a1a2e; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
  </style>
</head>
<body>
  <div>
    <div class="card">
      <div class="header">Digital Service Program</div>
      <div class="name">${fullName}</div>
      <div class="divider"></div>
      <div class="qr"><img src="${qrUrl}" alt="QR Code" /></div>
      <div class="instruction">
        Scan this code with your phone camera<br>
        to view the service program
      </div>
      <div class="url">${programUrl}</div>
      <div class="divider"></div>
      <div class="footer">KC Golden Gate Funeral Home</div>
    </div>
    <div class="no-print" style="text-align:center">
      <button class="print-btn" onclick="window.print()">Print This Card</button>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err: any) {
    res.status(500).send('Unable to generate QR card');
  }
});
