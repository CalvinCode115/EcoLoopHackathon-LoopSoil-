import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { UserRole, UserStatus, type User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** The claims Supabase Auth puts in an access token that we care about. */
export interface SupabaseClaims extends JWTPayload {
  sub: string; // Supabase Auth user id → User.authId
  email?: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
}

/**
 * Authentication is Supabase's job; authorization is ours (CLAUDE.md §5).
 *
 * - verifyAccessToken: checks the Supabase JWT locally against the project's public
 *   JWKS (ES256). No shared secret, no network call per request; jose caches the keys.
 * - resolveUser: lazily creates the User row on first authenticated request
 *   (default role TAKER). Managers are promoted once via `npm run promote-manager`.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const supabaseUrl = config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not set — check backend/.env');
    }
    this.issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );
  }

  async verifyAccessToken(token: string): Promise<SupabaseClaims> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
      });
      if (!payload.sub) {
        throw new Error('token has no sub claim');
      }
      return payload as SupabaseClaims;
    } catch (err) {
      this.logger.debug(`JWT rejected: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async resolveUser(claims: SupabaseClaims): Promise<User> {
    const email = claims.email;
    if (!email) {
      throw new UnauthorizedException('Account has no email address');
    }
    const meta = claims.user_metadata ?? {};
    const name =
      firstNonEmptyString(meta.full_name, meta.name) ?? email.split('@')[0];
    const phone = firstNonEmptyString(claims.phone, meta.phone) ?? null;

    const user = await this.prisma.user.upsert({
      where: { authId: claims.sub },
      create: { authId: claims.sub, email, name, phone, role: UserRole.TAKER },
      update: {}, // profile edits happen through the API, not from the token
    });

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Account suspended');
    }
    return user;
  }
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}
