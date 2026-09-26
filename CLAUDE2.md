# LoopSoil

**Closing the loop from campus waste to community soil.**

> This file is the shared source of truth for LoopSoil. Read it fully at the start of
> every session before writing code. It defines what we're building, the data model, the
> business rules, and — importantly — how we divide work between backend (build freely to
> spec) and frontend (implement only against designs the lead provides).

---

## 1. What this is

LoopSoil is a compost redistribution coordinator for SUSS (Singapore University of Social
Sciences). SUSS composts campus food waste and harvests **~20kg of usable compost every
fortnight**, but can only absorb so much in its own rooftop garden. LoopSoil connects that
surplus to community takers — individual gardeners and bulk organisations (NParks,
town-council gardens, schools) — schedules pickups, and records weighed proof of every
handover.

- **Programme:** SG Eco Loop Hackathon — a Singapore Deep-Tech Alliance programme.
- **Track:** SUSS Challenge Statement 2 — "Enhancing Compost Utilisation: sustainable,
  scalable ways to use or distribute the compost generated on campus, benefiting SUSS and
  the wider community."
- **Team:** GSM — 3 people, all on internship, working evenings/weekends.
- **Key dates:** Prototype + Scale-Up slides due **1 Oct**. Public showcase at Temasek
  Shophouse **2 Oct**.
- **The win condition:** the Biggest Impact prize rewards *real kilograms of waste diverted*,
  reported with integrity (weigh-in + photo). So the product's job is to make real,
  measurable compost redistribution happen — not to be a slick app that moves nothing.
  Every design decision should protect the honesty and measurability of the kg figure.

## 2. The problem (fuller context)

- SUSS diverts ~200kg of raw food waste/month from 3 campus outlets (Starhub, Subway,
  FoodFest) into composters, yielding ~20kg of usable compost per fortnight.
- Root friction upstream: canteens hesitate to join the compost programme because it's
  **extra manual work** for cleaning staff (carrying food waste to the composter). This is
  CS1 territory and OUT of scope for LoopSoil — but it tells us SUSS's overriding theme is
  **"reduce human effort."** Every LoopSoil feature must reduce the manager's coordination
  work, never add to it.
- Downstream (our problem): the compost currently only feeds SUSS's rooftop garden. There's
  no channel to get surplus to the many people who'd want it. Supply and demand both exist;
  nothing connects them. LoopSoil is that connector.
- Day-to-day today: harvest + diversion done by the mentor and Dr Kaveri; handling by
  cleaning staff. They explicitly need more support to scale this. Compost is given **free**;
  no monetisation. Quality is fine (pH ~6.9, no gardener complaints).

## 3. The product in one line

A lightweight, self-service compost redistribution coordinator: SUSS posts each fortnight's
harvest; vetted community takers claim a portion and book a pickup; every handover is
weighed and photographed — with near-zero manual coordination from SUSS staff.

**Distribution model — kg is carved off each batch in this fixed order:**
1. **School reserve** — set aside for the SUSS rooftop garden first (`Batch.schoolReserveKg`).
2. **Bulk allocations** — standing amounts for orgs like NParks (`Allocation`).
3. **Public pool** — whatever remains, self-served by individuals (`Claim`).

---

## 4. Tech stack

- **Frontend:** Next.js (React, App Router) + Tailwind, mobile-first. Two surfaces in one
  app, split by route + role: public **taker app** and **admin console**.
- **Backend:** NestJS (TypeScript) — modules / controllers / services / DI. Holds ALL
  business logic and authorization.
- **ORM:** Prisma → PostgreSQL.
- **Database + Auth + File storage:** Supabase.
- **Hosting:** Vercel (frontend), Railway or Render (backend), Supabase (DB/auth/storage).

## 5. Architecture (3-tier)

```
Taker app  ─┐
            ├─→  NestJS API  ─→  Prisma  ─→  Supabase Postgres
Admin app  ─┘   (business logic,     └─→  Supabase Storage (handover photos)
                 authorization)
                     │
                   Supabase Auth (authentication / identity)
```

**Auth split (critical):**
- **Supabase Auth** owns *authentication* — login, passwords, sessions, resets. The frontend
  authenticates with Supabase and gets a JWT.
- **NestJS backend** owns *authorization* — it verifies the Supabase JWT, loads the matching
  `User`, and gates every action off `User.role`. We never store passwords ourselves.

## 6. Repo layout

```
loopsoil/
├── backend/          NestJS + Prisma      (prisma/schema.prisma lives here)
│   └── src/
│       ├── prisma/           PrismaModule + PrismaService (shared)
│       ├── auth/             JWT verification, role guards
│       ├── users/            user profiles + roles
│       ├── takers/           registration, vetting, bulk records
│       ├── batches/          batch CRUD + pool math
│       ├── allocations/      bulk reserves
│       ├── claims/           claim lifecycle
│       ├── scheduling/       pickup slots + bookings + deadline cron
│       ├── handovers/        weighed proof, atomic status flips
│       ├── reporting/        dashboard aggregations
│       └── notifications/    announcements + reminders
├── frontend/         Next.js + Tailwind   (screens built only against provided designs)
└── CLAUDE.md
```

---

## 7. Domain glossary

- **Compost** — dark, crumbly, nutrient-rich end product of decomposed food waste. Free
  fertiliser. The thing we redistribute.
- **Batch** — one fortnightly harvest of usable compost (~20kg), logged into the system.
- **School reserve** — portion of a batch kept for SUSS's own rooftop garden, carved off first.
- **Allocation** — a bulk taker's standing amount off a batch, created directly by the
  manager. No request/approval step.
- **Claim** — an individual taker's self-served request for compost from the public pool.
  Goes through approval.
- **Public pool** — the kg of a batch left after school reserve + bulk allocations; what
  individuals can claim.
- **Pickup slot** — a manager-defined collection window (start/end/location/capacity).
- **Booking** — a claim or allocation reserved into a slot; occupies one unit of capacity.
- **Handover** — the physical moment compost changes hands, recorded with net weight + photo.
- **Tare / net weight** — bag weight is excluded; `actualKg` is compost only, weighed before
  bagging. Only net kg is reported.
- **Manager** — SUSS admin (mentor / Dr Kaveri). Full control; receives no compost.
- **Taker** — anyone who receives compost: individual (self-serve) or bulk org (manager record).

## 8. Roles & the User↔Taker split

Two tables, because "can log in" and "receives compost" don't always travel together:

- **User** = can log in (authId, email, phone, role). Owns auth identity + permissions.
- **Taker** = receives compost (intended use, history, monthly target). Business data only.

| Actor            | Has User? | Has Taker?                         |
| ---------------- | --------- | ---------------------------------- |
| Manager          | ✅        | ❌                                 |
| Individual taker | ✅        | ✅ (linked via `Taker.userId`)     |
| Bulk org (NParks)| ❌        | ✅ (manager-created record, no login) |

- Only **Manager** and **Individual taker** are interactive app users.
- **Bulk takers and SUSS campus farmers are records/allocations** the manager maintains — do
  NOT build login flows or accounts for them.
- `Taker.userId` filled → individual (has a login). Null → bulk (no login).
- If a manager ever also wanted compost personally: their existing User + a new linked
  Taker. The model already supports it, no changes.

---

## 9. Data model (7 tables)

Schema of record: **`backend/prisma/schema.prisma`** — always trust that file over this summary.

The chain every reported kg traces back through:

```
Batch ──> Allocation (bulk)  ──┐
   │                            ├──> Booking ──> Handover (actualKg + photo)
   └────> Claim (individual) ──┘
```

- **Batch** — a fortnightly harvest. Fields drive the pool math; `schoolReserveKg` carved
  first. `pickupLocation` / `bagSizeKg` pending mentor (optional, no migration needed later).
- **Taker** — individuals + bulk records; `type` discriminates. Nullable fields
  (`monthlyKgTarget`, `category`, `userId`) apply only to one type — that's intentional.
- **Allocation** — bulk standing reserve off a batch. Manager sets `allocatedKg` directly;
  no request step. Simple lifecycle (no approval).
- **Claim** — individual self-serve request. `requestedKg` (asked) vs `approvedKg` (locked)
  are separate on purpose. Carries rejection + cancellation reasons and `managerNote`.
- **PickupSlot** — manager-defined windows with `capacity`. The heart of real scheduling.
- **Booking** — links a Claim OR an Allocation (exactly one) to a slot; occupies capacity;
  has a `collectionDeadline`.
- **Handover** — weighed proof of collection. `actualKg` (net) + `photoUrl`. The only
  source of truth for reporting.
- **User** — auth identity + role. Closes all `createdById` / `handedOverById` links.

**Relationships:**
- Batch 1—* Allocation, 1—* Claim, 1—* PickupSlot; Batch *—1 User (createdBy).
- Taker 1—* Claim, 1—* Allocation; Taker 0/1—1 User (userId); Taker *—1 User (createdBy, bulk).
- Claim 1—0/1 Booking; Allocation 1—0/1 Booking.
- PickupSlot 1—* Booking; Booking 1—0/1 Handover.
- Handover *—1 User (handedOverBy).

## 10. Enums

- **UserRole:** MANAGER, TAKER
- **UserStatus:** ACTIVE, SUSPENDED
- **TakerType:** INDIVIDUAL, BULK
- **TakerCategory:** NPARKS, TOWN_COUNCIL, SCHOOL, COMMUNITY_GARDEN, INDEPENDENT_FARMER, OTHER
- **TakerStatus:** PENDING, APPROVED, SUSPENDED
- **BatchStatus:** DRAFT, OPEN, CLOSED, COMPLETED
- **ClaimStatus:** PENDING, APPROVED, REJECTED, CANCELLED, COLLECTED
- **RejectionReason:** INSUFFICIENT_SUPPLY, HIGHER_PRIORITY, SLOT_UNAVAILABLE, INELIGIBLE_TAKER, OTHER
- **CancellationReason:** WRONG_AMOUNT, SOURCED_ELSEWHERE, CANNOT_MAKE_PICKUP, NO_LONGER_NEEDED, OTHER
- **AllocationStatus:** PLANNED, CONFIRMED, COLLECTED, CANCELLED
- **SlotStatus:** OPEN, CLOSED, CANCELLED
- **BookingStatus:** BOOKED, COLLECTED, NO_SHOW, CANCELLED

## 11. State machines (enforce valid transitions in the backend)

**Claim:** `PENDING → APPROVED | REJECTED`; `PENDING → CANCELLED`; `APPROVED → CANCELLED | COLLECTED`.
Terminal: REJECTED, CANCELLED, COLLECTED. Reject requires `rejectionReason`; cancel requires
`cancellationReason`. Approve sets `approvedKg` + `decidedAt` and locks the kg (amount final).

**Allocation:** `PLANNED → CONFIRMED | CANCELLED`; `CONFIRMED → COLLECTED | CANCELLED`.
Terminal: COLLECTED, CANCELLED.

**Booking:** `BOOKED → COLLECTED | NO_SHOW | CANCELLED`. Terminal: COLLECTED, NO_SHOW, CANCELLED.
Past `collectionDeadline` while still BOOKED → auto NO_SHOW/CANCELLED via cron, frees kg.

## 12. Derived values & kg math (never store remaining kg)

Two live derivations — one source of truth, no counter drift:

```
publicPoolKg = totalKg − schoolReserveKg − sum(active Allocations)
kgRemaining  = publicPoolKg − sum(PENDING + APPROVED Claims)
```

- Active allocation = PLANNED / CONFIRMED / COLLECTED. CANCELLED frees kg back.
- PENDING + APPROVED claims lock kg. REJECTED / CANCELLED free it. COLLECTED already counted.

**Worked example** — Batch 20kg, schoolReserve 5kg:
- NParks allocation PLANNED 6kg → publicPoolKg = 20 − 5 − 6 = **9kg**.
- Claim A PENDING 3kg, Claim B APPROVED 2kg → locked 5kg → kgRemaining = 9 − 5 = **4kg**.
- Claim B cancels (APPROVED → CANCELLED) → kgRemaining = **6kg** automatically. No manual give-back.

## 13. Business rules & invariants (backend-enforced, NOT frontend)

- kg carving order: school reserve → bulk allocations → public claims.
- Derive `publicPoolKg` / `kgRemaining` live (§12). Never store a mutable remaining-kg field.
- Approval locks kg: set `approvedKg`, stamp `decidedAt`; amount cannot change after.
- Never approve a claim for more than `kgRemaining` allows.
- Reject → `rejectionReason` required. Cancel → `cancellationReason` required. `reasonNote` optional.
- Booking capacity: count active bookings (BOOKED + COLLECTED) < `capacity` before insert.
- Collection deadline cron (`@nestjs/schedule`): overdue BOOKED → NO_SHOW/CANCELLED, kg frees.
  Individual window ~2 days; bulk ~7 days (driven by `Taker.type`).
- Exactly one of `Booking.claimId` / `Booking.allocationId` is set.
- Handover writes atomically: ONE transaction creates the Handover row (actualKg + photo)
  and flips Booking + Claim/Allocation to COLLECTED together — they can never disagree.
- `actualKg` is NET compost (weighed before bagging, tare excluded) and is the ONLY figure
  summed for impact / Waste Diary reporting. Never sum requested/approved/allocated.
- Batch → COMPLETED only once all its handovers are done.

## 14. Backend modules (NestJS)

Build as a clean layered monolith. Modules are logical, not separately deployed.

- **PrismaModule** — shared `PrismaService`, injected everywhere.
- **AuthModule** — verify Supabase JWT, resolve `User`, role guards + decorators.
- **UsersModule** — user profiles, role management.
- **TakersModule** — individual registration, manager vetting/approval, bulk-record CRUD.
- **BatchesModule** — batch CRUD, status transitions, pool-math service (`publicPoolKg`, `kgRemaining`).
- **AllocationsModule** — create/confirm/cancel bulk allocations off batches.
- **ClaimsModule** — full claim lifecycle: submit, approve (lock kg), reject, cancel — with reasons.
- **SchedulingModule** — PickupSlot CRUD + Booking (capacity check) + collection-deadline cron.
- **HandoversModule** — record handover (kg + photo upload to Supabase Storage) + atomic status flip.
- **ReportingModule** — dashboard aggregations (sum `actualKg`, by taker type / batch / top contributors).
- **NotificationsModule** — batch announcements + pickup reminders (manual-assisted for the pilot).

## 15. API conventions

- REST, resource-based routes (`/batches`, `/claims`, `/claims/:id/approve`, etc.).
- DTOs validated with `class-validator` + `ValidationPipe`. Reject bad input at the edge.
- Role-guarded endpoints — manager-only actions behind a role guard; takers scoped to own data.
- Consistent error shape (status, message, code). No leaking Prisma errors raw.
- List endpoints paginate. Return derived values (e.g. `kgRemaining`) computed server-side.
- Business logic lives in services, never in controllers or the frontend.

---

## 16. Frontend — design ownership & workflow (READ THIS)

**The project lead owns all UI layout and visual design. Claude Code implements screens
only against designs the lead provides. Do NOT invent the interface.**

- **Do NOT**, unprompted: design page layouts, choose a visual style/theme, scaffold
  speculative screens, add pages that weren't asked for, or pick component structure for a
  screen before a design exists for it. No "here's a dashboard I made up."
- **You MAY set up (infrastructure, not layout), when asked:** the Next.js app, Tailwind
  config, the Supabase client, a typed API client to the NestJS backend, auth wiring +
  route protection (public vs manager), routing skeleton, and shared utilities.
- **Design workflow (one screen at a time):**
  1. Lead shares a design for a single screen — an image, a wireframe, a sketch, or a
     written layout spec.
  2. Claude Code implements *that one screen* to match it faithfully — spacing, hierarchy,
     labels, states as specified.
  3. Review together, iterate on that screen until the lead approves.
  4. Only then move to the next screen.
- **Match the design, don't reinterpret it.** If something in a design is ambiguous or
  seems to conflict with the data model or a business rule, ASK before deviating — don't
  silently "improve" it.
- **Keep components small and composable** so layout changes stay cheap as designs evolve.
- **Mobile-first** (takers use phones), but follow the lead's responsive intent from each design.
- Wire real data through the API client; never hardcode mock data into a screen unless the
  lead asks for a placeholder while a backend endpoint is pending.

## 17. Scope guardrails — do NOT over-engineer

3-person, ~4-week build. Ship a clean layered monolith.

- One NestJS backend. No microservices, Docker, Kubernetes, or message queues.
- No CI/CD beyond auto-deploy from GitHub.
- No native mobile apps — mobile web only.
- No custom auth — Supabase Auth + NestJS role guards.
- No payments — compost is free.
- No computer vision / contamination detection / smart-bin hardware.
- **WhatsApp is manual** for the pilot (manager messages from their own phone, using
  `Claim.managerNote` / stored contact). Automated WhatsApp = scale-up slide only.
- Booking capacity **race-condition** handling: simple count-then-insert is fine for the
  pilot; a DB transaction/constraint is a documented scale-up step, not now.
- Multi-site: keep the data model site-agnostic enough to extend later, but do NOT build
  multi-site UI/logic now.
- When a "proper enterprise" instinct would add infrastructure, prefer the managed,
  batteries-included option (Supabase/Vercel/Railway) over hand-rolled plumbing.

## 18. Build order

1. `prisma migrate dev --name init` — all tables live in Supabase. Verify in Table Editor.
2. Auth + role guards (verify Supabase JWT, gate on `User.role`).
3. Admin: batch logging + allocation (school reserve / bulk split, pool math).
4. Public: claim flow (submit → manager approve/reject with reasons; kg locking).
5. Scheduling: pickup slots + booking (capacity + collection-deadline cron).
6. Handover (weighed kg + photo, atomic status flip to COLLECTED).
7. Impact dashboard (sum `actualKg`, by taker type / batch / top contributors).
8. Notifications (batch announcements, pickup reminders).

Build one module, verify it works end-to-end, then move on. Don't scaffold all modules at once.

## 19. Conventions

- TypeScript everywhere, `strict` on. Shared types between front/back where practical.
- UUID primary keys. `reference` fields are human-friendly labels (e.g. `2026-09-A`, `CLM-2026-091`).
- Every table has `createdAt` / `updatedAt`.
- Enums for every status/category — never free-text status strings.
- Weights are `Float` kg, NET compost unless a field explicitly says otherwise.
- Small, focused commits with clear messages. Feature branches, PRs where sensible.
- Test the risky logic (pool math, kg locking, capacity, deadline cron, atomic handover),
  not everything. Manual test-as-you-go per module.

## 20. Pending answers from SUSS mentor (fields already in schema, optional)

- `Batch.pickupLocation` — exact campus collection spot.
- `Batch.bagSizeKg` — whether compost is pre-bagged in a standard size (if yes, count claims
  in bags, not loose kg).
- Manager's real availability pattern — informs how PickupSlots get created (ad-hoc vs recurring).
- Vetting strictness — individuals default to PENDING → manager approves. Flip to auto-APPROVE
  if SUSS wants it hands-off.

## 21. Definition of done (hackathon)

- Real compost redistributed during September (≥1, ideally 2, live rounds), every handover
  weighed + photographed → feeds the Waste Diary (target 20kg+; ~40kg realistic over 2 fortnights).
- Working prototype demoable at the 2 Oct showcase (managed data, doesn't fall over live).
- Impact dashboard showing kg diverted, beneficiaries, top contributors — sourced from `actualKg`.
- Scale-up slides: the chain diagram, the AWS production path, automated WhatsApp, multi-site,
  capacity race-handling — all framed as "next", proving we scoped the pilot deliberately.
- Integrity first: report net kg, exclude bag tare, say so out loud. Honesty > prize.
