import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// Every route throws an AppError (known, user-facing) or lets something unexpected fall through to the
// generic 500, which never leaks internals to the client.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: { message: `Upload rejected: ${err.message}` } });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: { message: 'Request body is not valid JSON' } });
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return res.status(404).json({ error: { message: 'Record not found' } });
  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
}
