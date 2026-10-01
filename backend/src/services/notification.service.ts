import { NotificationKind, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { DAY_MS } from '../utils/dates';

export async function notify(userId: string, kind: NotificationKind, title: string, body: string) {
  return prisma.notification.create({ data: { userId, kind, title, body } });
}

/** Skips if the same title was already sent to this user in the last `hours` (avoids alert spam). */
export async function notifyOnce(userId: string, kind: NotificationKind, title: string, body: string, hours = 24) {
  const since = new Date(Date.now() - (hours * DAY_MS) / 24);
  const dup = await prisma.notification.findFirst({ where: { userId, title, createdAt: { gt: since } }, select: { id: true } });
  if (dup) return null;
  return notify(userId, kind, title, body);
}

export async function notifyRole(role: Role, branch: string | null | undefined, kind: NotificationKind, title: string, body: string) {
  const users = await prisma.user.findMany({
    where: { role, ...(branch ? { branch } : {}) },
    select: { id: true },
  });
  await Promise.all(users.map((u) => notifyOnce(u.id, kind, title, body)));
  return users.length;
}

// SMS channel stub: swap the body for Twilio / MSG91. In-app notifications above are fully real.
export function sendSms(phone: string | null | undefined, text: string): void {
  if (!phone) return;
  console.log(`[sms:stub] -> ${phone}: ${text}`);
}

/** Alert levels from the university regulations: L1 <78%, L2 <75%, L3 <65%. */
export function alertLevel(pct: number): 0 | 1 | 2 | 3 {
  if (pct < 65) return 3;
  if (pct < 75) return 2;
  if (pct < 78) return 1;
  return 0;
}

interface AttendanceAlertParams {
  studentId: string;
  percentage: number;
  subject?: string;
}

export async function sendAttendanceAlert({ studentId, percentage, subject }: AttendanceAlertParams) {
  const level = alertLevel(percentage);
  if (level === 0) return { sent: false as const, level };

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { name: true, branch: true, studentProfile: { select: { parentId: true, parentPhone: true } } },
  });
  if (!student) return { sent: false as const, level };

  const label = subject ?? 'Overall';
  const title = `Attendance alert (Level ${level}): ${label} at ${percentage}%`;
  const messages: Record<1 | 2 | 3, string> = {
    1: `${label} attendance is ${percentage}%, close to the mandatory 75%. Attend upcoming classes to stay safe.`,
    2: `${label} attendance is ${percentage}%, below the mandatory 75%. Condonation needs a medical certificate or event duty slip, submitted in the app within 5 business days.`,
    3: `${label} attendance is ${percentage}%, below 65%. Exam hall ticket generation is locked and the case is escalated to your Faculty Advisor and HOD.`,
  };
  const body = messages[level];

  await notifyOnce(studentId, NotificationKind.ATTENDANCE, title, body);

  if (level >= 2) {
    const parentId = student.studentProfile?.parentId;
    if (parentId) await notifyOnce(parentId, NotificationKind.ATTENDANCE, `${student.name}: ${title}`, body);
    sendSms(student.studentProfile?.parentPhone, `${student.name}: ${body}`);
  }
  if (level === 3) {
    await notifyRole(Role.HOD, student.branch, NotificationKind.ATTENDANCE, `${student.name}: ${title}`, body);
  }
  return { sent: true as const, level };
}
