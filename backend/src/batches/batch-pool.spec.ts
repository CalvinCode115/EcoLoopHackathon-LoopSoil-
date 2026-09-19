import { computePool } from './batch-pool.service';

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
