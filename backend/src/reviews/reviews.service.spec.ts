import { NotFoundException } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import {
  GrowingPlan,
  PickupEase,
  Prisma,
  UserRole,
  type User,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ReviewsService, summariseReviews } from './reviews.service';

const jo = { id: 'u-jo', role: UserRole.TAKER } as User;
const stranger = { id: 'u-x', role: UserRole.TAKER } as User;

const claim = {
  id: 'c-1',
  reference: 'CLM-0198',
  status: 'COLLECTED',
  takerId: 't-jo',
  taker: { userId: 'u-jo' },
};
const handover = { id: 'h-1', actualKg: 0.3, handedOverAt: new Date() };
const dto = {
  claimId: 'c-1',
  compostRating: 4,
  pickupEase: PickupEase.SMOOTH,
  growing: [GrowingPlan.HERBS],
};

function setup(opts: { handover?: unknown; createError?: unknown } = {}) {
  const prisma = {
    claim: { findUnique: jest.fn().mockResolvedValue(claim) },
    handover: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.handover === undefined ? handover : opts.handover,
        ),
    },
    pickupReview: {
      create: opts.createError
        ? jest.fn().mockRejectedValue(opts.createError)
        : jest.fn().mockResolvedValue({
            id: 'r-1',
            ...dto,
            note: null,
            createdAt: new Date(),
            taker: { id: 't-jo', name: 'Jo' },
            handover: { ...handover, reference: 'HND-1', booking: null },
          }),
    },
  };
  const service = new ReviewsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('ReviewsService', () => {
  it('tallies ratings, ease and growing plans', () => {
    const s = summariseReviews([
      {
        compostRating: 5,
        pickupEase: PickupEase.SMOOTH,
        growing: [GrowingPlan.HERBS, GrowingPlan.FLOWERS],
        note: 'Lovely',
      },
      {
        compostRating: 4,
        pickupEase: PickupEase.HARD_TO_FIND,
        growing: [GrowingPlan.HERBS],
        note: '  ',
      },
      { compostRating: 2, pickupEase: null, growing: [], note: null },
    ]);
    expect(s.count).toBe(3);
    expect(s.averageRating).toBe(3.7);
    expect(s.ratingCounts).toEqual([0, 1, 0, 1, 1]);
    expect(s.pickupEase).toEqual({ SMOOTH: 1, CONFUSING: 0, HARD_TO_FIND: 1 });
    expect(s.growing.HERBS).toBe(2);
    expect(s.withNote).toBe(1);
    expect(summariseReviews([]).averageRating).toBeNull();
  });

  it("hides another taker's claim as 404", async () => {
    const { service } = setup();
    await expect(service.create(dto, stranger)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a claim that has not been collected yet', async () => {
    const { service, prisma } = setup({ handover: null });
    await expect(service.create(dto, jo)).rejects.toMatchObject({
      code: 'NOT_COLLECTED',
    });
    expect(prisma.pickupReview.create).not.toHaveBeenCalled();
  });

  it('saves the review against the live handover', async () => {
    const { service, prisma } = setup();
    const r = await service.create({ ...dto, note: '  ' } as never, jo);
    expect(prisma.pickupReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          handoverId: 'h-1',
          takerId: 't-jo',
          compostRating: 4,
          note: null,
        }),
      }),
    );
    expect(r.handover.actualKg).toBe(0.3);
  });

  it('turns a second review into REVIEW_EXISTS', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service } = setup({ createError: dup });
    const err = await service.create(dto, jo).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainException);
    expect(err).toMatchObject({ code: 'REVIEW_EXISTS' });
  });
});
