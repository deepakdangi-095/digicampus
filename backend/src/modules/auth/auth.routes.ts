import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { signAuthToken } from '../../utils/jwt';
import { authenticate } from '../../middleware/auth.middleware';
import { rateLimit } from '../../middleware/rateLimit';

const router = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const publicUser = (u: { id: string; name: string; email: string; role: string; branch: string | null }) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, branch: u.branch,
});

// Precomputed so unknown emails cost the same as wrong passwords (no user-enumeration timing signal).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// POST /api/auth/login — the role lives on the User row, never in the request body.
router.post(
  '/login',
  rateLimit({ windowMs: 15 * 60_000, max: 20, key: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}` }),
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid credentials payload', parsed.error.flatten());
    const email = parsed.data.email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new AppError(401, 'Invalid email or password');

    const token = signAuthToken({ id: user.id, role: user.role, email: user.email, branch: user.branch });
    res.json({ token, user: publicUser(user) });
  })
);

// GET /api/auth/me — used by the apps to restore a session on launch.
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(401, 'Account no longer exists');
    res.json({ user: publicUser(user) });
  })
);

export default router;
