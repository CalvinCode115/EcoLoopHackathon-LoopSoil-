# LoopSoil — Backend Updates (Consolidated)

> **For Claude Code.** Read with `CLAUDE2.md` and BACKEND-SKELETON(full design) and `backend/prisma/schema.prisma`
> (schema of record). This file **consolidates and replaces `UPDATES.md`** — it combines the
> SUSS mentor decisions, the claim/taker rules, and the changes surfaced while building the
> frontend in Claude Design.
>
> **Some of these require a schema migration.** Apply schema edits, then run
> `npx prisma migrate dev --name frontend-updates`. Do NOT run it until the user's Supabase
> `.env` is set. Build in the priority order in Part G — the demo loop first.

---

## Part A — Context: resolved mentor decisions (no schema impact)

- **Bagging:** takers request a **free amount in kg**; ½kg and 1kg are physical portions,
  plus loose for odd amounts. Requests/approvals stay in kg.
- **Pickup location:** default = "Near bin centre / composter".
- **Stock cadence:** manager tops up stock **weekly** (see BatchTopUp below); no daily counter.
- **Bulk vs individual:** NParks-type **bulk** via Allocations (uncapped); community
  **individuals** via Claims (capped). `Taker.type` is the differentiator.
- **Handover supervisor:** manager/staff/student with a manager login; no separate role.

## Part B — Out of scope (removed from the prototype)

No pages, so **no endpoints/fields** for: forgot/reset password, "My account", the no-access
page, the location sheet. Don't build these.

---

## Part C — Schema changes (require a migration)

### C1. Enum
- `TakerStatus`: add **`REJECTED`** → now PENDING, APPROVED, REJECTED, SUSPENDED.

### C2. New fields on existing models

**Taker** (status audit)
```prisma
statusReason      String?
statusChangedAt   DateTime?
statusChangedById String?
statusChangedBy   User?    @relation("TakerStatusChangedBy", fields: [statusChangedById], references: [id])
```

**Claim**
- `managerNote String?` — **ALREADY IN SCHEMA. No action.** (added earlier)

**Booking**
```prisma
bookedById    String?   // manager who booked on behalf of a bulk taker
bookedBy      User?     @relation("BookingBookedBy", fields: [bookedById], references: [id])
rescheduledAt DateTime?
cancelNote    String?   // (Booking.note already exists for general notes; this is cancel-specific)
```

**PickupSlot**
- Make `batchId` **optional** → `batchId String?` and `batch Batch? @relation(...)`.
  A null batch = a general availability window not tied to one harvest. Traceability still
  holds because the Booking links to a Claim/Allocation, which links to a Batch.
- Add `seriesId String?` — groups slots created together via "Repeat".

**Handover** (bag breakdown)
```prisma
halfKgBags Int      @default(0)
oneKgBags  Int      @default(0)
looseKg    Decimal  @default(0)
undoneAt   DateTime?          // for the 10-second undo
// note String?  — ALREADY IN SCHEMA. No action.
```
- **`actualKg` stays the single reporting figure**, and is **computed from the bags** at
  record time: `actualKg = 0.5*halfKgBags + 1*oneKgBags + looseKg`. Store it; don't let it
  drift from the breakdown. All impact/Waste-Diary reporting still sums `actualKg` only.

### C3. New models
```prisma
model BatchTopUp {
  id          String   @id @default(uuid())
  batchId     String
  batch       Batch    @relation(fields: [batchId], references: [id])
  kg          Decimal
  note        String?
  createdById String
  createdBy   User     @relation("TopUpCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
}

model ActivityLog {          // append-only audit / activity feed
  id         String   @id @default(uuid())
  actorId    String?
  actor      User?    @relation("ActivityActor", fields: [actorId], references: [id])
  action     String              // e.g. "claim.approved"
  entityType String              // e.g. "Claim"
  entityId   String
  meta       Json?
  createdAt  DateTime @default(now())
}

model SavedReportView {      // NICE-TO-HAVE — defer (see Part G)
  id        String   @id @default(uuid())
  name      String
  filters   Json
  userId    String
  user      User     @relation("SavedViews", fields: [userId], references: [id])
  createdAt DateTime @default(now())
}
```
Add the matching back-relations on `User` (`statusChangesMade`, `bookingsBookedOnBehalf`,
`topUpsCreated`, `activityLogs`, `savedViews`).

### C4. BatchTopUp ↔ totalKg
On a top-up: in **one transaction**, create the `BatchTopUp` row **and** increment
`Batch.totalKg` by `kg`. `totalKg` stays the current authoritative total; BatchTopUp is the
audit trail of how it grew. `publicPoolKg` / `kgRemaining` math is unchanged (still uses
`totalKg`).

### C5. Decimal migration (do this — good call)
Switch **all kg fields from `Float` to `Decimal`** to kill 0.1 rounding errors:
`Batch.totalKg`, `Batch.schoolReserveKg`, `Allocation.allocatedKg`, `Claim.requestedKg`,
`Claim.approvedKg`, `Handover.actualKg`, `Handover.looseKg`, `BatchTopUp.kg`.
(`Batch.bagSizeKg` is dropped — superseded by the bag breakdown.)
- In code, do kg arithmetic with `Prisma.Decimal` (decimal.js), not JS `number`, or you lose
  the benefit. The `kgRemaining` derivation uses Decimal math.

---

## Part D — Config constants (backend config, not DB)
```
MAX_CLAIM_KG = 1        // per individual, per batch
MIN_CLAIM_KG = 0.1      // step 0.1
CHANGE_SLOT_CUTOFF_HOURS = 2
HANDOVER_OVER_TOLERANCE = 0.10   // actualKg may exceed approvedKg by ≤10%
```

---

## Part E — Business rules (enforce in services, not frontend)

**Claims**
- Amount ≥ `MIN_CLAIM_KG` (0.1kg), in 0.1 steps.
- An individual's total **per batch** ≤ `MAX_CLAIM_KG` (1kg), counting **PENDING + APPROVED
  + COLLECTED** claims. Expose the remainder as `allowanceLeftKg`.
- Only **APPROVED** takers can claim.
- `approvedKg` ≤ `requestedKg` **and** ≤ current `kgRemaining`.
- Bulk approve: partial success — approve what fits, skip the rest, and **report skipped**.

**Takers**
- Suspending (or rejecting) a taker **cancels their active claims and bookings** and frees
  the kg back to the pool. Record `statusReason` / `statusChangedById` / `statusChangedAt`.

**Bookings & slots**
- A slot change is **atomic** with capacity + deadline + `CHANGE_SLOT_CUTOFF_HOURS` checks;
  on failure the old slot is kept.
- Cancelling a slot cancels its bookings and returns those claims to **"needs booking"**
  (an APPROVED claim with no active booking — derive it, no new status needed).
- A slot's `capacity` can't be set below its current active booking count.

**Handover**
- Requires a **photo** and an **APPROVED claim** or **CONFIRMED allocation**.
- Enforce `HANDOVER_OVER_TOLERANCE`: `actualKg` ≤ `approvedKg × 1.10`.
- **No-show** can only be marked **after the slot starts**; it releases the kg.

**Batches**
- Top-up allowed only on **DRAFT or OPEN** batches.
- Status transitions strictly **DRAFT → OPEN → CLOSED → COMPLETED**.

---

## Part F — Endpoints

**Taker**
- `GET /batches`, `GET /batches/:id` — include `allowanceLeftKg` for the current taker.
- `POST /claims` — submit a claim.
- `GET /claims` (mine), `POST /claims/:id/cancel`.
- `PATCH /bookings/:id` — move a booking to a new slot (Change Pickup).
- `GET /claims/:id/pass` — Pickup Pass (QR/reference).

**Manager**
- `GET /manager/dashboard` — single summary payload.
- `GET /manager/search?q=` — sidebar search. *(secondary)*
- Batches: `POST /batches`, `POST /batches/:id/topup`, `POST /batches/:id/publish`,
  `POST /batches/:id/close`, `POST /batches/:id/complete`.
- Allocations: full CRUD under a batch.
- Claims: `POST /claims/:id/approve`, `POST /claims/:id/reject`, `POST /claims/bulk-approve`.
- Pickups: `POST /slots` (with repeat/series), `PATCH /slots/:id` (move/close/reopen),
  `POST /slots/:id/cancel`, `GET /claims/needs-booking`, `POST /bookings/on-behalf`.
- Handover: `GET /handovers/lookup?ref=` (QR/search), `POST /handovers` (record),
  `POST /handovers/:id/undo`, `POST /bookings/:id/no-show`.
- Takers: approve, bulk-approve, decline, suspend, reinstate, create/edit bulk taker.
- Reports: analytics per section (shared filters), CSV export, saved views. *(nice-to-have)*

---

## Part G — Priority (≈5 days to 1 Oct submission, 2 Oct showcase)

Build in this order. **CORE is the demo loop — guarantee it works end-to-end before anything else.**

**CORE (must work for the demo + the impact story)**
- Decimal migration + new fields/models migration.
- Batches: create, top-up, publish, close, complete.
- Allocations CRUD.
- Claims: submit, allowance/cap, approve, reject, bulk-approve.
- Slots: create, book, change (atomic), cancel; needs-booking list; book-on-behalf.
- Handover: record (photo + bags → actualKg), no-show.
- Takers: approve, decline, suspend, create/edit bulk taker.
- `GET /manager/dashboard` (simple totals from `actualKg`).

**SECONDARY (if core is solid)**
- Pickup Pass + handover lookup by reference (QR flow).
- 10-second undo (`undoneAt`).
- Sidebar search.
- Repeat/series slot creation.

**DEFER (post-hackathon / only if time spare)**
- Full ActivityLog wiring across the app (add the table, but instrument lazily).
- Reports: per-section analytics, CSV export, SavedReportView.

**Honest note:** the endpoint list is a complete production surface. You don't need all of it
for a winning prototype — you need the CORE loop rock-solid and demoable, plus real weighed
handovers feeding the dashboard. Don't let SECONDARY/DEFER polish delay a working CORE.

---

## Part H — Flags & confirmed decisions

- **Duplicates already in schema:** `Claim.managerNote`, `Handover.note` — no action.
- **Confirmed:** min claim 0.1kg, cap 1kg **per batch** (matches `MIN_CLAIM_KG`/`MAX_CLAIM_KG`).
- **Open product call (minor):** vetting strictness — individuals default to PENDING →
  manager approves (aligns with "only APPROVED takers can claim"). Keep unless the team
  decides auto-approve.
- After applying: run `npx prisma migrate dev --name frontend-updates`, then `prisma generate`.