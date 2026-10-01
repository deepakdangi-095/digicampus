import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { aiGet } from './lib/aiClient';
import router from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Uploaded files are fetched cross-origin by the web app, so allow that for /uploads only via CORP override.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.corsOrigins }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '1mb' }));

  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), { index: false, dotfiles: 'deny' }));

  // Liveness + dependency status (DB and AI engine) so ops and the apps can tell what is degraded.
  app.get('/health', async (_req, res) => {
    const [db, ai] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down'),
      aiGet<{ status: string }>('/health').then((h) => (h.status === 'ok' ? 'up' : 'degraded')).catch(() => 'down'),
    ]);
    res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db, ai });
  });
  app.use('/api', router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
