import { dayKeySG } from '../common/reference';
import { SPARK_WEEKS, weekStartSG } from './analytics.aggregate';

/**
 * GET /reporting/report — every Reports section (Overview headline, Impact, Supply & stock,
 * Claims funnel, Pickups, Takers) for a period + filters, built from plain rows the service
 * loads (pilot scale: in memory). kg handed over always comes from Handover.actualKg.
 */
export interface ReportInput {
  handovers: {
    actualKg: number;
    handedOverAt: Date;
    takerId: string | null;
    takerName: string | null;
    takerType: 'INDIVIDUAL' | 'BULK' | null;
    category: string | null;
    batchId: string | null;
    source: 'CLAIM' | 'ALLOCATION' | null;
  }[];
  claims: {
    batchId: string;
    requestedKg: number;
    approvedKg: number | null;
    status: string;
    rejectionReason: string | null;
    cancellationReason: string | null;
    submittedAt: Date;
    decidedAt: Date | null;
    /** null = never booked; else the booking's status. */
    bookingStatus: string | null;
  }[];
  slots: {
    startTime: Date;
    capacity: number;
    bookedCount: number;
    status: string;
  }[];
  /** Bookings that reached an outcome (slot start time, kg that went / was released). */
  outcomes: {
    status: 'COLLECTED' | 'NO_SHOW';
    at: Date;
    kg: number;
    takerId: string | null;
  }[];
  batches: {
    id: string;
    reference: string;
    harvestDate: Date;
    status: string;
    totalKg: number;
    topUps: { kg: number; at: Date }[];
    schoolReserveKg: number;
    kgRemaining: number;
    availableFrom: Date | null;
  }[];
  takers: {
    id: string;
    name: string;
    type: 'INDIVIDUAL' | 'BULK';
    category: string | null;
    createdAt: Date;
    monthlyKgTarget: number | null;
  }[];
}

const DAY = 86_400_000;
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const monthKey = (d: Date) => dayKeySG(d).slice(0, 7);

export function buildReport(
  input: ReportInput,
  period: { from: Date; to: Date },
) {
  const { from, to } = period;
  const span = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - span - 1);
  const inCur = (d: Date) => d >= from && d <= to;
  const inPrev = (d: Date) => d >= prevFrom && d <= prevTo;

  const hCur = input.handovers.filter((h) => inCur(h.handedOverAt));
  const hPrev = input.handovers.filter((h) => inPrev(h.handedOverAt));

  // ── Overview headline (all time) ──
  const allTime = {
    kg: round(sum(input.handovers.map((h) => h.actualKg))),
    pickups: input.handovers.length,
    takers: new Set(input.handovers.map((h) => h.takerId).filter(Boolean)).size,
    since: input.handovers.length
      ? new Date(
          Math.min(...input.handovers.map((h) => h.handedOverAt.getTime())),
        ).toISOString()
      : null,
  };

  // ── Impact ──
  const dailyOf = (rows: typeof hCur) => {
    const m = new Map<string, number>();
    for (const h of rows) {
      const k = dayKeySG(h.handedOverAt);
      m.set(k, (m.get(k) ?? 0) + h.actualKg);
    }
    return [...m.entries()]
      .map(([day, kg]) => ({ day, kg: round(kg) }))
      .sort((a, b) => a.day.localeCompare(b.day));
  };
  const recipients = new Map<
    string,
    {
      takerId: string;
      name: string;
      type: string;
      category: string | null;
      kg: number;
      pickups: number;
    }
  >();
  for (const h of hCur) {
    if (!h.takerId) continue;
    const r = recipients.get(h.takerId) ?? {
      takerId: h.takerId,
      name: h.takerName ?? 'Unknown',
      type: h.takerType ?? 'INDIVIDUAL',
      category: h.category,
      kg: 0,
      pickups: 0,
    };
    r.kg += h.actualKg;
    r.pickups += 1;
    recipients.set(h.takerId, r);
  }
  const topRecipients = [...recipients.values()]
    .map((r) => ({ ...r, kg: round(r.kg) }))
    .sort((a, b) => b.kg - a.kg)
    .slice(0, 20);

  // ── Supply & stock ──
  const inPeriodOrActive = (b: ReportInput['batches'][number]) =>
    inCur(b.harvestDate) ||
    ['OPEN', 'CLOSED'].includes(b.status) ||
    hCur.some((h) => h.batchId === b.id);
  const batches = input.batches
    .filter(inPeriodOrActive)
    .sort((a, b) => a.harvestDate.getTime() - b.harvestDate.getTime())
    .map((b) => {
      const hs = input.handovers.filter((h) => h.batchId === b.id);
      const bulkKg = round(
        sum(hs.filter((h) => h.source === 'ALLOCATION').map((h) => h.actualKg)),
      );
      const individualKg = round(
        sum(hs.filter((h) => h.source !== 'ALLOCATION').map((h) => h.actualKg)),
      );
      const collectedKg = round(bulkKg + individualKg);
      const claims = input.claims.filter((c) => c.batchId === b.id);
      const start = b.availableFrom ?? b.harvestDate;
      const lastClaim = claims.length
        ? Math.max(...claims.map((c) => c.submittedAt.getTime()))
        : null;
      return {
        id: b.id,
        reference: b.reference,
        harvestDate: b.harvestDate.toISOString(),
        status: b.status,
        totalKg: b.totalKg,
        topUpKg: round(sum(b.topUps.map((t) => t.kg))),
        schoolReserveKg: b.schoolReserveKg,
        bulkKg,
        individualKg,
        unclaimedKg: round(
          Math.max(0, b.totalKg - b.schoolReserveKg - collectedKg),
        ),
        collectedKg,
        distributedPct:
          b.totalKg > 0 ? Math.round((collectedKg / b.totalKg) * 100) : 0,
        // Only knowable once nothing is left: first release → last claim.
        daysToFullyClaimed:
          b.kgRemaining <= 0 && lastClaim
            ? Math.max(0, Math.round((lastClaim - start.getTime()) / DAY))
            : null,
      };
    });

  const months: string[] = [];
  const firstMonth = new Date(
    Math.min(from.getTime(), to.getTime() - 100 * DAY),
  );
  for (let m = monthKey(firstMonth); m <= monthKey(to);) {
    months.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  }
  const stockAdded = input.batches.flatMap((b) => {
    const top = sum(b.topUps.map((t) => t.kg));
    return [
      { kg: b.totalKg - top, at: b.harvestDate },
      ...b.topUps.map((t) => ({ kg: t.kg, at: t.at })),
    ];
  });
  const generatedVsCollected = months.map((month) => ({
    month,
    generated: round(
      sum(stockAdded.filter((s) => monthKey(s.at) === month).map((s) => s.kg)),
    ),
    collected: round(
      sum(
        input.handovers
          .filter((h) => monthKey(h.handedOverAt) === month)
          .map((h) => h.actualKg),
      ),
    ),
  }));

  // ── Claims funnel ──
  const cCur = input.claims.filter((c) => inCur(c.submittedAt));
  const kgOf = (cs: typeof cCur, useApproved = false) =>
    round(
      sum(
        cs.map((c) =>
          useApproved ? (c.approvedKg ?? c.requestedKg) : c.requestedKg,
        ),
      ),
    );
  const approved = cCur.filter((c) => c.approvedKg != null);
  const booked = approved.filter(
    (c) => c.bookingStatus && c.bookingStatus !== 'CANCELLED',
  );
  const collected = cCur.filter((c) => c.status === 'COLLECTED');
  const count = (xs: (string | null)[]) => {
    const m: Record<string, number> = {};
    for (const x of xs) if (x) m[x] = (m[x] ?? 0) + 1;
    return m;
  };
  const funnel = {
    submitted: { count: cCur.length, kg: kgOf(cCur) },
    approved: { count: approved.length, kg: kgOf(approved, true) },
    booked: { count: booked.length, kg: kgOf(booked, true) },
    collected: { count: collected.length, kg: kgOf(collected, true) },
    rejected: cCur.filter((c) => c.status === 'REJECTED').length,
    approvedUnbooked: approved
      .filter((c) => !c.bookingStatus || c.bookingStatus === 'CANCELLED')
      .filter((c) => c.status === 'APPROVED').length,
    noShows: cCur.filter((c) => c.bookingStatus === 'NO_SHOW').length,
    upcoming: cCur.filter(
      (c) => c.status === 'APPROVED' && c.bookingStatus === 'BOOKED',
    ).length,
  };
  const rejectionReasons = count(
    cCur.filter((c) => c.status === 'REJECTED').map((c) => c.rejectionReason),
  );
  const cancellationReasons = count(
    cCur
      .filter((c) => c.status === 'CANCELLED' && c.bookingStatus !== 'NO_SHOW')
      .map((c) => c.cancellationReason),
  );

  const hoursToDecide = (cs: ReportInput['claims']) => {
    const d = cs
      .filter((c) => c.decidedAt)
      .map(
        (c) => (c.decidedAt!.getTime() - c.submittedAt.getTime()) / 3_600_000,
      );
    return d.length ? round(sum(d) / d.length, 1) : null;
  };
  const decided = cCur.filter((c) => c.decidedAt);
  const lastWeek = new Date(`${weekStartSG(to)}T00:00:00+08:00`);
  const responseTime = {
    avgHours: hoursToDecide(cCur),
    previousAvgHours: hoursToDecide(
      input.claims.filter((c) => inPrev(c.submittedAt)),
    ),
    within24Pct: decided.length
      ? Math.round(
          (decided.filter(
            (c) => c.decidedAt!.getTime() - c.submittedAt.getTime() <= DAY,
          ).length /
            decided.length) *
            100,
        )
      : null,
    sparkline: Array.from({ length: SPARK_WEEKS }, (_, i) => {
      const start = new Date(
        lastWeek.getTime() - (SPARK_WEEKS - 1 - i) * 7 * DAY,
      );
      const end = new Date(start.getTime() + 7 * DAY - 1);
      return {
        weekStart: dayKeySG(start),
        value: hoursToDecide(
          input.claims.filter(
            (c) => c.submittedAt >= start && c.submittedAt <= end,
          ),
        ),
      };
    }),
  };
  const claimSizes = {
    small: cCur.filter((c) => c.requestedKg <= 0.3 + 1e-9).length,
    medium: cCur.filter(
      (c) => c.requestedKg > 0.3 + 1e-9 && c.requestedKg <= 0.6 + 1e-9,
    ).length,
    large: cCur.filter((c) => c.requestedKg > 0.6 + 1e-9).length,
    atCap: cCur.filter((c) => c.requestedKg >= 1 - 1e-9).length,
  };

  // ── Pickups ──
  const live = (s: ReportInput['slots'][number]) =>
    s.status !== 'CANCELLED' && s.capacity > 0;
  const fill = (ss: ReportInput['slots']) => {
    const xs = ss.filter(live);
    return xs.length
      ? Math.round(
          (sum(xs.map((s) => s.bookedCount)) / sum(xs.map((s) => s.capacity))) *
            100,
        )
      : null;
  };
  const slotsCur = input.slots.filter((s) => inCur(s.startTime));
  const heat = new Map<
    string,
    {
      weekday: number;
      band: number;
      slots: number;
      booked: number;
      capacity: number;
    }
  >();
  for (const s of slotsCur.filter(live)) {
    const [y, m, d] = dayKeySG(s.startTime).split('-').map(Number);
    const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Singapore',
      }).format(s.startTime),
    );
    const band = Math.floor(hour / 2) * 2;
    const key = `${weekday}-${band}`;
    const cell = heat.get(key) ?? {
      weekday,
      band,
      slots: 0,
      booked: 0,
      capacity: 0,
    };
    cell.slots += 1;
    cell.booked += s.bookedCount;
    cell.capacity += s.capacity;
    heat.set(key, cell);
  }
  const oCur = input.outcomes.filter((o) => inCur(o.at));
  const weeks = new Map<
    string,
    { weekStart: string; collected: number; noShows: number }
  >();
  for (const o of oCur) {
    const w = weekStartSG(o.at);
    const row = weeks.get(w) ?? { weekStart: w, collected: 0, noShows: 0 };
    if (o.status === 'COLLECTED') row.collected += 1;
    else row.noShows += 1;
    weeks.set(w, row);
  }
  const pickups = {
    fillRate: fill(slotsCur),
    previousFillRate: fill(input.slots.filter((s) => inPrev(s.startTime))),
    noShows: oCur.filter((o) => o.status === 'NO_SHOW').length,
    noShowKg: round(
      sum(oCur.filter((o) => o.status === 'NO_SHOW').map((o) => o.kg)),
    ),
    heatmap: [...heat.values()],
    weekly: [...weeks.values()].sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    ),
  };

  // ── Takers ──
  const curTakers = new Set(
    hCur.map((h) => h.takerId).filter((x): x is string => !!x),
  );
  const before = new Set(
    input.handovers.filter((h) => h.handedOverAt < from).map((h) => h.takerId),
  );
  const returning = [...curTakers].filter((t) => before.has(t)).length;
  const noShowCount = new Map<string, number>();
  for (const o of input.outcomes) {
    if (o.status === 'NO_SHOW' && o.takerId)
      noShowCount.set(o.takerId, (noShowCount.get(o.takerId) ?? 0) + 1);
  }
  const signupMonths = months.slice(-5);
  const kgBy = (rows: typeof hCur, id: string) =>
    round(sum(rows.filter((h) => h.takerId === id).map((h) => h.actualKg)));
  const takers = {
    returning,
    firstTime: curTakers.size - returning,
    avgKgPerPickup: hCur.length
      ? round(sum(hCur.map((h) => h.actualKg)) / hCur.length)
      : null,
    repeatNoShows: [...noShowCount.values()].filter((n) => n >= 2).length,
    newPerMonth: signupMonths.map((month) => ({
      month,
      individual: input.takers.filter(
        (t) => t.type === 'INDIVIDUAL' && monthKey(t.createdAt) === month,
      ).length,
      bulk: input.takers.filter(
        (t) => t.type === 'BULK' && monthKey(t.createdAt) === month,
      ).length,
    })),
    bulkPartners: input.takers
      .filter((t) => t.type === 'BULK')
      .map((t) => ({
        takerId: t.id,
        name: t.name,
        category: t.category,
        // A monthly target, scaled to the period's length.
        target:
          t.monthlyKgTarget != null
            ? round(t.monthlyKgTarget * Math.max(1, span / (30 * DAY)), 1)
            : null,
        collected: kgBy(hCur, t.id),
        previousCollected: kgBy(hPrev, t.id),
      }))
      .filter((p) => p.target != null || p.collected > 0)
      .sort((a, b) => b.collected - a.collected),
  };

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    previousPeriod: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
    allTime,
    daily: dailyOf(hCur),
    previousDaily: dailyOf(hPrev),
    topRecipients,
    batches,
    generatedVsCollected,
    funnel,
    rejectionReasons,
    cancellationReasons,
    responseTime,
    claimSizes,
    pickups,
    takers,
  };
}

export type ReportData = ReturnType<typeof buildReport>;
