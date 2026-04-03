import { Router, Request, Response } from 'express';
import { queryOne } from '../../db/client';
import { generateProgram } from '../../agents/design/program-generator';
import { generateObituary } from '../../agents/design/obituary-generator';
import { logTimeline } from './timeline-helper';

export const documentsRouter = Router();

// ─── Generate funeral program PDF ───────────────────────────────────────────

documentsRouter.post('/program/:caseId', async (req: Request, res: Response) => {
  try {
    const { template } = req.body;
    const caseData = await queryOne('SELECT * FROM cases WHERE id = $1', [req.params.caseId]);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const obituary = await queryOne('SELECT * FROM obituaries WHERE case_id = $1 ORDER BY version DESC LIMIT 1', [req.params.caseId]);

    const pdfBuffer = await generateProgram(caseData as any, obituary as any, template || 'classic-elegant');

    await logTimeline(req.params.caseId, 'document_generated', 'Funeral program PDF generated', 'design-agent');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="program-${(caseData as any).case_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Generate obituary draft ────────────────────────────────────────────────

documentsRouter.post('/obituary/:caseId', async (req: Request, res: Response) => {
  try {
    const caseData = await queryOne('SELECT * FROM cases WHERE id = $1', [req.params.caseId]);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    const contacts = await import('../../db/client').then(db =>
      db.query('SELECT * FROM case_contacts WHERE case_id = $1', [req.params.caseId])
    );

    const obituary = await generateObituary(caseData as any, contacts as any[]);

    await logTimeline(req.params.caseId, 'document_generated', 'Obituary draft generated', 'design-agent');

    res.json(obituary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
