import { Role } from '@prisma/client';

export { Role };

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  branch?: string | null;
}

// Augment Express's Request so req.user is typed everywhere after
// the `authenticate` middleware has run.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
