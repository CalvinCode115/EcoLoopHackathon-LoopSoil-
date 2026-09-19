import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route (or whole controller) to the given roles.
 * Without this decorator any authenticated, non-suspended user may call the route.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
