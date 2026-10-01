import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { assertCanViewStudent } from '../../utils/access';
import { rateLimit } from '../../middleware/rateLimit';
import * as ai from './ai.service';
import { buildRiskInputs, predictRisk } from './risk.service';

const router = Router();
router.use(authenticate);

const chatSchema = z.object({
  query: z.string().min(1).max(1000),
  sessionId: z.string().max(64).optional(),
  category: z.enum(['regulations', 'exams', 'hostel', 'career', 'workflow']).optional(),
  selfCheck: z.boolean().optional(),
});

// POST /api/ai/chat — campus assistant (RAG + self-check + mentor). One rolling session per user by default.
router.post(
  '/chat',
  rateLimit({ windowMs: 60_000, max: 30, key: (req) => req.user?.id ?? req.ip ?? 'anon' }),
  asyncHandler(async (req, res) => {
    const p = chatSchema.safeParse(req.body);
    if (!p.success) throw new AppError(400, 'Invalid chat payload', p.error.flatten());
    res.json(await ai.chat(req.user!, p.data));
  })
);

// GET /api/ai/guidance?focus= — motivation, events to join and web resources for the home screen.
router.get('/guidance', authorize(Role.STUDENT), asyncHandler(async (req, res) => {
  res.json(await ai.guidance(req.user!.id, typeof req.query.focus === 'string' ? req.query.focus : undefined));
}));

// GET /api/ai/risk/:studentId — dropout/academic risk from live attendance, marks, assignments and fees.
router.get('/risk/:studentId', asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  await assertCanViewStudent(req.user!, studentId);
  const input = (await buildRiskInputs([studentId])).get(studentId)!;
  res.json({ input, ...(await predictRisk(studentId, input)) });
}));

const planSchema = z.object({
  hoursPerDay: z.number().min(1).max(12).optional(),
  topics: z.array(z.object({ subject: z.string().min(2), topic: z.string().min(2), proficiency: z.number().int().min(0).max(100) })).max(20).optional(),
});

// POST /api/ai/study-plan — 7-day plan + PYQs built from the student's own weakest topics.
router.post('/study-plan', authorize(Role.STUDENT), asyncHandler(async (req, res) => {
  const p = planSchema.safeParse(req.body ?? {});
  if (!p.success) throw new AppError(400, 'Invalid study-plan payload', p.error.flatten());
  res.json(await ai.studyPlan(req.user!.id, p.data));
}));

const evalSchema = z.object({
  studentId: z.string().optional(),
  question: z.string().max(2000).optional(),
  submissionText: z.string().min(10).max(20000),
  maxScore: z.number().positive().max(1000).optional(),
  minWords: z.number().int().min(0).max(5000).optional(),
  rubric: z.array(z.object({
    name: z.string().min(2), description: z.string().min(5),
    keywords: z.array(z.string()).max(25).optional(), weight: z.number().positive().max(100).optional(),
  })).min(1).max(20),
});

// POST /api/ai/evaluate — rubric-based scoring and feedback for a text submission.
router.post('/evaluate', asyncHandler(async (req, res) => {
  const p = evalSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, 'Invalid evaluation payload', p.error.flatten());
  res.json(await ai.evaluate(p.data));
}));

export default router;
