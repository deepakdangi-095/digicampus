import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { startEscalationJob } from './services/escalation.service';

const app = createApp();
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`Digi Campus API listening on :${env.PORT} (${env.NODE_ENV})`);
});
const timer = startEscalationJob();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  clearInterval(timer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
