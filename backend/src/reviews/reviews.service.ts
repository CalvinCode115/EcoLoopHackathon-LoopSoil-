import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import { decimalToNumber } from '../common/kg';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import {
  GrowingPlan,
  PickupEase,
  Prisma,
  UserRole,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReviewDto, ReviewFilterDto } from './dto/review.dto';

const reviewInclude = {
  taker: { select: { id: true, name: true } },
  handover: {
    select: {
      id: true,
      reference: true,
      actualKg: true,
      handedOverAt: true,
      booking: {
        select: {
          claim: {
            select: {
              id: true,
              reference: true,
              batch: { select: { id: true, reference: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PickupReviewInclude;

type ReviewRow = Prisma.PickupReviewGetPayload<{
  include: typeof reviewInclude;
}>;

export interface ReviewDetail {
  id: string;
  compostRating: number;
  pickupEase: PickupEase | null;
  growing: GrowingPlan[];
  note: string | null;
  createdAt: Date;
  taker: { id: string; name: string };
  handover: {
    id: string;
    reference: string;
    actualKg: number;
    handedOverAt: Date;
  };
  claim: { id: string; reference: string } | null;
  batch: { id: string; reference: string } | null;
}

/** Everything the "Rate your pickup" page needs for one claim. */
export interface ReviewContext {
  claim: { id: string; reference: string; status: string };
  /** The live handover — null until the compost has been collected. */
  handover: { id: string; actualKg: number; handedOverAt: Date } | null;
  /** True when collected and not yet reviewed — show the form. */
  canReview: boolean;
  /** The taker's existing review, if already sent. */
  review: ReviewDetail | null;
}

export interface ReviewSummary {
  count: number;
  /** Mean compost rating, 1 dp; null with no reviews. */
  averageRating: number | null;
  /** Reviews per star, index 0 = 1 star … index 4 = 5 stars. */
  ratingCounts: number[];
  pickupEase: Record<PickupEase, number>;
  growing: Record<GrowingPlan, number>;
  withNote: number;
}

type SummaryInput = Pick<
  ReviewRow,
  'compostRating' | 'pickupEase' | 'growing' | 'note'
>;

/** Pure tally behind GET /reviews/summary. */
export function summariseReviews(rows: SummaryInput[]): ReviewSummary {
  const zero = <K extends string>(keys: Record<string, K>) =>
    Object.fromEntries(Object.values(keys).map((k) => [k, 0])) as Record<
      K,
      number
    >;
  const s: ReviewSummary = {
    count: rows.length,
    averageRating: null,
    ratingCounts: [0, 0, 0, 0, 0],
    pickupEase: zero(PickupEase),
    growing: zero(GrowingPlan),
    withNote: 0,
  };
  let total = 0;
  for (const r of rows) {
    total += r.compostRating;
    s.ratingCounts[r.compostRating - 1] += 1;
    if (r.pickupEase) s.pickupEase[r.pickupEase] += 1;
    for (const g of r.growing) s.growing[g] += 1;
    if (r.note?.trim()) s.withNote += 1;
  }
  if (rows.length)
    s.averageRating = Math.round((total / rows.length) * 10) / 10;
  return s;
}

/**
 * The taker's "Rate your pickup" survey. A review hangs off the Handover (what actually
 * happened, with the real kg), but takers only know their claims, so the taker-facing
 * calls take a claimId and resolve its live handover. One review per handover.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /reviews/claim/:claimId — the page header plus whether to show the form. */
  async forClaim(claimId: string, user: User): Promise<ReviewContext> {
    const claim = await this.ownClaim(claimId, user);
    const handover = await this.liveHandover(claimId);
    const review = handover
      ? await this.prisma.pickupReview.findUnique({
          where: { handoverId: handover.id },
          include: reviewInclude,
        })
      : null;
    return {
      claim: { id: claim.id, reference: claim.reference, status: claim.status },
      handover: handover && {
        id: handover.id,
        actualKg: decimalToNumber(handover.actualKg),
        handedOverAt: handover.handedOverAt,
      },
      canReview: !!handover && !review && user.role === UserRole.TAKER,
      review: review && present(review),
    };
  }

  /** POST /reviews — the taker sends the survey for their own collected claim. */
  async create(dto: CreateReviewDto, user: User): Promise<ReviewDetail> {
    const claim = await this.ownClaim(dto.claimId, user);
    const handover = await this.liveHandover(claim.id);
    if (!handover) {
      throw new DomainException(
        'NOT_COLLECTED',
        'You can rate this pickup once the compost has been collected',
        HttpStatus.CONFLICT,
      );
    }
    try {
      const row = await this.prisma.pickupReview.create({
        data: {
          handoverId: handover.id,
          takerId: claim.takerId,
          compostRating: dto.compostRating,
          pickupEase: dto.pickupEase ?? null,
          growing: dto.growing ?? [],
          note: dto.note?.trim() || null,
        },
        include: reviewInclude,
      });
      return present(row);
    } catch (e) {
      // Unique handoverId: already reviewed (or a double-tap raced the first send).
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new DomainException(
          'REVIEW_EXISTS',
          'You have already rated this pickup',
          HttpStatus.CONFLICT,
        );
      }
      throw e;
    }
  }

  /** GET /reviews — manager: all, filterable. Taker: their own. Newest first. */
  async list(q: ReviewFilterDto, user: User): Promise<Paginated<ReviewDetail>> {
    const where = this.where(q, user);
    const [total, rows] = await Promise.all([
      this.prisma.pickupReview.count({ where }),
      this.prisma.pickupReview.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
      }),
    ]);
    return paginated(rows.map(present), total, q);
  }

  /** GET /reviews/summary — manager: tallies over the same filters as the list. */
  async summary(q: ReviewFilterDto, user: User): Promise<ReviewSummary> {
    const rows = await this.prisma.pickupReview.findMany({
      where: this.where(q, user),
      select: {
        compostRating: true,
        pickupEase: true,
        growing: true,
        note: true,
      },
    });
    return summariseReviews(rows);
  }

  private where(q: ReviewFilterDto, user: User): Prisma.PickupReviewWhereInput {
    return {
      handover: {
        undoneAt: null,
        ...(q.batchId ? { booking: { claim: { batchId: q.batchId } } } : {}),
      },
      ...(user.role === UserRole.TAKER
        ? { taker: { userId: user.id } }
        : q.takerId
          ? { takerId: q.takerId }
          : {}),
      ...(q.rating ? { compostRating: q.rating } : {}),
      ...(q.withNote ? { note: { not: null } } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              gte: q.from ? new Date(q.from) : undefined,
              lte: q.to ? new Date(q.to) : undefined,
            },
          }
        : {}),
    };
  }

  /** The claim, if this user may see it (manager: any; taker: own). 404 otherwise. */
  private async ownClaim(claimId: string, user: User) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        reference: true,
        status: true,
        takerId: true,
        taker: { select: { userId: true } },
      },
    });
    if (
      !claim ||
      (user.role !== UserRole.MANAGER && claim.taker.userId !== user.id)
    ) {
      throw new NotFoundException('Claim not found');
    }
    return claim;
  }

  /** The handover that actually happened for this claim (an undone one unlinks its booking). */
  private liveHandover(claimId: string) {
    return this.prisma.handover.findFirst({
      where: { undoneAt: null, booking: { claimId } },
      select: { id: true, actualKg: true, handedOverAt: true },
    });
  }
}

function present(r: ReviewRow): ReviewDetail {
  const claim = r.handover.booking?.claim ?? null;
  return {
    id: r.id,
    compostRating: r.compostRating,
    pickupEase: r.pickupEase,
    growing: r.growing,
    note: r.note,
    createdAt: r.createdAt,
    taker: r.taker,
    handover: {
      id: r.handover.id,
      reference: r.handover.reference,
      actualKg: decimalToNumber(r.handover.actualKg),
      handedOverAt: r.handover.handedOverAt,
    },
    claim: claim && { id: claim.id, reference: claim.reference },
    batch: claim?.batch ?? null,
  };
}
