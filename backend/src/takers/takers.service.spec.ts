import { NotFoundException } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import {
  AllocationStatus,
  BookingStatus,
  ClaimStatus,
  TakerStatus,
  UserRole,
  type User,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { TakersService } from './takers.service';

const manager = { id: 'u-mgr', role: UserRole.MANAGER } as User;

function taker(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    name: 'Jo Tan',
    status: TakerStatus.PENDING,
    ...overrides,
  };
}

function setup(existing = taker()) {
  const prisma = {
    taker: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...existing, ...data }),
        ),
    },
    claim: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    allocation: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    booking: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prismaWithTx = {
    ...prisma,
    $transaction: jest.fn((fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
  const service = new TakersService(prismaWithTx as unknown as PrismaService);
  return { service, prisma };
}

async function expectDomainError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(DomainException);
  await promise.catch((e: DomainException) => expect(e.code).toBe(code));
}

describe('TakersService status transitions (§11-style state machine)', () => {
  it('approves a PENDING applicant and stamps the audit trail', async () => {
    const { service, prisma } = setup(taker({ status: TakerStatus.PENDING }));
    const result = await service.approve(
      't-1',
      { statusReason: 'looks good' },
      manager,
    );
    expect(result.status).toBe(TakerStatus.APPROVED);
    expect(prisma.taker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TakerStatus.APPROVED,
          statusReason: 'looks good',
          statusChangedById: 'u-mgr',
          statusChangedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('lets the manager reconsider: REJECTED → APPROVED via the same approve() call', async () => {
    const { service } = setup(taker({ status: TakerStatus.REJECTED }));
    const result = await service.approve('t-1', {}, manager);
    expect(result.status).toBe(TakerStatus.APPROVED);
  });

  it('declines a PENDING applicant', async () => {
    const { service } = setup(taker({ status: TakerStatus.PENDING }));
    const result = await service.decline(
      't-1',
      { statusReason: 'no plot' },
      manager,
    );
    expect(result.status).toBe(TakerStatus.REJECTED);
  });

  it('reinstates a SUSPENDED taker', async () => {
    const { service } = setup(taker({ status: TakerStatus.SUSPENDED }));
    const result = await service.reinstate('t-1', {}, manager);
    expect(result.status).toBe(TakerStatus.APPROVED);
  });

  it('rejects invalid transitions (PENDING cannot go straight to SUSPENDED)', async () => {
    const { service } = setup(taker({ status: TakerStatus.PENDING }));
    await expectDomainError(
      service.suspend('t-1', { statusReason: 'x' }, manager),
      'INVALID_TRANSITION',
    );
  });

  it('rejects declining an already-APPROVED taker (decline is PENDING-only)', async () => {
    const { service } = setup(taker({ status: TakerStatus.APPROVED }));
    await expectDomainError(
      service.decline('t-1', { statusReason: 'x' }, manager),
      'INVALID_TRANSITION',
    );
  });

  it('404s on an unknown taker', async () => {
    const { service, prisma } = setup();
    prisma.taker.findUnique.mockResolvedValue(null);
    await expect(
      service.approve('missing', {}, manager),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TakersService cascade cancel on suspend/decline (§E)', () => {
  it('suspend cancels active claims + their bookings, freeing the kg', async () => {
    const { service, prisma } = setup(taker({ status: TakerStatus.APPROVED }));
    prisma.claim.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]);

    await service.suspend('t-1', { statusReason: 'no-shows' }, manager);

    expect(prisma.claim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          takerId: 't-1',
          status: { in: [ClaimStatus.PENDING, ClaimStatus.APPROVED] },
        },
      }),
    );
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { claimId: { in: ['c-1', 'c-2'] }, status: BookingStatus.BOOKED },
      data: {
        status: BookingStatus.CANCELLED,
        cancelNote: expect.stringContaining('suspended'),
      },
    });
    expect(prisma.claim.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-1', 'c-2'] } },
      data: expect.objectContaining({
        status: ClaimStatus.CANCELLED,
        cancellationReason: 'OTHER',
      }),
    });
  });

  it('suspending a BULK taker cancels active allocations + their bookings too', async () => {
    const { service, prisma } = setup(taker({ status: TakerStatus.APPROVED }));
    prisma.allocation.findMany.mockResolvedValue([{ id: 'a-1' }]);

    await service.suspend('t-1', { statusReason: 'pulled out' }, manager);

    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { allocationId: { in: ['a-1'] }, status: BookingStatus.BOOKED },
      data: expect.objectContaining({ status: BookingStatus.CANCELLED }),
    });
    expect(prisma.allocation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a-1'] } },
      data: expect.objectContaining({ status: AllocationStatus.CANCELLED }),
    });
  });

  it('decline cascades the same way as suspend', async () => {
    const { service, prisma } = setup(taker({ status: TakerStatus.PENDING }));
    prisma.claim.findMany.mockResolvedValue([{ id: 'c-1' }]);

    await service.decline('t-1', { statusReason: 'ineligible' }, manager);

    expect(prisma.claim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ClaimStatus.CANCELLED }),
      }),
    );
  });

  it('reinstate does NOT touch claims or allocations', async () => {
    const { service, prisma } = setup(taker({ status: TakerStatus.SUSPENDED }));
    await service.reinstate('t-1', {}, manager);
    expect(prisma.claim.findMany).not.toHaveBeenCalled();
    expect(prisma.allocation.findMany).not.toHaveBeenCalled();
  });

  it('approve does NOT touch claims or allocations', async () => {
    const { service, prisma } = setup(taker({ status: TakerStatus.PENDING }));
    await service.approve('t-1', {}, manager);
    expect(prisma.claim.findMany).not.toHaveBeenCalled();
    expect(prisma.allocation.findMany).not.toHaveBeenCalled();
  });

  it('skips the booking/claim update calls entirely when there is nothing active', async () => {
    const { service, prisma } = setup(taker({ status: TakerStatus.APPROVED }));
    await service.suspend('t-1', { statusReason: 'x' }, manager);
    expect(prisma.claim.updateMany).not.toHaveBeenCalled();
    expect(prisma.allocation.updateMany).not.toHaveBeenCalled();
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });
});

describe('TakersService.requireApprovedIndividual', () => {
  const jo = { id: 'u-jo', role: UserRole.TAKER } as User;

  function withStatus(status: TakerStatus) {
    return setup(taker({ userId: 'u-jo', status }));
  }

  it('allows an APPROVED individual through', async () => {
    const { service } = withStatus(TakerStatus.APPROVED);
    await expect(service.requireApprovedIndividual(jo)).resolves.toBeTruthy();
  });

  it.each([
    [TakerStatus.PENDING, 'TAKER_NOT_APPROVED'],
    [TakerStatus.REJECTED, 'TAKER_REJECTED'],
    [TakerStatus.SUSPENDED, 'TAKER_SUSPENDED'],
  ])('blocks a %s taker with %s', async (status, code) => {
    const { service, prisma } = setup();
    prisma.taker.findUnique.mockResolvedValue(
      taker({ userId: 'u-jo', status }),
    );
    await expectDomainError(service.requireApprovedIndividual(jo), code);
  });

  it('blocks someone who never registered', async () => {
    const { service, prisma } = setup();
    prisma.taker.findUnique.mockResolvedValue(null);
    await expectDomainError(
      service.requireApprovedIndividual(jo),
      'TAKER_NOT_REGISTERED',
    );
  });
});
