import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db/client';

export const contactsRouter = Router();

contactsRouter.get('/case/:caseId', async (req: Request, res: Response) => {
  try {
    const rows = await query('SELECT * FROM case_contacts WHERE case_id = $1 ORDER BY created_at', [req.params.caseId]);
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

contactsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { case_id, first_name, last_name, relationship, is_nok, is_informant, phone, email, address, city, state, zip, notes } = req.body;
    const row = await queryOne(
      `INSERT INTO case_contacts (case_id, first_name, last_name, relationship, is_nok, is_informant, phone, email, address, city, state, zip, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [case_id, first_name, last_name || null, relationship, is_nok || false, is_informant || false, phone || null, email || null, address || null, city || null, state || null, zip || null, notes || null]
    );
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

contactsRouter.patch('/:id', async (req: Request, res: Response) => {
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
    const row = await queryOne(`UPDATE case_contacts SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (!row) return res.status(404).json({ error: 'Contact not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

contactsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne('DELETE FROM case_contacts WHERE id = $1 RETURNING id', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Contact not found' });
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
