import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { generateSeating } from './seating.algorithm';

const router = Router();

const seatingSchema = z.object({
  rows: z.number().int().positive().max(100),
  cols: z.number().int().positive().max(100),
  // Either send students explicitly, or name branches (and optional semester) and they are loaded from the database.
  students: z.array(z.object({ id: z.string(), branch: z.string() })).min(1).optional(),
  branches: z.array(z.string()).min(1).optional(),
  semester: z.number().int().min(1).max(8).optional(),
});

// POST /api/admin/generate-seating — anti-collusion seating for one exam room.
router.post('/generate-seating', authenticate, authorize(Role.ADMIN, Role.DEAN, Role.HOD), asyncHandler(async (req, res) => {
  const p = seatingSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, 'Invalid seating request', p.error.flatten());
  const { rows, cols, branches, semester } = p.data;

  let students = p.data.students;
  if (!students) {
    const found = await prisma.user.findMany({
      where: { role: Role.STUDENT, branch: branches ? { in: branches } : { not: null }, ...(semester ? { studentProfile: { semester } } : {}) },
      select: { id: true, name: true, branch: true },
      orderBy: { name: 'asc' },
    });
    students = found.map((s) => ({ id: s.id, branch: s.branch as string }));
  }

  const result = generateSeating(rows, cols, students);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: result.assignments.map((a) => a.studentId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  res.json({ ...result, assignments: result.assignments.map((a) => ({ ...a, name: names.get(a.studentId) ?? null })) });
}));

export default router;
