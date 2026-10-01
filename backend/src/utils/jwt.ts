import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUser } from '../types';

// @types/jsonwebtoken narrows expiresIn to a fixed set of duration strings; a runtime env value
// can't satisfy that literal type, so the cast happens once, here, at the boundary.
const expiresIn = env.JWT_EXPIRES_IN as SignOptions['expiresIn'];

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn });
}

export function verifyAuthToken(token: string): AuthUser {
  const { id, role, email, branch } = jwt.verify(token, env.JWT_SECRET) as AuthUser;
  return { id, role, email, branch };
}
