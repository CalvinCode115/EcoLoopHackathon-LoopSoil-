// One-off bootstrap: make a Supabase Auth account a LoopSoil MANAGER.
//
//   npm run promote-manager -- someone@suss.edu.sg
//
// Prerequisite: the person has an account in Supabase Auth (signed up via the app, or
// added under Authentication → Users in the dashboard). This script looks that account up
// with the service-role key and creates/updates the matching User row with role MANAGER —
// no prior login required. Run from backend/ with .env filled in.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run promote-manager -- <email>');
  process.exit(1);
}
for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) {
    console.error(`${key} is not set — check backend/.env`);
    process.exit(1);
  }
}

// 1. Find the Supabase Auth account (authentication is Supabase's; identity comes from there).
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) {
  console.error('Supabase Auth lookup failed:', error.message);
  process.exit(1);
}
const authUser = data.users.find((u) => u.email?.toLowerCase() === email);
if (!authUser) {
  console.error(
    `No Supabase Auth account with email "${email}".\n` +
      'Create one first: sign up through the app, or Supabase dashboard → Authentication → Users → Add user.',
  );
  process.exit(1);
}
const meta = authUser.user_metadata ?? {};
const name =
  [meta.full_name, meta.name].find((v) => typeof v === 'string' && v.trim()) ??
  email.split('@')[0];
const phone = [authUser.phone, meta.phone].find(
  (v) => typeof v === 'string' && v.trim(),
);

// 2. Create or update the User row (authorization is ours; role lives here).
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const { rows } = await db.query(
    `INSERT INTO "User" (id, "authId", email, name, phone, role, status, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'MANAGER', 'ACTIVE', now(), now())
     ON CONFLICT ("authId") DO UPDATE
        SET role = 'MANAGER', "updatedAt" = now()
     RETURNING id, "authId", email, name, phone, role, status`,
    [authUser.id, authUser.email, name.trim(), phone?.trim() ?? null],
  );
  console.log('MANAGER ready:', rows[0]);
} catch (err) {
  if (err.code === '23505') {
    console.error(
      `A different User row already uses email "${email}" (unique constraint). Resolve that row manually.`,
    );
    process.exit(1);
  }
  throw err;
} finally {
  await db.end();
}
