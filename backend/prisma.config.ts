import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7+: the CLI reads its connection URL from here, not from schema.prisma.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DIRECT connection (Supabase port 5432, "Session" mode) — used ONLY by the
    // Prisma CLI for `migrate` / `db pull` etc.
    // The running NestJS app does NOT use this: PrismaService connects through the
    // POOLED `DATABASE_URL` (port 6543, pgbouncer) via @prisma/adapter-pg.
    url: env("DIRECT_URL"),
  },
});
