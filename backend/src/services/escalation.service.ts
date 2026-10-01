import { ApplicationStatus, NotificationKind, Role, StageAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { notify, notifyRole } from './notification.service';

/**
 * Regulation: an application pending >48h at any stage escalates to the next tier with an urgent badge.
 * The stale stage is logged as ESCALATED, currentStage advances, and the next role is alerted.
 * At the final stage there is no next tier, so it is flagged urgent and admins are alerted once.
 */
export async function escalateStaleApplications(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - env.ESCALATION_HOURS * 3_600_000);
  const stale = await prisma.application.findMany({
    where: { status: ApplicationStatus.IN_PROGRESS, stageEnteredAt: { lt: cutoff } },
    include: { stageLogs: { orderBy: { stageIndex: 'asc' } }, submittedBy: { select: { id: true, name: true, branch: true } } },
  });

  let escalated = 0;
  for (const app of stale) {
    const current = app.stageLogs[app.currentStage];
    const next = app.stageLogs[app.currentStage + 1];
    if (!current) continue;

    if (next) {
      const swap = await prisma.application.updateMany({
        where: { id: app.id, currentStage: app.currentStage, status: ApplicationStatus.IN_PROGRESS },
        data: { currentStage: app.currentStage + 1, urgent: true, stageEnteredAt: now },
      });
      if (swap.count !== 1) continue; // someone acted in the meantime
      await prisma.applicationStageLog.update({
        where: { id: current.id },
        data: { action: StageAction.ESCALATED, actedAt: now, comment: `Auto-escalated after ${env.ESCALATION_HOURS}h without action` },
      });
      const branch = next.stageRole === Role.DEAN ? null : app.submittedBy.branch;
      await notifyRole(next.stageRole, branch, NotificationKind.APPLICATION, `URGENT: ${app.type} request from ${app.submittedBy.name}`,
        `Escalated from ${current.stageRole} after ${env.ESCALATION_HOURS} hours without action.`);
      await notify(app.submittedBy.id, NotificationKind.APPLICATION, 'Your request was escalated',
        `It was pending with ${current.stageRole} for over ${env.ESCALATION_HOURS} hours and has moved to ${next.stageRole}.`);
      escalated++;
    } else if (!app.urgent) {
      await prisma.application.update({ where: { id: app.id }, data: { urgent: true } });
      await notifyRole(Role.ADMIN, null, NotificationKind.APPLICATION, `URGENT: ${app.type} request from ${app.submittedBy.name}`,
        `Still pending at the final stage (${current.stageRole}) after ${env.ESCALATION_HOURS} hours.`);
      escalated++;
    }
  }
  return escalated;
}

export function startEscalationJob(): NodeJS.Timeout {
  const run = () => escalateStaleApplications().catch((err) => console.error('[escalation] failed', err));
  const timer = setInterval(run, env.ESCALATION_INTERVAL_MINUTES * 60_000);
  timer.unref(); // never keeps the process alive on shutdown
  setTimeout(run, 10_000).unref();
  return timer;
}
