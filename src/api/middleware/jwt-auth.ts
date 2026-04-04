import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || process.env.API_SECRET || 'dev-secret-change-me';
const JWT_EXPIRY = '24h';

export interface StaffPayload {
  staff_id: string;
  role: string;
  first_name: string;
  last_name: string;
}

declare global {
  namespace Express {
    interface Request {
      staff?: StaffPayload;
    }
  }
}

export function signToken(payload: StaffPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): StaffPayload {
  return jwt.verify(token, JWT_SECRET) as StaffPayload;
}

/**
 * JWT auth middleware. Extracts token from Authorization: Bearer <token> header.
 * Also accepts x-api-key for Max bridge backward compatibility.
 */
export function requireJWT(req: Request, res: Response, next: NextFunction): void {
  // Max bridge backward compat: API_SECRET header bypasses JWT
  const apiSecret = process.env.API_SECRET;
  const apiKey = req.headers['x-api-key'] as string;
  if (apiSecret && apiKey === apiSecret) {
    req.staff = { staff_id: 'max', role: 'admin', first_name: 'M.A.X.', last_name: '' };
    return next();
  }

  // Dev mode: no JWT_SECRET set → skip auth
  if (!process.env.JWT_SECRET && !process.env.API_SECRET) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    req.staff = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Role-based authorization. Use after requireJWT.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.staff) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.staff.role)) {
      res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}
