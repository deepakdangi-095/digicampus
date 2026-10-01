import { Router } from 'express';
import { z } from 'zod';
import { Fee, FeeStatus, NotificationKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { assertCanViewStudent } from '../../utils/access';
import { daysBetween } from '../../utils/dates';
import { notify, notifyRole } from '../../services/notification.service';
import { charge, newReceiptNumber } from '../../services/payment.service';

const router = Router();
router.use(authenticate);

const view = (f: Fee) => {
  const now = new Date();
  const dueInDays = daysBetween(f.dueDate, now);
  return { ...f, dueInDays, overdueDays: f.status === FeeStatus.DUE && dueInDays < 0 ? -dueInDays : 0 };
};

// GET /api/fees?studentId= — students: own fees; parents: a linked child's (defaults to the first child).
router.get('/', asyncHandler(async (req, res) => {
  const user = req.user!;
  let studentId = typeof req.query.studentId === 'string' ? req.query.studentId : user.id;
  if (user.role === Role.PARENT && !req.query.studentId) {
    const child = await prisma.studentProfile.findFirst({ where: { parentId: user.id }, select: { userId: true } });
    if (!child) return res.json([]);
    studentId = child.userId;
  }
  await assertCanViewStudent(user, studentId);
  const fees = await prisma.fee.findMany({ where: { studentId }, orderBy: { dueDate: 'desc' } });
  res.json(fees.map(view));
}));

async function loadPayableFee(feeId: string, userId: string, role: Role) {
  const fee = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!fee) throw new AppError(404, 'Fee not found');
  await assertCanViewStudent({ id: userId, role, email: '' }, fee.studentId);
  return fee;
}

// POST /api/fees/:id/pay — settle a fee and get a digital receipt (conditional update: can't be paid twice).
router.post('/:id/pay', authorize(Role.STUDENT, Role.PARENT), asyncHandler(async (req, res) => {
  const fee = await loadPayableFee(req.params.id, req.user!.id, req.user!.role);
  if (fee.status === FeeStatus.PAID) throw new AppError(409, 'This fee is already paid');

  const payment = await charge({ feeId: fee.id, amount: fee.amount, payerId: req.user!.id });
  if (!payment.ok) throw new AppError(402, 'Payment was declined');

  const paid = await prisma.fee.updateMany({
    where: { id: fee.id, status: FeeStatus.DUE },
    data: { status: FeeStatus.PAID, paidAt: new Date(), receiptNo: newReceiptNumber() },
  });
  if (paid.count !== 1) throw new AppError(409, 'This fee was just paid');
  const updated = await prisma.fee.findUniqueOrThrow({ where: { id: fee.id } });
  await notify(fee.studentId, NotificationKind.FEE, 'Fee payment received', `${fee.description}: receipt ${updated.receiptNo}`);
  res.json({ ...view(updated), transactionId: payment.transactionId });
}));

// GET /api/fees/:id/receipt — printable receipt data
router.get('/:id/receipt', asyncHandler(async (req, res) => {
  const fee = await loadPayableFee(req.params.id, req.user!.id, req.user!.role);
  if (fee.status !== FeeStatus.PAID) throw new AppError(409, 'No receipt: this fee is not paid yet');
  const student = await prisma.user.findUnique({ where: { id: fee.studentId }, select: { name: true, branch: true } });
  res.json({ receiptNo: fee.receiptNo, paidAt: fee.paidAt, amount: fee.amount, description: fee.description, semester: fee.semester, student });
}));

const extSchema = z.object({ reason: z.string().min(5).max(500) });

// POST /api/fees/:id/extension — request more time; the accounts office (admins) is notified.
router.post('/:id/extension', authorize(Role.STUDENT, Role.PARENT), asyncHandler(async (req, res) => {
  const p = extSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, 'Please give a reason (at least 5 characters)', p.error.flatten());
  const fee = await loadPayableFee(req.params.id, req.user!.id, req.user!.role);
  if (fee.status === FeeStatus.PAID) throw new AppError(409, 'This fee is already paid');
  const updated = await prisma.fee.update({ where: { id: fee.id }, data: { extensionRequested: true, extensionReason: p.data.reason } });
  await notifyRole(Role.ADMIN, null, NotificationKind.FEE, 'Fee extension requested', `${fee.description}: ${p.data.reason}`);
  res.json(view(updated));
}));

export default router;
