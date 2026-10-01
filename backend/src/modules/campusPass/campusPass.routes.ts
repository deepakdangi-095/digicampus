import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';

const router = Router();
export const PASS_TTL_SECONDS = 90;

// GET /api/student/qr-pass — short-lived signed token (verified offline by readers with the shared secret).
// The app re-fetches before expiry and shows the last token when offline until it lapses.
router.get('/qr-pass', authenticate, authorize(Role.STUDENT), (req, res) => {
  const token = jwt.sign({ sub: req.user!.id, typ: 'campus-pass' }, env.CAMPUS_PASS_SECRET, { expiresIn: PASS_TTL_SECONDS });
  res.json({ token, expiresIn: PASS_TTL_SECONDS, issuedAt: new Date().toISOString() });
});

export default router;
