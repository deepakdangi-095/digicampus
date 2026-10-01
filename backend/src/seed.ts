/**
 * Demo data: 3 departments, staff of every tier, students with deliberately different situations
 * (safe, condonation band, critical), parents, subjects, ~100 days of attendance, graded work, fees,
 * notices, vault files and in-flight workflow applications.
 *   npm run db:seed          (refuses to run in production unless SEED_FORCE=1)
 * Every demo account uses the password below.
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { AssessmentKind, AttendanceStatus, FeeStatus, Prisma, PrismaClient, Role, StageAction } from '@prisma/client';
import { env } from './config/env';
import { checkAndAlert } from './modules/attendance/attendance.service';
import { stagesFor } from './modules/applications/workflow.engine';
import { prisma as sharedPrisma } from './lib/prisma';
import { DAY_MS, startOfDayUTC } from './utils/dates';

const prisma: PrismaClient = sharedPrisma;
const PASSWORD = 'Password@123';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260930);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const SUBJECTS: Record<string, { name: string; topics: string[] }[]> = {
  CSE: [
    { name: 'Data Structures', topics: ['Trees', 'Graphs'] },
    { name: 'DBMS', topics: ['Normalization', 'Transactions'] },
    { name: 'Operating Systems', topics: ['Deadlocks', 'CPU Scheduling'] },
  ],
  ECE: [
    { name: 'Signals and Systems', topics: ['Laplace Transform', 'Fourier Series'] },
    { name: 'Digital Electronics', topics: ['Flip-Flops', 'Counters'] },
  ],
  ME: [
    { name: 'Thermodynamics', topics: ['Entropy', 'Carnot Cycle'] },
    { name: 'Fluid Mechanics', topics: ['Bernoulli Equation', 'Boundary Layers'] },
  ],
};

interface StudentSpec {
  name: string; email: string; branch: string; targets: number[]; cgpa: number; backlogs?: number; ats?: number;
  skills: string[]; weak: string[]; interests: string[]; role: string; parent?: string; fee: 'paid' | 'due-soon' | 'overdue';
  projects: number; internships: number; room?: string; bus?: string;
}
const STUDENTS: StudentSpec[] = [
  { name: 'Aarav Sharma', email: 'aarav.sharma@student.digicampus.edu', branch: 'CSE', targets: [82, 71, 68], cgpa: 7.2, ats: 68, skills: ['python', 'sql', 'git'], weak: ['statistics'], interests: ['machine learning', 'robotics'], role: 'Data Scientist', parent: 'parent.aarav', fee: 'due-soon', projects: 1, internships: 0, room: 'B-214', bus: 'Bus 12' },
  { name: 'Rohan Verma', email: 'rohan.verma@student.digicampus.edu', branch: 'CSE', targets: [66, 60, 62], cgpa: 5.9, backlogs: 1, ats: 55, skills: ['c', 'html'], weak: ['dsa', 'sql'], interests: ['gaming'], role: 'Backend Developer', parent: 'parent.rohan', fee: 'overdue', projects: 0, internships: 0, room: 'A-101', bus: 'Bus 4' },
  { name: 'Meera Nair', email: 'meera.nair@student.digicampus.edu', branch: 'CSE', targets: [88, 90, 85], cgpa: 8.6, ats: 82, skills: ['python', 'dsa', 'sql', 'git', 'react'], weak: ['system design'], interests: ['competitive coding', 'music'], role: 'Software Engineer', fee: 'paid', projects: 3, internships: 1, room: 'B-118', bus: 'Bus 12' },
  { name: 'Diya Iyer', email: 'diya.iyer@student.digicampus.edu', branch: 'CSE', targets: [95, 92, 93], cgpa: 9.1, ats: 88, skills: ['python', 'machine learning', 'pandas', 'sql', 'statistics'], weak: ['mlops'], interests: ['research', 'machine learning'], role: 'Machine Learning Engineer', fee: 'paid', projects: 4, internships: 2 },
  { name: 'Sana Khan', email: 'sana.khan@student.digicampus.edu', branch: 'ECE', targets: [74, 68], cgpa: 6.8, skills: ['c', 'electronics'], weak: ['microcontrollers'], interests: ['iot', 'embedded'], role: 'Embedded Engineer', fee: 'paid', projects: 1, internships: 0 },
  { name: 'Vikram Singh', email: 'vikram.singh@student.digicampus.edu', branch: 'ECE', targets: [86, 84], cgpa: 8.0, skills: ['c', 'microcontrollers', 'electronics'], weak: ['rtos'], interests: ['robotics', 'sports'], role: 'Embedded Engineer', fee: 'paid', projects: 2, internships: 1 },
  { name: 'Karan Patel', email: 'karan.patel@student.digicampus.edu', branch: 'ME', targets: [70, 66], cgpa: 6.1, skills: ['cad'], weak: ['thermodynamics'], interests: ['sports', 'entrepreneurship'], role: 'Design Engineer', fee: 'due-soon', projects: 0, internships: 0 },
  { name: 'Ishaan Rao', email: 'ishaan.rao@student.digicampus.edu', branch: 'ME', targets: [90, 88], cgpa: 8.4, skills: ['cad', 'python'], weak: [], interests: ['robotics'], role: 'Design Engineer', fee: 'paid', projects: 2, internships: 1 },
];

async function main() {
  if (process.argv.includes('--if-empty') && (await prisma.user.count()) > 0) {
    console.log('Database already has users; skipping seed.');
    return;
  }
  if (env.isProd && process.env.SEED_FORCE !== '1') throw new Error('Refusing to seed a production database (set SEED_FORCE=1 to override).');

  // ---- wipe (children first) ----
  for (const m of ['gateEvent', 'notification', 'appointment', 'applicationStageLog', 'application', 'vaultResource', 'announcement',
    'assessment', 'fee', 'attendanceRecord', 'subject', 'studentProfile', 'user', 'department'] as const) {
    await (prisma[m] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const depts = Object.fromEntries(await Promise.all(Object.keys(SUBJECTS).map(async (name) => [name, await prisma.department.create({ data: { name } })])));
  const mkUser = (email: string, name: string, role: Role, branch?: string) =>
    prisma.user.create({ data: { email, name, role, branch, passwordHash, departmentId: branch ? depts[branch].id : undefined } });

  // ---- staff ----
  const admin = await mkUser('admin@digicampus.edu', 'Registrar Office', Role.ADMIN);
  const dean = await mkUser('dean@digicampus.edu', 'Dr. Anjali Menon (Dean, Academics)', Role.DEAN);
  const hods: Record<string, { id: string }> = {};
  const faculty: Record<string, { id: string }> = {};
  for (const [branch, hodName, facName] of [['CSE', 'Prof. R. Krishnan', 'Prof. S. Bose'], ['ECE', 'Prof. L. Fernandes', 'Prof. T. Alam'], ['ME', 'Prof. D. Kulkarni', 'Prof. P. Joshi']] as const) {
    hods[branch] = await mkUser(`hod.${branch.toLowerCase()}@digicampus.edu`, `${hodName} (HOD ${branch})`, Role.HOD, branch);
    faculty[branch] = await mkUser(`faculty.${branch.toLowerCase()}@digicampus.edu`, facName, Role.FACULTY, branch);
    for (const s of SUBJECTS[branch]) await prisma.subject.create({ data: { name: s.name, branch, semester: 5, facultyId: faculty[branch].id } });
  }

  // ---- parents ----
  const parents: Record<string, { id: string }> = {
    'parent.aarav': await mkUser('parent.aarav@digicampus.edu', 'Rakesh Sharma (parent of Aarav)', Role.PARENT),
    'parent.rohan': await mkUser('parent.rohan@digicampus.edu', 'Sunita Verma (parent of Rohan)', Role.PARENT),
  };

  // ---- students, attendance, assessments, fees ----
  const weekdays: Date[] = [];
  for (let d = 1; weekdays.length < 100; d++) {
    const day = startOfDayUTC(daysAgo(d));
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) weekdays.unshift(day);
  }
  const studentIds: Record<string, string> = {};

  for (const s of STUDENTS) {
    const user = await mkUser(s.email, s.name, Role.STUDENT, s.branch);
    studentIds[s.name] = user.id;
    await prisma.studentProfile.create({
      data: {
        userId: user.id, semester: 5, cgpa: s.cgpa, activeBacklogs: s.backlogs ?? 0, atsScore: s.ats, projectsCount: s.projects,
        internshipsCount: s.internships, targetRole: s.role, skills: s.skills, weakSkills: s.weak, interests: s.interests,
        parentId: s.parent ? parents[s.parent].id : undefined, parentEmail: s.parent ? `${s.parent}@digicampus.edu` : undefined,
        parentPhone: s.parent ? '+91-90000-00000' : undefined, hostelRoom: s.room, busRoute: s.bus,
      },
    });

    const subjects = SUBJECTS[s.branch];
    const rows: { studentId: string; subject: string; date: Date; status: AttendanceStatus; markedById: string }[] = [];
    subjects.forEach((sub, i) => {
      const target = s.targets[i] ?? 80;
      const absent = Math.round(weekdays.length * (1 - target / 100));
      // Struggling students skip more in the recent weeks, so the university trend line genuinely drifts down.
      const keys = weekdays.map((_, idx) => ({ idx, k: rand() * (target < 80 && idx >= 65 ? 0.6 : 1) })).sort((a, b) => a.k - b.k);
      const absentIdx = new Set(keys.slice(0, absent).map((x) => x.idx));
      weekdays.forEach((date, idx) => rows.push({ studentId: user.id, subject: sub.name, date, status: absentIdx.has(idx) ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT, markedById: faculty[s.branch].id }));
    });
    await prisma.attendanceRecord.createMany({ data: rows });

    // Graded work: ability follows CGPA; one topic per subject is noticeably weaker so study plans have something to target.
    const ability = s.cgpa * 10;
    const assess: Prisma.AssessmentCreateManyInput[] = [];
    for (const sub of subjects) {
      assess.push({ studentId: user.id, subject: sub.name, kind: AssessmentKind.MIDTERM, maxScore: 30, score: Math.round(clamp(ability + (rand() - 0.5) * 16, 20, 98) * 0.3) });
      sub.topics.forEach((topic, ti) => assess.push({ studentId: user.id, subject: sub.name, topic, kind: AssessmentKind.QUIZ, maxScore: 10, score: Math.round(clamp(ability - (ti === 0 ? 22 : 0) + (rand() - 0.5) * 14, 15, 100) / 10) }));
      for (let a = 1; a <= 3; a++) {
        const due = daysAgo(60 - a * 15);
        const onTime = rand() < clamp((ability - 30) / 60, 0.2, 0.98);
        assess.push({ studentId: user.id, subject: sub.name, kind: AssessmentKind.ASSIGNMENT, maxScore: 10, dueDate: due,
          submittedAt: onTime ? new Date(due.getTime() - DAY_MS) : rand() < 0.5 ? new Date(due.getTime() + 3 * DAY_MS) : null,
          score: onTime ? Math.round(clamp(ability + (rand() - 0.5) * 20, 30, 100) / 10) : null });
      }
    }
    await prisma.assessment.createMany({ data: assess });

    const due = s.fee === 'overdue' ? daysAgo(45) : s.fee === 'due-soon' ? new Date(Date.now() + 4 * DAY_MS) : daysAgo(30);
    await prisma.fee.create({ data: { studentId: user.id, semester: 5, description: 'Semester 5 tuition', amount: 42500, dueDate: due,
      ...(s.fee === 'paid' ? { status: FeeStatus.PAID, paidAt: daysAgo(35), receiptNo: `RCP-DEMO-${user.id.slice(-6).toUpperCase()}` } : {}) } });
  }

  // ---- announcements ----
  await prisma.announcement.createMany({ data: [
    { title: 'Smart India Hackathon: internal round registrations open', body: 'Form a team and register with your department coordinator. Problem statements are on sih.gov.in.', type: 'HACKATHON' },
    { title: 'Cloud & DevOps workshop (hands-on)', body: 'Two-day workshop in the CSE seminar hall. Bring your laptop; seats are limited.', type: 'WORKSHOP' },
    { title: 'Campus placement drive: eligibility reminder', body: 'CGPA 6.50+, no active backlogs and an AI ATS resume score of 75% or more are required to register.', type: 'PLACEMENT' },
    { title: 'Mid-term timetable released', body: 'Mid-terms begin in the 8th week. Hall tickets need 75% attendance and cleared dues.', type: 'GENERAL' },
    { title: 'Mock placement interviews', body: 'Sign up with the Training & Placement cell for a practice round with industry mentors.', type: 'PLACEMENT' },
  ] });

  // ---- vault (real files so the links work) ----
  const vaultDir = path.resolve(env.UPLOAD_DIR, 'vault');
  fs.mkdirSync(vaultDir, { recursive: true });
  const notes: [string, string, string, string, boolean][] = [
    ['dbms-normalization-notes.txt', 'DBMS: Normalization cheat-sheet', 'DBMS', 'Meera Nair', true],
    ['os-deadlocks-summary.txt', 'OS: Deadlocks and Banker\'s algorithm summary', 'Operating Systems', 'Diya Iyer', true],
    ['ds-trees-practice.txt', 'Data Structures: AVL tree practice set', 'Data Structures', 'Meera Nair', false],
  ];
  for (const [file, title, subject, by, approved] of notes) {
    fs.writeFileSync(path.join(vaultDir, file), `${title}\n\nSample study note seeded for the demo. Replace with real material via the app.\n`);
    await prisma.vaultResource.create({ data: { title, subject, fileUrl: `/uploads/vault/${file}`, uploadedById: studentIds[by], status: approved ? 'APPROVED' : 'PENDING' } });
  }

  // ---- workflow applications in flight ----
  const rohanLeave = await prisma.application.create({
    data: { type: 'LEAVE', reason: 'Medical leave for 2 days (viral fever), certificate attached', submittedById: studentIds['Rohan Verma'], status: 'IN_PROGRESS', currentStage: 1, stageEnteredAt: daysAgo(0.25),
      stageLogs: { create: stagesFor('LEAVE').map((role, i) => ({ stageIndex: i, stageRole: role })) } },
    include: { stageLogs: true },
  });
  await prisma.applicationStageLog.update({ where: { id: rohanLeave.stageLogs.find((l) => l.stageIndex === 0)!.id },
    data: { action: StageAction.APPROVED, approverId: faculty.CSE.id, comment: 'Verified with the medical certificate.', actedAt: daysAgo(0.3) } });
  await prisma.application.create({
    data: { type: 'BONAFIDE', reason: 'Bonafide certificate for a bank education-loan application', submittedById: studentIds['Aarav Sharma'], status: 'IN_PROGRESS', currentStage: 0, stageEnteredAt: daysAgo(0.5),
      stageLogs: { create: stagesFor('BONAFIDE').map((role, i) => ({ stageIndex: i, stageRole: role })) } },
  });

  // ---- alerts: run the real alert engine so notifications match the numbers ----
  for (const id of Object.values(studentIds)) await checkAndAlert(id);
  await prisma.notification.create({ data: { userId: studentIds['Aarav Sharma'], kind: 'GENERAL', title: 'Welcome to DigiCampus', body: 'Try the AI assistant: ask about attendance rules, exams or placements.' } });

  console.log('\nSeed complete. All demo accounts use password:', PASSWORD, '\n');
  console.table([
    { role: 'ADMIN', email: admin.email }, { role: 'DEAN', email: dean.email },
    ...Object.values(hods).map((_, i) => ({ role: 'HOD', email: `hod.${['cse', 'ece', 'me'][i]}@digicampus.edu` })),
    { role: 'FACULTY', email: 'faculty.cse@digicampus.edu (teaches DS, DBMS, OS)' },
    { role: 'PARENT', email: 'parent.aarav@digicampus.edu (Aarav: ~74%, fee due in 4 days)' },
    { role: 'PARENT', email: 'parent.rohan@digicampus.edu (Rohan: ~63%, fee overdue)' },
    { role: 'STUDENT', email: 'aarav.sharma@student.digicampus.edu (condonation band)' },
    { role: 'STUDENT', email: 'rohan.verma@student.digicampus.edu (critical, <65%)' },
    { role: 'STUDENT', email: 'diya.iyer@student.digicampus.edu (top performer)' },
  ]);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
