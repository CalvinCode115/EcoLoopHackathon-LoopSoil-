import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BatchPoolService,
  type BatchPool,
} from '../batches/batch-pool.service';
import { decimalToNumber } from '../common/kg';
import { yearMonthSG } from '../common/reference';
import {
  BatchStatus,
  BookingStatus,
  ClaimStatus,
  Prisma,
  TakerStatus,
  TakerType,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  aggregateAnalytics,
  type AnalyticsReport,
} from './analytics.aggregate';
import type {
  CreateSavedViewDto,
  ImpactQueryDto,
  ReportQueryDto,
} from './dto/reporting-query.dto';
import {
  buildReport,
  type ReportData,
  type ReportInput,
} from './report.builder';
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
const reportBatch = {
  select: {
    id: true,
    reference: true,
    harvestDate: true,
    totalKg: true,
    schoolReserveKg: true,
  },
} as const;

const impactInclude = {
  handedOverBy: { select: { name: true } },
  booking: {
    select: {
      slot: { select: { batch: reportBatch } },
      // The claim/allocation batch is the fallback when the slot is a general one (no batch).
      claim: {
        select: {
          reference: true,
          approvedKg: true,
          batch: reportBatch,
          taker: {
            select: { id: true, name: true, type: true, category: true },
          },
        },
      },
      allocation: {
        select: {
          reference: true,
          allocatedKg: true,
          batch: reportBatch,
          taker: {
            select: { id: true, name: true, type: true, category: true },
          },
        },
      },
    },
  },
} satisfies Prisma.HandoverInclude;

/** Handovers soft-cancelled by the undo (`undoneAt`) never count. */
const LIVE_HANDOVER: Prisma.HandoverWhereInput = { undoneAt: null };

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

export interface ManagerDashboard {
  generatedAt: string;
  /** All-time and current-month (Singapore time) totals — Σ Handover.actualKg only. */
  impact: {
    allTime: ImpactReport['totals'];
    thisMonth: { month: string; kgDiverted: number; handovers: number };
  };
  /** What needs attention now (same payload as GET /reporting/pipeline). */
  pipeline: PipelineReport;
  /** OPEN batches with their live pool, oldest harvest first. */
  openBatches: ({
    id: string;
    reference: string;
    harvestDate: Date;
    availableUntil: Date | null;
  } & BatchPool)[];
  recentHandovers: {
    id: string;
    reference: string;
    handedOverAt: Date;
    actualKg: number;
    takerName: string | null;
    batchReference: string | null;
    hasPhoto: boolean;
  }[];
}

const RECENT_HANDOVERS = 5;

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pools: BatchPoolService,
  ) {}

  /**
   * GET /manager/dashboard — one payload composed from the existing reports, so the
   * figures always agree with /reporting/impact, /reporting/pipeline and batch pools.
   */
  async dashboard(now: Date = new Date()): Promise<ManagerDashboard> {
    const { year, month } = yearMonthSG(now);
    const monthStart = new Date(`${year}-${month}-01T00:00:00+08:00`);

    const openBatchesQuery = this.prisma.batch.findMany({
      where: { status: BatchStatus.OPEN },
      select: {
        id: true,
        reference: true,
        harvestDate: true,
        availableUntil: true,
        totalKg: true,
        schoolReserveKg: true,
      },
      orderBy: { harvestDate: 'asc' },
    });
    const [rows, pipeline, openBatches] = await Promise.all([
      this.loadHandovers({}),
      this.pipeline(now),
      openBatchesQuery,
    ]);
    const pools = await this.pools.forBatches(openBatches);

    const impactRows = rows.map(toImpactRow);
    const monthRows = impactRows.filter((r) => r.handedOverAt >= monthStart);
    const monthTotals = aggregateImpact(monthRows).totals;

    return {
      generatedAt: now.toISOString(),
      impact: {
        allTime: aggregateImpact(impactRows).totals,
        thisMonth: {
          month: `${year}-${month}`,
          kgDiverted: monthTotals.kgDiverted,
          handovers: monthTotals.handovers,
        },
      },
      pipeline,
      openBatches: openBatches.map((b) => ({
        id: b.id,
        reference: b.reference,
        harvestDate: b.harvestDate,
        availableUntil: b.availableUntil,
        ...pools.get(b.id)!,
      })),
      // loadHandovers is newest-first.
      recentHandovers: rows.slice(0, RECENT_HANDOVERS).map((h) => {
        const row = toDiaryRow(h);
        return {
          id: h.id,
          reference: h.reference,
          handedOverAt: h.handedOverAt,
          actualKg: row.actualKg,
          takerName: row.takerName,
          batchReference: row.batchReference,
          hasPhoto: row.hasPhoto,
        };
      }),
    };
  }

  async impact(q: ImpactQueryDto): Promise<ImpactReport> {
    const period = toPeriod(q);
    const rows = await this.loadHandovers(period);
    return aggregateImpact(rows.map(toImpactRow), period);
  }

  async topTakers(q: ImpactQueryDto, limit: number): Promise<TopTaker[]> {
    const rows = await this.loadHandovers(toPeriod(q));
    return topTakers(rows.map(toImpactRow), limit);
  }

  /**
   * KPI cards, sparklines and trends for a period (default: this month to date, SG time),
   * narrowed by the Reports filters (batch, taker type, category) when given.
   */
  async analytics(
    q: ReportQueryDto,
    now = new Date(),
  ): Promise<AnalyticsReport> {
    const period = defaultPeriod(q, now);
    const rows = await this.loadReportRows(q);
    return aggregateAnalytics(
      {
        handovers: rows.handovers.map((h) => ({
          actualKg: h.actualKg,
          handedOverAt: h.handedOverAt,
          takerId: h.takerId,
          group: !h.takerType
            ? 'OTHER'
            : h.takerType === 'INDIVIDUAL'
              ? 'INDIVIDUAL'
              : (h.category ?? 'OTHER'),
        })),
        outcomes: rows.outcomes.map((o) => ({ status: o.status, at: o.at })),
        // totalKg already includes top-ups, so the harvest itself is total − Σ top-ups.
        stockAdded: rows.batches.flatMap((b) => {
          const top = b.topUps.reduce((s, t) => s + t.kg, 0);
          return [{ kg: b.totalKg - top, at: b.harvestDate }, ...b.topUps];
        }),
        completedAt: rows.completedAt,
      },
      period,
    );
  }

  /** Every Reports section for a period + filters (see report.builder.ts). */
  async report(q: ReportQueryDto, now = new Date()): Promise<ReportData> {
    const rows = await this.loadReportRows(q);
    return buildReport(rows, defaultPeriod(q, now));
  }

  /**
   * All the rows the Reports + analytics need, already narrowed by the filters. Loaded in
   * full (pilot scale — tens to hundreds of rows); a SQL rollup is the scale-up step.
   */
  private async loadReportRows(
    q: ReportQueryDto,
  ): Promise<ReportInput & { completedAt: Date[] }> {
    const takerSel = {
      select: { id: true, name: true, type: true, category: true },
    } as const;
    const batchSel = { select: { id: true } } as const;
    const [handovers, claims, slots, outcomes, batches, takers] =
      await Promise.all([
        this.prisma.handover.findMany({
          where: LIVE_HANDOVER,
          select: {
            actualKg: true,
            handedOverAt: true,
            booking: {
              select: {
                slot: { select: { batch: batchSel } },
                claim: { select: { taker: takerSel, batch: batchSel } },
                allocation: { select: { taker: takerSel, batch: batchSel } },
              },
            },
          },
        }),
        this.prisma.claim.findMany({
          select: {
            batchId: true,
            requestedKg: true,
            approvedKg: true,
            status: true,
            rejectionReason: true,
            cancellationReason: true,
            submittedAt: true,
            decidedAt: true,
            taker: { select: { type: true, category: true } },
            booking: { select: { status: true } },
          },
        }),
        this.prisma.pickupSlot.findMany({
          where: q.batchId ? { batchId: q.batchId } : {},
          select: {
            startTime: true,
            capacity: true,
            status: true,
            _count: {
              select: {
                bookings: {
                  where: {
                    status: {
                      in: [BookingStatus.BOOKED, BookingStatus.COLLECTED],
                    },
                  },
                },
              },
            },
          },
        }),
        this.prisma.booking.findMany({
          where: {
            status: { in: [BookingStatus.COLLECTED, BookingStatus.NO_SHOW] },
          },
          select: {
            status: true,
            slot: { select: { startTime: true, batchId: true } },
            claim: {
              select: { approvedKg: true, batchId: true, taker: takerSel },
            },
            allocation: {
              select: { allocatedKg: true, batchId: true, taker: takerSel },
            },
          },
        }),
        this.prisma.batch.findMany({
          where: q.batchId ? { id: q.batchId } : {},
          include: { topUps: { select: { kg: true, createdAt: true } } },
        }),
        this.prisma.taker.findMany({
          select: {
            id: true,
            name: true,
            type: true,
            category: true,
            createdAt: true,
            monthlyKgTarget: true,
          },
        }),
      ]);

    const anyTakerFilter = !!(q.takerType || q.category);
    const takerOk = (
      t: { type: TakerType; category: string | null } | null | undefined,
    ) =>
      !anyTakerFilter ||
      (!!t &&
        (!q.takerType || t.type === q.takerType) &&
        (!q.category || t.category === q.category));
    const pools = await this.pools.forBatches(batches);

    const handoverRows: ReportInput['handovers'] = [];
    for (const h of handovers) {
      const src = h.booking?.claim ?? h.booking?.allocation ?? null;
      const t = src?.taker ?? null;
      const rowBatch = h.booking?.slot.batch?.id ?? src?.batch.id ?? null;
      if (q.batchId && rowBatch !== q.batchId) continue;
      if (!takerOk(t)) continue;
      handoverRows.push({
        actualKg: decimalToNumber(h.actualKg),
        handedOverAt: h.handedOverAt,
        takerId: t?.id ?? null,
        takerName: t?.name ?? null,
        takerType: t?.type ?? null,
        category: t?.category ?? null,
        batchId: rowBatch,
        source: h.booking?.claim
          ? 'CLAIM'
          : h.booking?.allocation
            ? 'ALLOCATION'
            : null,
      });
    }

    const outcomeRows: ReportInput['outcomes'] = [];
    for (const b of outcomes) {
      const src = b.claim ?? b.allocation;
      const rowBatch = b.slot.batchId ?? src?.batchId ?? null;
      if (q.batchId && rowBatch !== q.batchId) continue;
      if (!takerOk(src?.taker)) continue;
      outcomeRows.push({
        status: b.status as 'COLLECTED' | 'NO_SHOW',
        at: b.slot.startTime,
        kg: b.claim
          ? decimalToNumber(b.claim.approvedKg ?? 0)
          : decimalToNumber(b.allocation?.allocatedKg ?? 0),
        takerId: src?.taker.id ?? null,
      });
    }

    return {
      handovers: handoverRows,
      claims: claims
        .filter(
          (c) => (!q.batchId || c.batchId === q.batchId) && takerOk(c.taker),
        )
        .map((c) => ({
          batchId: c.batchId,
          requestedKg: decimalToNumber(c.requestedKg),
          approvedKg:
            c.approvedKg == null ? null : decimalToNumber(c.approvedKg),
          status: c.status,
          rejectionReason: c.rejectionReason,
          cancellationReason: c.cancellationReason,
          submittedAt: c.submittedAt,
          decidedAt: c.decidedAt,
          bookingStatus: c.booking?.status ?? null,
        })),
      slots: slots.map((s) => ({
        startTime: s.startTime,
        capacity: s.capacity,
        status: s.status,
        bookedCount: s._count.bookings,
      })),
      outcomes: outcomeRows,
      batches: batches.map((b) => ({
        id: b.id,
        reference: b.reference,
        harvestDate: b.harvestDate,
        status: b.status,
        totalKg: decimalToNumber(b.totalKg),
        topUps: b.topUps.map((t) => ({
          kg: decimalToNumber(t.kg),
          at: t.createdAt,
        })),
        schoolReserveKg: decimalToNumber(b.schoolReserveKg),
        kgRemaining: pools.get(b.id)?.kgRemaining ?? 0,
        availableFrom: b.availableFrom,
      })),
      takers: takers.filter((t) => takerOk(t)),
      // No completedAt column: a COMPLETED batch's last update is when it was completed.
      completedAt: batches
        .filter((b) => b.status === BatchStatus.COMPLETED)
        .map((b) => b.updatedAt),
    };
  }

  // ─── Saved views (each manager sees only their own) ───────────────────────

  listViews(user: User) {
    return this.prisma.savedReportView.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, filters: true, createdAt: true },
    });
  }

  saveView(user: User, dto: CreateSavedViewDto) {
    return this.prisma.savedReportView.create({
      data: {
        name: dto.name.trim(),
        filters: dto.filters as Prisma.InputJsonValue,
        userId: user.id,
      },
      select: { id: true, name: true, filters: true, createdAt: true },
    });
  }

  async deleteView(user: User, id: string): Promise<void> {
    const { count } = await this.prisma.savedReportView.deleteMany({
      where: { id, userId: user.id },
    });
    if (!count) throw new NotFoundException('Saved view not found');
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
      this.prisma.handover.count({
        where: { ...LIVE_HANDOVER, photoUrl: null },
      }),
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
      where: {
        ...LIVE_HANDOVER,
        ...(period.from || period.to
          ? { handedOverAt: { gte: period.from, lte: period.to } }
          : {}),
      },
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

/** Slot's batch, else the claim/allocation's (general-availability slots have none). */
function batchOf(h: HandoverForReport) {
  return (
    h.booking?.slot.batch ??
    h.booking?.claim?.batch ??
    h.booking?.allocation?.batch ??
    null
  );
}

/** Decimal -> number happens here, so impact.aggregate stays plain-number and pure. */
function toImpactRow(h: HandoverForReport): ImpactRow {
  const taker = h.booking?.claim?.taker ?? h.booking?.allocation?.taker ?? null;
  const batch = batchOf(h);
  return {
    actualKg: decimalToNumber(h.actualKg),
    handedOverAt: h.handedOverAt,
    photoUrl: h.photoUrl,
    takerConfirmed: h.takerConfirmed,
    batch: batch
      ? {
          id: batch.id,
          reference: batch.reference,
          harvestDate: batch.harvestDate,
          totalKg: decimalToNumber(batch.totalKg),
          schoolReserveKg: decimalToNumber(batch.schoolReserveKg),
        }
      : null,
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
    batchReference: batchOf(h)?.reference ?? null,
    source: claim ? 'CLAIM' : allocation ? 'ALLOCATION' : null,
    sourceReference: claim?.reference ?? allocation?.reference ?? null,
    takerName: taker?.name ?? null,
    takerType: taker?.type ?? null,
    takerCategory: taker?.category ?? null,
    expectedKg: claim?.approvedKg
      ? decimalToNumber(claim.approvedKg)
      : allocation
        ? decimalToNumber(allocation.allocatedKg)
        : null,
    actualKg: decimalToNumber(h.actualKg),
    hasPhoto: h.photoUrl !== null,
    takerConfirmed: h.takerConfirmed,
    handedOverBy: h.handedOverBy.name,
    note: h.note,
  };
}

/** Reports / analytics default: this month to date (Singapore). */
function defaultPeriod(q: ImpactQueryDto, now: Date): { from: Date; to: Date } {
  const { year, month } = yearMonthSG(now);
  return {
    from: q.from
      ? new Date(q.from)
      : new Date(`${year}-${month}-01T00:00:00+08:00`),
    to: q.to ? new Date(q.to) : now,
  };
}
