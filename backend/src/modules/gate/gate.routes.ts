import { NextFunction, Request, Response, Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { GateKind } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';

const router = Router();

// Turnstiles, library and cafeteria readers authenticate with a shared device key, not a user login.
function deviceKey(req: Request, _res: Response, next: NextFunction) {
  const expected = env.GATE_API_KEY;
  if (!expected) return next(new AppError(503, 'Gate integration is not configured (set GATE_API_KEY)'));
  const given = String(req.headers['x-gate-key'] ?? '');
  const ok = given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  next(ok ? undefined : new AppError(401, 'Invalid gate device key'));
}

const scanSchema = z.object({ token: z.string().min(10), kind: z.nativeEnum(GateKind).default(GateKind.GATE), location: z.string().max(80).optional() });

// POST /api/gate/scan — verify a campus-pass QR and log the entry. Also usable for library issue / cafeteria.
router.post('/scan', deviceKey, asyncHandler(async (req, res) => {
  const p = scanSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, 'Invalid scan payload', p.error.flatten());
  let sub: string;
  try {
    const payload = jwt.verify(p.data.token, env.CAMPUS_PASS_SECRET) as jwt.JwtPayload;
    if (payload.typ !== 'campus-pass' || !payload.sub) throw new Error('wrong token type');
    sub = payload.sub;
  } catch {
    return res.status(403).json({ allowed: false, reason: 'Pass is invalid or expired' });
  }
  const student = await prisma.user.findUnique({ where: { id: sub }, select: { id: true, name: true, branch: true } });
  if (!student) return res.status(403).json({ allowed: false, reason: 'Unknown student' });
  await prisma.gateEvent.create({ data: { userId: student.id, kind: p.data.kind, location: p.data.location } });
  res.json({ allowed: true, student });
}));

// GET /api/gate/events — recent entries for the security dashboard
router.get('/events', authenticate, authorize(Role.ADMIN, Role.DEAN), asyncHandler(async (_req, res) => {
  res.json(await prisma.gateEvent.findMany({ orderBy: { at: 'desc' }, take: 100, include: { user: { select: { name: true, branch: true } } } }));
}));

export default router;
