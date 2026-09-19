import type { Request } from 'express';
import type { User } from '../generated/prisma/client';

/** Express request after SupabaseAuthGuard has attached the resolved User row. */
export interface AuthenticatedRequest extends Request {
  user: User;
}
