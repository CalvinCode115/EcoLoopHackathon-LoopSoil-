import { roundKg } from '../common/kg';
import { yearMonthSG } from '../common/reference';
import type { TakerCategory, TakerType } from '../generated/prisma/client';

/**
 * The minimal handover shape the aggregation needs. `actualKg` is NET compost and is the
 * ONLY figure ever summed here (CLAUDE.md §13) — requested / approved / allocated kg are
 * deliberately absent from this type so they cannot leak into an impact number.
 */
export interface ImpactRow {
  actualKg: number;
  handedOverAt: Date;
  photoUrl: string | null;
  takerConfirmed: boolean;
  batch: {
    id: string;
    reference: string;
    harvestDate: Date;
    totalKg: number;
    schoolReserveKg: number;
  } | null;
  taker: {
    id: string;
    name: string;
    type: TakerType;
    category: TakerCategory | null;
  } | null;
}

export interface ImpactTotals {
  /** Σ actualKg — the headline number. */
  kgDiverted: number;
  handovers: number;
  /** Distinct takers who received compost. */
  beneficiaries: number;
  /** Distinct batches with at least one handover. */
  batches: number;
  photoCoverage: { withPhoto: number; withoutPhoto: number; pct: number };
  takerConfirmedPct: number;
}

export interface ImpactReport {
  period: { from: string | null; to: string | null };
  totals: ImpactTotals;
  byTakerType: {
    type: TakerType;
    kg: number;
    handovers: number;
    takers: number;
  }[];
  /** Bulk categories, plus "INDIVIDUAL" for individuals (who have no category). */
  byCategory: { category: string; kg: number; handovers: number }[];
  byBatch: {
    batchId: string;
    reference: string;
    harvestDate: Date;
    totalKg: number;
    /** totalKg − schoolReserveKg: what was there to give away. */
    redistributableKg: number;
    kgDiverted: number;
    handovers: number;
    /** kgDiverted / redistributableKg, % (null when nothing was redistributable). */
    utilisationPct: number | null;
  }[];
  byMonth: { month: string; kg: number; handovers: number }[];
}

export interface TopTaker {
  takerId: string;
  name: string;
  type: TakerType;
  category: TakerCategory | null;
  kg: number;
  handovers: number;
}

const pct = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

export function aggregateImpact(
  rows: ImpactRow[],
  period: { from?: Date; to?: Date } = {},
): ImpactReport {
  const takerIds = new Set<string>();
  const batchIds = new Set<string>();
  let kg = 0;
  let withPhoto = 0;
  let confirmed = 0;

  const byType = new Map<
    TakerType,
    { kg: number; handovers: number; takers: Set<string> }
  >();
  const byCategory = new Map<string, { kg: number; handovers: number }>();
  const byBatch = new Map<string, ImpactReport['byBatch'][number]>();
  const byMonth = new Map<string, { kg: number; handovers: number }>();

  for (const row of rows) {
    kg += row.actualKg;
    if (row.photoUrl) withPhoto++;
    if (row.takerConfirmed) confirmed++;

    if (row.taker) {
      takerIds.add(row.taker.id);
      const t = byType.get(row.taker.type) ?? {
        kg: 0,
        handovers: 0,
        takers: new Set<string>(),
      };
      t.kg += row.actualKg;
      t.handovers++;
      t.takers.add(row.taker.id);
      byType.set(row.taker.type, t);

      const category = row.taker.category ?? 'INDIVIDUAL';
      const c = byCategory.get(category) ?? { kg: 0, handovers: 0 };
      c.kg += row.actualKg;
      c.handovers++;
      byCategory.set(category, c);
    }

    if (row.batch) {
      batchIds.add(row.batch.id);
      const b = byBatch.get(row.batch.id) ?? {
        batchId: row.batch.id,
        reference: row.batch.reference,
        harvestDate: row.batch.harvestDate,
        totalKg: roundKg(row.batch.totalKg),
        redistributableKg: roundKg(
          row.batch.totalKg - row.batch.schoolReserveKg,
        ),
        kgDiverted: 0,
        handovers: 0,
        utilisationPct: null,
      };
      b.kgDiverted += row.actualKg;
      b.handovers++;
      byBatch.set(row.batch.id, b);
    }

    const { year, month } = yearMonthSG(row.handedOverAt);
    const key = `${year}-${month}`;
    const m = byMonth.get(key) ?? { kg: 0, handovers: 0 };
    m.kg += row.actualKg;
    m.handovers++;
    byMonth.set(key, m);
  }

  return {
    period: {
      from: period.from?.toISOString() ?? null,
      to: period.to?.toISOString() ?? null,
    },
    totals: {
      kgDiverted: roundKg(kg),
      handovers: rows.length,
      beneficiaries: takerIds.size,
      batches: batchIds.size,
      photoCoverage: {
        withPhoto,
        withoutPhoto: rows.length - withPhoto,
        pct: pct(withPhoto, rows.length),
      },
      takerConfirmedPct: pct(confirmed, rows.length),
    },
    byTakerType: [...byType.entries()]
      .map(([type, t]) => ({
        type,
        kg: roundKg(t.kg),
        handovers: t.handovers,
        takers: t.takers.size,
      }))
      .sort((a, b) => b.kg - a.kg),
    byCategory: [...byCategory.entries()]
      .map(([category, c]) => ({
        category,
        kg: roundKg(c.kg),
        handovers: c.handovers,
      }))
      .sort((a, b) => b.kg - a.kg),
    byBatch: [...byBatch.values()]
      .map((b) => ({
        ...b,
        kgDiverted: roundKg(b.kgDiverted),
        utilisationPct:
          b.redistributableKg > 0
            ? pct(b.kgDiverted, b.redistributableKg)
            : null,
      }))
      .sort((a, b) => b.harvestDate.getTime() - a.harvestDate.getTime()),
    byMonth: [...byMonth.entries()]
      .map(([month, m]) => ({
        month,
        kg: roundKg(m.kg),
        handovers: m.handovers,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export function topTakers(rows: ImpactRow[], limit: number): TopTaker[] {
  const byTaker = new Map<string, TopTaker>();
  for (const row of rows) {
    if (!row.taker) continue;
    const t = byTaker.get(row.taker.id) ?? {
      takerId: row.taker.id,
      name: row.taker.name,
      type: row.taker.type,
      category: row.taker.category,
      kg: 0,
      handovers: 0,
    };
    t.kg += row.actualKg;
    t.handovers++;
    byTaker.set(row.taker.id, t);
  }
  return [...byTaker.values()]
    .map((t) => ({ ...t, kg: roundKg(t.kg) }))
    .sort((a, b) => b.kg - a.kg || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ─── Waste Diary CSV ──────────────────────────────────────────────────────────

export interface DiaryRow {
  reference: string;
  handedOverAt: Date;
  batchReference: string | null;
  source: 'CLAIM' | 'ALLOCATION' | null;
  sourceReference: string | null;
  takerName: string | null;
  takerType: TakerType | null;
  takerCategory: TakerCategory | null;
  expectedKg: number | null;
  actualKg: number;
  hasPhoto: boolean;
  takerConfirmed: boolean;
  handedOverBy: string;
  note: string | null;
}

export const DIARY_COLUMNS = [
  'reference',
  'handedOverAt',
  'batch',
  'source',
  'sourceReference',
  'takerName',
  'takerType',
  'takerCategory',
  'expectedKg',
  'actualNetKg',
  'photo',
  'takerConfirmed',
  'handedOverBy',
  'note',
] as const;

/** RFC 4180-style CSV: quotes around every field, embedded quotes doubled, CRLF rows. */
export function wasteDiaryCsv(rows: DiaryRow[]): string {
  const escape = (
    v: string | number | boolean | Date | null | undefined,
  ): string => {
    if (v === null || v === undefined) return '""';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [DIARY_COLUMNS.map(escape).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.reference,
        r.handedOverAt,
        r.batchReference,
        r.source,
        r.sourceReference,
        r.takerName,
        r.takerType,
        r.takerCategory ?? (r.takerType === 'INDIVIDUAL' ? 'INDIVIDUAL' : null),
        r.expectedKg,
        roundKg(r.actualKg),
        r.hasPhoto ? 'yes' : 'no',
        r.takerConfirmed ? 'yes' : 'no',
        r.handedOverBy,
        r.note,
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
