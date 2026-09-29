# LoopSoil — Finalizing & Launch Runbook

> Final push to 1 Oct submission / 2 Oct showcase. Work top to bottom. Principle: **make the
> CORE loop bulletproof and demoable before polishing anything.** Test locally → deploy →
> smoke-test production → showcase.

---

## 1. Pre-deploy blockers (do these first — they gate everything)

- [X] **Custom SMTP in Supabase.** The default Supabase email has a tiny rate limit and will
      block testers' sign-up emails after a few. Create a Resend account, verify a sender,
      and put its SMTP creds in Supabase → Auth → SMTP settings. Test one real sign-up email
      lands.
- [X] **Handover photo upload — test end to end NOW.** This is your prize evidence, so prove
      it works early: record one handover with a real photo, confirm it uploads to Supabase
      Storage and the URL displays back. Check the bucket's access policy allows it.
- [X] **Promote the manager account.** Sign up `loopsoiladmin@gmail.com` in the app so the
      Supabase auth user exists, then from `backend/`:
      `npm run promote-manager -- loopsoiladmin@gmail.com`
      Confirm that account now sees the manager console.
- [ ] **Seed a demo scenario** so UAT and the showcase have data: 1–2 batches (one OPEN with
      remaining kg), a couple of approved individual takers, one bulk taker (NParks, 10kg
      target), a pickup slot or two.

---

## 2. UAT — test locally first, then on production

### 2a. Smoke test — the CORE loop, happy path, end to end
Do this once as a taker and once as a manager before hunting edge cases. If this breaks,
nothing else matters.

- [X] Taker: register → (manager approves) → browse batches → claim 0.5kg → see APPROVED →
      book a pickup slot → view pickup pass.
- [X] Manager: log batch → top-up → publish → see the claim → approve → create slot →
      record handover with photo + bags → dashboard total goes up.

### 2b. Error messages & edge cases (the part testers break)
Claims
- [X] Claim below 0.1kg → rejected with clear message.
- [X] Claim not in 0.1 steps (e.g. 0.35) → rejected.
- [X] Claim over 1kg per batch, or a 2nd claim that pushes the batch total over 1kg → blocked;
      `allowanceLeftKg` shown correctly.
- [X] Approve more than requested, or more than kg remaining → blocked.
- [X] Non-APPROVED taker tries to claim → blocked.
- [X] Bulk approve with some invalid → partial success, skipped ones reported.

Bookings & slots
- [ ] Change pickup past the 2-hour cutoff → blocked, old slot kept.
- [ ] Set slot capacity below current bookings → blocked.
- [ ] Cancel a slot → its bookings cancel, those claims return to "needs booking".

Handover
- [X] Record without a photo → blocked.
- [X] actualKg over approved by >10% → blocked (tolerance).
- [X] Mark no-show before the slot starts → blocked; after start → allowed, kg released.

Takers & batches
- [X] Suspend a taker → their active claims + bookings cancel, kg frees back.
- [X] Try an out-of-order batch status change (e.g. Draft → Completed) → blocked.
- [X] Top-up a Closed/Completed batch → blocked.

### 2c. Roles & auth
- [ ] Logged-out user hitting a protected route → redirected to login.
- [X] A taker cannot reach manager pages or manager API endpoints.

### 2d. Cross-cutting
- [X] **Mobile:** run the taker flow on an actual phone — takers use phones at the showcase.
- [X] **Decimal:** a 0.1 + 0.2 style sum shows 0.3, not 0.30000004 (confirms the Decimal fix).
- [X] **Dark mode:** logos/navy stay readable (you already fixed the report cover).
- [X] **Photo upload** works on the deployed site, not just locally.

---

## 3. Deployment

**Stack:** Vercel (frontend) · Railway (backend) · Supabase Pro (DB/Auth/Storage) · Resend (SMTP).
Set every region to **Singapore**.

### Steps
- [ ] **Supabase → upgrade to Pro** (removes free-tier pausing during the showcase window).
- [ ] **Backend on Railway:** new project from the GitHub repo, root = `backend/`.
      - Add all backend env vars (from `.env`): `DATABASE_URL` (pooled, :6543),
        `DIRECT_URL` (:5432), Supabase URL + keys, storage bucket, `PORT`.
      - Build: `npm install && npx prisma generate && npm run build`. Start: `npm run start:prod`.
      - Run the migration against prod once: `npx prisma migrate deploy`.
      - Confirm the service is **always-on** (not sleeping) so the cron job runs.
- [ ] **Frontend on Vercel:** import the repo, root = `frontend/`.
      - Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
        `NEXT_PUBLIC_API_URL` = your Railway backend URL.
      - Set the Vercel function region to Singapore.
- [ ] **CORS:** allow the Vercel frontend domain in the NestJS backend.
- [ ] **Point auth redirects** in Supabase to the Vercel domain.

### 4. Production smoke test (repeat 2a on the live URLs)
- [ ] Full core loop works on the deployed site.
- [ ] Sign-up email arrives (SMTP live).
- [ ] Handover photo uploads on prod.

---

## 5. Showcase-day resilience (2 Oct)

- [ ] **Pre-warm** ~30 min before: hit the backend and load the site so there's no cold start.
- [ ] **Seed fresh demo data** the morning of, so the dashboard shows real, clean numbers.
- [ ] **Local fallback:** have the app runnable on your laptop (`npm run dev`) as a backup in
      case venue wifi fails — a rehearsed offline demo beats a spinning loader.
- [ ] **Rehearse the 2-minute demo path** so you're not clicking around live: the one story is
      log batch → taker claims → approve → book → handover with photo → dashboard kg goes up.
- [ ] Have the **Waste Diary numbers** (real kg diverted, from actual handovers) ready to show.

---

## 6. Suggested sequence (given ~2–3 days)

1. **Today:** Pre-deploy blockers (§1) + local core-loop smoke test (§2a). Fix breakages.
2. **Next:** Error/edge + role + cross-cutting UAT (§2b–d). Fix.
3. **Then:** Deploy (§3) + production smoke test (§4). Do this a full day before showcase, not
   the night before.
4. **Buffer / showcase eve:** run a few real handovers to build genuine Waste Diary kg, seed
   demo data, rehearse.

Don't let Secondary/Defer polish (undo, search, reports, activity log) delay a solid deploy.
A demoable CORE loop on a stable URL is the whole game.

---

## 7. Still-pending content (chase SUSS / your teammate)

- [ ] Taker approval time — "usually [1–2] working days" (Tutorial, FAQ, pending message).
- [ ] Exact bin-centre spot — "At the SUSS bin centre, [exact spot]" (Tutorial, FAQ).
- [ ] Bag/BYO wording — the ½kg/1kg + own-container line (FAQ).
- [ ] Bin-centre **map pin** → un-hides "View on map".
- [ ] **LoopSoil logo** (replacing the dashed placeholder) — from your teammate.
