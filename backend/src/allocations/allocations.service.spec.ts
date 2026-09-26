import type {
  BatchPool,
  BatchPoolService,
} from '../batches/batch-pool.service';
import { DomainException } from '../common/errors/domain.exception';
import {
  AllocationStatus,
  BatchStatus,
  Prisma,
  TakerCategory,
  TakerStatus,
  TakerType,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AllocationsService } from './allocations.service';

const batch = {
  id: 'b-1',
  reference: '2026-09-A',
  status: BatchStatus.OPEN,
  totalKg: 20,
  schoolReserveKg: 5,
};

const nparks = {
  id: 't-np',
  name: 'NParks',
  type: TakerType.BULK,
  status: TakerStatus.APPROVED,
  category: TakerCategory.NPARKS,
};

const individual = {
  ...nparks,
  id: 't-ind',
  name: 'Jo Tan',
  type: TakerType.INDIVIDUAL,
};

/** §12 example after NParks 6kg, Claim A 3kg pending, Claim B 2kg approved → 4kg left. */
const poolWith4Left: BatchPool = {
  totalKg: 20,
  schoolReserveKg: 5,
  allocatedKg: 6,
  publicPoolKg: 9,
  pendingClaimKg: 3,
  approvedClaimKg: 2,
  kgRemaining: 4,
};

function setup(
  overrides: {
    batch?: Partial<typeof batch> | null;
    taker?: typeof nparks | null;
    duplicate?: { reference: string } | null;
    pool?: BatchPool;
    allocation?: Record<string, unknown> | null;
  } = {},
) {
  const prisma = {
    batch: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.batch === null ? null : { ...batch, ...overrides.batch },
        ),
    },
    taker: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.taker === undefined ? nparks : overrides.taker,
        ),
    },
    allocation: {
      findFirst: jest.fn().mockResolvedValue(overrides.duplicate ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(overrides.allocation ?? null),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'a-new', status: 'PLANNED', ...data }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...overrides.allocation, ...data }),
        ),
    },
    booking: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  // Interactive transaction: run the callback against the same mock client.
  const tx = prisma;
  const prismaWithTx = {
    ...prisma,
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const pool = {
    forBatch: jest.fn().mockResolvedValue(overrides.pool ?? poolWith4Left),
  };
  const service = new AllocationsService(
    prismaWithTx as unknown as PrismaService,
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

describe('AllocationsService.create', () => {
  const dto = { batchId: 'b-1', takerId: 't-np', allocatedKg: 3 };

  it('creates a PLANNED allocation within the remaining pool with a generated reference', async () => {
    const { service, prisma } = setup();
    await service.create(dto);
    expect(prisma.allocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: 'ALC-2026-09-A-NParks',
          allocatedKg: 3,
        }),
      }),
    );
  });

  it('hard-blocks an allocation larger than kgRemaining', async () => {
    const { service, prisma } = setup();
    await expectDomainError(
      service.create({ ...dto, allocatedKg: 4.001 }),
      'INSUFFICIENT_POOL',
    );
    expect(prisma.allocation.create).not.toHaveBeenCalled();
  });

  it('allows exactly kgRemaining (float-tolerant)', async () => {
    const { service, prisma } = setup();
    await service.create({ ...dto, allocatedKg: 4 });
    expect(prisma.allocation.create).toHaveBeenCalled();
  });

  it('refuses individuals — they receive compost through claims', async () => {
    const { service } = setup({ taker: individual });
    await expectDomainError(service.create(dto), 'TAKER_NOT_BULK');
  });

  it('refuses a suspended bulk taker', async () => {
    const { service } = setup({
      taker: { ...nparks, status: TakerStatus.SUSPENDED },
    });
    await expectDomainError(service.create(dto), 'TAKER_NOT_APPROVED');
  });

  it('refuses a second active allocation for the same org on the same batch', async () => {
    const { service } = setup({
      duplicate: { reference: 'ALC-2026-09-A-NParks' },
    });
    await expectDomainError(service.create(dto), 'ALLOCATION_EXISTS');
  });

  it('refuses to allocate off a CLOSED or COMPLETED batch', async () => {
    const { service } = setup({ batch: { status: BatchStatus.CLOSED } });
    await expectDomainError(service.create(dto), 'BATCH_NOT_ALLOCATABLE');
  });

  it('suffixes the reference when the natural label is taken', async () => {
    const { service, prisma } = setup();
    prisma.allocation.findMany.mockResolvedValue([
      { reference: 'ALC-2026-09-A-NParks' },
      { reference: 'ALC-2026-09-A-NParks-2' },
    ]);
    await service.create(dto);
    expect(prisma.allocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reference: 'ALC-2026-09-A-NParks-3' }),
      }),
    );
  });
});

describe('AllocationsService.update', () => {
  const existing = {
    id: 'a-1',
    status: AllocationStatus.PLANNED,
    allocatedKg: new Prisma.Decimal(6),
    batch,
  };

  it('lets the amount grow by up to what is still remaining plus its own share', async () => {
    const { service, prisma } = setup({ allocation: existing });
    // 4 remaining + own 6 = 10 available
    await service.update('a-1', { allocatedKg: 10 });
    expect(prisma.allocation.update).toHaveBeenCalled();
    await expectDomainError(
      service.update('a-1', { allocatedKg: 10.5 }),
      'INSUFFICIENT_POOL',
    );
  });

  it('refuses to edit a COLLECTED or CANCELLED allocation', async () => {
    const { service } = setup({
      allocation: { ...existing, status: AllocationStatus.COLLECTED },
    });
    await expectDomainError(
      service.update('a-1', { allocatedKg: 1 }),
      'ALLOCATION_LOCKED',
    );
  });
});

describe('AllocationsService transitions (§11)', () => {
  it('PLANNED → CONFIRMED', async () => {
    const { service } = setup({
      allocation: { id: 'a-1', status: AllocationStatus.PLANNED },
    });
    const result = await service.confirm('a-1');
    expect(result.status).toBe(AllocationStatus.CONFIRMED);
  });

  it('CANCELLED is terminal', async () => {
    const { service } = setup({
      allocation: { id: 'a-1', status: AllocationStatus.CANCELLED },
    });
    await expectDomainError(service.confirm('a-1'), 'INVALID_TRANSITION');
    await expectDomainError(service.cancel('a-1', {}), 'INVALID_TRANSITION');
  });

  it('cancel releases any BOOKED pickup in the same transaction', async () => {
    const { service, prisma } = setup({
      allocation: { id: 'a-1', status: AllocationStatus.CONFIRMED, note: null },
    });
    const result = await service.cancel('a-1', { note: 'NParks pulled out' });
    expect(result.status).toBe(AllocationStatus.CANCELLED);
    expect(result.note).toBe('NParks pulled out');
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { allocationId: 'a-1', status: 'BOOKED' },
      data: { status: 'CANCELLED' },
    });
  });
});
