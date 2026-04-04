import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../db/client';
import { hashPassword, verifyPassword, hashPin, verifyPin } from '../../services/crypto';
import { signToken } from '../middleware/jwt-auth';

export const authRouter = Router();

// ─── Login (email + password) ───────────────────────────────────────────────

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, pin } = req.body;

    let staff: any;

    if (email && password) {
      staff = await queryOne('SELECT * FROM staff WHERE email = $1 AND is_active = true', [email]);
      if (!staff || !staff.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
      const valid = await verifyPassword(password, staff.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    } else if (pin) {
      const pinHash = hashPin(pin);
      staff = await queryOne('SELECT * FROM staff WHERE pin_hash = $1 AND is_active = true', [pinHash]);
      if (!staff) return res.status(401).json({ error: 'Invalid PIN' });
    } else {
      return res.status(400).json({ error: 'Provide email+password or pin' });
    }

    // Update last login
    await query('UPDATE staff SET last_login = now() WHERE id = $1', [staff.id]);

    const token = signToken({
      staff_id: staff.id,
      role: staff.role,
      first_name: staff.first_name,
      last_name: staff.last_name,
    });

    res.json({
      token,
      staff: {
        id: staff.id,
        first_name: staff.first_name,
        last_name: staff.last_name,
        role: staff.role,
        email: staff.email,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Create staff account (admin only in production, open in dev) ───────────

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, password, pin, role, phone } = req.body;

    if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name required' });

    const passwordHash = password ? await hashPassword(password) : null;
    const pinHash = pin ? hashPin(pin) : null;

    const staff = await queryOne(
      `INSERT INTO staff (first_name, last_name, email, password_hash, pin_hash, role, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, first_name, last_name, email, role`,
      [first_name, last_name, email || null, passwordHash, pinHash, role || 'staff', phone || null]
    );

    res.status(201).json(staff);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Verify token (for dashboard auth check) ───────────────────────────────

authRouter.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });

  try {
    const { verifyToken } = await import('../middleware/jwt-auth');
    const payload = verifyToken(authHeader.slice(7));
    const staff = await queryOne(
      'SELECT id, first_name, last_name, email, role FROM staff WHERE id = $1',
      [payload.staff_id]
    );
    if (!staff) return res.status(401).json({ error: 'Staff not found' });
    res.json(staff);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});
