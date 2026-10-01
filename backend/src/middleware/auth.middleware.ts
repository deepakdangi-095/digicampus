import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { Role } from '../types';

// Verifies the bearer JWT and attaches the decoded user to req.user.
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or malformed Authorization header'));
  }

  const token = header.slice('Bearer '.length);
  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}

// Restricts a route to the given roles. Must run after `authenticate`.
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Not authenticated'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, `This action requires one of: ${allowedRoles.join(', ')}`));
    }
    next();
  };
}
