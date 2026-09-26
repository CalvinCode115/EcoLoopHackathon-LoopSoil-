-- Enable Row Level Security on the three tables added in frontend-updates.
--
-- Same reasoning as 20260919135619_enable_rls: Supabase auto-exposes every table in the
-- `public` schema through its REST API (PostgREST) to anyone holding the anon key, which
-- is public by design. New tables do not inherit RLS from existing ones, so each table
-- created since the initial migration needs this explicitly.
--
-- RLS enabled with NO policies = deny-all for the `anon` / `authenticated` roles. The
-- NestJS backend is unaffected: it connects as `postgres`, which has BYPASSRLS.

ALTER TABLE "BatchTopUp"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLog"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedReportView" ENABLE ROW LEVEL SECURITY;
