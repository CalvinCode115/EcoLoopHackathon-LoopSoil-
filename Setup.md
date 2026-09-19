# LoopSoil — Backend Setup Instructions (for Claude Code)

You are Claude Code, setting up the backend for **LoopSoil** — a NestJS + Prisma + Supabase
project — on a **Windows** machine (PowerShell, VS Code). Follow these steps in order and
verify each before moving to the next. Do not improvise beyond what is written here.

## Current state (what the user has already done)
- The GitHub repo is cloned and open in VS Code.
- A NestJS app was scaffolded in the `backend/` folder (`nest new backend`).
- `npx prisma init` was already run. On this Prisma version (6.18+), it created a
  `prisma.config.ts` file and some AI-agent "skills" folders, but it did **NOT** create a
  `prisma/schema.prisma` file. That is expected — you will create the schema below.
- There may be leftover errors or a missing `prisma/` folder. Fixing this is the job.

## Your goal
Get the backend to a state where `npx prisma validate` and `npx prisma generate` both
succeed, and the project is ready for the user to add Supabase credentials and run the
first migration themselves.

## Hard rules — do NOT break these
- **Do NOT run `npx prisma migrate` or `prisma db push`.** They need a real database the
  user has not created yet. Stop before that step.
- **Do NOT invent or hardcode any real Supabase credentials, passwords, or connection
  strings.** Use the placeholder `.env` exactly as given.
- **Do NOT commit or push with `git` unless the user explicitly asks.** Never commit `.env`.
- **Do NOT design or scaffold any frontend, UI, pages, or screens.** Backend only.
- **Do NOT restructure the project** beyond these steps. Keep one clean NestJS app.
- Keep the `datasource` block inside `schema.prisma` (it has both `url` and `directUrl` for
  Supabase). Do **NOT** add a `datasource` block to `prisma.config.ts` — if one is there,
  remove it, otherwise the schema's datasource (and its `directUrl`) gets ignored.

## Step 1 — Assess the current state
Run these from inside the `backend/` folder and note the results:
```powershell
node --version
npx prisma -v
Get-ChildItem
Get-ChildItem prisma -ErrorAction SilentlyContinue
```
Confirm you are inside `backend/` before continuing. If not, `cd` into it.

## Step 2 — Create the Prisma schema
Create the folder `backend/prisma/` if it does not exist, then create the file
`backend/prisma/schema.prisma` with EXACTLY this content:

```prisma
// LoopSoil — Prisma schema
// SG Eco Loop Hackathon · SUSS Challenge Statement 2 (compost redistribution)
// Stack: NestJS + Prisma + Supabase (PostgreSQL)
//
// Order of kg carving off a batch:  schoolReserveKg → Allocations (bulk) → Claims (public)
// kgRemaining is DERIVED, never stored:
//   publicPoolKg = totalKg - schoolReserveKg - sum(active Allocations)
//   kgRemaining  = publicPoolKg - sum(PENDING + APPROVED Claims)
// actualKg on Handover is the ONLY source of truth for diverted-kg reporting.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // pooled (pgbouncer) — used by the running app
  directUrl = env("DIRECT_URL")   // direct — used for migrations
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

enum UserRole {
  MANAGER // full admin: batches, allocations, approvals, handovers, dashboard
  TAKER   // individual: browse, claim, book, collect
}

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum TakerType {
  INDIVIDUAL // self-registers, logs in, claims from public pool
  BULK       // manager-created record, standing monthly allocation, no login
}

enum TakerCategory {
  NPARKS
  TOWN_COUNCIL
  SCHOOL
  COMMUNITY_GARDEN
  INDEPENDENT_FARMER
  OTHER
}

enum TakerStatus {
  PENDING  // registered, awaiting manager approval
  APPROVED // cleared to claim / receive
  SUSPENDED
}

enum BatchStatus {
  DRAFT     // logged, not yet open to takers
  OPEN      // public pool live, claimable
  CLOSED    // claiming stopped (window ended or emptied)
  COMPLETED // all handovers done, archived
}

enum ClaimStatus {
  PENDING   // order submitted, awaiting manager decision
  APPROVED  // approved — kg locked, amount final
  REJECTED  // manager declined — reason required
  CANCELLED // taker withdrew — reason required
  COLLECTED // handed over (handover service sets this)
}

enum RejectionReason {
  INSUFFICIENT_SUPPLY
  HIGHER_PRIORITY
  SLOT_UNAVAILABLE
  INELIGIBLE_TAKER
  OTHER
}

enum CancellationReason {
  WRONG_AMOUNT
  SOURCED_ELSEWHERE
  CANNOT_MAKE_PICKUP
  NO_LONGER_NEEDED
  OTHER
}

enum AllocationStatus {
  PLANNED   // manager reserved it off the batch
  CONFIRMED // bulk taker confirmed they'll take it
  COLLECTED // handed over
  CANCELLED // fell through — kg releases back
}

enum SlotStatus {
  OPEN      // published, bookable
  CLOSED    // manager stopped taking bookings (or full)
  CANCELLED // slot scrapped — bookings need rebooking
}

enum BookingStatus {
  BOOKED    // reserved into the slot, occupies capacity
  COLLECTED // showed up, handed over
  NO_SHOW   // didn't turn up before deadline
  CANCELLED // released before pickup — frees capacity
}

// ─────────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────────

model User {
  id        String     @id @default(uuid())
  authId    String     @unique // Supabase Auth user id — the login seam
  email     String     @unique // login identity + contact
  phone     String? // primary contact for login users (call / WhatsApp)
  name      String
  role      UserRole   @default(TAKER)
  status    UserStatus @default(ACTIVE)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  taker         Taker?     @relation("UserTaker") // individual takers only
  batchesLogged Batch[]    @relation("BatchCreatedBy")
  takersCreated Taker[]    @relation("TakerCreatedBy") // bulk records this manager added
  handovers     Handover[] @relation("HandoverBy")
}

model Taker {
  id              String         @id @default(uuid())
  name            String
  type            TakerType
  category        TakerCategory?
  email           String
  phone           String? // primary contact for BULK takers (they have no User)
  intendedUse     String?
  monthlyKgTarget Float? // BULK standing demand
  status          TakerStatus    @default(PENDING)

  userId String? @unique // INDIVIDUAL → links to login; null for BULK
  user   User?   @relation("UserTaker", fields: [userId], references: [id])

  createdById String? // manager who created a BULK record
  createdBy   User?   @relation("TakerCreatedBy", fields: [createdById], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  claims      Claim[]
  allocations Allocation[]
}

model Batch {
  id              String      @id @default(uuid())
  reference       String      @unique // human label e.g. "2026-09-A"
  harvestDate     DateTime
  totalKg         Float
  schoolReserveKg Float       @default(0) // set aside for SUSS rooftop before public/bulk
  bagSizeKg       Float? // PENDING MENTOR: standard bag size, if bagged
  phReading       Float? // quality/trust signal (e.g. 6.9)
  status          BatchStatus @default(DRAFT)
  availableFrom   DateTime? // when public claiming opens
  availableUntil  DateTime? // when claiming/collection closes
  pickupLocation  String? // PENDING MENTOR: exact campus spot
  notes           String?

  createdById String
  createdBy   User   @relation("BatchCreatedBy", fields: [createdById], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  allocations Allocation[]
  claims      Claim[]
  pickupSlots PickupSlot[]
}

model Allocation {
  id        String @id @default(uuid())
  reference String @unique // e.g. "ALC-2026-09-NParks"

  batchId String
  batch   Batch  @relation(fields: [batchId], references: [id])
  takerId String
  taker   Taker  @relation(fields: [takerId], references: [id])

  allocatedKg Float // agreed amount, set directly by manager (no request step)
  status      AllocationStatus @default(PLANNED)

  collectedAt DateTime?
  note        String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  booking Booking?
}

model Claim {
  id        String @id @default(uuid())
  reference String @unique // e.g. "CLM-2026-091"

  batchId String
  batch   Batch  @relation(fields: [batchId], references: [id])
  takerId String
  taker   Taker  @relation(fields: [takerId], references: [id])

  requestedKg Float // what the taker asked for
  approvedKg  Float? // locked amount at approval (may be < requested)

  status ClaimStatus @default(PENDING)

  rejectionReason    RejectionReason? // set only when REJECTED
  cancellationReason CancellationReason? // set only when CANCELLED
  reasonNote         String? // optional free-text for either path
  managerNote        String? // e.g. "only 3kg avail — WhatsApp 9XXX to confirm"

  submittedAt DateTime  @default(now())
  decidedAt   DateTime? // when manager approved/rejected
  cancelledAt DateTime? // when taker cancelled
  collectedAt DateTime? // when handed over

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  booking Booking?
}

model PickupSlot {
  id String @id @default(uuid())

  batchId String
  batch   Batch  @relation(fields: [batchId], references: [id])

  startTime DateTime
  endTime   DateTime
  location  String? // overrides batch.pickupLocation if set
  capacity  Int        @default(1) // max bookings — the heart of the booking system
  status    SlotStatus @default(OPEN)
  note      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  bookings Booking[]
}

model Booking {
  id String @id @default(uuid())

  slotId String
  slot   PickupSlot @relation(fields: [slotId], references: [id])

  // exactly one of the two is set (enforced in the backend):
  claimId      String?     @unique
  claim        Claim?      @relation(fields: [claimId], references: [id])
  allocationId String?     @unique
  allocation   Allocation? @relation(fields: [allocationId], references: [id])

  status             BookingStatus @default(BOOKED)
  collectionDeadline DateTime? // no-show cutoff (e.g. bookedAt + 2 days individual, +7 bulk); past it → auto-cancel, kg frees
  bookedAt           DateTime      @default(now())
  note               String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  handover Handover?
}

model Handover {
  id        String @id @default(uuid())
  reference String @unique // e.g. "HND-2026-09-014"

  bookingId String?  @unique
  booking   Booking? @relation(fields: [bookingId], references: [id])

  actualKg Float // NET compost, weighed before bagging (tare excluded) — the only figure summed for reporting
  photoUrl String? // Supabase Storage — Waste Diary evidence

  handedOverById String
  handedOverBy   User     @relation("HandoverBy", fields: [handedOverById], references: [id])
  handedOverAt   DateTime @default(now())

  takerConfirmed Boolean @default(false)
  note           String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Step 3 — Fix `prisma.config.ts`
Overwrite `backend/prisma.config.ts` with EXACTLY this content. It points Prisma at the
schema, loads the `.env`, keeps the agent skills, and deliberately has NO datasource block:

```typescript
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
});
```

## Step 4 — Create `.env` (PLACEHOLDER values only)
Create `backend/.env` with EXACTLY this content. These are PLACEHOLDERS — the user fills in
the real Supabase values later. Do NOT replace them with anything real:

```dotenv
# ─────────────────────────────────────────────
# LoopSoil — environment variables
# Copy this file to `.env` (backend) and fill in real values.
# NEVER commit the real .env — add it to .gitignore.
# ─────────────────────────────────────────────

# ---- Database (Supabase → Project Settings → Database → Connection string) ----
# DATABASE_URL = the POOLED connection (port 6543, "Transaction" mode, ?pgbouncer=true).
#   Used by the running app for normal queries.
# DIRECT_URL   = the DIRECT connection (port 5432, "Session" mode).
#   Used by Prisma for migrations only. Both point at the same database.
DATABASE_URL="postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres"

# ---- Supabase Auth / Storage (Project Settings → API) ----
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_ANON_KEY="<anon-public-key>"
# Service-role key bypasses row-level security. BACKEND ONLY. Never expose to the frontend.
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# Storage bucket for handover photos (create it in Supabase → Storage)
SUPABASE_HANDOVER_BUCKET="handover-photos"

# ---- Backend (NestJS) ----
PORT=3001
NODE_ENV=development

# ─────────────────────────────────────────────
# FRONTEND (Next.js) — put these in frontend/.env.local, NOT here.
# Only NEXT_PUBLIC_* values are exposed to the browser — never the service-role key.
# ─────────────────────────────────────────────
# NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
# NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-public-key>"
# NEXT_PUBLIC_API_URL="http://localhost:3001"
```

## Step 5 — Make sure secrets are gitignored
Ensure a `.gitignore` exists at the REPO ROOT (one level up from `backend/`) containing at
least these lines. Create it if missing, or append any missing lines — do not remove
existing lines:

```
# Secrets
.env
.env.local

# Dependencies
node_modules/

# Build output
dist/
.next/

# Logs / OS junk
*.log
.DS_Store
```

`backend/.gitignore` (created by NestJS) should already ignore `node_modules` and `dist` —
leave it as is.

## Step 6 — Install required dependencies
From inside `backend/`, install what the project needs (npm will skip anything already there):
```powershell
npm install prisma --save-dev
npm install @prisma/client @nestjs/config @nestjs/schedule @supabase/supabase-js
```

## Step 7 — Validate and generate
```powershell
npx prisma validate
npx prisma generate
```
- `prisma validate` must report the schema is valid. If it errors, read it, fix the specific
  issue, and re-run. Most common cause: a stray `datasource` block in `prisma.config.ts` —
  remove it so the schema's datasource is used.
- `prisma generate` should create the Prisma Client without needing a database connection.

## Step 8 — Report and STOP
Once validate + generate pass, STOP and report to the user:
- Confirm the schema is valid and the Prisma Client generated.
- Tell them the next step is theirs: create a free Supabase project, copy the real
  `DATABASE_URL` and `DIRECT_URL` into `backend/.env`, then run
  `npx prisma migrate dev --name init` to create the tables.
- Do NOT run that migration yourself.

## If you hit errors
- If `npx prisma -v` shows **v7.x**: the schema's `generator client { provider =
  "prisma-client-js" }` and schema-based datasource should still work. If validate complains
  specifically about the datasource or generator, report the exact error to the user and ask
  before changing the generator or moving the datasource — do not guess.
- For any other blocking error, fix only the specific thing the error names. If you are
  unsure, stop and paste the exact error text to the user rather than making broad changes.

## After setup (context, for later — do not act on this now)
The full project design, data model, business rules, and scope guardrails live in
`CLAUDE.md` at the repo root. Read it before writing any feature code in a later session.
The frontend is designed by the user — never invent UI or layouts.