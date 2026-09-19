import { NotFoundException } from '@nestjs/common';
import type {
  BatchPool,
  BatchPoolService,
} from '../batches/batch-pool.service';
import { DomainException } from '../common/errors/domain.exception';
import {
  BatchStatus,
  CancellationReason,
  ClaimStatus,
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

/** §12: 20kg, reserve 5, NParks 6 → public 9; Claim A 3 pending, Claim B 2 approved → 4 left. */
const pool4Left: BatchPool = {
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
    existing?: { reference: string } | null;
    claim?: Record<string, unknown> | null;
  } = {},
) {
  const prisma = {
    batch: { findUnique: jest.fn().mockResolvedValue(openBatch) },
    claim: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
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
    forBatch: jest.fn().mockResolvedValue(opts.pool ?? pool4Left),
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

describe('ClaimsService.create — requested kg locks against the pool', () => {
  it('creates a PENDING claim with a yearly sequence reference', async () => {
    const { service, prisma } = setup();
    const claim = await service.create({ batchId: 'b-1', requestedKg: 3 }, jo);
    expect(claim.status).toBe('PENDING');
    expect(prisma.claim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: expect.stringMatching(/^CLM-\d{4}-001$/),
          takerId: 't-jo',
          requestedKg: 3,
        }),
      }),
    );
  });

  it('hard-blocks a request larger than kgRemaining', async () => {
    const { service, prisma } = setup();
    await expectDomainError(
      service.create({ batchId: 'b-1', requestedKg: 4.5 }, jo),
      'INSUFFICIENT_POOL',
    );
    expect(prisma.claim.create).not.toHaveBeenCalled();
  });

  it('allows exactly kgRemaining', async () => {
    const { service, prisma } = setup();
    await service.create({ batchId: 'b-1', requestedKg: 4 }, jo);
    expect(prisma.claim.create).toHaveBeenCalled();
  });

  it('refuses a second live claim on the same batch', async () => {
    const { service } = setup({ existing: { reference: 'CLM-2026-007' } });
    await expectDomainError(
      service.create({ batchId: 'b-1', requestedKg: 1 }, jo),
      'CLAIM_EXISTS',
    );
  });

  it('is gated by taker vetting (registration + approval)', async () => {
    const { service, takers } = setup();
    takers.requireApprovedIndividual.mockRejectedValue(
      new DomainException('TAKER_NOT_APPROVED', 'awaiting approval', 403),
    );
    await expectDomainError(
      service.create({ batchId: 'b-1', requestedKg: 1 }, jo),
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

describe('ClaimsService.approve — locks approvedKg', () => {
  const pending = {
    id: 'c-1',
    status: ClaimStatus.PENDING,
    requestedKg: 3,
    managerNote: null,
    batch: openBatch,
  };

  it('defaults approvedKg to requestedKg and stamps decidedAt', async () => {
    const { service } = setup({ claim: pending });
    const result = await service.approve('c-1', {});
    expect(result.status).toBe(ClaimStatus.APPROVED);
    expect(result.approvedKg).toBe(3);
    expect(result.decidedAt).toBeInstanceOf(Date);
  });

  it('may approve less than requested', async () => {
    const { service } = setup({ claim: pending });
    const result = await service.approve('c-1', {
      approvedKg: 2,
      managerNote: 'only 2kg avail — WhatsApp 9XXX to confirm',
    });
    expect(result.approvedKg).toBe(2);
    expect(result.managerNote).toContain('WhatsApp');
  });

  it('never approves more than requested', async () => {
    const { service } = setup({ claim: pending });
    await expectDomainError(
      service.approve('c-1', { approvedKg: 3.5 }),
      'APPROVED_EXCEEDS_REQUESTED',
    );
  });

  it("counts the claim's own pending lock as available to itself", async () => {
    // Pool says 0 left, but 3 of the locked kg is this very claim → approving 3 is fine.
    const { service } = setup({
      claim: pending,
      pool: { ...pool4Left, pendingClaimKg: 7, kgRemaining: 0 },
    });
    const result = await service.approve('c-1', {});
    expect(result.approvedKg).toBe(3);
  });

  it('blocks approval when other commitments have since eaten the pool', async () => {
    // Manager allocated more after this claim came in: remaining is −2 including our 3.
    const { service } = setup({
      claim: pending,
      pool: { ...pool4Left, allocatedKg: 12, publicPoolKg: 3, kgRemaining: -2 },
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
