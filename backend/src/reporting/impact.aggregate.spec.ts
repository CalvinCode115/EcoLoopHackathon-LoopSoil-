import { TakerCategory, TakerType } from '../generated/prisma/client';
import {
  aggregateImpact,
  topTakers,
  wasteDiaryCsv,
  type ImpactRow,
} from './impact.aggregate';

const batchA = {
  id: 'b-a',
  reference: '2026-09-A',
  harvestDate: new Date('2026-09-05T00:00:00+08:00'),
  totalKg: 20,
  schoolReserveKg: 5,
};
const batchB = {
  id: 'b-b',
  reference: '2026-09-B',
  harvestDate: new Date('2026-09-19T00:00:00+08:00'),
  totalKg: 20,
  schoolReserveKg: 20, // all kept for the rooftop → nothing redistributable
};
const jo = {
  id: 't-jo',
  name: 'Jo',
  type: TakerType.INDIVIDUAL,
  category: null,
};
const mei = {
  id: 't-mei',
  name: 'Mei',
  type: TakerType.INDIVIDUAL,
  category: null,
};
const nparks = {
  id: 't-np',
  name: 'NParks',
  type: TakerType.BULK,
  category: TakerCategory.NPARKS,
};

const rows: ImpactRow[] = [
  // Weighed 2.8 although 3 was approved — only 2.8 may ever be reported.
  {
    actualKg: 2.8,
    handedOverAt: new Date('2026-09-12T10:00:00+08:00'),
    photoUrl: 'p1.jpg',
    takerConfirmed: true,
    batch: batchA,
    taker: jo,
  },
  {
    actualKg: 1.2,
    handedOverAt: new Date('2026-09-12T11:00:00+08:00'),
    photoUrl: null,
    takerConfirmed: false,
    batch: batchA,
    taker: mei,
  },
  {
    actualKg: 6,
    handedOverAt: new Date('2026-09-13T09:00:00+08:00'),
    photoUrl: 'p3.jpg',
    takerConfirmed: true,
    batch: batchA,
    taker: nparks,
  },
  {
    actualKg: 0.5,
    handedOverAt: new Date('2026-10-01T09:00:00+08:00'),
    photoUrl: 'p4.jpg',
    takerConfirmed: false,
    batch: batchB,
    taker: jo,
  },
];

describe('aggregateImpact — sourced only from actualKg (§13)', () => {
  const report = aggregateImpact(rows);

  it('headline: Σ actualKg, handovers, distinct beneficiaries and batches', () => {
    expect(report.totals.kgDiverted).toBe(10.5);
    expect(report.totals.handovers).toBe(4);
    expect(report.totals.beneficiaries).toBe(3); // jo counted once
    expect(report.totals.batches).toBe(2);
  });

  it('integrity signals: photo coverage and taker confirmation', () => {
    expect(report.totals.photoCoverage).toEqual({
      withPhoto: 3,
      withoutPhoto: 1,
      pct: 75,
    });
    expect(report.totals.takerConfirmedPct).toBe(50);
  });

  it('breaks down by taker type and category (individuals get an INDIVIDUAL bucket)', () => {
    expect(report.byTakerType).toEqual([
      { type: 'BULK', kg: 6, handovers: 1, takers: 1 },
      { type: 'INDIVIDUAL', kg: 4.5, handovers: 3, takers: 2 },
    ]);
    expect(report.byCategory).toEqual([
      { category: 'NPARKS', kg: 6, handovers: 1 },
      { category: 'INDIVIDUAL', kg: 4.5, handovers: 3 },
    ]);
  });

  it('per batch: utilisation of the redistributable kg, null when nothing was redistributable', () => {
    const [b, a] = report.byBatch; // newest harvest first
    expect(a.reference).toBe('2026-09-A');
    expect(a.redistributableKg).toBe(15);
    expect(a.kgDiverted).toBe(10);
    expect(a.utilisationPct).toBe(66.7);
    expect(b.reference).toBe('2026-09-B');
    expect(b.redistributableKg).toBe(0);
    expect(b.utilisationPct).toBeNull();
  });

  it('per month in Singapore time, ascending', () => {
    expect(report.byMonth).toEqual([
      { month: '2026-09', kg: 10, handovers: 3 },
      { month: '2026-10', kg: 0.5, handovers: 1 },
    ]);
  });

  it('handles an empty period without dividing by zero', () => {
    const empty = aggregateImpact([]);
    expect(empty.totals.kgDiverted).toBe(0);
    expect(empty.totals.photoCoverage.pct).toBe(0);
    expect(empty.byBatch).toEqual([]);
  });
});

describe('topTakers', () => {
  it('ranks by kg collected, respects the limit', () => {
    expect(topTakers(rows, 2).map((t) => [t.name, t.kg, t.handovers])).toEqual([
      ['NParks', 6, 1],
      ['Jo', 3.3, 2],
    ]);
  });
});

describe('wasteDiaryCsv', () => {
  it('produces a header + one quoted row per handover, escaping embedded quotes', () => {
    const csv = wasteDiaryCsv([
      {
        reference: 'HND-2026-09-001',
        handedOverAt: new Date('2026-09-12T02:00:00Z'),
        batchReference: '2026-09-A',
        source: 'CLAIM',
        sourceReference: 'CLM-2026-001',
        takerName: 'Jo "JJ" Tan',
        takerType: TakerType.INDIVIDUAL,
        takerCategory: null,
        expectedKg: 3,
        actualKg: 2.8,
        hasPhoto: true,
        takerConfirmed: true,
        handedOverBy: 'Dr Kaveri',
        note: null,
      },
    ]);
    const [header, row, trailing] = csv.split('\r\n');
    expect(header).toBe(
      '"reference","handedOverAt","batch","source","sourceReference","takerName","takerType","takerCategory","expectedKg","actualNetKg","photo","takerConfirmed","handedOverBy","note"',
    );
    expect(row).toBe(
      '"HND-2026-09-001","2026-09-12T02:00:00.000Z","2026-09-A","CLAIM","CLM-2026-001","Jo ""JJ"" Tan","INDIVIDUAL","INDIVIDUAL","3","2.8","yes","yes","Dr Kaveri",""',
    );
    expect(trailing).toBe('');
  });
});
