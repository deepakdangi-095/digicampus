import { Router } from 'express';
import { z } from 'zod';
import { ApplicationStatus, NotificationKind, Prisma, StageAction } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { notify } from '../../services/notification.service';
import { stagesFor } from './workflow.engine';

const router = Router();

const include = {
  stageLogs: { orderBy: { stageIndex: 'asc' } },
  submittedBy: { select: { id: true, name: true, branch: true } },
} satisfies Prisma.ApplicationInclude;

const submitSchema = z.object({
  type: z.enum(['LEAVE', 'BONAFIDE', 'HOSTEL_CHANGE', 'CERTIFICATE']),
  reason: z.string().min(3, 'Give a short reason (at least 3 characters)').max(1000),
});

// POST /api/applications/submit — creates the application with one pre-built log row per approver stage,
// so the whole route (and the live tracker in the app) exists from the first second.
router.post(
  '/submit',
  authenticate,
  authorize(Role.STUDENT),
  asyncHandler(async (req, res) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid application payload', parsed.error.flatten());

    const stages = stagesFor(parsed.data.type);
    const application = await prisma.application.create({
      data: {
        type: parsed.data.type,
        reason: parsed.data.reason,
        submittedById: req.user!.id,
        status: ApplicationStatus.IN_PROGRESS,
        stageLogs: { create: stages.map((role, index) => ({ stageIndex: index, stageRole: role })) },
      },
      include,
    });
    res.status(201).json(application);
  })
);

const approveSchema = z.object({ action: z.enum(['APPROVE', 'REJECT']), comment: z.string().max(500).optional() });

// PUT /api/applications/:id/approve — only the role the CURRENT stage is waiting on may act, only within
// their own department (Dean: all). The state change is one compare-and-swap so two approvers can't both win.
router.put(
  '/:id/approve',
  authenticate,
  authorize(Role.FACULTY, Role.HOD, Role.DEAN),
  asyncHandler(async (req, res) => {
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid decision payload', parsed.error.flatten());
    const user = req.user!;

    const app = await prisma.application.findUnique({ where: { id: req.params.id }, include });
    if (!app) throw new AppError(404, 'Application not found');
    if (app.status !== ApplicationStatus.IN_PROGRESS) throw new AppError(409, `Application is already ${app.status}`);
    if (user.branch && user.role !== Role.DEAN && app.submittedBy.branch !== user.branch) {
      throw new AppError(403, 'This application belongs to another department');
    }

    const log = app.stageLogs.find((l) => l.stageIndex === app.currentStage);
    if (!log) throw new AppError(500, 'Workflow state is corrupted: no matching stage');
    if (log.stageRole !== user.role) throw new AppError(403, `This application is awaiting ${log.stageRole}, not ${user.role}`);

    const approved = parsed.data.action === 'APPROVE';
    const isLast = app.currentStage === app.stageLogs.length - 1;

    await prisma.$transaction(async (tx) => {
      const swap = await tx.application.updateMany({
        where: { id: app.id, currentStage: app.currentStage, status: ApplicationStatus.IN_PROGRESS },
        data: approved
          ? { status: isLast ? ApplicationStatus.APPROVED : ApplicationStatus.IN_PROGRESS, currentStage: isLast ? app.currentStage : app.currentStage + 1, stageEnteredAt: new Date(), urgent: false }
          : { status: ApplicationStatus.REJECTED },
      });
      if (swap.count !== 1) throw new AppError(409, 'This application was just updated by someone else');
      await tx.applicationStageLog.update({
        where: { id: log.id },
        data: { action: approved ? StageAction.APPROVED : StageAction.REJECTED, approverId: user.id, comment: parsed.data.comment, actedAt: new Date() },
      });
    });

    const updated = await prisma.application.findUniqueOrThrow({ where: { id: app.id }, include });
    const outcome = !approved ? 'was rejected' : isLast ? 'was fully approved' : `moved to the next stage (${updated.stageLogs[updated.currentStage]?.stageRole})`;
    await notify(app.submittedById, NotificationKind.APPLICATION, `Your ${app.type.toLowerCase().replace('_', ' ')} request ${outcome}`,
      parsed.data.comment ? `Comment: ${parsed.data.comment}` : 'Open the app to track the workflow.');
    res.json(updated);
  })
);

// GET /api/applications?status=
//  STUDENT: own applications | FACULTY/HOD/DEAN: applications waiting on THEIR role (department-scoped) | ADMIN: all
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const s = req.query.status;
    const status = typeof s === 'string' && (Object.values(ApplicationStatus) as string[]).includes(s) ? (s as ApplicationStatus) : undefined;
    const { role, id, branch } = req.user!;
    const orderBy = { createdAt: 'desc' } as const;

    if (role === Role.ADMIN) return res.json(await prisma.application.findMany({ where: { status }, include, orderBy }));
    if (role === Role.STUDENT) return res.json(await prisma.application.findMany({ where: { status, submittedById: id }, include, orderBy }));
    if (role === Role.PARENT) throw new AppError(403, 'Parents cannot view applications');

    const apps = await prisma.application.findMany({
      where: {
        status: status ?? ApplicationStatus.IN_PROGRESS,
        ...(branch && role !== Role.DEAN ? { submittedBy: { branch } } : {}),
      },
      include,
      orderBy,
    });
    res.json(apps.filter((a) => a.stageLogs.find((l) => l.stageIndex === a.currentStage)?.stageRole === role));
  })
);

// GET /api/applications/:id — one application with its full stage history
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const app = await prisma.application.findUnique({ where: { id: req.params.id }, include });
    if (!app) throw new AppError(404, 'Application not found');
    const { id, role } = req.user!;
    const allowed = app.submittedById === id || role === Role.ADMIN || app.stageLogs.some((l) => l.stageRole === role);
    if (!allowed) throw new AppError(403, 'Not authorized to view this application');
    res.json(app);
  })
);

export default router;
