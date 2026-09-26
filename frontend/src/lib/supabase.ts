import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — AUTHENTICATION ONLY (login, sign-up, sessions, resets).
 * All data goes through the NestJS API (`api.ts`), never straight to the database
 * (CLAUDE.md §5). Only the anon key is used here; the service-role key never leaves the backend.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — see frontend/.env.local",
  );
}

export const supabase = createClient(url, anonKey);
