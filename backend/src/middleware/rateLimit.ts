import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

/** Tiny in-memory fixed-window limiter (per process). Swap for Redis if you run several instances. */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = opts.key ? opts.key(req) : req.ip ?? 'unknown';
    const h = hits.get(k);
    if (!h || h.reset < now) {
      hits.set(k, { count: 1, reset: now + opts.windowMs });
      if (hits.size > 10_000) for (const [key, v] of hits) if (v.reset < now) hits.delete(key);
      return next();
    }
    if (++h.count > opts.max) return next(new AppError(429, 'Too many attempts. Please try again later.'));
    next();
  };
}
