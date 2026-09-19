import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../generated/prisma/client';
import { RolesGuard } from './roles.guard';

function contextWithUser(
  user: { role: UserRole } | undefined,
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows any authenticated user when no @Roles() is set', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextWithUser({ role: UserRole.TAKER }))).toBe(
      true,
    );
  });

  it('allows a user whose role is in the list', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.MANAGER]);
    expect(guard.canActivate(contextWithUser({ role: UserRole.MANAGER }))).toBe(
      true,
    );
  });

  it('rejects a TAKER on a MANAGER-only route', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.MANAGER]);
    expect(() =>
      guard.canActivate(contextWithUser({ role: UserRole.TAKER })),
    ).toThrow(ForbiddenException);
  });

  it('fails closed when @Roles() is present but no user was authenticated', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.MANAGER]);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
