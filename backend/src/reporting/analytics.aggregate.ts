import { dayKeySG } from '../common/reference';

/**
 * GET /reporting/analytics — the Dashboard's KPI cards + trends and the Reports overview.
 * Pure functions over plain rows (the service loads them), so every figure is testable.
 * kg figures come from Handover.actualKg only (CLAUDE.md §13). Weeks start Monday 00:00
 * Singapore time and are labelled by that Monday ("2026-09-28").
 */
export type KpiKey =
  | 'kgDiverted'
  | 'kgGenerated'
  | 'distributionRate'
  | 'collectionRate'
  | 'noShowRate'
  | 'activeTakers'
  | 'batchesCompleted';

export const KPI_KEYS: readonly KpiKey[] = [
  'kgDiverted',
  'kgGenerated',
  'distributionRate',
  'collectionRate',
  'noShowRate',
  'activeTakers',
  'batchesCompleted',
];

export interface AnalyticsInput {
  handovers: {
    actualKg: number;
    handedOverAt: Date;
    takerId: string | null;
    /** 'INDIVIDUAL' for individual takers, else the bulk taker's category (or 'OTHER'). */
    group: string;
  }[];
  /** Bookings that reached an outcome, keyed by when their slot started. */
  outcomes: { status: 'COLLECTED' | 'NO_SHOW'; at: Date }[];
  /** kg added to stock: each batch's initial harvest (at harvestDate) and each top-up. */
  stockAdded: { kg: number; at: Date }[];
  /** COMPLETED batches, by when they were completed (last status change). */
  completedAt: Date[];
}

export interface AnalyticsReport {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  /** value = this period; previous = the same-length period just before. Rates are 0–100 or null. */
  kpis: Record<KpiKey, { value: number | null; previous: number | null }>;
  /** 7 weekly points ending with the week that contains `to`. */
  sparklines: Record<KpiKey, { weekStart: string; value: number | null }[]>;
  /** kg per week across the period; previousKg is the matching week of the previous period. */
  weekly: { weekStart: string; kg: number; previousKg: number }[];
  /** kg this period by recipient group, largest first. */
  byGroup: { group: string; kg: number }[];
}

export const SPARK_WEEKS = 7;
const DAY = 86_400_000;

/** Monday (YYYY-MM-DD, Singapore) of the week containing `d`. */
export function weekStartSG(d: Date): string {
  const key = dayKeySG(d);
  const [y, m, day] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return new Date(Date.UTC(y, m - 1, day - back)).toISOString().slice(0, 10);
}

/** Start instant of a Singapore calendar day. */
function sgMidnight(day: string): Date {
  return new Date(`${day}T00:00:00+08:00`);
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function kpisFor(
  input: AnalyticsInput,
  from: Date,
  to: Date,
): Record<KpiKey, number | null> {
  const inRange = (d: Date) => d >= from && d <= to;
  const handovers = input.handovers.filter((h) => inRange(h.handedOverAt));
  const kgDiverted = round(handovers.reduce((s, h) => s + h.actualKg, 0));
  const kgGenerated = round(
    input.stockAdded.filter((a) => inRange(a.at)).reduce((s, a) => s + a.kg, 0),
  );
  const outcomes = input.outcomes.filter((o) => inRange(o.at));
  const collected = outcomes.filter((o) => o.status === 'COLLECTED').length;
  const resolved = outcomes.length;
  return {
    kgDiverted,
    kgGenerated,
    distributionRate:
      kgGenerated > 0 ? Math.round((kgDiverted / kgGenerated) * 100) : null,
    collectionRate: resolved ? Math.round((collected / resolved) * 100) : null,
    noShowRate: resolved
      ? Math.round(((resolved - collected) / resolved) * 100)
      : null,
    activeTakers: new Set(handovers.map((h) => h.takerId).filter(Boolean)).size,
    batchesCompleted: input.completedAt.filter(inRange).length,
  };
}

export function aggregateAnalytics(
  input: AnalyticsInput,
  period: { from: Date; to: Date },
): AnalyticsReport {
  const { from, to } = period;
  const span = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - span - 1);

  const current = kpisFor(input, from, to);
  const previous = kpisFor(input, prevFrom, prevTo);
  const kpis = Object.fromEntries(
    KPI_KEYS.map((k) => [k, { value: current[k], previous: previous[k] }]),
  ) as AnalyticsReport['kpis'];

  // Sparklines: the 7 weeks ending with the week containing `to`.
  const lastWeek = weekStartSG(to);
  const weeks = Array.from(
    { length: SPARK_WEEKS },
    (_, i) =>
      new Date(
        sgMidnight(lastWeek).getTime() - (SPARK_WEEKS - 1 - i) * 7 * DAY,
      ),
  );
  const sparkRows = weeks.map((start) => {
    const end = new Date(Math.min(start.getTime() + 7 * DAY - 1, to.getTime()));
    return { weekStart: dayKeySG(start), values: kpisFor(input, start, end) };
  });
  const sparklines = Object.fromEntries(
    KPI_KEYS.map((k) => [
      k,
      sparkRows.map((r) => ({ weekStart: r.weekStart, value: r.values[k] })),
    ]),
  ) as AnalyticsReport['sparklines'];

  // Weekly kg across the period (first bucket starts at the Monday on/before `from`).
  const weekly: AnalyticsReport['weekly'] = [];
  for (
    let start = sgMidnight(weekStartSG(from));
    start <= to;
    start = new Date(start.getTime() + 7 * DAY)
  ) {
    const end = new Date(start.getTime() + 7 * DAY - 1);
    const lo = new Date(Math.max(start.getTime(), from.getTime()));
    const hi = new Date(Math.min(end.getTime(), to.getTime()));
    const kgIn = (a: Date, b: Date) =>
      round(
        input.handovers
          .filter((h) => h.handedOverAt >= a && h.handedOverAt <= b)
          .reduce((s, h) => s + h.actualKg, 0),
      );
    weekly.push({
      weekStart: dayKeySG(start),
      kg: kgIn(lo, hi),
      previousKg: kgIn(
        new Date(lo.getTime() - span - 1),
        new Date(hi.getTime() - span - 1),
      ),
    });
  }

  const groups = new Map<string, number>();
  for (const h of input.handovers) {
    if (h.handedOverAt < from || h.handedOverAt > to) continue;
    groups.set(h.group, (groups.get(h.group) ?? 0) + h.actualKg);
  }
  const byGroup = [...groups.entries()]
    .map(([group, kg]) => ({ group, kg: round(kg) }))
    .sort((a, b) => b.kg - a.kg);

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    previousPeriod: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
    kpis,
    sparklines,
    weekly,
    byGroup,
  };
}

/** Earliest instant the aggregation needs rows from (previous period or first sparkline week). */
export function analyticsWindowStart(period: { from: Date; to: Date }): Date {
  const span = period.to.getTime() - period.from.getTime();
  const prevFrom = new Date(period.from.getTime() - span - 1);
  const sparkFrom = new Date(
    sgMidnight(weekStartSG(period.to)).getTime() - (SPARK_WEEKS - 1) * 7 * DAY,
  );
  return prevFrom < sparkFrom ? prevFrom : sparkFrom;
}
