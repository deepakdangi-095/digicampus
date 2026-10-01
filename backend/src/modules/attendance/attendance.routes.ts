import { Router } from 'express';
import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { assertCanViewStudent } from '../../utils/access';
import { startOfDayUTC } from '../../utils/dates';
import { computeAttendance, checkAndAlert, ALERT_THRESHOLD } from './attendance.service';

const router = Router();

const markSchema = z.object({
  subject: z.string().min(1),
  date: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date').optional(),
  records: z.array(z.object({ studentId: z.string(), status: z.enum(['PRESENT', 'ABSENT']) })).min(1).max(500),
});

// POST /api/attendance/mark
// One subject's roll call for one day. Faculty may only mark subjects they teach. Dates are normalised
// to the day so re-marking corrects the record instead of duplicating it; each affected student is then
// checked against the alert thresholds (deduplicated, so re-submitting doesn't spam anyone).
router.post(
  '/mark',
  authenticate,
  authorize(Role.FACULTY, Role.HOD, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const parsed = markSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid attendance payload', parsed.error.flatten());
    const { subject, records } = parsed.data;
    const date = startOfDayUTC(parsed.data.date ? new Date(parsed.data.date) : new Date());

    if (req.user!.role === Role.FACULTY) {
      const owns = await prisma.subject.findFirst({ where: { name: subject, facultyId: req.user!.id }, select: { id: true } });
      if (!owns) throw new AppError(403, 'You can only mark attendance for subjects you teach');
    }
    const ids = [...new Set(records.map((r) => r.studentId))];
    const valid = await prisma.user.count({ where: { id: { in: ids }, role: Role.STUDENT } });
    if (valid !== ids.length) throw new AppError(400, 'One or more studentIds are not students');

    await prisma.$transaction(
      records.map((r) =>
        prisma.attendanceRecord.upsert({
          where: { studentId_subject_date: { studentId: r.studentId, subject, date } },
          update: { status: r.status as AttendanceStatus, markedById: req.user!.id },
          create: { studentId: r.studentId, subject, date, status: r.status as AttendanceStatus, markedById: req.user!.id },
        })
      )
    );

    const percentages = await Promise.all(ids.map(async (studentId) => ({ studentId, percentage: await checkAndAlert(studentId) })));
    res.status(201).json({
      marked: records.length,
      date: date.toISOString().slice(0, 10),
      alertsSent: percentages.filter((p) => p.percentage < ALERT_THRESHOLD),
    });
  })
);

// GET /api/attendance/:studentId — students: self; parents: linked children; staff: anyone.
router.get(
  '/:studentId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    await assertCanViewStudent(req.user!, studentId);

    const [summary, records] = await Promise.all([
      computeAttendance(studentId),
      prisma.attendanceRecord.findMany({ where: { studentId }, orderBy: { date: 'desc' }, take: 60 }),
    ]);
    res.json({ ...summary, records });
  })
);

export default router;
