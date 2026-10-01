import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { careerAdvice } from '../ai/ai.service';

const router = Router();

// GET /api/student/profile — the student's own academic profile (semester, CGPA, skills, hostel, bus).
router.get('/profile', authenticate, authorize(Role.STUDENT), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { studentProfile: true } });
  if (!user?.studentProfile) throw new AppError(404, 'Student profile not found');
  const { passwordHash, ...safe } = user;
  res.json(safe);
}));

// GET /api/student/career-recommendations — skill gaps, resume tips, events and placement eligibility (AI engine).
router.get('/career-recommendations', authenticate, authorize(Role.STUDENT), asyncHandler(async (req, res) => {
  res.json(await careerAdvice(req.user!.id));
}));

const skillsSchema = z.object({
  targetRole: z.string().max(80).optional(),
  skills: z.array(z.string().max(40)).max(40).optional(),
  weakSkills: z.array(z.string().max(40)).max(40).optional(),
  interests: z.array(z.string().max(40)).max(15).optional(),
});

// PUT /api/student/skills
router.put('/skills', authenticate, authorize(Role.STUDENT), asyncHandler(async (req, res) => {
  const parsed = skillsSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid payload', parsed.error.flatten());
  if (!Object.keys(parsed.data).length) throw new AppError(400, 'Provide at least one field to update');
  res.json(await prisma.studentProfile.update({ where: { userId: req.user!.id }, data: parsed.data }));
}));

export default router;
