import { Request, Response, NextFunction } from 'express';

/**
 * Simple API key auth for the Max bridge and staff dashboard.
 * Checks for x-api-key header matching API_SECRET env var.
 * If API_SECRET is not set, all requests pass (dev mode).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.API_SECRET;
  if (!secret) return next(); // dev mode — no auth

  const provided = req.headers['x-api-key'] as string;
  if (provided === secret) return next();

  res.status(401).json({ error: 'Unauthorized' });
}
