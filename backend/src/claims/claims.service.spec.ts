import { NotFoundException } from '@nestjs/common';
import type {
  BatchPool,
  BatchPoolService,
} from '../batches/batch-pool.service';
import { MAX_CLAIM_KG, MIN_CLAIM_KG } from '../common/constants';
import { DomainException } from '../common/errors/domain.exception';
import {
  BatchStatus,
  CancellationReason,
  ClaimStatus,
  Prisma,
  TakerStatus,
  TakerType,
  UserRole,
  type Batch,
  type User,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { TakersService } from '../takers/takers.service';
import {
  assertBatchClaimable,
  assertValidClaimAmount,
  ClaimsService,
  nextClaimNumber,
} from './claims.service';

const manager = { id: 'u-mgr', role: UserRole.MANAGER } as User;
const jo = { id: 'u-jo', role: UserRole.TAKER } as User;
const someoneElse = { id: 'u-other', role: UserRole.TAKER } as User;

const joTaker = {
  id: 't-jo',
  userId: 'u-jo',
  type: TakerType.INDIVIDUAL,
  status: TakerStatus.APPROVED,
};

const openBatch = {
  id: 'b-1',
  reference: '2026-09-A',
  status: BatchStatus.OPEN,
  totalKg: 20,
  schoolReserveKg: 5,
  availableFrom: null,
  availableUntil: null,
} as unknown as Batch;

/** The BATCH's public pool has plenty left — these tests isolate the PERSONAL 1kg cap. */
const roomyPool: BatchPool = {
  totalKg: 20,
  schoolReserveKg: 5,
  allocatedKg: 6,
  publicPoolKg: 9,
  pendingClaimKg: 3,
  approvedClaimKg: 2,
  kgRemaining: 4,
};

function setup(
  opts: {
    pool?: BatchPool;
    allowanceLeftKg?: number;
    claim?: Record<string, unknown> | null;
  } = {},
) {
  const prisma = {
    batch: { findUnique: jest.fn().mockResolvedValue(openBatch) },
    claim: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(opts.claim ?? null),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'c-new', status: 'PENDING', ...data }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...opts.claim, ...data }),
        ),
    },
    booking: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prismaWithTx = {
    ...prisma,
    $transaction: jest.fn((fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
  const pool = {
    forBatch: jest.fn().mockResolvedValue(opts.pool ?? roomyPool),
    allowanceLeftKgFor: jest
      .fn()
      .mockResolvedValue(opts.allowanceLeftKg ?? MAX_CLAIM_KG),
  };
  const takers = {
    requireApprovedIndividual: jest.fn().mockResolvedValue(joTaker),
    findByUserId: jest.fn().mockResolvedValue(joTaker),
  };
  const service = new ClaimsService(
    prismaWithTx as unknown as PrismaService,
    pool as unknown as BatchPoolService,
    takers as unknown as TakersService,
  );
  return { service, prisma, pool, takers };
}

async function expectDomainError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(DomainException);
  await promise.catch((e: DomainException) => expect(e.code).toBe(code));
}

describe('assertValidClaimAmount (§D: 0.1-1kg, exact 0.1 steps)', () => {
  it('accepts the boundaries and valid steps', () => {
    expect(() => assertValidClaimAmount(MIN_CLAIM_KG)).not.toThrow();
    expect(() => assertValidClaimAmount(MAX_CLAIM_KG)).not.toThrow();
    expect(() => assertValidClaimAmount(0.6)).not.toThrow();
  });

  it('rejects below the minimum', () => {
    expect(() => assertValidClaimAmount(0.05)).toThrow(DomainException);
  });

  it('rejects above the maximum', () => {
    expect(() => assertValidClaimAmount(1.1)).toThrow(DomainException);
  });

  it('rejects amounts off the 0.1 step, exactly (no float false-positives)', () => {
    expect(() => assertValidClaimAmount(0.35)).toThrow(DomainException);
    // 0.1 + 0.2 famously isn't 0.3 in JS floats — Decimal must not inherit that noise.
    expect(() => assertValidClaimAmount(0.3)).not.toThrow();
    expect(() => assertValidClaimAmount(0.7)).not.toThrow();
  });
});

describe('ClaimsService.create — allowance (personal cap) and pool checks', () => {
  it('creates a PENDING claim with a yearly sequence reference', async () => {
    const { service, prisma } = setup();
    const claim = await service.create(
      { batchId: 'b-1', requestedKg: 0.6 },
      jo,
    );
    expect(claim.status).toBe('PENDING');
    expect(prisma.claim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: expect.stringMatching(/^CLM-\d{4}-001$/),
          takerId: 't-jo',
          requestedKg: 0.6,
        }),
      }),
    );
  });

  it('rejects an invalid amount before ever touching the database', async () => {
    const { service, prisma } = setup();
    await expectDomainError(
      service.create({ batchId: 'b-1', requestedKg: 0.35 }, jo),
      'CLAIM_INVALID_STEP',
    );
    expect(prisma.batch.findUnique).not.toHaveBeenCalled();
  });

  it('hard-blocks a request larger than the BATCH pool has left', async () => {
    const { service, prisma } = setup({
      pool: { ...roomyPool, kgRemaining: 0.5 },
    });
    await expectDomainError(
      service.create({ batchId: 'b-1', requestedKg: 0.6 }, jo),
      'INSUFFICIENT_POOL',
    );
    expect(prisma.claim.create).not.toHaveBeenCalled();
  });

  it('allows exactly the pool remainder', async () => {
    const { service, prisma } = setup({
      pool: { ...roomyPool, kgRemaining: 0.6 },
    });
    await service.create({ batchId: 'b-1', requestedKg: 0.6 }, jo);
    expect(prisma.claim.create).toHaveBeenCalled();
  });

  it('hard-blocks when the PERSONAL per-batch allowance is exceeded, even with pool to spare', async () => {
    // Batch pool is roomy (4kg left) but this taker has already used 0.7 of their 1kg cap.
    const { service, prisma } = setup({ allowanceLeftKg: 0.3 });
    await expectDomainError(
      service.create({ batchId: 'b-1', requestedKg: 0.5 }, jo),
      'CLAIM_ALLOWANCE_EXCEEDED',
    );
    expect(prisma.claim.create).not.toHaveBeenCalled();
  });

  it('allows several small claims on one batch as long as the running total holds (§E)', async () => {
    // Not "one claim per batch" any more — the allowance mock represents what's left
    // after any earlier PENDING/APPROVED/COLLECTED claims on this batch.
    const { service, prisma } = setup({ allowanceLeftKg: 0.4 });
    await service.create({ batchId: 'b-1', requestedKg: 0.4 }, jo);
    expect(prisma.claim.create).toHaveBeenCalled();
  });

  it('is gated by taker vetting (registration + approval)', async () => {
    const { service, takers } = setup();
    takers.requireApprovedIndividual.mockRejectedValue(
      new DomainException('TAKER_NOT_APPROVED', 'awaiting approval', 403),
    );
    await expectDomainError(
      service.create({ batchId: 'b-1', requestedKg: 0.5 }, jo),
      'TAKER_NOT_APPROVED',
    );
  });
});

describe('assertBatchClaimable', () => {
  const now = new Date('2026-09-20T10:00:00+08:00');

  it('requires OPEN status', () => {
    expect(() =>
      assertBatchClaimable({ ...openBatch, status: BatchStatus.DRAFT }, now),
    ).toThrow(DomainException);
    expect(() =>
      assertBatchClaimable({ ...openBatch, status: BatchStatus.CLOSED }, now),
    ).toThrow(DomainException);
    expect(() => assertBatchClaimable(openBatch, now)).not.toThrow();
  });

  it('enforces the availability window when set', () => {
    const notYet = {
      ...openBatch,
      availableFrom: new Date('2026-09-21T00:00:00+08:00'),
    };
    const closed = {
      ...openBatch,
      availableUntil: new Date('2026-09-19T23:59:00+08:00'),
    };
    const inside = {
      ...openBatch,
      availableFrom: new Date('2026-09-19T00:00:00+08:00'),
      availableUntil: new Date('2026-09-21T00:00:00+08:00'),
    };
    expect(() => assertBatchClaimable(notYet, now)).toThrow(DomainException);
    expect(() => assertBatchClaimable(closed, now)).toThrow(DomainException);
    expect(() => assertBatchClaimable(inside, now)).not.toThrow();
  });
});

describe('ClaimsService.approve — locks approvedKg (Decimal-exact)', () => {
  const pending = {
    id: 'c-1',
    status: ClaimStatus.PENDING,
    requestedKg: new Prisma.Decimal(0.6),
    managerNote: null,
    batch: openBatch,
  };

  it('defaults approvedKg to requestedKg and stamps decidedAt', async () => {
    const { service } = setup({ claim: pending });
    const result = await service.approve('c-1', {});
    expect(result.status).toBe(ClaimStatus.APPROVED);
    expect((result.approvedKg as Prisma.Decimal).toNumber()).toBe(0.6);
    expect(result.decidedAt).toBeInstanceOf(Date);
  });

  it('may approve less than requested', async () => {
    const { service } = setup({ claim: pending });
    const result = await service.approve('c-1', {
      approvedKg: 0.3,
      managerNote: 'only 0.3kg avail — WhatsApp 9XXX to confirm',
    });
    expect((result.approvedKg as Prisma.Decimal).toNumber()).toBe(0.3);
    expect(result.managerNote).toContain('WhatsApp');
  });

  it('never approves more than requested', async () => {
    const { service } = setup({ claim: pending });
    await expectDomainError(
      service.approve('c-1', { approvedKg: 0.7 }),
      'APPROVED_EXCEEDS_REQUESTED',
    );
  });

  it("counts the claim's own pending lock as available to itself", async () => {
    // Pool says 0 left, but the requested 0.6 is this very claim → approving it is fine.
    const { service } = setup({
      claim: pending,
      pool: { ...roomyPool, pendingClaimKg: 7, kgRemaining: 0 },
    });
    const result = await service.approve('c-1', {});
    expect((result.approvedKg as Prisma.Decimal).toNumber()).toBe(0.6);
  });

  it('blocks approval when other commitments have since eaten the pool', async () => {
    // Manager allocated more after this claim came in: remaining is negative including ours.
    const { service } = setup({
      claim: pending,
      pool: { ...roomyPool, allocatedKg: 12, publicPoolKg: 3, kgRemaining: -2 },
    });
    await expectDomainError(service.approve('c-1', {}), 'INSUFFICIENT_POOL');
  });

  it('only PENDING can be approved', async () => {
    const { service } = setup({
      claim: { ...pending, status: ClaimStatus.CANCELLED },
    });
    await expectDomainError(service.approve('c-1', {}), 'INVALID_TRANSITION');
  });
});

describe('ClaimsService.bulkApprove — partial success (§E)', () => {
  it('approves what fits and reports the rest as skipped, without rolling back successes', async () => {
    const { service } = setup();
    const okClaim = {
      id: 'c-ok',
      status: ClaimStatus.PENDING,
      requestedKg: new Prisma.Decimal(0.4),
      managerNote: null,
      batch: openBatch,
    };
    const badClaim = { id: 'c-bad', status: ClaimStatus.CANCELLED }; // terminal — will fail

    const spy = jest
      .spyOn(service, 'approve')
      .mockImplementation(async (id) => {
        if (id === 'c-ok')
          return { ...okClaim, status: ClaimStatus.APPROVED } as never;
        throw new DomainException(
          'INVALID_TRANSITION',
          'Claim cannot go from CANCELLED to APPROVED',
        );
      });

    const result = await service.bulkApprove(['c-ok', 'c-bad', 'missing-id']);

    expect(result.approved).toHaveLength(1);
    expect(result.approved[0].id).toBe('c-ok');
    expect(result.skipped).toEqual([
      {
        claimId: 'c-bad',
        reason: 'Claim cannot go from CANCELLED to APPROVED',
      },
      {
        claimId: 'missing-id',
        reason: 'Claim cannot go from CANCELLED to APPROVED',
      },
    ]);
    spy.mockRestore();
    void badClaim; // shape reference only, not directly asserted
  });

  it('reports a not-found claim with a clear reason rather than throwing', async () => {
    const { service } = setup({ claim: null });
    const result = await service.bulkApprove(['missing']);
    expect(result.approved).toHaveLength(0);
    expect(result.skipped).toEqual([
      { claimId: 'missing', reason: 'Claim not found' },
    ]);
  });
});

describe('ClaimsService.reject / cancel', () => {
  it('reject is PENDING-only', async () => {
    const { service } = setup({
      claim: { id: 'c-1', status: ClaimStatus.APPROVED },
    });
    await expectDomainError(
      service.reject('c-1', { rejectionReason: 'INSUFFICIENT_SUPPLY' }),
      'INVALID_TRANSITION',
    );
  });

  it('a taker can cancel their own APPROVED claim; the booked slot is released too', async () => {
    const { service, prisma } = setup({
      claim: {
        id: 'c-1',
        status: ClaimStatus.APPROVED,
        taker: { userId: 'u-jo' },
      },
    });
    const result = await service.cancel(
      'c-1',
      { cancellationReason: CancellationReason.CANNOT_MAKE_PICKUP },
      jo,
    );
    expect(result.status).toBe(ClaimStatus.CANCELLED);
    expect(result.cancelledAt).toBeInstanceOf(Date);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { claimId: 'c-1', status: 'BOOKED' },
      data: { status: 'CANCELLED' },
    });
  });

  it("a taker cannot cancel someone else's claim (looks like 404)", async () => {
    const { service } = setup({
      claim: {
        id: 'c-1',
        status: ClaimStatus.PENDING,
        taker: { userId: 'u-jo' },
      },
    });
    await expect(
      service.cancel(
        'c-1',
        { cancellationReason: CancellationReason.OTHER },
        someoneElse,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the manager can cancel any claim', async () => {
    const { service } = setup({
      claim: {
        id: 'c-1',
        status: ClaimStatus.PENDING,
        taker: { userId: 'u-jo' },
      },
    });
    const result = await service.cancel(
      'c-1',
      { cancellationReason: CancellationReason.SOURCED_ELSEWHERE },
      manager,
    );
    expect(result.status).toBe(ClaimStatus.CANCELLED);
  });

  it('terminal states stay terminal', async () => {
    const { service } = setup({
      claim: {
        id: 'c-1',
        status: ClaimStatus.COLLECTED,
        taker: { userId: 'u-jo' },
      },
    });
    await expectDomainError(
      service.cancel(
        'c-1',
        { cancellationReason: CancellationReason.OTHER },
        jo,
      ),
      'INVALID_TRANSITION',
    );
  });
});

describe('nextClaimNumber', () => {
  it('increments the highest existing number, zero-padded to 3', () => {
    expect(nextClaimNumber('CLM-2026-', [])).toBe('CLM-2026-001');
    expect(nextClaimNumber('CLM-2026-', ['CLM-2026-001', 'CLM-2026-003'])).toBe(
      'CLM-2026-004',
    );
    expect(nextClaimNumber('CLM-2026-', ['CLM-2026-999'])).toBe(
      'CLM-2026-1000',
    );
  });
});
