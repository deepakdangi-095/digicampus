import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CAMPUS_PASS_SECRET: z.string().min(16).optional(),
  GATE_API_KEY: z.string().min(8).optional(),
  PYTHON_AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AI_SERVICE_API_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  UPLOAD_DIR: z.string().default('uploads'),
  CORS_ORIGINS: z.string().default('*'),
  ESCALATION_HOURS: z.coerce.number().positive().default(48),
  ESCALATION_INTERVAL_MINUTES: z.coerce.number().positive().default(15),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const e = parsed.data;
const isProd = e.NODE_ENV === 'production';

// Secrets must be explicit in production; dev gets a clearly-labelled fallback so `npm run dev` just works.
function secret(name: string, value: string | undefined, devDefault: string): string {
  if (value) return value;
  if (isProd) throw new Error(`${name} must be set (min 16 chars) when NODE_ENV=production`);
  return devDefault;
}

export const env = {
  ...e,
  isProd,
  JWT_SECRET: secret('JWT_SECRET', e.JWT_SECRET, 'dev-jwt-secret-change-me'),
  CAMPUS_PASS_SECRET: secret('CAMPUS_PASS_SECRET', e.CAMPUS_PASS_SECRET, 'dev-pass-secret-change-me'),
  corsOrigins: e.CORS_ORIGINS === '*' ? '*' : e.CORS_ORIGINS.split(',').map((s) => s.trim()),
};
