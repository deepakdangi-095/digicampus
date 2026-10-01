import { AssessmentKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { aiPost } from '../../lib/aiClient';
import { AppError } from '../../utils/AppError';
import { AuthUser, Role } from '../../types';

/** Profile fields the AI engine uses to personalise answers, events and resources. */
async function studentContext(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { studentProfile: true } });
  if (!user) throw new AppError(404, 'User not found');
  return user;
}

export async function aiStudentProfile(userId: string) {
  const u = await studentContext(userId);
  const p = u.studentProfile;
  return {
    branch: u.branch ?? undefined,
    semester: p?.semester ?? undefined,
    interests: [...(p?.interests ?? []), ...(p?.skills ?? [])].slice(0, 15),
    target_role: p?.targetRole ?? undefined,
  };
}

export async function chat(user: AuthUser, dto: { query: string; sessionId?: string; category?: string; selfCheck?: boolean }) {
  const profile = user.role === Role.STUDENT ? await aiStudentProfile(user.id) : undefined;
  return aiPost('/ai/chat', {
    query: dto.query,
    session_id: dto.sessionId ?? `u_${user.id}`,
    category: dto.category,
    self_check: dto.selfCheck ?? true,
    student_profile: profile,
  });
}

export async function guidance(userId: string, focus?: string) {
  return aiPost('/ai/guidance', { student_id: userId, student_profile: await aiStudentProfile(userId), focus });
}

export async function careerAdvice(userId: string) {
  const u = await studentContext(userId);
  const p = u.studentProfile;
  if (!p) throw new AppError(404, 'Student profile not found');
  return aiPost('/ai/career-advisor', {
    student_id: userId,
    branch: u.branch ?? 'General',
    current_semester: p.semester,
    strong_skills: p.skills,
    weak_skills: p.weakSkills,
    target_job_role: p.targetRole ?? 'Software Engineer',
    projects_count: p.projectsCount,
    internships_count: p.internshipsCount,
    cgpa: p.cgpa ?? undefined,
    active_backlogs: p.activeBacklogs,
    ats_score: p.atsScore ?? undefined,
  });
}

interface WeakTopic { subject: string; topic: string; proficiency: number }

/** Derive weak topics from graded work: topic-level average % (subject-level if no topic), weakest first. */
export async function weakTopicsFor(studentId: string): Promise<WeakTopic[]> {
  const rows = await prisma.assessment.findMany({ where: { studentId, score: { not: null }, kind: { in: [AssessmentKind.QUIZ, AssessmentKind.ASSIGNMENT, AssessmentKind.MIDTERM] } } });
  const groups = new Map<string, { subject: string; topic: string; sum: number; n: number }>();
  for (const r of rows) {
    const topic = r.topic ?? r.subject;
    const key = `${r.subject}::${topic}`;
    const g = groups.get(key) ?? { subject: r.subject, topic, sum: 0, n: 0 };
    g.sum += ((r.score as number) / r.maxScore) * 100;
    g.n += 1;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ subject: g.subject, topic: g.topic, proficiency: Math.round(g.sum / g.n) }))
    .sort((a, b) => a.proficiency - b.proficiency);
}

export async function studyPlan(studentId: string, dto: { hoursPerDay?: number; topics?: WeakTopic[] }) {
  let topics = dto.topics;
  if (!topics?.length) {
    const all = await weakTopicsFor(studentId);
    const weak = all.filter((t) => t.proficiency < 60);
    topics = (weak.length ? weak : all.slice(0, 3)).slice(0, 8);
  }
  if (!topics.length) throw new AppError(422, 'No graded work yet. Add topics manually or take a quiz first.');
  return aiPost('/ai/recommend-study-plan', {
    student_id: studentId,
    weak_topics: topics,
    hours_per_day: dto.hoursPerDay ?? 4,
    pyqs_per_topic: 3,
  });
}

export async function evaluate(dto: {
  studentId?: string; question?: string; submissionText: string; maxScore?: number; minWords?: number;
  rubric: { name: string; description: string; keywords?: string[]; weight?: number }[];
}) {
  return aiPost('/ai/evaluate-assignment', {
    student_id: dto.studentId,
    question: dto.question,
    submission_text: dto.submissionText,
    max_score: dto.maxScore ?? 10,
    min_words: dto.minWords ?? 0,
    rubric: dto.rubric.map((r) => ({ name: r.name, description: r.description, keywords: r.keywords ?? [], weight: r.weight ?? 1 })),
  });
}
