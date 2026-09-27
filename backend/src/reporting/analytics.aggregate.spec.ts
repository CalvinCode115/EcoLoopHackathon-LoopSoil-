import {
  aggregateAnalytics,
  weekStartSG,
  type AnalyticsInput,
} from './analytics.aggregate';

// SG time helper: "2026-09-15 10:00" Singapore
const sg = (s: string) => new Date(`${s.replace(' ', 'T')}:00+08:00`);

// September 2026 (this period) vs the same-length window before it (previous).
const period = { from: sg('2026-09-01 00:00'), to: sg('2026-09-30 23:59') };

const input: AnalyticsInput = {
  handovers: [
    {
      actualKg: 2,
      handedOverAt: sg('2026-09-02 10:00'),
      takerId: 't1',
      group: 'INDIVIDUAL',
    },
    {
      actualKg: 3,
      handedOverAt: sg('2026-09-16 10:00'),
      takerId: 't2',
      group: 'NPARKS',
    },
    {
      actualKg: 1,
      handedOverAt: sg('2026-09-16 11:00'),
      takerId: 't1',
      group: 'INDIVIDUAL',
    },
    {
      actualKg: 4,
      handedOverAt: sg('2026-08-12 10:00'),
      takerId: 't3',
      group: 'SCHOOL',
    },
  ],
  outcomes: [
    { status: 'COLLECTED', at: sg('2026-09-02 10:00') },
    { status: 'COLLECTED', at: sg('2026-09-16 10:00') },
    { status: 'COLLECTED', at: sg('2026-09-16 11:00') },
    { status: 'NO_SHOW', at: sg('2026-09-20 10:00') },
  ],
  stockAdded: [
    { kg: 10, at: sg('2026-09-01 09:00') },
    { kg: 2, at: sg('2026-09-10 09:00') },
    { kg: 8, at: sg('2026-08-05 09:00') },
  ],
  completedAt: [sg('2026-09-25 12:00')],
};

describe('aggregateAnalytics', () => {
  const report = aggregateAnalytics(input, period);

  it('computes KPIs for the period and the one before it', () => {
    expect(report.kpis.kgDiverted).toEqual({ value: 6, previous: 4 });
    expect(report.kpis.kgGenerated).toEqual({ value: 12, previous: 8 });
    expect(report.kpis.distributionRate.value).toBe(50); // 6 / 12
    expect(report.kpis.collectionRate.value).toBe(75); // 3 of 4 resolved
    expect(report.kpis.noShowRate.value).toBe(25);
    expect(report.kpis.activeTakers).toEqual({ value: 2, previous: 1 });
    expect(report.kpis.batchesCompleted.value).toBe(1);
  });

  it('has 7 Monday-start sparkline weeks ending with the week of `to`', () => {
    const weeks = report.sparklines.kgDiverted.map((p) => p.weekStart);
    expect(weeks).toHaveLength(7);
    expect(weeks[6]).toBe('2026-09-28');
    expect(
      report.sparklines.kgDiverted.find((p) => p.weekStart === '2026-09-14')
        ?.value,
    ).toBe(4);
    expect(
      report.sparklines.collectionRate.find((p) => p.weekStart === '2026-09-14')
        ?.value,
    ).toBe(67); // 2 collected + the Sunday 20 Sep no-show
  });

  it('buckets weekly kg and groups recipients, largest first', () => {
    expect(report.weekly[0].weekStart).toBe('2026-08-31');
    expect(report.weekly.find((w) => w.weekStart === '2026-09-14')?.kg).toBe(4);
    expect(report.byGroup).toEqual([
      { group: 'INDIVIDUAL', kg: 3 },
      { group: 'NPARKS', kg: 3 },
    ]);
    expect(weekStartSG(sg('2026-09-27 23:30'))).toBe('2026-09-21'); // Sunday → that week's Monday
  });
});
