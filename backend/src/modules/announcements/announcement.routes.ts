import { Router } from 'express';
import { z } from 'zod';
import { AnnouncementType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';

const router = Router();

// GET /api/announcements?type=HACKATHON — notices, hackathons, workshops and placement drives.
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const t = req.query.type;
  const type = typeof t === 'string' && (Object.values(AnnouncementType) as string[]).includes(t) ? (t as AnnouncementType) : undefined;
  res.json(await prisma.announcement.findMany({ where: { type }, orderBy: { createdAt: 'desc' }, take: 50 }));
}));

const createSchema = z.object({ title: z.string().min(3).max(140), body: z.string().min(3).max(2000), type: z.nativeEnum(AnnouncementType).default('GENERAL') });

// POST /api/announcements — staff publish notices
router.post('/', authenticate, authorize(Role.FACULTY, Role.HOD, Role.DEAN, Role.ADMIN), asyncHandler(async (req, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, 'Invalid announcement', p.error.flatten());
  res.status(201).json(await prisma.announcement.create({ data: p.data }));
}));

export default router;
