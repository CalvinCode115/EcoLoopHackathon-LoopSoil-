import { NotFoundException } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import { BatchStatus, UserRole, type User } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
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
    totalKg: 20,
    schoolReserveKg: 5,
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
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...existing, ...data }),
        ),
      delete: jest.fn().mockResolvedValue(existing),
    },
    claim: { count: jest.fn().mockResolvedValue(0) },
    allocation: { count: jest.fn().mockResolvedValue(0) },
  };
  const pool = {
    forBatch: jest.fn().mockResolvedValue(emptyPool),
    forBatches: jest.fn().mockResolvedValue(new Map()),
  };
  const service = new BatchesService(
    prisma as unknown as PrismaService,
    pool as unknown as BatchPoolService,
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
  it('opens a DRAFT', async () => {
    const { service } = setup(batch({ status: BatchStatus.DRAFT }));
    const result = await service.open('b-1');
    expect(result.status).toBe(BatchStatus.OPEN);
  });

  it('reopens a CLOSED batch', async () => {
    const { service } = setup(batch({ status: BatchStatus.CLOSED }));
    expect((await service.open('b-1')).status).toBe(BatchStatus.OPEN);
  });

  it('refuses to close a DRAFT (must be OPEN first)', async () => {
    const { service } = setup(batch({ status: BatchStatus.DRAFT }));
    await expectDomainError(service.close('b-1'), 'INVALID_TRANSITION');
  });

  it('never leaves COMPLETED', async () => {
    const { service } = setup(batch({ status: BatchStatus.COMPLETED }));
    await expectDomainError(service.open('b-1'), 'INVALID_TRANSITION');
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
});

describe('BatchesService.remove', () => {
  it('only deletes an unused DRAFT', async () => {
    const { service, prisma } = setup();
    prisma.batch.findUnique.mockResolvedValue(
      batch({
        status: BatchStatus.OPEN,
        _count: { allocations: 0, claims: 0, pickupSlots: 0 },
      }),
    );
    await expectDomainError(service.remove('b-1'), 'BATCH_NOT_DRAFT');

    prisma.batch.findUnique.mockResolvedValue(
      batch({ _count: { allocations: 1, claims: 0, pickupSlots: 0 } }),
    );
    await expectDomainError(service.remove('b-1'), 'BATCH_IN_USE');

    prisma.batch.findUnique.mockResolvedValue(
      batch({ _count: { allocations: 0, claims: 0, pickupSlots: 0 } }),
    );
    await service.remove('b-1');
    expect(prisma.batch.delete).toHaveBeenCalledWith({ where: { id: 'b-1' } });
  });
});
