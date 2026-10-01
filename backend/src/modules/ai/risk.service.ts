import { AssessmentKind, FeeStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { aiPost } from '../../lib/aiClient';
import { daysBetween, mapLimit } from '../../utils/dates';
import { attendanceForStudents } from '../attendance/attendance.service';

export interface RiskInput {
  attendance_pct: number;
  midterm_pct: number;
  assignment_submission_rate: number;
  fee_delay_days: number;
}
export interface RiskResult {
  student_id?: string | null;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_percentage: number;
  probabilities?: Record<string, number>;
  top_factors: { feature: string; value: number; impact_pct: number }[];
  warnings: string[];
  recommended_actions: string[];
  model_version: string;
}

const NEUTRAL_MIDTERM = 60; // used only when a student has no graded work yet

/** Build the AI risk-model features for many students with a fixed number of queries. */
export async function buildRiskInputs(studentIds: string[]): Promise<Map<string, RiskInput>> {
  const [attendance, assessments, fees] = await Promise.all([
    attendanceForStudents({ studentId: { in: studentIds } }),
    prisma.assessment.findMany({ where: { studentId: { in: studentIds } } }),
    prisma.fee.findMany({ where: { studentId: { in: studentIds }, status: FeeStatus.DUE } }),
  ]);

  const now = new Date();
  const out = new Map<string, RiskInput>();
  for (const id of studentIds) {
    const mine = assessments.filter((a) => a.studentId === id);
    const graded = (kinds: AssessmentKind[]) =>
      mine.filter((a) => kinds.includes(a.kind) && a.score !== null).map((a) => ((a.score as number) / a.maxScore) * 100);
    const midterms = graded([AssessmentKind.MIDTERM]);
    const any = graded([AssessmentKind.MIDTERM, AssessmentKind.QUIZ, AssessmentKind.ASSIGNMENT]);
    const pool = midterms.length ? midterms : any;
    const midterm = pool.length ? pool.reduce((a, b) => a + b, 0) / pool.length : NEUTRAL_MIDTERM;

    const assignments = mine.filter((a) => a.kind === AssessmentKind.ASSIGNMENT);
    const onTime = assignments.filter((a) => a.submittedAt && (!a.dueDate || a.submittedAt <= a.dueDate)).length;
    const rate = assignments.length ? (onTime / assignments.length) * 100 : 100;

    const overdue = fees.filter((f) => f.studentId === id && f.dueDate < now).map((f) => daysBetween(now, f.dueDate));
    out.set(id, {
      attendance_pct: attendance.get(id) ?? 100,
      midterm_pct: Math.round(midterm * 10) / 10,
      assignment_submission_rate: Math.round(rate * 10) / 10,
      fee_delay_days: overdue.length ? Math.max(...overdue) : 0,
    });
  }
  return out;
}

/** Same weights the model is trained on, used only if the AI service is down so dashboards never break. */
export function fallbackRisk(i: RiskInput): RiskResult {
  const latent =
    0.35 * (100 - i.attendance_pct) / 100 + 0.3 * (100 - i.midterm_pct) / 100 +
    0.2 * (100 - i.assignment_submission_rate) / 100 + 0.15 * Math.min(i.fee_delay_days, 90) / 90;
  const level = latent < 0.25 ? 'LOW' : latent < 0.42 ? 'MEDIUM' : 'HIGH';
  const warnings: string[] = [];
  if (i.attendance_pct < 75) warnings.push(`Attendance ${i.attendance_pct}% is below the mandatory 75%.`);
  if (i.midterm_pct < 50) warnings.push(`Mid-term average ${i.midterm_pct}% is borderline or failing.`);
  if (i.fee_delay_days > 0) warnings.push(`Fee overdue by ${i.fee_delay_days} days.`);
  return {
    risk_level: level, risk_percentage: Math.round(Math.min(100, (latent / 0.6) * 100) * 10) / 10,
    top_factors: [], warnings, recommended_actions: [], model_version: 'fallback-heuristic',
  };
}

export async function predictRisk(studentId: string, input: RiskInput): Promise<RiskResult & { source: 'ai' | 'fallback' }> {
  try {
    const r = await aiPost<RiskResult>('/ai/predict-risk', { student_id: studentId, ...input });
    return { ...r, source: 'ai' };
  } catch {
    return { ...fallbackRisk(input), student_id: studentId, source: 'fallback' };
  }
}

/** The N lowest-attendance students (optionally one branch) scored by the AI engine, worst first. */
export async function atRiskStudents(opts: { branch?: string | null; limit?: number }) {
  const limit = opts.limit ?? 10;
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT, ...(opts.branch ? { branch: opts.branch } : {}) },
    select: { id: true, name: true, branch: true },
  });
  if (!students.length) return [];
  const att = await attendanceForStudents({ studentId: { in: students.map((s) => s.id) } });
  const candidates = [...students].sort((a, b) => (att.get(a.id) ?? 100) - (att.get(b.id) ?? 100)).slice(0, Math.max(limit * 3, 15));
  const inputs = await buildRiskInputs(candidates.map((c) => c.id));
  const scored = await mapLimit(candidates, 5, async (c) => {
    const input = inputs.get(c.id)!;
    const r = await predictRisk(c.id, input);
    return { studentId: c.id, name: c.name, branch: c.branch, attendance: input.attendance_pct, riskLevel: r.risk_level, riskPercentage: r.risk_percentage, warnings: r.warnings, source: r.source };
  });
  return scored.sort((a, b) => b.riskPercentage - a.riskPercentage).slice(0, limit);
}
