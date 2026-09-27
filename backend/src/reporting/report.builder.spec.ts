import { buildReport, type ReportInput } from './report.builder';

const sg = (s: string) => new Date(`${s.replace(' ', 'T')}:00+08:00`);
const period = { from: sg('2026-09-01 00:00'), to: sg('2026-09-30 23:59') };

const claim = (
  o: Partial<ReportInput['claims'][number]>,
): ReportInput['claims'][number] => ({
  batchId: 'b1',
  requestedKg: 0.5,
  approvedKg: null,
  status: 'PENDING',
  rejectionReason: null,
  cancellationReason: null,
  submittedAt: sg('2026-09-10 09:00'),
  decidedAt: null,
  bookingStatus: null,
  ...o,
});

const input: ReportInput = {
  handovers: [
    {
      actualKg: 0.5,
      handedOverAt: sg('2026-08-20 10:00'),
      takerId: 'jo',
      takerName: 'Jo',
      takerType: 'INDIVIDUAL',
      category: null,
      batchId: 'b1',
      source: 'CLAIM',
    },
    {
      actualKg: 0.5,
      handedOverAt: sg('2026-09-12 10:00'),
      takerId: 'jo',
      takerName: 'Jo',
      takerType: 'INDIVIDUAL',
      category: null,
      batchId: 'b1',
      source: 'CLAIM',
    },
    {
      actualKg: 4,
      handedOverAt: sg('2026-09-15 14:00'),
      takerId: 'np',
      takerName: 'NParks',
      takerType: 'BULK',
      category: 'NPARKS',
      batchId: 'b1',
      source: 'ALLOCATION',
    },
  ],
  claims: [
    claim({
      status: 'COLLECTED',
      approvedKg: 0.5,
      decidedAt: sg('2026-09-10 15:00'),
      bookingStatus: 'COLLECTED',
    }),
    claim({
      status: 'REJECTED',
      requestedKg: 1,
      decidedAt: sg('2026-09-12 09:00'),
      rejectionReason: 'INSUFFICIENT_SUPPLY',
    }),
    claim({
      status: 'APPROVED',
      approvedKg: 0.3,
      requestedKg: 0.3,
      decidedAt: sg('2026-09-10 12:00'),
    }),
    claim({ status: 'PENDING', requestedKg: 1 }),
  ],
  slots: [
    {
      startTime: sg('2026-09-15 14:00'),
      capacity: 4,
      bookedCount: 3,
      status: 'OPEN',
    },
    {
      startTime: sg('2026-09-16 10:00'),
      capacity: 4,
      bookedCount: 1,
      status: 'OPEN',
    },
    {
      startTime: sg('2026-09-17 10:00'),
      capacity: 4,
      bookedCount: 0,
      status: 'CANCELLED',
    },
  ],
  outcomes: [
    { status: 'COLLECTED', at: sg('2026-09-15 14:00'), kg: 4, takerId: 'np' },
    { status: 'NO_SHOW', at: sg('2026-09-16 10:00'), kg: 0.5, takerId: 'jo' },
    { status: 'NO_SHOW', at: sg('2026-08-16 10:00'), kg: 0.5, takerId: 'jo' },
  ],
  batches: [
    {
      id: 'b1',
      reference: '2026-09-A',
      harvestDate: sg('2026-09-01 08:00'),
      status: 'OPEN',
      totalKg: 12,
      topUps: [{ kg: 2, at: sg('2026-09-05 08:00') }],
      schoolReserveKg: 2,
      kgRemaining: 3,
      availableFrom: null,
    },
  ],
  takers: [
    {
      id: 'jo',
      name: 'Jo',
      type: 'INDIVIDUAL',
      category: null,
      createdAt: sg('2026-08-01 08:00'),
      monthlyKgTarget: null,
    },
    {
      id: 'np',
      name: 'NParks',
      type: 'BULK',
      category: 'NPARKS',
      createdAt: sg('2026-09-02 08:00'),
      monthlyKgTarget: 8,
    },
  ],
};

describe('buildReport', () => {
  const r = buildReport(input, period);

  it('funnels claims from submitted to collected, with reasons', () => {
    expect(r.funnel.submitted.count).toBe(4);
    expect(r.funnel.approved.count).toBe(2);
    expect(r.funnel.booked.count).toBe(1);
    expect(r.funnel.collected).toEqual({ count: 1, kg: 0.5 });
    expect(r.funnel.approvedUnbooked).toBe(1);
    expect(r.rejectionReasons).toEqual({ INSUFFICIENT_SUPPLY: 1 });
    expect(r.claimSizes).toEqual({ small: 1, medium: 1, large: 2, atCap: 2 });
    expect(r.responseTime.within24Pct).toBe(67); // the rejection took 48h
  });

  it('splits each batch into reserve / bulk / individual / unclaimed', () => {
    expect(r.batches[0]).toMatchObject({
      bulkKg: 4,
      individualKg: 1,
      schoolReserveKg: 2,
      unclaimedKg: 5,
      topUpKg: 2,
    });
  });

  it('measures slot use, no-shows and returning takers', () => {
    expect(r.pickups.fillRate).toBe(50); // 4 of 8 seats, cancelled slot ignored
    expect(r.pickups.noShows).toBe(1);
    expect(r.takers).toMatchObject({
      returning: 1,
      firstTime: 1,
      repeatNoShows: 1,
    });
    expect(r.takers.bulkPartners[0]).toMatchObject({
      name: 'NParks',
      collected: 4,
    });
    expect(r.allTime).toMatchObject({ kg: 5, pickups: 3, takers: 2 });
  });
});
