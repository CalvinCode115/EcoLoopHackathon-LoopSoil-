import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService, type SupabaseClaims } from './auth.service';

// jose is ESM-only and does real crypto; signature verification is not under test here.
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => jest.fn()),
  jwtVerify: jest.fn(),
}));

const config = {
  get: (key: string) =>
    key === 'SUPABASE_URL' ? 'https://example.supabase.co' : undefined,
} as unknown as ConfigService;

function makeService(upsert: jest.Mock) {
  const prisma = { user: { upsert } } as unknown as PrismaService;
  return new AuthService(config, prisma);
}

const baseUser = {
  id: 'u1',
  authId: 'auth-1',
  email: 'jo@example.com',
  phone: null,
  name: 'jo',
  role: UserRole.TAKER,
  status: UserStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService.resolveUser (lazy upsert)', () => {
  it('creates the User as TAKER, deriving name from email when metadata is empty', async () => {
    const upsert = jest.fn().mockResolvedValue(baseUser);
    const claims: SupabaseClaims = { sub: 'auth-1', email: 'jo@example.com' };

    const user = await makeService(upsert).resolveUser(claims);

    expect(user).toBe(baseUser);
    expect(upsert).toHaveBeenCalledWith({
      where: { authId: 'auth-1' },
      create: {
        authId: 'auth-1',
        email: 'jo@example.com',
        name: 'jo',
        phone: null,
        role: UserRole.TAKER,
      },
      update: {},
    });
  });

  it('prefers full_name and phone from user_metadata when present', async () => {
    const upsert = jest.fn().mockResolvedValue(baseUser);
    const claims: SupabaseClaims = {
      sub: 'auth-1',
      email: 'jo@example.com',
      user_metadata: { full_name: '  Jo Tan ', phone: '91234567' },
    };

    await makeService(upsert).resolveUser(claims);

    const args = upsert.mock.calls[0][0] as {
      create: { name: string; phone: string | null };
    };
    expect(args.create.name).toBe('Jo Tan');
    expect(args.create.phone).toBe('91234567');
  });

  it('rejects a token without an email claim', async () => {
    const upsert = jest.fn();
    await expect(
      makeService(upsert).resolveUser({ sub: 'auth-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('blocks a SUSPENDED user with 403', async () => {
    const upsert = jest
      .fn()
      .mockResolvedValue({ ...baseUser, status: UserStatus.SUSPENDED });
    await expect(
      makeService(upsert).resolveUser({
        sub: 'auth-1',
        email: 'jo@example.com',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
