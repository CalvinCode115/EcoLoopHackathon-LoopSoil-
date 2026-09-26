import type { BatchPoolService } from '../batches/batch-pool.service';
import { Prisma, TakerType } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ReportingService } from './reporting.service';

const d = (v: number) => new Prisma.Decimal(v);
const batch = {
  id: 'b-1',
  reference: '2026-09-A',
  harvestDate: new Date('2026-09-01T00:00:00Z'),
  totalKg: d(20),
  schoolReserveKg: d(5),
};

/** A handover on a general slot (no batch) — the batch must come from the claim. */
function handover(id: string, kg: number, at: string) {
  return {
    id,
    reference: `HND-${id}`,
    actualKg: d(kg),
    handedOverAt: new Date(at),
    photoUrl: 'p.jpg',
    takerConfirmed: true,
    note: null,
    handedOverBy: { name: 'Manager' },
    booking: {
      slot: { batch: null },
      claim: {
        reference: 'CLM-1',
        approvedKg: d(1),
        batch,
        taker: {
          id: 't-1',
          name: 'Jo',
          type: TakerType.INDIVIDUAL,
          category: null,
        },
      },
      allocation: null,
    },
  };
}

describe('ReportingService.dashboard', () => {
  it('composes totals (this month in SG time), pipeline, open pools and recent handovers', async () => {
    const prisma = {
      handover: {
        // newest first, as loadHandovers orders them
        findMany: jest
          .fn()
          .mockResolvedValue([
            handover('2', 0.8, '2026-09-10T02:00:00Z'),
            handover('1', 1.1, '2026-08-20T02:00:00Z'),
          ]),
        count: jest.fn().mockResolvedValue(0),
      },
      batch: {
        findMany: jest.fn().mockResolvedValue([batch]),
        count: jest.fn().mockResolvedValue(1),
      },
      taker: { count: jest.fn().mockResolvedValue(2) },
      claim: { count: jest.fn().mockResolvedValue(3) },
      booking: { count: jest.fn().mockResolvedValue(0) },
    };
    const pools = {
      forBatches: jest
        .fn()
        .mockResolvedValue(new Map([['b-1', { kgRemaining: 4 }]])),
    };
    const service = new ReportingService(
      prisma as unknown as PrismaService,
      pools as unknown as BatchPoolService,
    );

    const result = await service.dashboard(new Date('2026-09-27T04:00:00Z'));

    expect(result.impact.allTime.kgDiverted).toBeCloseTo(1.9);
    expect(result.impact.thisMonth).toEqual({
      month: '2026-09',
      kgDiverted: 0.8,
      handovers: 1,
    });
    expect(result.pipeline.takers.pendingVetting).toBe(2);
    expect(result.openBatches[0]).toMatchObject({
      reference: '2026-09-A',
      kgRemaining: 4,
    });
    expect(result.recentHandovers[0]).toMatchObject({
      reference: 'HND-2',
      actualKg: 0.8,
      batchReference: '2026-09-A',
    });
    // Undone handovers never count.
    expect(prisma.handover.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ undoneAt: null }),
      }),
    );
  });
});
