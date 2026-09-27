import { NotFoundException } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import { toDecimal } from '../common/kg';
import {
  BatchStatus,
  Prisma,
  UserRole,
  type User,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { TakersService } from '../takers/takers.service';
import type { BatchPool, BatchPoolService } from './batch-pool.service';
import {
  BatchesService,
  monthPrefix,
  nextBatchReference,
} from './batches.service';

const manager = { id: 'mgr-1', role: UserRole.MANAGER } as User;
const taker = { id: 'tkr-1', role: UserRole.TAKER } as User;

const emptyPool: BatchPool = {
  totalKg: 20,
  schoolReserveKg: 5,
  allocatedKg: 0,
  publicPoolKg: 15,
  pendingClaimKg: 0,
  approvedClaimKg: 0,
  kgRemaining: 15,
};

function batch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b-1',
    reference: '2026-09-A',
    harvestDate: new Date('2026-09-15'),
    totalKg: new Prisma.Decimal(20),
    schoolReserveKg: new Prisma.Decimal(5),
    status: BatchStatus.DRAFT,
    availableFrom: null,
    availableUntil: null,
    ...overrides,
  };
}

function setup(existing = batch()) {
  const prisma = {
    batch: {
      findUnique: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'b-new', status: BatchStatus.DRAFT, ...data }),
        ),
      update: jest.fn().mockImplementation(({ data }) => {
        // Simulate Prisma's atomic { increment } operator for the top-up test.
        const resolved = { ...data };
        if (
          data.totalKg &&
          typeof data.totalKg === 'object' &&
          'increment' in data.totalKg
        ) {
          resolved.totalKg = toDecimal(existing.totalKg).plus(
            data.totalKg.increment,
          );
        }
        return Promise.resolve({ ...existing, ...resolved });
      }),
      delete: jest.fn().mockResolvedValue(existing),
    },
    batchTopUp: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    claim: { count: jest.fn().mockResolvedValue(0) },
    allocation: { count: jest.fn().mockResolvedValue(0) },
  };
  // Interactive transaction: run the callback against the same mock client.
  const prismaWithTx = {
    ...prisma,
    // Array form (batched writes) just awaits each one.
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (tx: typeof prisma) => unknown)(prisma),
    ),
  };
  const pool = {
    forBatch: jest.fn().mockResolvedValue(emptyPool),
    forBatches: jest.fn().mockResolvedValue(new Map()),
    allowanceLeftKgForMany: jest.fn().mockResolvedValue(new Map()),
  };
  // No test here cares about the allowanceLeftKg value itself (that's covered in
  // claims.service.spec.ts / batch-pool.spec.ts) — an unregistered taker keeps it null.
  const takers = { findByUserId: jest.fn().mockResolvedValue(null) };
  const service = new BatchesService(
    prismaWithTx as unknown as PrismaService,
    pool as unknown as BatchPoolService,
    takers as unknown as TakersService,
  );
  return { service, prisma, pool };
}

async function expectDomainError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(DomainException);
  await promise.catch((e: DomainException) => expect(e.code).toBe(code));
}

describe('reference generation', () => {
  it('uses the harvest month in Singapore time', () => {
    expect(monthPrefix(new Date('2026-09-30T20:00:00+08:00'))).toBe('2026-09-');
    // 30 Sep 23:30 SGT is still September even though it is 1 Oct in UTC+9
    expect(monthPrefix(new Date('2026-09-30T15:30:00Z'))).toBe('2026-09-');
  });

  it('picks the first unused letter, skipping gaps and ignoring other months', () => {
    expect(nextBatchReference('2026-09-', [])).toBe('2026-09-A');
    expect(nextBatchReference('2026-09-', ['2026-09-A', '2026-09-B'])).toBe(
      '2026-09-C',
    );
    expect(nextBatchReference('2026-09-', ['2026-09-A', '2026-09-C'])).toBe(
      '2026-09-B',
    );
    expect(nextBatchReference('2026-10-', ['2026-09-A'])).toBe('2026-10-A');
  });

  it('continues past Z', () => {
    const all = Array.from(
      { length: 26 },
      (_, i) => `2026-09-${String.fromCharCode(65 + i)}`,
    );
    expect(nextBatchReference('2026-09-', all)).toBe('2026-09-AA');
  });
});

describe('BatchesService.create', () => {
  it('rejects a school reserve larger than the harvest', async () => {
    const { service } = setup();
    await expectDomainError(
      service.create(
        { harvestDate: '2026-09-15', totalKg: 10, schoolReserveKg: 11 },
        manager,
      ),
      'INVALID_RESERVE',
    );
  });

  it('rejects an availability window that ends before it starts', async () => {
    const { service } = setup();
    await expectDomainError(
      service.create(
        {
          harvestDate: '2026-09-15',
          totalKg: 10,
          availableFrom: '2026-09-20',
          availableUntil: '2026-09-19',
        },
        manager,
      ),
      'INVALID_WINDOW',
    );
  });

  it('creates a DRAFT with a generated reference and the manager as creator', async () => {
    const { service, prisma } = setup();
    const created = await service.create(
      { harvestDate: '2026-09-15', totalKg: 20, schoolReserveKg: 5 },
      manager,
    );
    expect(prisma.batch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: '2026-09-A',
          totalKg: 20,
          schoolReserveKg: 5,
          createdById: 'mgr-1',
        }),
      }),
    );
    expect(created.pool).toEqual(emptyPool);
  });
});

describe('BatchesService visibility', () => {
  it('hides DRAFT batches from takers', async () => {
    const { service } = setup(batch({ status: BatchStatus.DRAFT }));
    await expect(service.getById('b-1', taker)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('forces takers onto OPEN batches only, regardless of the filter they send', async () => {
    const { service, prisma } = setup();
    prisma.batch.count = jest.fn().mockResolvedValue(0);
    await service.list(
      { page: 1, pageSize: 20, status: BatchStatus.DRAFT },
      taker,
    );
    expect(prisma.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: BatchStatus.OPEN } }),
    );
  });
});

describe('BatchesService transitions', () => {
  it('publishes a DRAFT', async () => {
    const { service } = setup(batch({ status: BatchStatus.DRAFT }));
    const result = await service.publish('b-1');
    expect(result.status).toBe(BatchStatus.OPEN);
  });

  it('republishes a CLOSED batch', async () => {
    const { service } = setup(batch({ status: BatchStatus.CLOSED }));
    expect((await service.publish('b-1')).status).toBe(BatchStatus.OPEN);
  });

  it('refuses to close a DRAFT (must be OPEN first)', async () => {
    const { service } = setup(batch({ status: BatchStatus.DRAFT }));
    await expectDomainError(service.close('b-1'), 'INVALID_TRANSITION');
  });

  it('never leaves COMPLETED', async () => {
    const { service } = setup(batch({ status: BatchStatus.COMPLETED }));
    await expectDomainError(service.publish('b-1'), 'INVALID_TRANSITION');
  });

  it('refuses to complete while claims or allocations are still open (§13)', async () => {
    const { service, prisma } = setup(batch({ status: BatchStatus.CLOSED }));
    prisma.claim.count.mockResolvedValue(2);
    await expectDomainError(service.complete('b-1'), 'BATCH_HAS_OPEN_ITEMS');
  });

  it('completes once everything is collected or released', async () => {
    const { service } = setup(batch({ status: BatchStatus.CLOSED }));
    expect((await service.complete('b-1')).status).toBe(BatchStatus.COMPLETED);
  });
});

describe('BatchesService.update pool guard', () => {
  it('refuses to shrink the harvest below what is already committed', async () => {
    const { service, pool } = setup(batch({ status: BatchStatus.OPEN }));
    // Preview with totalKg 10: 10 − 5 reserve − 6 allocated = −1 remaining
    pool.forBatch.mockResolvedValue({
      ...emptyPool,
      totalKg: 10,
      allocatedKg: 6,
      publicPoolKg: -1,
      kgRemaining: -1,
    });
    await expectDomainError(
      service.update('b-1', { totalKg: 10 }),
      'INSUFFICIENT_POOL',
    );
  });

  it('treats a COMPLETED batch as read-only', async () => {
    const { service } = setup(batch({ status: BatchStatus.COMPLETED }));
    await expectDomainError(
      service.update('b-1', { notes: 'x' }),
      'BATCH_COMPLETED',
    );
  });

  it('skips the validation-preview pool read when the edit does not touch totalKg / schoolReserveKg', async () => {
    const { service, pool } = setup(batch({ status: BatchStatus.OPEN }));
    await service.update('b-1', { notes: 'restocked shelf' });
    // withPool() still computes the pool once for the response — only the extra
    // "would this shrink strand committed kg" preview read is the one being skipped.
    expect(pool.forBatch).toHaveBeenCalledTimes(1);
  });
});

describe('BatchesService.topUp (Part A: weekly stock top-up)', () => {
  it('creates the audit row and atomically increments totalKg, on a DRAFT batch', async () => {
    const { service, prisma } = setup(batch({ status: BatchStatus.DRAFT }));
    const result = await service.topUp(
      'b-1',
      { kg: 4.5, note: 'extra bin' },
      manager,
    );
    expect(prisma.batchTopUp.create).toHaveBeenCalledWith({
      data: {
        batchId: 'b-1',
        kg: 4.5,
        note: 'extra bin',
        createdById: 'mgr-1',
      },
    });
    expect(prisma.batch.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { totalKg: { increment: 4.5 } },
    });
    expect(result.totalKg.toNumber()).toBe(24.5); // 20 + 4.5, exact — no float drift
  });

  it('allows top-up on an OPEN batch too', async () => {
    const { service } = setup(batch({ status: BatchStatus.OPEN }));
    const result = await service.topUp('b-1', { kg: 1 }, manager);
    expect(result.totalKg.toNumber()).toBe(21);
  });

  it('refuses top-up on a CLOSED or COMPLETED batch', async () => {
    const { service: closedService } = setup(
      batch({ status: BatchStatus.CLOSED }),
    );
    await expectDomainError(
      closedService.topUp('b-1', { kg: 1 }, manager),
      'BATCH_NOT_TOPUPABLE',
    );
    const { service: completedService } = setup(
      batch({ status: BatchStatus.COMPLETED }),
    );
    await expectDomainError(
      completedService.topUp('b-1', { kg: 1 }, manager),
      'BATCH_NOT_TOPUPABLE',
    );
  });
});

describe('BatchesService.remove', () => {
  it('deletes an unused batch, even once published, but never a completed or used one', async () => {
    const { service, prisma } = setup();
    prisma.batch.findUnique.mockResolvedValue(
      batch({
        status: BatchStatus.COMPLETED,
        _count: { allocations: 0, claims: 0, pickupSlots: 0 },
      }),
    );
    await expectDomainError(service.remove('b-1'), 'BATCH_COMPLETED');

    prisma.batch.findUnique.mockResolvedValue(
      batch({ _count: { allocations: 1, claims: 0, pickupSlots: 0 } }),
    );
    await expectDomainError(service.remove('b-1'), 'BATCH_IN_USE');

    prisma.batch.findUnique.mockResolvedValue(
      batch({
        status: BatchStatus.OPEN,
        _count: { allocations: 0, claims: 0, pickupSlots: 0 },
      }),
    );
    await service.remove('b-1');
    expect(prisma.batchTopUp.deleteMany).toHaveBeenCalledWith({
      where: { batchId: 'b-1' },
    });
    expect(prisma.batch.delete).toHaveBeenCalledWith({ where: { id: 'b-1' } });
  });
});
