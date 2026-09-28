# LoopSoil Backend — How It Works (for frontend teammates)

> **Give this file to your Claude Code session.** It tells Claude everything it needs to
> build a screen against the real API: every route, what to send, what comes back, who's
> allowed to call it, and the client files already set up for you. You should not need to
> open the backend code to build a frontend screen — if something here doesn't match what
> you see happen, tell the backend owner rather than guessing.
>
> `CLAUDE2.md` at the repo root explains the product, the data model and the business rules.
> `Backend-Updates.md` explains what changed for the new screens. This file is the "how do I
> actually call it" companion, and it reflects the backend **after** those updates.

---

## 0. What changed since the last version of this file

If you already built against the old API, these are the breaking changes:

| Before | Now |
|---|---|
| `POST /batches/:id/open` | `POST /batches/:id/publish` |
| `bagSizeKg` on batches | Removed. Bags are recorded per handover instead (§10). |
| `PATCH /takers/:id { status }` | Status can't be set there any more. Use `/approve`, `/decline`, `/suspend`, `/reinstate` (§5). |
| One claim per batch, up to the pool | **0.1–1 kg per person per batch, in 0.1 kg steps**, across all their claims (§8) |
| `POST /bookings/:id/reschedule` | `PATCH /bookings/:id` |
| Handover `actualKg` computed from bags | Send **`actualKg` off the scale**; the bag breakdown is information only (§10) |
| Handover photo optional | **Photo required** |
| — | New: manager light/dark switch (`PATCH /auth/me/theme`, §5), pickup reviews (§12b), batch top-up, bulk claim approval, "needs booking" list, book on behalf, general pickup slots, `GET /manager/dashboard` |

---

## 1. The one thing to understand first

Two servers, one job split:

- **Supabase** — login only. Sign up, sign in, sessions, password reset.
- **NestJS backend** (`backend/`, runs on `http://localhost:3001`) — everything else.
  Every rule in the product (who can claim how much compost, when a slot is full, what
  counts as "collected") lives here. **The frontend never talks to the database directly**
  — always through this API.

So a screen almost always does two things: ask Supabase "who is this person", then ask the
backend "what can they do / see". That wiring is already done in `frontend/src/lib/` (§3).

---

## 2. Talking to the API

- Base URL: `NEXT_PUBLIC_API_URL` (`.env.local`) → `http://localhost:3001` locally.
- Every request except `GET /health` needs a **Bearer token** — the current user's Supabase
  access token. The `api.ts` client (§3) adds it for you.
- Request bodies are JSON, except `POST /handovers` and `POST /handovers/:id/photo`, which
  are `multipart/form-data` (§10).
- **Every list endpoint is paginated.** Query params `?page=1&pageSize=20`. Response:
  ```json
  { "data": [ /* items */ ], "meta": { "page": 1, "pageSize": 20, "total": 47, "totalPages": 3 } }
  ```
- **Every error has the same shape:**
  ```json
  {
    "statusCode": 409,
    "code": "SLOT_FULL",
    "message": "That pickup slot is full",
    "path": "/bookings",
    "timestamp": "2026-09-20T10:00:00.000Z"
  }
  ```
  `message` is human-readable — safe to show directly in a toast. `code` is stable — use it
  when a screen needs to react differently (e.g. offer other slots on `SLOT_FULL`). Codes are
  listed in §13.

### ⚠ kg values: numbers vs strings

kg is stored as an exact decimal. How it reaches you depends on the field:

- **Already numbers** — use as-is: everything in a batch's `pool`, `allowanceLeftKg`,
  handover `actualKg` / `looseKg` / `expectedKg`, all of `/reporting/*` and
  `/manager/dashboard`.
- **Strings** like `"0.5"` or `"20"` — the raw record fields: batch `totalKg` /
  `schoolReserveKg`, claim `requestedKg` / `approvedKg`, allocation `allocatedKg`, top-up
  `kg`. Wrap them in `Number(...)` before doing maths or formatting.

When sending kg, plain JSON numbers are fine (`{ "requestedKg": 0.5 }`).

---

## 3. The files already built for you

**`frontend/src/lib/supabase.ts`** — the Supabase browser client. Only for login /
sign-up / sign-out.

**`frontend/src/lib/api.ts`** — the typed client for the backend. Use it for every JSON call:

```ts
import { api, ApiError, type Paginated } from "@/lib/api";

const batches = await api.get<Paginated<Batch>>("/batches");
const claim = await api.post<Claim>("/claims", { batchId, requestedKg: 0.5 });
await api.patch(`/bookings/${id}`, { slotId });
await api.del(`/slots/${id}`);
```

- `api.get / post / patch / del` — attaches the token, JSON-encodes the body, parses the reply.
- Non-2xx throws `ApiError` with `.status`, `.code`, `.message` (validation messages arrive
  already joined into one string). Show `.message`; branch on `.code`.
- It JSON-encodes everything, so **don't use it for the handover photo upload** — see §10.

**`frontend/src/lib/auth-provider.tsx`** — already wraps the app. One hook:

```ts
import { useAuth } from "@/lib/auth-provider";
const { user, loading, session, signIn, signOut, refreshUser } = useAuth();
```

- `user` — the backend's `User` (`{ id, email, name, phone, role, ... }`) or `null`.
  **`user.role` (`"MANAGER"` | `"TAKER"`) is what decides the UI**, not anything from Supabase.
- `loading` — don't render role-based UI until it's `false`.
- `refreshUser()` — call after the user changes their own data (e.g. after `POST /takers/register`).

**`frontend/src/lib/route-guard.tsx`** — already mounted. Sends logged-out users to `/login`
and keeps managers and takers out of each other's routes. No redirect logic needed per page.

---

## 4. Roles

| Role | Who | Can do |
|---|---|---|
| `MANAGER` | SUSS staff/students with a manager login (also whoever supervises a handover) | Everything: batches, bulk orgs, vetting, claims, slots, bookings, handovers, reports |
| `TAKER` | An individual who receives compost | Register, browse open batches, claim, book/change/cancel own pickups, see own history |

Bulk organisations (NParks, town councils…) **don't log in** — the manager acts for them.

A route with no role below is open to **any logged-in user**, scoped by ownership for takers
(`GET /claims` = everyone's for a manager, only yours for a taker). Fetching someone else's
record by id returns a plain `404`, not `403` — treat both as "not found".

---

## 5. Auth, registration & vetting

```
Supabase sign-up/login  →  GET /auth/me  →  { role: "TAKER" | "MANAGER" }
```

- **`GET /auth/me`** — the first call after login creates the `User` row (role `TAKER`).
  Already done inside `auth-provider.tsx`.
- **`PATCH /auth/me/theme`** *(MANAGER)* `{ theme: "LIGHT" | "DARK" }` — the manager light/dark switch. Saved on the account, so it survives log-out and follows them to other devices; `/auth/me` returns it as `theme` (default `LIGHT`).
- Managers are promoted by a backend script — never build a "become manager" button.
- A login is **not** permission to claim. An individual must register as a taker and be
  approved first.

### Taker side

| Route | Role | Body / notes |
|---|---|---|
| `POST /takers/register` | TAKER | `{ name?, phone?, intendedUse? }` → taker record with `status: "PENDING"`. Call `refreshUser()` after. |
| `GET /takers/me` | TAKER | Own taker record. Use `status` for banners: `PENDING` "awaiting approval", `REJECTED` / `SUSPENDED` show `statusReason`. |
| `PATCH /takers/me` | TAKER | `{ name?, phone?, intendedUse? }` |

### Manager side

| Route | Role | Body / notes |
|---|---|---|
| `GET /takers?type=&status=&search=` | MANAGER | Vetting queue: `?type=INDIVIDUAL&status=PENDING`. Bulk orgs: `?type=BULK`. `search` matches name, email or phone. Each row carries `statusChangedBy { id, name }` and `stats { collectedKg, claims, allocations, noShows, lastActiveAt, monthAllocatedKg, monthCollectedKg }` (this month = SG calendar month). |
| `GET /takers/:id` | MANAGER | Same shape as a list row (with `stats`). |
| `POST /takers/:id/approve` | MANAGER | `{ statusReason? }` — `PENDING` or `REJECTED` → `APPROVED` |
| `POST /takers/:id/decline` | MANAGER | `{ statusReason }` **required** — `PENDING` → `REJECTED` |
| `POST /takers/:id/suspend` | MANAGER | `{ statusReason }` **required** — `APPROVED` → `SUSPENDED` |
| `POST /takers/:id/reinstate` | MANAGER | `{ statusReason? }` — `SUSPENDED` → `APPROVED` |
| `POST /takers/bulk` | MANAGER | Create a bulk org: `{ name, category, email, phone?, intendedUse?, monthlyKgTarget? }`. `category`: `NPARKS \| TOWN_COUNCIL \| SCHOOL \| COMMUNITY_GARDEN \| INDEPENDENT_FARMER \| OTHER`. Auto-approved. |
| `PATCH /takers/:id` | MANAGER | Edit profile fields (same as bulk create, all optional). **Not** status. |

Every status change records `statusReason`, `statusChangedAt` and `statusChangedById` — show
them on the taker's detail page.

**Decline and suspend cascade:** they automatically cancel that taker's open claims
(`PENDING`/`APPROVED`) and active allocations, plus their booked pickups. Warn the manager in
the confirm dialog ("This will cancel N claims and their pickups").

**Taker statuses:** `PENDING` → `APPROVED` or `REJECTED`; `APPROVED` ↔ `SUSPENDED`;
`REJECTED` → `APPROVED` (manager changed their mind).

---

## 6. Batches — the compost supply

A **batch** is one harvest. Every batch response carries a live `pool` — **show these
numbers, never compute kg on the frontend**:

```json
{
  "id": "...",
  "reference": "2026-09-A",
  "totalKg": "20",
  "schoolReserveKg": "5",
  "status": "OPEN",
  "pickupLocation": "Near bin centre / composter",
  "availableFrom": null,
  "availableUntil": "2026-10-10T00:00:00.000Z",
  "pool": {
    "totalKg": 20,
    "schoolReserveKg": 5,
    "allocatedKg": 6,
    "publicPoolKg": 9,
    "pendingClaimKg": 3,
    "approvedClaimKg": 2,
    "kgRemaining": 4
  },
  "allowanceLeftKg": 0.5
}
```

- `pool.kgRemaining` — what's left in the batch for new claims.
- `allowanceLeftKg` — how much **this taker** can still claim from this batch (their 1 kg cap
  minus what they've already claimed). `null` for managers and for takers who aren't approved.
  A taker can claim `min(allowanceLeftKg, pool.kgRemaining)`.

| Route | Role | Body / notes |
|---|---|---|
| `POST /batches` | MANAGER | `{ harvestDate, totalKg, schoolReserveKg?, reference?, phReading?, availableFrom?, availableUntil?, pickupLocation?, notes? }`. `reference` auto-generates (`2026-09-A`). `pickupLocation` defaults to "Near bin centre / composter". Starts `DRAFT`. |
| `GET /batches?status=` | any | Takers only ever see `OPEN` batches. |
| `GET /batches/:id` | any | |
| `PATCH /batches/:id` | MANAGER | Same fields as create, all optional (not `reference`). Blocked if it would strand kg already committed. |
| `POST /batches/:id/topup` | MANAGER | `{ kg, note? }` — adds stock (e.g. the weekly harvest). `DRAFT` or `OPEN` only. Logged as a top-up row; `totalKg` increases. |
| `POST /batches/:id/publish` | MANAGER | `DRAFT` → `OPEN` (also re-opens a `CLOSED` batch) |
| `POST /batches/:id/close` | MANAGER | `OPEN` → `CLOSED` — stops new claims |
| `POST /batches/:id/complete` | MANAGER | Only when every claim/allocation is collected or cancelled |
| `DELETE /batches/:id` | MANAGER | Only an untouched `DRAFT` |

**Statuses:** `DRAFT` (hidden from takers) → `OPEN` → `CLOSED` (can re-open) → `COMPLETED`.

---

## 7. Allocations — set amounts for bulk orgs

Manager-only. Bulk orgs get a fixed amount per batch — no request/approval step.

| Route | Role | Body / notes |
|---|---|---|
| `POST /allocations` | MANAGER | `{ batchId, takerId, allocatedKg, reference?, note? }`. `takerId` must be a BULK taker. Blocked if more than `pool.kgRemaining`. One active allocation per org per batch — edit instead. |
| `GET /allocations?batchId=&takerId=&status=` | MANAGER | |
| `GET /allocations/:id` | MANAGER | |
| `PATCH /allocations/:id` | MANAGER | `{ allocatedKg?, note? }` |
| `POST /allocations/:id/confirm` | MANAGER | `PLANNED` → `CONFIRMED` (the org said yes) — only now can it be booked |
| `POST /allocations/:id/cancel` | MANAGER | `{ note? }` — frees the kg |

**Statuses:** `PLANNED` → `CONFIRMED` → `COLLECTED`, or `CANCELLED` from either of the first two.

---

## 8. Claims — individuals asking for compost

### Taker

| Route | Role | Body / notes |
|---|---|---|
| `POST /claims` | TAKER | `{ batchId, requestedKg }` |
| `GET /claims?batchId=&status=` | any | Taker: own claims only |
| `GET /claims/:id` | any | |
| `POST /claims/:id/cancel` | owner or MANAGER | `{ cancellationReason, reasonNote? }` — reason **required**: `WRONG_AMOUNT \| SOURCED_ELSEWHERE \| CANNOT_MAKE_PICKUP \| NO_LONGER_NEEDED \| OTHER` |

**Claim rules** (enforced by the server; mirror them in the form so users rarely hit errors):
- Taker must be registered **and** `APPROVED`.
- Batch must be `OPEN` and inside its `availableFrom` / `availableUntil` window.
- `requestedKg` between **0.1 and 1 kg**, in **0.1 kg steps** (0.1, 0.2 … 1.0).
- **1 kg per person per batch in total.** Pending, approved and collected claims all count, so
  a taker can make several small claims until the 1 kg is used. Use `allowanceLeftKg` from
  the batch to cap the input.
- Can't exceed the batch's `pool.kgRemaining`.

### Manager

| Route | Role | Body / notes |
|---|---|---|
| `GET /claims?status=PENDING` | MANAGER | The approval queue. Also `?takerId=`, `?batchId=`. |
| `POST /claims/:id/approve` | MANAGER | `{ approvedKg?, managerNote? }` — defaults to the full amount; can approve less, never more. Locks the amount. |
| `POST /claims/bulk-approve` | MANAGER | `{ claimIds: [...] }` → `{ approved: [claim, ...], skipped: [{ claimId, reason }] }`. **Partial success** — show the skipped list with its reasons. |
| `POST /claims/:id/reject` | MANAGER | `{ rejectionReason, reasonNote?, managerNote? }` — reason **required**: `INSUFFICIENT_SUPPLY \| HIGHER_PRIORITY \| SLOT_UNAVAILABLE \| INELIGIBLE_TAKER \| OTHER` |
| `PATCH /claims/:id/manager-note` | MANAGER | `{ managerNote }` — working note; `""` clears it |
| `GET /claims/needs-booking` | MANAGER | Approved claims with no active pickup booked, oldest approval first — the "chase these people" list (includes claims whose slot was cancelled). Paginated. |

**Statuses:** `PENDING` → `APPROVED` → `COLLECTED` (set by the handover). `PENDING` →
`REJECTED`. `PENDING` / `APPROVED` → `CANCELLED`.

---

## 9. Pickup slots & bookings

A **slot** is a pickup time window; a **booking** reserves one seat in it for one claim or
one allocation.

### Slots

| Route | Role | Body / notes |
|---|---|---|
| `POST /slots` | MANAGER | `{ startTime, endTime, batchId?, location?, capacity?, note? }`. **`batchId` is optional** — leave it out for a general pickup window any batch's claims can book. `capacity` defaults to 1. |
| `GET /slots?batchId=&status=&upcoming=true` | any | Each slot includes `bookedCount`, `remainingCapacity`, `effectiveLocation` (slot location → batch location → `null`). **Use these, don't count bookings yourself.** Takers only see `OPEN` slots. |
| `GET /slots/:id` | any | |
| `PATCH /slots/:id` | MANAGER | `{ startTime?, endTime?, location?, capacity?, note? }` — can't shrink capacity below what's booked |
| `POST /slots/:id/open` / `/close` | MANAGER | `close` stops new bookings; existing ones stand |
| `POST /slots/:id/cancel` | MANAGER | Cancels the slot and its bookings (each gets a `cancelNote`). The claims stay `APPROVED` and show up in `GET /claims/needs-booking`. |
| `DELETE /slots/:id` | MANAGER | Only a slot that never had bookings |

### Bookings

| Route | Role | Body / notes |
|---|---|---|
| `POST /bookings` | TAKER (own claim) / MANAGER | `{ slotId, claimId }` **or** `{ slotId, allocationId }` (exactly one), `note?`. Claim must be `APPROVED`; allocation `CONFIRMED` (manager only). |
| `POST /bookings/on-behalf` | MANAGER | Same body. For booking on someone's behalf (bulk orgs, or a taker on WhatsApp). Records the manager in `bookedById`. |
| `GET /bookings?slotId=&batchId=&status=` | any | Taker: own only |
| `GET /bookings/:id` | any | Includes slot, claim/allocation, and the handover once it exists |
| `PATCH /bookings/:id` | owner / MANAGER | `{ slotId }` — **"Change pickup"**. Blocked within **2 hours of the current slot's start** (`CHANGE_CUTOFF_PASSED`). Also how a booking cancelled by a slot cancellation gets rebooked. Atomic — if the new slot is full, the old one is kept. Sets `rescheduledAt`. |
| `POST /bookings/:id/cancel` | owner / MANAGER | `{ note? }` — frees the seat; the claim stays `APPROVED` so they can book again |
| `POST /bookings/:id/no-show` | MANAGER | Only **after the slot has started** (`SLOT_NOT_STARTED` before that). Releases the kg back to the pool. |
| `POST /bookings/expire-overdue` | MANAGER | Runs the overdue sweep now (it also runs automatically every 30 min) |

**Statuses:** `BOOKED` → `COLLECTED` (on handover), `NO_SHOW`, or `CANCELLED`. Bookings not
collected by their deadline (2 days after the slot for individuals, 7 for bulk orgs) are
expired automatically — nothing to build.

Show `cancelNote` on cancelled bookings so the taker knows why.

---

## 10. Handovers — the weigh-in (the most important screen)

The manager records "I handed this person X kg, here's the photo." Every number in the
reports comes from here.

**`POST /handovers`** *(MANAGER)* — **`multipart/form-data`, not JSON**.
Send exactly one of `bookingId`, `claimId` or `allocationId` (else `HANDOVER_TARGET`). With
`claimId`/`allocationId` and no BOOKED booking, it's a **walk-in**: inside the same transaction the
server creates a one-off pickup slot (capacity 1, `CLOSED`, starting at `handedOverAt`, note
"Walk-in handover") and books the claim/allocation into it (re-using a cancelled booking row if
there is one), then does the normal COLLECTED flip. If it already has a BOOKED booking, that is used.

```ts
import { supabase } from "@/lib/supabase";

const form = new FormData();
form.append("bookingId", bookingId); // OR claimId / allocationId (walk-in) — exactly one
form.append("actualKg", "2.8");       // REQUIRED — NET kg off the scale
form.append("halfKgBags", "2");      // number of 0.5 kg bags (information)
form.append("oneKgBags", "1");       // number of 1 kg bags
form.append("looseKg", "0.3");       // unbagged remainder, weighed
form.append("photo", photoFile);     // REQUIRED
form.append("takerConfirmed", "true");        // optional
form.append("note", "collected 10:15am");     // optional
// form.append("handedOverAt", isoString);    // optional, defaults to now, can't be future

const { data } = await supabase.auth.getSession();
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/handovers`, {
  method: "POST",
  headers: { Authorization: `Bearer ${data.session?.access_token}` }, // no Content-Type — the browser sets it
  body: form,
});
```

- **`actualKg` is the scale reading** (NET, tare excluded), sent by the form; it must be more
  than 0 and is the figure every report sums. The bag breakdown (`halfKgBags`, `oneKgBags`,
  `looseKg`) records how it was packed — the form warns when it doesn't add up, the server doesn't.
- **Tolerance:** `actualKg` may be at most **10% over** the approved (claim) or allocated
  (allocation) kg — e.g. approved 1 kg → max 1.1 kg. Warn in the form before submitting.
- **Photo:** required. JPEG/PNG/WebP/HEIC, max 10 MB.
- Booking must be `BOOKED` with no handover yet. In one step the server records the handover
  **and** flips the booking and the claim/allocation to `COLLECTED`.

| Route | Role | Body / notes |
|---|---|---|
| `GET /handovers/lookup?code=CLM-2026-091` | MANAGER | Scan / type a reference (claim `CLM-…` or allocation `ALC-…`, case-insensitive) → `{ kind, id, reference, status, kg, requestedKg, decidedAt, taker{…status}, batch, booking{…slot} \| null, handover \| null, canRecord, issues[] }`. Each issue is `{ code, blocking, message }`: blocking `ALREADY_COLLECTED`, `RELEASED`, `NOT_APPROVED`, `TAKER_SUSPENDED`; warnings `NO_BOOKING` (records as a walk-in), `PAST_DEADLINE`, `WRONG_DAY`. `canRecord` = no blocking issue. **404** when nothing matches. |
| `POST /handovers/:id/photo` | MANAGER | multipart, `photo` field only — replace the photo |
| `GET /handovers?batchId=&takerId=&from=&to=&missingPhoto=true` | any | Manager: all. Taker: own. |
| `GET /handovers/:id` | any | |
| `POST /handovers/:id/confirm` | TAKER (own) | Taker confirms they received it |
| `PATCH /handovers/:id` | MANAGER | `{ actualKg?, halfKgBags?, oneKgBags?, looseKg?, note? }` — fix a miscount. Omitted fields keep their value; `actualKg` is re-checked against the tolerance. JSON, so `api.patch` works. |
| `POST /handovers/:id/undo` | MANAGER | Within **30 s** of recording (`UNDO_EXPIRED` after). Booking → BOOKED, claim → APPROVED / allocation → CONFIRMED, photo deleted. The row stays for audit with `undoneAt` set and is detached from the booking, so the pickup can be recorded again. Undone handovers never appear in lists or reports. |

Every handover response includes: `actualKg`, `halfKgBags`, `oneKgBags`, `looseKg`,
`expectedKg` (approved/allocated amount — show both if they differ), `photoUrl` (a **signed
URL valid ~1 hour** — re-fetch rather than cache), `batch`, `taker`, `source`
(`"CLAIM"` | `"ALLOCATION"`), `sourceReference`.

---

## 11. Manager dashboard

**`GET /manager/dashboard`** *(MANAGER)* — the manager home screen in one call:

```json
{
  "generatedAt": "2026-09-27T04:00:00.000Z",
  "impact": {
    "allTime": { "kgDiverted": 42.5, "handovers": 51, "beneficiaries": 30, "batches": 4,
                 "photoCoverage": { "withPhoto": 51, "withoutPhoto": 0, "pct": 100 },
                 "takerConfirmedPct": 80 },
    "thisMonth": { "month": "2026-09", "kgDiverted": 12.3, "handovers": 14 }
  },
  "pipeline": {
    "batches": { "draft": 1, "open": 1, "closed": 0 },
    "takers": { "pendingVetting": 3 },
    "claims": { "pending": 5, "approvedUnbooked": 2, "approvedBooked": 4 },
    "bookings": { "upcoming": 4, "overdue": 0 },
    "handovers": { "missingPhoto": 0 }
  },
  "openBatches": [
    { "id": "...", "reference": "2026-09-A", "harvestDate": "...", "availableUntil": null,
      "totalKg": 20, "kgRemaining": 4, "...": "the rest of the pool fields" }
  ],
  "recentHandovers": [
    { "id": "...", "reference": "HND-2026-09-014", "handedOverAt": "...", "actualKg": 0.8,
      "takerName": "Jo Tan", "batchReference": "2026-09-A", "hasPhoto": true }
  ]
}
```

(Values above are illustrative; the field names are exact.) The pipeline counts link to
their lists: `pendingVetting` → vetting queue, `pending` → `GET /claims?status=PENDING`,
`approvedUnbooked` → `GET /claims/needs-booking`, `missingPhoto` → `GET /handovers?missingPhoto=true`.

---

**`GET /manager/search?q=`** *(MANAGER)* — the sidebar search. `q` of 2+ characters matches
claim / allocation references and taker names (`claims`, `allocations`), taker name / email / phone
(`takers`, with claim + allocation counts) and batch references (`batches`, with `kgRemaining`;
"Batch 3" searches for "3"). Up to 5 per group, newest first.

## 12. Reporting

Read-only. Everything sums **`actualKg` from handovers only** — never requested/approved kg.

| Route | Role | Notes |
|---|---|---|
| `GET /reporting/impact?from=&to=` | any | Totals plus breakdowns by taker type, category, batch and month |
| `GET /reporting/analytics?from=&to=` | MANAGER | Dashboard / Reports KPIs. Default period: this month to date (SG). Returns `kpis` — `kgDiverted`, `kgGenerated`, `distributionRate`, `collectionRate`, `noShowRate`, `activeTakers`, `batchesCompleted`, each `{ value, previous }` (previous = the same-length period just before; rates 0–100 or null) — plus `sparklines` (7 Monday-start weeks ending with the week of `to`), `weekly` (`{ weekStart, kg, previousKg }` across the period) and `byGroup` (`INDIVIDUAL` or a bulk category → kg). |
| `GET /reporting/report?from=&to=&batchId=&takerType=&category=` | MANAGER | Every Reports section for the period + filters: `allTime` headline, `daily` / `previousDaily` kg, `topRecipients`, `batches` (reserve / bulk / individual / unclaimed split, % distributed), `generatedVsCollected` per month, claims `funnel` + `rejectionReasons` / `cancellationReasons`, `responseTime`, `claimSizes`, `pickups` (fill rate, weekday × time `heatmap`, weekly collected / no-shows), `takers` (returning vs first-time, new per month, `bulkPartners` vs monthly target scaled to the period). `/reporting/analytics` takes the same filters. |
| `GET /reporting/views` · `POST /reporting/views` `{ name, filters }` · `DELETE /reporting/views/:id` | MANAGER | Saved Reports views — each manager sees only their own. |
| `GET /reporting/top-takers?limit=10&from=&to=` | MANAGER | Who has collected the most |
| `GET /reporting/pipeline` | MANAGER | Same object as the dashboard's `pipeline` |
| `GET /reporting/waste-diary.csv?from=&to=` | MANAGER | CSV download, one row per handover. Needs the auth header, so fetch it with the token and save the blob (a plain `<a href>` won't send the token). |

---

## 12b. Pickup reviews — "Rate your pickup"

The taker's survey after a collection (board "Taker · Rate your pickup"). One review per
handover; individual takers only (bulk takers have no login). The taker only knows the
claim, so the taker calls take a `claimId` and the server finds its handover.

| Route | Role | Notes |
|---|---|---|
| `GET /reviews/claim/:claimId` | owner / MANAGER | Powers the page: `claim { id, reference, status }`, `handover { id, actualKg, handedOverAt }` (null until collected — the "Collected 0.3kg on 12 Sep" line), `canReview` (collected and not yet reviewed → show the form) and `review` (the one already sent, or null). |
| `POST /reviews` | TAKER | `{ claimId, compostRating: 1–5, pickupEase?: SMOOTH \| CONFUSING \| HARD_TO_FIND, growing?: (HERBS \| VEGETABLES \| FLOWERS \| HOUSEPLANTS \| OTHER)[], note?: ≤1000 chars }`. Only `compostRating` is required. `NOT_COLLECTED` before the handover, `REVIEW_EXISTS` on a second send. |
| `GET /reviews?batchId=&takerId=&rating=&withNote=true&from=&to=&page=&pageSize=` | any | Manager: all reviews, newest first. Taker: their own. Each row has the rating, answers, note, `taker`, `handover { reference, actualKg, handedOverAt }`, `claim` and `batch`. |
| `GET /reviews/summary` (same filters) | MANAGER | `{ count, averageRating (1 dp or null), ratingCounts [1★…5★], pickupEase { SMOOTH, CONFUSING, HARD_TO_FIND }, growing { HERBS, … }, withNote }` |

Labels for the chips: SMOOTH "Yes, smooth", CONFUSING "A bit confusing", HARD_TO_FIND "Hard to find".

---

## 13. Error codes you'll actually see

Always safe to show `message`. Use `code` when the screen should react.

| `code` | When | Suggested UI |
|---|---|---|
| `VALIDATION_ERROR` | Missing / wrong-typed field | Show `message` |
| `UNAUTHORIZED` | Session expired | Send to `/login` |
| `FORBIDDEN` | Wrong role | Shouldn't happen if the UI hides the button |
| `NOT_FOUND` | Doesn't exist, or isn't theirs | Generic "not found" |
| `INVALID_TRANSITION` | Status change not allowed (e.g. approving a rejected claim) | Refresh the record |
| **Takers** | | |
| `TAKER_NOT_REGISTERED` | Claiming before registering | Link to registration |
| `TAKER_NOT_APPROVED` / `TAKER_REJECTED` / `TAKER_SUSPENDED` | Claiming while not approved | Status banner with `statusReason` |
| `TAKER_EXISTS` | Registering twice | Go to profile |
| **Claims** | | |
| `CLAIM_BELOW_MINIMUM` / `CLAIM_ABOVE_MAXIMUM` / `CLAIM_INVALID_STEP` | Outside 0.1–1 kg or not a 0.1 step | Fix the input |
| `CLAIM_ALLOWANCE_EXCEEDED` | Over the 1 kg per-batch cap | Show `allowanceLeftKg` |
| `INSUFFICIENT_POOL` | Not enough left in the batch | `message` says how much is left |
| `BATCH_NOT_OPEN` / `BATCH_NOT_YET_AVAILABLE` / `BATCH_WINDOW_CLOSED` | Batch not claimable right now | Refresh the batch list |
| `APPROVED_EXCEEDS_REQUESTED` | Approving more than requested | Fix the input |
| **Scheduling** | | |
| `SLOT_FULL` | No seats left | Offer other slots |
| `SLOT_NOT_OPEN` / `SLOT_PAST` / `SLOT_CANCELLED` | Slot can't be booked | Refresh slots |
| `SLOT_BATCH_MISMATCH` | Slot belongs to a different batch | Only list matching or general slots |
| `CHANGE_CUTOFF_PASSED` | Changing pickup within 2 h of start | "Too late to change — contact the manager" |
| `SLOT_NOT_STARTED` | No-show before the slot began | Hide the button until then |
| `BOOKING_EXISTS` | Claim already has a live booking | Use "Change pickup" instead |
| `CLAIM_NOT_APPROVED` / `ALLOCATION_NOT_CONFIRMED` | Booking something not ready | — |
| `CAPACITY_BELOW_BOOKED` / `SLOT_HAS_BOOKINGS` | Shrinking / deleting a used slot | Show `message` |
| **Handovers** | | |
| `PHOTO_REQUIRED` / `PHOTO_TOO_LARGE` / `PHOTO_TYPE_INVALID` / `PHOTO_UPLOAD_FAILED` | Photo problems | Show `message`, let them retake |
| `HANDOVER_EMPTY` | All bag counts 0 | Fix the input |
| `HANDOVER_OVER_TOLERANCE` | More than 10% over approved | Recount, or approve more first |
| `HANDOVER_EXISTS` | Already handed over | Open the existing one |
| `HANDOVER_IN_FUTURE` | `handedOverAt` in the future | Fix the time |
| **Reviews** | | |
| `NOT_COLLECTED` | Rating a pickup that hasn't been handed over yet | Hide the form until `canReview` |
| `REVIEW_EXISTS` | Rating the same pickup twice | Show the review already sent |
| **Batches / allocations** | | |
| `BATCH_NOT_TOPUPABLE` | Top-up on a closed/completed batch | — |
| `BATCH_HAS_OPEN_ITEMS` | Completing with uncollected items | Show `message` |
| `ALLOCATION_EXISTS` | Second allocation for the same org + batch | Edit the existing one |
| `TAKER_NOT_BULK` | Allocating to an individual | Individuals use claims |

---

## 14. Not built yet

- **Notifications** (announcements, reminders) — manual for the pilot (the manager WhatsApps
  people using the phone number on the claim).
- **Later, only if time allows:** repeating slot series, reports CSV per section /
  saved views, activity log. The database already has columns for some of these (`seriesId`) — ignore them in the UI for now.

---

## 15. Quick reference — every route

```
HEALTH        GET    /health                      (public)
AUTH          GET    /auth/me
              PATCH  /auth/me/theme              (MANAGER)  light / dark switch

TAKERS        POST   /takers/register             (TAKER)
              GET    /takers/me                   (TAKER)
              PATCH  /takers/me                   (TAKER)
              POST   /takers/bulk                 (MANAGER)
              GET    /takers                      (MANAGER)
              GET    /takers/:id                  (MANAGER)
              PATCH  /takers/:id                  (MANAGER)
              POST   /takers/:id/approve          (MANAGER)
              POST   /takers/:id/decline          (MANAGER)
              POST   /takers/:id/suspend          (MANAGER)
              POST   /takers/:id/reinstate        (MANAGER)

BATCHES       POST   /batches                     (MANAGER)
              GET    /batches
              GET    /batches/:id
              PATCH  /batches/:id                 (MANAGER)
              POST   /batches/:id/topup           (MANAGER)
              POST   /batches/:id/publish         (MANAGER)
              POST   /batches/:id/close           (MANAGER)
              POST   /batches/:id/complete        (MANAGER)
              DELETE /batches/:id                 (MANAGER)

ALLOCATIONS   POST   /allocations                 (MANAGER)
              GET    /allocations                 (MANAGER)
              GET    /allocations/:id             (MANAGER)
              PATCH  /allocations/:id             (MANAGER)
              POST   /allocations/:id/confirm     (MANAGER)
              POST   /allocations/:id/cancel      (MANAGER)

CLAIMS        POST   /claims                      (TAKER)
              GET    /claims
              GET    /claims/needs-booking        (MANAGER)
              GET    /claims/:id
              POST   /claims/:id/approve          (MANAGER)
              POST   /claims/bulk-approve         (MANAGER)
              POST   /claims/:id/reject           (MANAGER)
              POST   /claims/:id/cancel           (owner/MANAGER)
              PATCH  /claims/:id/manager-note     (MANAGER)

SLOTS         POST   /slots                       (MANAGER)
              GET    /slots
              GET    /slots/:id
              PATCH  /slots/:id                   (MANAGER)
              POST   /slots/:id/open              (MANAGER)
              POST   /slots/:id/close             (MANAGER)
              POST   /slots/:id/cancel            (MANAGER)
              DELETE /slots/:id                   (MANAGER)

BOOKINGS      POST   /bookings                    (owner/MANAGER)
              POST   /bookings/on-behalf          (MANAGER)
              POST   /bookings/expire-overdue     (MANAGER)
              GET    /bookings
              GET    /bookings/:id
              PATCH  /bookings/:id                (owner/MANAGER)  change pickup
              POST   /bookings/:id/cancel         (owner/MANAGER)
              POST   /bookings/:id/no-show        (MANAGER)

HANDOVERS     POST   /handovers                   (MANAGER, multipart, photo required)
              POST   /handovers/:id/photo         (MANAGER, multipart)
              GET    /handovers/lookup?code=      (MANAGER)
              GET    /handovers
              GET    /handovers/:id
              POST   /handovers/:id/confirm       (owner)
              PATCH  /handovers/:id               (MANAGER)

MANAGER       GET    /manager/dashboard           (MANAGER)
              GET    /manager/search?q=           (MANAGER)
              GET    /reporting/analytics         (MANAGER)

REVIEWS       GET    /reviews/claim/:claimId      (owner/MANAGER)  the Rate-your-pickup page
              POST   /reviews                     (TAKER)
              GET    /reviews
              GET    /reviews/summary             (MANAGER)

REPORTING     GET    /reporting/impact
              GET    /reporting/top-takers        (MANAGER)
              GET    /reporting/pipeline          (MANAGER)
              GET    /reporting/waste-diary.csv   (MANAGER)
```

Blank role = any logged-in user (scoped to their own data where relevant).

---

*Something here doesn't match reality? Ask the backend owner before guessing — this file is
meant to save you from reading the NestJS code, not to replace asking.*
