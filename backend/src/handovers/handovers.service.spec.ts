import { NotFoundException } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import {
  AllocationStatus,
  BookingStatus,
  ClaimStatus,
  TakerType,
  UserRole,
  type User,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupabaseService } from '../supabase/supabase.service';
import { assertPhoto } from '../supabase/supabase.service';
import { HandoversService, type UploadedPhoto } from './handovers.service';

const manager = { id: 'u-mgr', role: UserRole.MANAGER } as User;
const jo = { id: 'u-jo', role: UserRole.TAKER } as User;
const stranger = { id: 'u-x', role: UserRole.TAKER } as User;

const joTaker = {
  id: 't-jo',
  userId: 'u-jo',
  name: 'Jo Tan',
  type: TakerType.INDIVIDUAL,
  category: null,
};

/** A BOOKED booking on an APPROVED 3kg claim — ready to be handed over. */
function collectable(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk-1',
    status: BookingStatus.BOOKED,
    bookedAt: new Date(),
    slot: {
      id: 's-1',
      startTime: new Date(),
      endTime: new Date(),
      location: null,
      batch: { id: 'b-1', reference: '2026-09-A', harvestDate: new Date() },
    },
    claim: {
      id: 'c-1',
      reference: 'CLM-2026-001',
      status: ClaimStatus.APPROVED,
      approvedKg: 3,
      taker: joTaker,
    },
    allocation: null,
    handover: null,
    ...overrides,
  };
}

const photo: UploadedPhoto = {
  buffer: Buffer.from('jpeg-bytes'),
  mimetype: 'image/jpeg',
  size: 1234,
};

function setup(
  opts: {
    booking?: ReturnType<typeof collectable> | null;
    handover?: Record<string, unknown> | null;
    uploadFails?: boolean;
    txFails?: boolean;
  } = {},
) {
  const booking = opts.booking === undefined ? collectable() : opts.booking;
  const prisma = {
    booking: {
      findUnique: jest.fn().mockResolvedValue(booking),
      update: jest.fn().mockResolvedValue({}),
    },
    claim: { update: jest.fn().mockResolvedValue({}) },
    allocation: { update: jest.fn().mockResolvedValue({}) },
    handover: {
      findMany: jest.fn().mockResolvedValue([{ reference: 'HND-2026-09-004' }]),
      findUnique: jest.fn().mockResolvedValue(opts.handover ?? null),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'h-new',
          ...data,
          booking: { ...booking, status: BookingStatus.COLLECTED },
          handedOverBy: { id: manager.id, name: 'Manager' },
        }),
      ),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...opts.handover, ...data }),
        ),
    },
  };
  const prismaWithTx = {
    ...prisma,
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => unknown) => {
      if (opts.txFails) throw new Error('db exploded mid-transaction');
      return fn(prisma);
    }),
  };
  const storage = {
    uploadHandoverPhoto: jest
      .fn()
      .mockImplementation((path: string) =>
        opts.uploadFails
          ? Promise.reject(new DomainException('PHOTO_UPLOAD_FAILED', 'x', 502))
          : Promise.resolve(path),
      ),
    removeHandoverPhoto: jest.fn().mockResolvedValue(undefined),
    signedHandoverPhotoUrls: jest
      .fn()
      .mockImplementation((paths: string[]) =>
        Promise.resolve(new Map(paths.map((p) => [p, `https://signed/${p}`]))),
      ),
  };
  const service = new HandoversService(
    prismaWithTx as unknown as PrismaService,
    storage as unknown as SupabaseService,
  );
  return { service, prisma, prismaWithTx, storage };
}

async function expectDomainError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(DomainException);
  await promise.catch((e: DomainException) => expect(e.code).toBe(code));
}

describe('HandoversService.create — the atomic COLLECTED flip (§13)', () => {
  // 1 half-kg bag + 2 one-kg bags + 0.3 loose = 2.8 kg NET, within 3kg x 1.10
  const dto = { bookingId: 'bk-1', halfKgBags: 1, oneKgBags: 2, looseKg: 0.3 };

  it('creates the handover and flips booking + claim to COLLECTED inside one transaction', async () => {
    const { service, prisma, prismaWithTx } = setup();
    const result = await service.create(dto, photo, manager);

    expect(prismaWithTx.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'bk-1' },
      data: { status: BookingStatus.COLLECTED },
    });
    expect(prisma.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c-1' },
        data: expect.objectContaining({ status: ClaimStatus.COLLECTED }),
      }),
    );
    expect(prisma.handover.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: expect.stringMatching(/^HND-\d{4}-\d{2}-005$/),
          bookingId: 'bk-1',
          halfKgBags: 1,
          oneKgBags: 2,
          handedOverById: 'u-mgr',
          photoUrl: expect.stringMatching(/^2026-09-A\/bk-1-\d+\.jpg$/),
        }),
      }),
    );
    // Flattened chain for the UI / dashboard
    expect(result.batch?.reference).toBe('2026-09-A');
    expect(result.taker?.name).toBe('Jo Tan');
    expect(result.source).toBe('CLAIM');
    expect(result.expectedKg).toBe(3);
    expect(result.actualKg).toBe(2.8);
    expect(result.photoUrl).toMatch(/^https:\/\/signed\//);
  });

  it('flips a CONFIRMED allocation the same way', async () => {
    const { service, prisma } = setup({
      booking: collectable({
        claim: null,
        allocation: {
          id: 'a-1',
          reference: 'ALC-2026-09-A-NParks',
          status: AllocationStatus.CONFIRMED,
          allocatedKg: 6,
          taker: {
            ...joTaker,
            id: 't-np',
            userId: null,
            name: 'NParks',
            type: TakerType.BULK,
          },
        },
      }),
    });
    const result = await service.create(dto, photo, manager);
    expect(prisma.allocation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AllocationStatus.COLLECTED }),
      }),
    );
    expect(result.source).toBe('ALLOCATION');
    expect(result.expectedKg).toBe(6);
  });

  it('refuses a booking that already has a handover', async () => {
    const { service, storage } = setup({
      booking: collectable({
        handover: { id: 'h-1', reference: 'HND-2026-09-001' },
      }),
    });
    await expectDomainError(
      service.create(dto, photo, manager),
      'HANDOVER_EXISTS',
    );
    expect(storage.uploadHandoverPhoto).not.toHaveBeenCalled();
  });

  it('refuses a CANCELLED / NO_SHOW booking', async () => {
    const { service } = setup({
      booking: collectable({ status: BookingStatus.NO_SHOW }),
    });
    await expectDomainError(
      service.create(dto, photo, manager),
      'INVALID_TRANSITION',
    );
  });

  it('refuses when the claim is no longer APPROVED', async () => {
    const { service } = setup({
      booking: collectable({
        claim: {
          id: 'c-1',
          reference: 'CLM-1',
          status: ClaimStatus.CANCELLED,
          approvedKg: 3,
          taker: joTaker,
        },
      }),
    });
    await expectDomainError(
      service.create(dto, photo, manager),
      'INVALID_TRANSITION',
    );
  });

  it('refuses a handedOverAt in the future', async () => {
    const { service } = setup();
    await expectDomainError(
      service.create(
        { ...dto, handedOverAt: new Date(Date.now() + 3600_000).toISOString() },
        photo,
        manager,
      ),
      'HANDOVER_IN_FUTURE',
    );
  });

  it('requires a photo', async () => {
    const { service, prismaWithTx } = setup();
    await expectDomainError(
      service.create(dto, undefined, manager),
      'PHOTO_REQUIRED',
    );
    expect(prismaWithTx.$transaction).not.toHaveBeenCalled();
  });

  it('refuses more than 10% over the approved kg, before uploading', async () => {
    const { service, storage } = setup();
    // 3 + 0.5 = 3.5 kg > 3kg x 1.10 = 3.3
    await expectDomainError(
      service.create(
        { bookingId: 'bk-1', oneKgBags: 3, looseKg: 0.5 },
        photo,
        manager,
      ),
      'HANDOVER_OVER_TOLERANCE',
    );
    expect(storage.uploadHandoverPhoto).not.toHaveBeenCalled();
  });

  it('refuses an empty breakdown', async () => {
    const { service } = setup();
    await expectDomainError(
      service.create({ bookingId: 'bk-1' }, photo, manager),
      'HANDOVER_EMPTY',
    );
  });

  it('writes nothing when the photo upload fails', async () => {
    const { service, prismaWithTx } = setup({ uploadFails: true });
    await expectDomainError(
      service.create(dto, photo, manager),
      'PHOTO_UPLOAD_FAILED',
    );
    expect(prismaWithTx.$transaction).not.toHaveBeenCalled();
  });

  it('removes the uploaded photo when the transaction fails', async () => {
    const { service, storage } = setup({ txFails: true });
    await expect(service.create(dto, photo, manager)).rejects.toThrow(
      'db exploded',
    );
    expect(storage.removeHandoverPhoto).toHaveBeenCalledWith(
      expect.stringMatching(/^2026-09-A\/bk-1-\d+\.jpg$/),
    );
  });
});

describe('photo validation', () => {
  it('accepts phone/browser image types up to 10 MB', () => {
    expect(() =>
      assertPhoto({ mimetype: 'image/heic', size: 5_000_000 }),
    ).not.toThrow();
  });
  it('rejects non-images and oversized files', () => {
    expect(() =>
      assertPhoto({ mimetype: 'application/pdf', size: 10 }),
    ).toThrow(DomainException);
    expect(() =>
      assertPhoto({ mimetype: 'image/jpeg', size: 11 * 1024 * 1024 }),
    ).toThrow(DomainException);
  });
});

describe('HandoversService visibility + confirmation', () => {
  const existing = {
    id: 'h-1',
    reference: 'HND-2026-09-001',
    actualKg: 2.8,
    looseKg: 0.3,
    photoUrl: null,
    takerConfirmed: false,
    booking: collectable(),
    handedOverBy: { id: 'u-mgr', name: 'Manager' },
  };

  it('the taker can see and confirm their own handover', async () => {
    const { service } = setup({ handover: existing });
    const result = await service.confirm('h-1', jo);
    expect(result.takerConfirmed).toBe(true);
  });

  it("someone else's handover looks like 404", async () => {
    const { service } = setup({ handover: existing });
    await expect(service.getById('h-1', stranger)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
