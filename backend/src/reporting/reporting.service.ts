import { Injectable } from '@nestjs/common';
import {
  BatchStatus,
  BookingStatus,
  ClaimStatus,
  Prisma,
  TakerStatus,
  TakerType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ImpactQueryDto } from './dto/reporting-query.dto';
import {
  aggregateImpact,
  topTakers,
  wasteDiaryCsv,
  type DiaryRow,
  type ImpactReport,
  type ImpactRow,
  type TopTaker,
} from './impact.aggregate';

/**
 * Everything here is sourced from Handover.actualKg — never from requested / approved /
 * allocated kg (CLAUDE.md §13). Rows are aggregated in memory: fine at pilot scale
 * (tens to hundreds of handovers); a SQL-side rollup is the documented scale-up step.
 */
const impactInclude = {
  handedOverBy: { select: { name: true } },
  booking: {
    select: {
      slot: {
        select: {
          batch: {
            select: {
              id: true,
              reference: true,
              harvestDate: true,
              totalKg: true,
              schoolReserveKg: true,
            },
          },
        },
      },
      claim: {
        select: {
          reference: true,
          approvedKg: true,
          taker: {
            select: { id: true, name: true, type: true, category: true },
          },
        },
      },
      allocation: {
        select: {
          reference: true,
          allocatedKg: true,
          taker: {
            select: { id: true, name: true, type: true, category: true },
          },
        },
      },
    },
  },
} satisfies Prisma.HandoverInclude;

type HandoverForReport = Prisma.HandoverGetPayload<{
  include: typeof impactInclude;
}>;

export interface PipelineReport {
  batches: { draft: number; open: number; closed: number };
  takers: { pendingVetting: number };
  claims: { pending: number; approvedUnbooked: number; approvedBooked: number };
  bookings: { upcoming: number; overdue: number };
  handovers: { missingPhoto: number };
}

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async impact(q: ImpactQueryDto): Promise<ImpactReport> {
    const period = toPeriod(q);
    const rows = await this.loadHandovers(period);
    return aggregateImpact(rows.map(toImpactRow), period);
  }

  async topTakers(q: ImpactQueryDto, limit: number): Promise<TopTaker[]> {
    const rows = await this.loadHandovers(toPeriod(q));
    return topTakers(rows.map(toImpactRow), limit);
  }

  /** One row per handover — the Waste Diary evidence the hackathon asks for. */
  async wasteDiaryCsv(q: ImpactQueryDto): Promise<string> {
    const rows = await this.loadHandovers(toPeriod(q), 'asc');
    return wasteDiaryCsv(rows.map(toDiaryRow));
  }

  /** What needs the manager's attention right now. */
  async pipeline(now: Date = new Date()): Promise<PipelineReport> {
    const [
      draft,
      open,
      closed,
      pendingVetting,
      pendingClaims,
      approvedUnbooked,
      approvedBooked,
      upcoming,
      overdue,
      missingPhoto,
    ] = await Promise.all([
      this.prisma.batch.count({ where: { status: BatchStatus.DRAFT } }),
      this.prisma.batch.count({ where: { status: BatchStatus.OPEN } }),
      this.prisma.batch.count({ where: { status: BatchStatus.CLOSED } }),
      this.prisma.taker.count({
        where: { type: TakerType.INDIVIDUAL, status: TakerStatus.PENDING },
      }),
      this.prisma.claim.count({ where: { status: ClaimStatus.PENDING } }),
      this.prisma.claim.count({
        where: {
          status: ClaimStatus.APPROVED,
          OR: [
            { booking: null },
            { booking: { status: { not: BookingStatus.BOOKED } } },
          ],
        },
      }),
      this.prisma.claim.count({
        where: {
          status: ClaimStatus.APPROVED,
          booking: { status: BookingStatus.BOOKED },
        },
      }),
      this.prisma.booking.count({
        where: {
          status: BookingStatus.BOOKED,
          slot: { endTime: { gte: now } },
        },
      }),
      this.prisma.booking.count({
        where: {
          status: BookingStatus.BOOKED,
          collectionDeadline: { lt: now },
        },
      }),
      this.prisma.handover.count({ where: { photoUrl: null } }),
    ]);
    return {
      batches: { draft, open, closed },
      takers: { pendingVetting },
      claims: {
        pending: pendingClaims,
        approvedUnbooked,
        approvedBooked,
      },
      bookings: { upcoming, overdue },
      handovers: { missingPhoto },
    };
  }

  private loadHandovers(
    period: { from?: Date; to?: Date },
    order: 'asc' | 'desc' = 'desc',
  ): Promise<HandoverForReport[]> {
    return this.prisma.handover.findMany({
      where:
        period.from || period.to
          ? { handedOverAt: { gte: period.from, lte: period.to } }
          : {},
      include: impactInclude,
      orderBy: { handedOverAt: order },
    });
  }
}

function toPeriod(q: ImpactQueryDto): { from?: Date; to?: Date } {
  return {
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
  };
}

function toImpactRow(h: HandoverForReport): ImpactRow {
  const taker = h.booking?.claim?.taker ?? h.booking?.allocation?.taker ?? null;
  return {
    actualKg: h.actualKg,
    handedOverAt: h.handedOverAt,
    photoUrl: h.photoUrl,
    takerConfirmed: h.takerConfirmed,
    batch: h.booking?.slot.batch ?? null,
    taker,
  };
}

function toDiaryRow(h: HandoverForReport): DiaryRow {
  const claim = h.booking?.claim ?? null;
  const allocation = h.booking?.allocation ?? null;
  const taker = claim?.taker ?? allocation?.taker ?? null;
  return {
    reference: h.reference,
    handedOverAt: h.handedOverAt,
    batchReference: h.booking?.slot.batch.reference ?? null,
    source: claim ? 'CLAIM' : allocation ? 'ALLOCATION' : null,
    sourceReference: claim?.reference ?? allocation?.reference ?? null,
    takerName: taker?.name ?? null,
    takerType: taker?.type ?? null,
    takerCategory: taker?.category ?? null,
    expectedKg: claim
      ? claim.approvedKg
      : allocation
        ? allocation.allocatedKg
        : null,
    actualKg: h.actualKg,
    hasPhoto: h.photoUrl !== null,
    takerConfirmed: h.takerConfirmed,
    handedOverBy: h.handedOverBy.name,
    note: h.note,
  };
}
