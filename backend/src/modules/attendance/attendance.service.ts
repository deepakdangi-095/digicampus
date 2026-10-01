import { AttendanceStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { alertLevel, sendAttendanceAlert } from '../../services/notification.service';

export const ALERT_THRESHOLD = 75;

const pct = (present: number, total: number) =>
  // No records yet reads as 100%: an empty history isn't a shortfall and shouldn't fire an alert.
  total === 0 ? 100 : Math.round((present / total) * 1000) / 10;

export interface SubjectAttendance {
  subject: string;
  total: number;
  present: number;
  percentage: number;
}

export async function computeAttendance(studentId: string) {
  const groups = await prisma.attendanceRecord.groupBy({
    by: ['subject', 'status'],
    where: { studentId },
    _count: { _all: true },
  });
  const bySubject = new Map<string, { total: number; present: number }>();
  for (const g of groups) {
    const s = bySubject.get(g.subject) ?? { total: 0, present: 0 };
    s.total += g._count._all;
    if (g.status === AttendanceStatus.PRESENT) s.present += g._count._all;
    bySubject.set(g.subject, s);
  }
  const subjects: SubjectAttendance[] = [...bySubject.entries()]
    .map(([subject, v]) => ({ subject, ...v, percentage: pct(v.present, v.total) }))
    .sort((a, b) => a.percentage - b.percentage);
  const total = subjects.reduce((n, s) => n + s.total, 0);
  const present = subjects.reduce((n, s) => n + s.present, 0);
  const percentage = pct(present, total);
  return { total, present, percentage, level: alertLevel(percentage), belowThreshold: percentage < ALERT_THRESHOLD, subjects };
}

/** Overall attendance % for many students in two queries (used by dashboards and risk scoring). */
export async function attendanceForStudents(where: Prisma.AttendanceRecordWhereInput): Promise<Map<string, number>> {
  const groups = await prisma.attendanceRecord.groupBy({
    by: ['studentId', 'status'],
    where,
    _count: { _all: true },
  });
  const acc = new Map<string, { total: number; present: number }>();
  for (const g of groups) {
    const s = acc.get(g.studentId) ?? { total: 0, present: 0 };
    s.total += g._count._all;
    if (g.status === AttendanceStatus.PRESENT) s.present += g._count._all;
    acc.set(g.studentId, s);
  }
  return new Map([...acc.entries()].map(([id, v]) => [id, pct(v.present, v.total)]));
}

/** Fires alerts for the overall figure and for every subject under 78%. Returns the overall percentage. */
export async function checkAndAlert(studentId: string): Promise<number> {
  const summary = await computeAttendance(studentId);
  await sendAttendanceAlert({ studentId, percentage: summary.percentage });
  for (const s of summary.subjects) {
    if (s.percentage < 78) await sendAttendanceAlert({ studentId, percentage: s.percentage, subject: s.subject });
  }
  return summary.percentage;
}
