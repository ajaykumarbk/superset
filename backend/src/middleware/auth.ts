// backend/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && (req.session as Record<string, unknown>).userId) {
    next();
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
}
