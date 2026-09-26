import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import {
  AllocationStatus,
  BookingStatus,
  ClaimStatus,
  SlotStatus,
  TakerType,
  UserRole,
  type User,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  assertOutsideChangeCutoff,
  assertSlotBookable,
  BookingsService,
  collectionDeadlineFor,
} from './bookings.service';

const manager = { id: 'u-mgr', role: UserRole.MANAGER } as User;
const jo = { id: 'u-jo', role: UserRole.TAKER } as User;
const stranger = { id: 'u-x', role: UserRole.TAKER } as User;

const future = new Date(Date.now() + 3 * 24 * 3600 * 1000);
const futureEnd = new Date(future.getTime() + 2 * 3600 * 1000);

function slot(overrides: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    batchId: 'b-1',
    status: SlotStatus.OPEN,
    startTime: future,
    endTime: futureEnd,
    capacity: 2,
    _count: { bookings: 0 },
    ...overrides,
  };
}

const joTaker = { id: 't-jo', userId: 'u-jo', type: TakerType.INDIVIDUAL };
const nparksTaker = { id: 't-np', userId: null, type: TakerType.BULK };

function approvedClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    reference: 'CLM-2026-001',
    status: ClaimStatus.APPROVED,
    batchId: 'b-1',
    taker: joTaker,
    booking: null,
    ...overrides,
  };
}

function setup(
  opts: {
    slot?: ReturnType<typeof slot> | null;
    claim?: Record<string, unknown> | null;
    allocation?: Record<string, unknown> | null;
    booking?: Record<string, unknown> | null;
    overdue?: { id: string }[];
  } = {},
) {
  const prisma = {
    pickupSlot: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.slot === undefined ? slot() : opts.slot),
    },
    claim: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.claim === undefined ? approvedClaim() : opts.claim,
        ),
      update: jest.fn().mockResolvedValue({}),
    },
    allocation: {
      findUnique: jest.fn().mockResolvedValue(opts.allocation ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    booking: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'bk-new', status: 'BOOKED', ...data }),
        ),
      findUnique: jest.fn().mockResolvedValue(opts.booking ?? null),
      findMany: jest.fn().mockResolvedValue(opts.overdue ?? []),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...opts.booking, ...data }),
        ),
    },
  };
  const prismaWithTx = {
    ...prisma,
    $transaction: jest.fn((fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
  const service = new BookingsService(prismaWithTx as unknown as PrismaService);
  return { service, prisma };
}

async function expectDomainError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(DomainException);
  await promise.catch((e: DomainException) => expect(e.code).toBe(code));
}

describe('collectionDeadlineFor (§13 grace periods)', () => {
  const end = new Date('2026-09-26T12:00:00Z');
  it('individual: slot end + 2 days', () => {
    expect(collectionDeadlineFor(end, TakerType.INDIVIDUAL).toISOString()).toBe(
      '2026-09-28T12:00:00.000Z',
    );
  });
  it('bulk: slot end + 7 days', () => {
    expect(collectionDeadlineFor(end, TakerType.BULK).toISOString()).toBe(
      '2026-10-03T12:00:00.000Z',
    );
  });
});

describe('assertSlotBookable — capacity (§13)', () => {
  const now = new Date();
  it('accepts a seat while active bookings < capacity', () => {
    expect(() =>
      assertSlotBookable(
        slot({ _count: { bookings: 1 } }) as never,
        'b-1',
        now,
      ),
    ).not.toThrow();
  });
  it('rejects when full', () => {
    expect(() =>
      assertSlotBookable(
        slot({ _count: { bookings: 2 } }) as never,
        'b-1',
        now,
      ),
    ).toThrow(DomainException);
  });
  it('rejects a slot of another batch, a closed slot, and a past slot', () => {
    expect(() => assertSlotBookable(slot() as never, 'b-2', now)).toThrow(
      DomainException,
    );
    expect(() =>
      assertSlotBookable(
        slot({ status: SlotStatus.CLOSED }) as never,
        'b-1',
        now,
      ),
    ).toThrow(DomainException);
    expect(() =>
      assertSlotBookable(
        slot({ endTime: new Date(Date.now() - 1000) }) as never,
        'b-1',
        now,
      ),
    ).toThrow(DomainException);
  });
});

describe('BookingsService.create', () => {
  it('books a taker into a slot for their APPROVED claim with an individual deadline', async () => {
    const { service } = setup();
    const booking = await service.create({ slotId: 's-1', claimId: 'c-1' }, jo);
    expect(booking.status).toBe('BOOKED');
    expect(booking.claimId).toBe('c-1');
    expect(booking.collectionDeadline).toEqual(
      collectionDeadlineFor(futureEnd, TakerType.INDIVIDUAL),
    );
  });

  it('requires exactly one of claimId / allocationId', async () => {
    const { service } = setup();
    await expectDomainError(
      service.create({ slotId: 's-1' }, jo),
      'BOOKING_TARGET_REQUIRED',
    );
    await expectDomainError(
      service.create(
        { slotId: 's-1', claimId: 'c-1', allocationId: 'a-1' },
        jo,
      ),
      'BOOKING_TARGET_REQUIRED',
    );
  });

  it('refuses when the slot is full', async () => {
    const { service, prisma } = setup({
      slot: slot({ _count: { bookings: 2 } }),
    });
    await expectDomainError(
      service.create({ slotId: 's-1', claimId: 'c-1' }, jo),
      'SLOT_FULL',
    );
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('only APPROVED claims can book', async () => {
    const { service } = setup({
      claim: approvedClaim({ status: ClaimStatus.PENDING }),
    });
    await expectDomainError(
      service.create({ slotId: 's-1', claimId: 'c-1' }, jo),
      'CLAIM_NOT_APPROVED',
    );
  });

  it("a taker cannot book someone else's claim", async () => {
    const { service } = setup();
    await expect(
      service.create({ slotId: 's-1', claimId: 'c-1' }, stranger),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('one booking row per claim — a second attempt points to reschedule', async () => {
    const { service } = setup({
      claim: approvedClaim({ booking: { status: BookingStatus.CANCELLED } }),
    });
    await expectDomainError(
      service.create({ slotId: 's-1', claimId: 'c-1' }, jo),
      'BOOKING_EXISTS',
    );
  });

  it('allocations: manager only, and only when CONFIRMED, with a bulk deadline', async () => {
    const confirmed = {
      id: 'a-1',
      reference: 'ALC-2026-09-A-NParks',
      status: AllocationStatus.CONFIRMED,
      batchId: 'b-1',
      taker: nparksTaker,
      booking: null,
    };
    await expect(
      setup({ allocation: confirmed }).service.create(
        { slotId: 's-1', allocationId: 'a-1' },
        jo,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expectDomainError(
      setup({
        allocation: { ...confirmed, status: AllocationStatus.PLANNED },
      }).service.create({ slotId: 's-1', allocationId: 'a-1' }, manager),
      'ALLOCATION_NOT_CONFIRMED',
    );

    const booking = await setup({ allocation: confirmed }).service.create(
      { slotId: 's-1', allocationId: 'a-1' },
      manager,
    );
    expect(booking.collectionDeadline).toEqual(
      collectionDeadlineFor(futureEnd, TakerType.BULK),
    );
  });
});

describe('BookingsService — no-show releases the kg (§11, §13)', () => {
  const bookedClaim = {
    id: 'bk-1',
    status: BookingStatus.BOOKED,
    slotId: 's-1',
    slot: { startTime: new Date(Date.now() - 3600_000) }, // slot already started
    claim: {
      id: 'c-1',
      reference: 'CLM-2026-001',
      status: ClaimStatus.APPROVED,
      batchId: 'b-1',
      taker: joTaker,
    },
    allocation: null,
  };

  it('markNoShow: booking → NO_SHOW and the APPROVED claim → CANCELLED (CANNOT_MAKE_PICKUP)', async () => {
    const { service, prisma } = setup({ booking: bookedClaim });
    const result = await service.markNoShow('bk-1');
    expect(result.status).toBe(BookingStatus.NO_SHOW);
    expect(prisma.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c-1' },
        data: expect.objectContaining({
          status: ClaimStatus.CANCELLED,
          cancellationReason: 'CANNOT_MAKE_PICKUP',
        }),
      }),
    );
  });

  it('a CONFIRMED allocation is cancelled the same way', async () => {
    const { service, prisma } = setup({
      booking: {
        ...bookedClaim,
        claim: null,
        allocation: {
          id: 'a-1',
          reference: 'ALC-1',
          status: AllocationStatus.CONFIRMED,
          batchId: 'b-1',
          taker: nparksTaker,
        },
      },
    });
    await service.markNoShow('bk-1');
    expect(prisma.allocation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a-1' },
        data: expect.objectContaining({ status: AllocationStatus.CANCELLED }),
      }),
    );
  });

  it('expireOverdue sweeps every overdue BOOKED booking and reports references', async () => {
    const { service, prisma } = setup({
      booking: bookedClaim,
      overdue: [{ id: 'bk-1' }, { id: 'bk-1' }],
    });
    const result = await service.expireOverdue(new Date());
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: BookingStatus.BOOKED }),
      }),
    );
    expect(result.expired).toBe(2);
    expect(result.references).toEqual(['CLM-2026-001', 'CLM-2026-001']);
  });

  it('a COLLECTED booking is never expired', async () => {
    const { service } = setup({
      booking: { ...bookedClaim, status: BookingStatus.COLLECTED },
    });
    await expectDomainError(service.markNoShow('bk-1'), 'INVALID_TRANSITION');
  });
});

describe('BookingsService.reschedule / cancel', () => {
  const cancelledBySlot = {
    id: 'bk-1',
    status: BookingStatus.CANCELLED,
    slotId: 's-old',
    note: null,
    claim: {
      id: 'c-1',
      reference: 'CLM-2026-001',
      status: ClaimStatus.APPROVED,
      batchId: 'b-1',
      taker: joTaker,
    },
    allocation: null,
  };

  it('re-activates a CANCELLED booking into a new slot with a fresh deadline', async () => {
    const { service } = setup({ booking: cancelledBySlot });
    const result = await service.reschedule('bk-1', { slotId: 's-1' }, jo);
    expect(result.status).toBe(BookingStatus.BOOKED);
    expect(result.slotId).toBe('s-1');
    expect(result.collectionDeadline).toEqual(
      collectionDeadlineFor(futureEnd, TakerType.INDIVIDUAL),
    );
  });

  it('cannot re-activate when the claim itself is no longer APPROVED', async () => {
    const { service } = setup({
      booking: {
        ...cancelledBySlot,
        claim: { ...cancelledBySlot.claim, status: ClaimStatus.CANCELLED },
      },
    });
    await expectDomainError(
      service.reschedule('bk-1', { slotId: 's-1' }, jo),
      'TARGET_NOT_ACTIVE',
    );
  });

  it('COLLECTED / NO_SHOW bookings are locked', async () => {
    const { service } = setup({
      booking: { ...cancelledBySlot, status: BookingStatus.NO_SHOW },
    });
    await expectDomainError(
      service.reschedule('bk-1', { slotId: 's-1' }, jo),
      'BOOKING_LOCKED',
    );
  });

  it('cancel frees the seat and leaves the claim untouched', async () => {
    const { service, prisma } = setup({
      booking: { ...cancelledBySlot, status: BookingStatus.BOOKED },
    });
    const result = await service.cancel('bk-1', { note: 'cannot make it' }, jo);
    expect(result.status).toBe(BookingStatus.CANCELLED);
    expect(prisma.claim.update).not.toHaveBeenCalled();
  });
});

describe('Stage 5 rules (Backend-Updates.md §D/§E)', () => {
  it('change-pickup cutoff: blocked within 2h of the current slot, allowed before', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    expect(() =>
      assertOutsideChangeCutoff(new Date('2026-09-28T11:30:00Z'), now),
    ).toThrow(DomainException);
    expect(() =>
      assertOutsideChangeCutoff(new Date('2026-09-28T12:30:00Z'), now),
    ).not.toThrow();
  });

  it('a general-availability slot (no batch) accepts a booking from any batch', () => {
    const general = { ...slot(), batchId: null };
    expect(() =>
      assertSlotBookable(general as never, 'b-any', new Date()),
    ).not.toThrow();
  });

  it('manual no-show is refused before the slot has started', async () => {
    const { service } = setup({
      booking: {
        id: 'bk-1',
        status: BookingStatus.BOOKED,
        slot: { startTime: new Date(Date.now() + 3600_000) },
        claim: null,
        allocation: null,
      },
    });
    await expect(service.markNoShow('bk-1')).rejects.toMatchObject({
      code: 'SLOT_NOT_STARTED',
    });
  });

  it('a manager booking records who booked it (on-behalf)', async () => {
    const { service, prisma } = setup();
    await service.create({ slotId: 's-1', claimId: 'c-1' }, manager);
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bookedById: 'u-mgr' }),
      }),
    );
  });
});
