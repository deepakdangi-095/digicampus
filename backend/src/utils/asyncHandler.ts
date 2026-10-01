import { Request, Response, NextFunction, RequestHandler } from 'express';

// Wraps an async route handler so any rejected promise is forwarded to
// Express's error middleware instead of crashing the process or hanging
// the request. Keeps controllers free of repetitive try/catch blocks.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
