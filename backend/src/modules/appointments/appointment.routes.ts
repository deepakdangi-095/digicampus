import { Router } from 'express';
import { z } from 'zod';
import { AppointmentMode, AppointmentStatus, NotificationKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { isStaff } from '../../utils/access';
import { notify } from '../../services/notification.service';

const router = Router();
router.use(authenticate);

const include = {
  parent: { select: { name: true } },
  staff: { select: { name: true, role: true } },
  student: { select: { name: true } },
};

const bookSchema = z.object({
  staffId: z.string(),
  studentId: z.string(),
  slot: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid slot'),
  mode: z.nativeEnum(AppointmentMode),
  note: z.string().max(500).optional(),
});

// POST /api/appointments — a parent books an online/in-person meeting with faculty, HOD or Dean.
router.post('/', authorize(Role.PARENT), asyncHandler(async (req, res) => {
  const p = bookSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, 'Invalid booking', p.error.flatten());
  const slot = new Date(p.data.slot);
  if (slot.getTime() < Date.now()) throw new AppError(400, 'Pick a time in the future');

  const [child, staff] = await Promise.all([
    prisma.studentProfile.findFirst({ where: { userId: p.data.studentId, parentId: req.user!.id }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: p.data.staffId, role: { in: [Role.FACULTY, Role.HOD, Role.DEAN] } }, select: { id: true } }),
  ]);
  if (!child) throw new AppError(403, 'That student is not linked to your account');
  if (!staff) throw new AppError(404, 'Staff member not found');
  const clash = await prisma.appointment.findFirst({ where: { staffId: staff.id, slot, status: { not: AppointmentStatus.DECLINED } }, select: { id: true } });
  if (clash) throw new AppError(409, 'That slot was just taken. Please choose another.');

  const appt = await prisma.appointment.create({ data: { ...p.data, slot, parentId: req.user!.id }, include });
  await notify(staff.id, NotificationKind.APPOINTMENT, 'New meeting request', `${appt.parent.name} about ${appt.student.name} (${p.data.mode.replace('_', ' ').toLowerCase()})`);
  res.status(201).json(appt);
}));

// GET /api/appointments — parents: mine; staff: requests addressed to me
router.get('/', asyncHandler(async (req, res) => {
  const { role, id } = req.user!;
  if (role !== Role.PARENT && !isStaff(role)) throw new AppError(403, 'Not available for your role');
  const where = role === Role.PARENT ? { parentId: id } : { staffId: id };
  res.json(await prisma.appointment.findMany({ where, include, orderBy: { slot: 'asc' }, take: 50 }));
}));

const respondSchema = z.object({ status: z.enum(['CONFIRMED', 'DECLINED']) });

// PUT /api/appointments/:id/respond — the staff member confirms or declines
router.put('/:id/respond', authorize(Role.FACULTY, Role.HOD, Role.DEAN), asyncHandler(async (req, res) => {
  const p = respondSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, 'Invalid response', p.error.flatten());
  const appt = await prisma.appointment.findFirst({ where: { id: req.params.id, staffId: req.user!.id } });
  if (!appt) throw new AppError(404, 'Appointment not found');
  const updated = await prisma.appointment.update({ where: { id: appt.id }, data: { status: p.data.status }, include });
  await notify(appt.parentId, NotificationKind.APPOINTMENT, `Meeting ${p.data.status.toLowerCase()}`, `${updated.staff.name} ${p.data.status.toLowerCase()} your request for ${appt.slot.toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
  res.json(updated);
}));

export default router;
