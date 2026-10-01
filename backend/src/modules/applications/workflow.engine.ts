import { ApplicationType, Role } from '@prisma/client';

// Ordered approver stages per application type (Stage 1 Faculty Advisor/Warden -> Stage 2 HOD -> Stage 3 Dean).
// Config-driven: add a type to the Prisma enum and a row here, nothing else changes.
export const WORKFLOW_STAGES: Record<ApplicationType, Role[]> = {
  LEAVE: [Role.FACULTY, Role.HOD, Role.DEAN],
  HOSTEL_CHANGE: [Role.FACULTY, Role.HOD, Role.DEAN],
  BONAFIDE: [Role.FACULTY, Role.HOD, Role.DEAN],
  CERTIFICATE: [Role.HOD, Role.DEAN],
};

export function stagesFor(type: ApplicationType): Role[] {
  return WORKFLOW_STAGES[type];
}
