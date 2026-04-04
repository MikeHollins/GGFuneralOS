import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { validatePortalToken, updatePortalProgress, completePortalSession, setScheduledDate } from '../../services/portal-tokens';
import { saveUploadedFile } from '../../services/uploads';
import * as multer from 'multer';

export const portalRouter = Router();

const upload = multer.default({ limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max

// ─── Validate token + get session context ───────────────────────────────────

portalRouter.get('/:token', async (req: Request, res: Response) => {
  try {
    const session = await validatePortalToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Invalid or expired link' });

    res.json({
      case_id: session.case_id,
      case_number: session.case_number,
      decedent_name: `${session.decedent_first_name} ${session.decedent_last_name}`,
      contact_name: session.contact_name,
      fields_completed: session.fields_completed,
      files_uploaded: session.files_uploaded,
      scheduled_date: session.scheduled_date,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Submit a field value ───────────────────────────────────────────────────

portalRouter.post('/:token/field', async (req: Request, res: Response) => {
  try {
    const session = await validatePortalToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Invalid or expired link' });

    const { field_id, value } = req.body;
    if (!field_id) return res.status(400).json({ error: 'field_id required' });

    // Store directly to case or obituary table based on field mapping
    // Fields starting with _ go to obituary biographical_data
    if (field_id.startsWith('_')) {
      const key = field_id.slice(1);
      await query(
        `INSERT INTO obituaries (case_id, biographical_data, status)
         VALUES ($1, jsonb_build_object($2, $3), 'DRAFT')
         ON CONFLICT (case_id) DO UPDATE
         SET biographical_data = obituaries.biographical_data || jsonb_build_object($2, $3)`,
        [session.case_id, key, value]
      );
    } else {
      await query(`UPDATE cases SET ${field_id} = $1 WHERE id = $2`, [value, session.case_id]);
    }

    await updatePortalProgress(req.params.token, field_id, value);

    res.json({ success: true, field_id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Upload a file ──────────────────────────────────────────────────────────

portalRouter.post('/:token/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const session = await validatePortalToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Invalid or expired link' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const result = await saveUploadedFile(
      session.case_id,
      file.buffer,
      file.originalname,
      file.mimetype,
      'portal'
    );

    res.json({ success: true, file_id: result.fileId, filename: file.originalname });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Schedule arrangement conference ────────────────────────────────────────

portalRouter.post('/:token/schedule', async (req: Request, res: Response) => {
  try {
    const session = await validatePortalToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Invalid or expired link' });

    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });

    await setScheduledDate(req.params.token, date);
    await query('UPDATE cases SET arrangement_conference_date = $1 WHERE id = $2', [date, session.case_id]);

    res.json({ success: true, scheduled_date: date });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get package info (links to website, NO prices per FTC) ─────────────────

portalRouter.get('/:token/packages', async (req: Request, res: Response) => {
  try {
    const session = await validatePortalToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Invalid or expired link' });

    const website = process.env.FUNERAL_HOME_WEBSITE || 'https://kcgoldengate.com';

    res.json({
      packages: [
        { name: 'The Direct', description: 'Simple cremation with dignity', url: `${website}/packages` },
        { name: 'The Memorial', description: 'Memorial service celebrating their life', url: `${website}/packages` },
        { name: 'The Noble', description: 'Cremation with visitation for family and friends', url: `${website}/packages` },
        { name: 'The Formal', description: 'Traditional funeral service with graveside', url: `${website}/packages` },
        { name: 'The Prestige', description: 'Enhanced funeral with premium selections', url: `${website}/packages` },
        { name: 'The Gold', description: 'Full service with extended visitation', url: `${website}/packages` },
        { name: 'The Imperial', description: 'Premium tribute with video and florals', url: `${website}/packages` },
        { name: 'The Royal', description: 'The complete experience with all honors', url: `${website}/packages` },
      ],
      note: 'Visit our website for detailed package information and pricing. Our team will discuss all options during your arrangement conference.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Mark complete ──────────────────────────────────────────────────────────

portalRouter.post('/:token/complete', async (req: Request, res: Response) => {
  try {
    const session = await validatePortalToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Invalid or expired link' });

    await completePortalSession(req.params.token);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
