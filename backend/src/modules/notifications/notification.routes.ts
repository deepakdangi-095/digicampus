import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

// GET /api/notifications?unread=1 — newest first, plus the unread count for the app's badge.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId, ...(req.query.unread ? { read: false } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);
    res.json({ unread, items });
  })
);

router.put(
  '/read-all',
  asyncHandler(async (req, res) => {
    const r = await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
    res.json({ updated: r.count });
  })
);

router.put(
  '/:id/read',
  asyncHandler(async (req, res) => {
    // userId in the filter = only my own notifications can be touched
    const r = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { read: true } });
    res.json({ updated: r.count });
  })
);

export default router;
