import { Router } from 'express';
import { ApplicationStatus, FeeStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { attendanceForStudents } from '../attendance/attendance.service';
import { atRiskStudents } from '../ai/risk.service';

const router = Router();
router.use(authenticate);

const month = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

// HODs are scoped to their own department; Dean/Admin see the whole university.
const scope = (role: string, branch?: string | null) => (role === Role.HOD && branch ? branch : undefined);

// GET /api/analytics/overview — KPIs for the executive dashboard (enrolment, attendance, risk, revenue, workflow).
router.get(
  '/overview',
  authorize(Role.ADMIN, Role.DEAN, Role.HOD),
  asyncHandler(async (req, res) => {
    const branch = scope(req.user!.role, req.user!.branch);
    const studentWhere = { role: Role.STUDENT, ...(branch ? { branch } : {}) };
    const recordScope = branch ? { student: { branch } } : {};
    const since = new Date(); since.setUTCMonth(since.getUTCMonth() - 6);

    const [totalStudents, branches, perStudent, daily, feeGroups, appGroups, atRisk] = await Promise.all([
      prisma.user.count({ where: studentWhere }),
      prisma.user.groupBy({ by: ['branch'], where: studentWhere, _count: { _all: true } }),
      attendanceForStudents(recordScope),
      prisma.attendanceRecord.groupBy({ by: ['date', 'status'], where: { ...recordScope, date: { gte: since } }, _count: { _all: true } }),
      prisma.fee.groupBy({ by: ['status'], where: branch ? { student: { branch } } : {}, _sum: { amount: true } }),
      prisma.application.groupBy({ by: ['status'], where: branch ? { submittedBy: { branch } } : {}, _count: { _all: true } }),
      atRiskStudents({ branch, limit: 8 }),
    ]);

    const pcts = [...perStudent.values()];
    const average = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0;

    const months = new Map<string, { present: number; total: number; sort: number }>();
    for (const g of daily) {
      const key = month(g.date);
      const m = months.get(key) ?? { present: 0, total: 0, sort: g.date.getTime() };
      m.total += g._count._all;
      if (g.status === 'PRESENT') m.present += g._count._all;
      m.sort = Math.min(m.sort, g.date.getTime());
      months.set(key, m);
    }
    const trend = [...months.entries()]
      .sort((a, b) => a[1].sort - b[1].sort)
      .map(([m, v]) => ({ month: m, value: Math.round((v.present / v.total) * 1000) / 10 }));

    const sum = (s: FeeStatus) => feeGroups.find((f) => f.status === s)?._sum.amount ?? 0;
    const count = (s: ApplicationStatus) => appGroups.find((a) => a.status === s)?._count._all ?? 0;

    res.json({
      scope: branch ?? 'University',
      totalStudents,
      averageAttendance: average,
      belowThreshold: pcts.filter((p) => p < 75).length,
      critical: pcts.filter((p) => p < 65).length,
      branches: branches.map((b) => ({ branch: b.branch ?? 'Unassigned', students: b._count._all })),
      trend,
      fees: { collected: sum(FeeStatus.PAID), pending: sum(FeeStatus.DUE) },
      applications: { inProgress: count(ApplicationStatus.IN_PROGRESS), approved: count(ApplicationStatus.APPROVED), rejected: count(ApplicationStatus.REJECTED) },
      atRisk,
    });
  })
);

// GET /api/analytics/at-risk?limit= — students who need proactive counselling, scored by the AI risk model.
router.get(
  '/at-risk',
  authorize(Role.FACULTY, Role.HOD, Role.DEAN, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const branch = req.user!.role === Role.ADMIN || req.user!.role === Role.DEAN ? null : req.user!.branch;
    res.json(await atRiskStudents({ branch, limit }));
  })
);

// CSV cells starting with = + - @ are executed as formulas by Excel; prefix them so names can't inject anything.
const cell = (v: unknown) => {
  const t = String(v ?? '');
  return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};

// GET /api/analytics/export/students.csv — student-level attendance, CGPA and backlog data for accreditation
// (NAAC/NIRF) working files. Base dataset only: map the columns to your exact submission templates.
router.get(
  '/export/students.csv',
  authorize(Role.ADMIN, Role.DEAN, Role.HOD),
  asyncHandler(async (req, res) => {
    const branch = scope(req.user!.role, req.user!.branch);
    const [students, att] = await Promise.all([
      prisma.user.findMany({
        where: { role: Role.STUDENT, ...(branch ? { branch } : {}) },
        select: { name: true, email: true, branch: true, id: true, studentProfile: { select: { semester: true, cgpa: true, activeBacklogs: true } } },
        orderBy: [{ branch: 'asc' }, { name: 'asc' }],
      }),
      attendanceForStudents(branch ? { student: { branch } } : {}),
    ]);
    const rows = [['Name', 'Email', 'Branch', 'Semester', 'CGPA', 'Active backlogs', 'Attendance %', 'Below 75%']];
    for (const s of students) {
      const a = att.get(s.id) ?? '';
      rows.push([s.name, s.email, s.branch ?? '', s.studentProfile?.semester ?? '', s.studentProfile?.cgpa ?? '', s.studentProfile?.activeBacklogs ?? '', a, a !== '' && Number(a) < 75 ? 'YES' : 'NO'].map(String));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="students-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n'));
  })
);

export default router;
