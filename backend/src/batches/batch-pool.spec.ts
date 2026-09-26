import { MAX_CLAIM_KG } from '../common/constants';
import { ClaimStatus } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { BatchPoolService, computePool } from './batch-pool.service';

describe('computePool (CLAUDE.md §12)', () => {
  // Worked example: Batch 20kg, schoolReserve 5kg, NParks PLANNED 6kg,
  // Claim A PENDING 3kg, Claim B APPROVED 2kg.
  const sums = { allocatedKg: 6, pendingClaimKg: 3, approvedClaimKg: 2 };

  it('carves school reserve, then allocations, then claims', () => {
    const pool = computePool(20, 5, sums);
    expect(pool.publicPoolKg).toBe(9); // 20 − 5 − 6
    expect(pool.kgRemaining).toBe(4); // 9 − 3 − 2
  });

  it('frees kg automatically when an approved claim is cancelled', () => {
    const pool = computePool(20, 5, { ...sums, approvedClaimKg: 0 });
    expect(pool.kgRemaining).toBe(6);
  });

  it('frees kg automatically when an allocation is cancelled', () => {
    const pool = computePool(20, 5, { ...sums, allocatedKg: 0 });
    expect(pool.publicPoolKg).toBe(15);
    expect(pool.kgRemaining).toBe(10);
  });

  it('with nothing committed, the whole non-reserved harvest is claimable', () => {
    const pool = computePool(20, 5, {
      allocatedKg: 0,
      pendingClaimKg: 0,
      approvedClaimKg: 0,
    });
    expect(pool.publicPoolKg).toBe(15);
    expect(pool.kgRemaining).toBe(15);
  });

  it('rounds float noise to the gram', () => {
    const pool = computePool(1, 0, {
      allocatedKg: 0.1,
      pendingClaimKg: 0.2,
      approvedClaimKg: 0,
    });
    expect(pool.publicPoolKg).toBe(0.9);
    expect(pool.kgRemaining).toBe(0.7); // not 0.7000000000000001
  });

  it('reports a negative remainder rather than hiding an over-commitment', () => {
    const pool = computePool(10, 5, {
      allocatedKg: 4,
      pendingClaimKg: 3,
      approvedClaimKg: 0,
    });
    expect(pool.kgRemaining).toBe(-2); // services guard against reaching this
  });
});

describe('BatchPoolService.allowanceLeftKgForMany (§E: the 1kg-per-taker-per-batch cap)', () => {
  function setup(
    rows: {
      batchId: string;
      status: ClaimStatus;
      requestedKg?: number;
      approvedKg?: number;
    }[],
  ) {
    const groupBy = jest.fn().mockResolvedValue(
      rows.map((r) => ({
        batchId: r.batchId,
        status: r.status,
        _sum: {
          requestedKg: r.requestedKg ?? null,
          approvedKg: r.approvedKg ?? null,
        },
      })),
    );
    const prisma = { claim: { groupBy } };
    const service = new BatchPoolService(prisma as unknown as PrismaService);
    return { service, groupBy };
  }

  it('full allowance when the taker has no claims yet on this batch', async () => {
    const { service } = setup([]);
    expect(await service.allowanceLeftKgFor('b-1', 't-1')).toBe(MAX_CLAIM_KG);
  });

  it('PENDING counts requestedKg; APPROVED/COLLECTED count the locked approvedKg', async () => {
    const { service } = setup([
      { batchId: 'b-1', status: ClaimStatus.PENDING, requestedKg: 0.3 },
      { batchId: 'b-1', status: ClaimStatus.APPROVED, approvedKg: 0.2 },
      { batchId: 'b-1', status: ClaimStatus.COLLECTED, approvedKg: 0.1 },
    ]);
    // 1 - (0.3 + 0.2 + 0.1) = 0.4, exactly — not 0.3999999999999999
    expect(await service.allowanceLeftKgFor('b-1', 't-1')).toBe(0.4);
  });

  it('REJECTED and CANCELLED claims do not count against the allowance', async () => {
    // groupBy is mocked to already reflect the where-clause filter, so simulate that
    // filter having excluded them by simply not including such rows.
    const { service, groupBy } = setup([
      { batchId: 'b-1', status: ClaimStatus.PENDING, requestedKg: 0.5 },
    ]);
    expect(await service.allowanceLeftKgFor('b-1', 't-1')).toBe(0.5);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              ClaimStatus.PENDING,
              ClaimStatus.APPROVED,
              ClaimStatus.COLLECTED,
            ],
          },
        }),
      }),
    );
  });

  it('floors at zero rather than going negative if data is ever edited unsafely', async () => {
    const { service } = setup([
      { batchId: 'b-1', status: ClaimStatus.APPROVED, approvedKg: 1.5 },
    ]);
    expect(await service.allowanceLeftKgFor('b-1', 't-1')).toBe(0);
  });

  it('keeps each batch independent — the cap is per batch, not across all batches', async () => {
    const { service } = setup([
      { batchId: 'b-1', status: ClaimStatus.PENDING, requestedKg: 0.9 },
      { batchId: 'b-2', status: ClaimStatus.PENDING, requestedKg: 0.2 },
    ]);
    const map = await service.allowanceLeftKgForMany(
      ['b-1', 'b-2', 'b-3'],
      't-1',
    );
    expect(map.get('b-1')).toBe(0.1);
    expect(map.get('b-2')).toBe(0.8);
    expect(map.get('b-3')).toBe(MAX_CLAIM_KG); // no claims at all on this one
  });

  it("scopes the query to this one taker (does not sum everyone's claims)", async () => {
    const { service, groupBy } = setup([]);
    await service.allowanceLeftKgFor('b-1', 't-jo');
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ takerId: 't-jo' }),
      }),
    );
  });
});
