import { prisma } from '../lib/prisma';
import { AuthUser, Role } from '../types';
import { AppError } from './AppError';

const STAFF: Role[] = [Role.FACULTY, Role.HOD, Role.DEAN, Role.ADMIN];
export const isStaff = (role: Role): boolean => STAFF.includes(role);

/** Students see themselves, parents see linked children, staff see everyone. */
export async function assertCanViewStudent(user: AuthUser, studentId: string): Promise<void> {
  if (isStaff(user.role)) return;
  if (user.role === Role.STUDENT && user.id === studentId) return;
  if (user.role === Role.PARENT) {
    const link = await prisma.studentProfile.findFirst({ where: { userId: studentId, parentId: user.id }, select: { id: true } });
    if (link) return;
  }
  throw new AppError(403, 'Not authorized to view this student');
}
