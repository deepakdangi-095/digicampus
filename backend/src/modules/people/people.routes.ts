import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { computeAttendance } from '../attendance/attendance.service';
import { buildRiskInputs, predictRisk } from '../ai/risk.service';

const router = Router();
router.use(authenticate);

// GET /api/people/children — a parent's linked students with live attendance and AI risk level.
router.get('/children', authorize(Role.PARENT), asyncHandler(async (req, res) => {
  const profiles = await prisma.studentProfile.findMany({
    where: { parentId: req.user!.id },
    include: { user: { select: { id: true, name: true, branch: true } } },
  });
  const ids = profiles.map((p) => p.userId);
  const inputs = await buildRiskInputs(ids);
  const out = await Promise.all(profiles.map(async (p) => {
    const [attendance, risk] = await Promise.all([computeAttendance(p.userId), predictRisk(p.userId, inputs.get(p.userId)!)]);
    return { id: p.userId, name: p.user.name, branch: p.user.branch, semester: p.semester, attendance, risk: { level: risk.risk_level, percentage: risk.risk_percentage, warnings: risk.warnings } };
  }));
  res.json(out);
}));

// GET /api/people/staff — who a parent can book a meeting with (faculty/HOD in the child's branch + Dean)
router.get('/staff', authorize(Role.PARENT), asyncHandler(async (req, res) => {
  const children = await prisma.studentProfile.findMany({ where: { parentId: req.user!.id }, select: { user: { select: { branch: true } } } });
  const branches = [...new Set(children.map((c) => c.user.branch).filter((b): b is string => !!b))];
  res.json(await prisma.user.findMany({
    where: { OR: [{ role: Role.DEAN }, { role: { in: [Role.FACULTY, Role.HOD] }, branch: { in: branches } }] },
    select: { id: true, name: true, role: true, branch: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  }));
}));

// GET /api/people/subjects — subjects I teach (HOD: my department, Admin: all)
router.get('/subjects', authorize(Role.FACULTY, Role.HOD, Role.ADMIN), asyncHandler(async (req, res) => {
  const { role, id, branch } = req.user!;
  const where = role === Role.FACULTY ? { facultyId: id } : role === Role.HOD && branch ? { branch } : {};
  res.json(await prisma.subject.findMany({ where, orderBy: [{ branch: 'asc' }, { name: 'asc' }] }));
}));

// GET /api/people/roster?subjectId= — the students of that subject's branch + semester, for roll call
router.get('/roster', authorize(Role.FACULTY, Role.HOD, Role.ADMIN), asyncHandler(async (req, res) => {
  const subject = await prisma.subject.findUnique({ where: { id: String(req.query.subjectId ?? '') } });
  if (!subject) throw new AppError(404, 'Subject not found');
  if (req.user!.role === Role.FACULTY && subject.facultyId !== req.user!.id) throw new AppError(403, 'You do not teach this subject');
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT, branch: subject.branch, studentProfile: { semester: subject.semester } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json({ subject, students });
}));

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(72),
  role: z.nativeEnum(Role),
  branch: z.string().max(60).optional(),
  semester: z.number().int().min(1).max(8).optional(),
  parentEmail: z.string().email().optional(),
});

// POST /api/people/users — admin creates any account (students get a profile; parents link by email).
router.post('/users', authorize(Role.ADMIN), asyncHandler(async (req, res) => {
  const p = createSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, 'Invalid user payload', p.error.flatten());
  const d = p.data;
  const email = d.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new AppError(409, 'A user with this email already exists');

  const parent = d.parentEmail ? await prisma.user.findFirst({ where: { email: d.parentEmail.toLowerCase(), role: Role.PARENT } }) : null;
  const user = await prisma.user.create({
    data: {
      email, name: d.name, role: d.role, branch: d.branch, passwordHash: await bcrypt.hash(d.password, 10),
      ...(d.role === Role.STUDENT ? { studentProfile: { create: { semester: d.semester ?? 1, parentId: parent?.id, parentEmail: d.parentEmail } } } : {}),
    },
    select: { id: true, email: true, name: true, role: true, branch: true },
  });
  res.status(201).json(user);
}));

export default router;
