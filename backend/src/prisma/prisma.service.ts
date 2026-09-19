import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Shared Prisma client for the whole backend (see CLAUDE.md §14).
 *
 * Prisma 7 runs "Rust-free": the client talks to Postgres through a driver adapter.
 * We use the pooled Supabase connection (DATABASE_URL, port 6543, pgbouncer) here;
 * migrations use the direct connection configured in prisma.config.ts.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set — copy env.example to backend/.env and fill it in',
      );
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres (pooled)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
