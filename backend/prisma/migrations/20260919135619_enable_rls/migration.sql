-- Enable Row Level Security on every LoopSoil table.
--
-- WHY: Supabase auto-exposes every table in the `public` schema through its REST API
-- (PostgREST) to anyone holding the anon key — and the anon key is public (it ships in
-- the frontend). With RLS off, that API could read AND write every row, bypassing all
-- NestJS business rules (e.g. inserting fake Handover rows to inflate the kg figure).
--
-- HOW: RLS enabled with NO policies = deny-all for the `anon` / `authenticated` roles.
-- The NestJS backend is unaffected: it connects as `postgres`, which has BYPASSRLS.
-- All data access goes through the NestJS API, never through Supabase's REST API.
--
-- Prisma does not track RLS in its schema diff, so this migration causes no drift.

ALTER TABLE "User"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Taker"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Batch"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Claim"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PickupSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Handover"   ENABLE ROW LEVEL SECURITY;

-- Prisma's own bookkeeping table. Harmless (postgres bypasses RLS) and keeps the
-- Supabase Security Advisor free of "RLS disabled" warnings. Guarded because the table
-- does not exist yet when Prisma replays migrations into its shadow database.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
