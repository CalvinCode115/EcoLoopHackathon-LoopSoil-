import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import { decimalToNumber } from '../common/kg';
import { yearMonthSG } from '../common/reference';
import {
  AllocationStatus,
  BookingStatus,
  CancellationReason,
  ClaimStatus,
  Prisma,
  TakerStatus,
  TakerType,
  type Taker,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBulkTakerDto } from './dto/create-bulk-taker.dto';
import type { ListTakersQueryDto } from './dto/list-takers-query.dto';
import type { RegisterTakerDto } from './dto/register-taker.dto';
import type {
  ApproveTakerDto,
  DeclineTakerDto,
  ReinstateTakerDto,
  SuspendTakerDto,
} from './dto/taker-status-action.dto';
import type { UpdateTakerDto } from './dto/update-taker.dto';

/**
 * CLAUDE.md / Backend-Updates.md §E. REJECTED is not a dead end — a manager can
 * reconsider and approve a previously-declined applicant, the same way `/approve`
 * also covers first-time vetting from PENDING.
 */
/** Per-taker figures for the manager's Takers screen (list columns + drawer). */
export interface TakerStats {
  /** Σ Handover.actualKg to this taker (live handovers only). */
  collectedKg: number;
  claims: number;
  allocations: number;
  noShows: number;
  /** Latest claim, allocation or handover — null if they've done nothing yet. */
  lastActiveAt: Date | null;
  /** Bulk: kg allocated (not cancelled) and collected this calendar month (SG). */
  monthAllocatedKg: number;
  monthCollectedKg: number;
}

export type TakerWithStats = Taker & {
  stats: TakerStats;
  statusChangedBy: { id: string; name: string } | null;
};

export const TAKER_STATUS_TRANSITIONS: Record<
  TakerStatus,
  readonly TakerStatus[]
> = {
  PENDING: [TakerStatus.APPROVED, TakerStatus.REJECTED],
  APPROVED: [TakerStatus.SUSPENDED],
  REJECTED: [TakerStatus.APPROVED],
  SUSPENDED: [TakerStatus.APPROVED],
};

@Injectable()
export class TakersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── bulk records (manager) ──────────────────────────────────────────────

  /** Bulk orgs are vetted by the act of the manager creating them → APPROVED immediately. */
  createBulk(dto: CreateBulkTakerDto, manager: User): Promise<Taker> {
    return this.prisma.taker.create({
      data: {
        name: dto.name,
        category: dto.category,
        email: dto.email,
        phone: dto.phone,
        intendedUse: dto.intendedUse,
        monthlyKgTarget: dto.monthlyKgTarget,
        type: TakerType.BULK,
        status: TakerStatus.APPROVED,
        createdById: manager.id,
      },
    });
  }

  /** `status=PENDING&type=INDIVIDUAL` is the manager's vetting queue. Rows carry `stats`. */
  async list(q: ListTakersQueryDto): Promise<Paginated<TakerWithStats>> {
    const where: Prisma.TakerWhereInput = {
      type: q.type,
      status: q.status,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: q.search.replace(/\s/g, '') } },
            ],
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.taker.count({ where }),
      this.prisma.taker.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { statusChangedBy: { select: { id: true, name: true } } },
        ...pageArgs(q),
      }),
    ]);
    return paginated(await this.withStats(data), total, q);
  }

  /** GET /takers/:id — the taker plus their stats (the manager's drawer). */
  async getDetail(id: string): Promise<TakerWithStats> {
    const taker = await this.prisma.taker.findUnique({
      where: { id },
      include: { statusChangedBy: { select: { id: true, name: true } } },
    });
    if (!taker) throw new NotFoundException('Taker not found');
    return (await this.withStats([taker]))[0];
  }

  /** Batched stats for a page of takers — a handful of grouped queries, no N+1. */
  private async withStats<
    T extends Taker & { statusChangedBy: { id: string; name: string } | null },
  >(takers: T[], now = new Date()): Promise<(T & { stats: TakerStats })[]> {
    const ids = takers.map((t) => t.id);
    if (!ids.length) return [];
    const { year, month } = yearMonthSG(now);
    const monthStart = new Date(`${year}-${month}-01T00:00:00+08:00`);
    const [claims, allocations, noShows, handovers] = await Promise.all([
      this.prisma.claim.groupBy({
        by: ['takerId'],
        where: { takerId: { in: ids } },
        _count: { _all: true },
        _max: { submittedAt: true },
      }),
      this.prisma.allocation.findMany({
        where: { takerId: { in: ids } },
        select: {
          takerId: true,
          allocatedKg: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.booking.findMany({
        where: {
          status: BookingStatus.NO_SHOW,
          OR: [
            { claim: { takerId: { in: ids } } },
            { allocation: { takerId: { in: ids } } },
          ],
        },
        select: {
          claim: { select: { takerId: true } },
          allocation: { select: { takerId: true } },
        },
      }),
      this.prisma.handover.findMany({
        where: {
          undoneAt: null,
          booking: {
            OR: [
              { claim: { takerId: { in: ids } } },
              { allocation: { takerId: { in: ids } } },
            ],
          },
        },
        select: {
          actualKg: true,
          handedOverAt: true,
          booking: {
            select: {
              claim: { select: { takerId: true } },
              allocation: { select: { takerId: true } },
            },
          },
        },
      }),
    ]);

    return takers.map((t) => {
      const c = claims.find((x) => x.takerId === t.id);
      const allocs = allocations.filter((a) => a.takerId === t.id);
      const hs = handovers.filter(
        (h) =>
          (h.booking?.claim?.takerId ?? h.booking?.allocation?.takerId) ===
          t.id,
      );
      const dates = [
        c?._max.submittedAt,
        ...allocs.map((a) => a.createdAt),
        ...hs.map((h) => h.handedOverAt),
      ].filter((d): d is Date => !!d);
      const round = (n: number) => Math.round(n * 1000) / 1000;
      return {
        ...t,
        stats: {
          collectedKg: round(
            hs.reduce((s, h) => s + decimalToNumber(h.actualKg), 0),
          ),
          claims: c?._count._all ?? 0,
          allocations: allocs.length,
          noShows: noShows.filter(
            (b) => (b.claim?.takerId ?? b.allocation?.takerId) === t.id,
          ).length,
          lastActiveAt: dates.length
            ? new Date(Math.max(...dates.map((d) => d.getTime())))
            : null,
          monthAllocatedKg: round(
            allocs
              .filter(
                (a) =>
                  a.status !== AllocationStatus.CANCELLED &&
                  a.createdAt >= monthStart,
              )
              .reduce((s, a) => s + decimalToNumber(a.allocatedKg), 0),
          ),
          monthCollectedKg: round(
            hs
              .filter((h) => h.handedOverAt >= monthStart)
              .reduce((s, h) => s + decimalToNumber(h.actualKg), 0),
          ),
        },
      };
    });
  }

  async getById(id: string): Promise<Taker> {
    const taker = await this.prisma.taker.findUnique({ where: { id } });
    if (!taker) throw new NotFoundException('Taker not found');
    return taker;
  }

  /** Profile fields only — see UpdateTakerDto for why `status` isn't here. */
  async update(id: string, dto: UpdateTakerDto): Promise<Taker> {
    await this.getById(id);
    return this.prisma.taker.update({ where: { id }, data: dto });
  }

  // ─── vetting: discrete, audited status actions (Backend-Updates.md §C2, §E) ──

  /** PENDING → APPROVED (first vetting), or REJECTED → APPROVED (manager reconsiders). */
  approve(id: string, dto: ApproveTakerDto, manager: User): Promise<Taker> {
    return this.changeStatus(
      id,
      TakerStatus.APPROVED,
      dto.statusReason,
      manager,
    );
  }

  /** PENDING → REJECTED. Cancels any active claims/allocations — see requireApprovedIndividual. */
  decline(id: string, dto: DeclineTakerDto, manager: User): Promise<Taker> {
    return this.changeStatus(
      id,
      TakerStatus.REJECTED,
      dto.statusReason,
      manager,
      {
        cascade: true,
      },
    );
  }

  /**
   * APPROVED → SUSPENDED. "Suspending (or rejecting) a taker cancels their active claims
   * and bookings and frees the kg back to the pool" (§E) — extended here to allocations
   * too, since that's how BULK takers hold kg; the same reasoning applies symmetrically.
   */
  suspend(id: string, dto: SuspendTakerDto, manager: User): Promise<Taker> {
    return this.changeStatus(
      id,
      TakerStatus.SUSPENDED,
      dto.statusReason,
      manager,
      {
        cascade: true,
      },
    );
  }

  /** SUSPENDED → APPROVED. No cascade — reinstating unlocks them, cancels nothing. */
  reinstate(id: string, dto: ReinstateTakerDto, manager: User): Promise<Taker> {
    return this.changeStatus(
      id,
      TakerStatus.APPROVED,
      dto.statusReason,
      manager,
    );
  }

  private changeStatus(
    id: string,
    to: TakerStatus,
    statusReason: string | undefined,
    manager: User,
    opts: { cascade?: boolean } = {},
  ): Promise<Taker> {
    return this.prisma.$transaction(async (tx) => {
      const taker = await tx.taker.findUnique({ where: { id } });
      if (!taker) throw new NotFoundException('Taker not found');
      assertTransition('Taker', TAKER_STATUS_TRANSITIONS, taker.status, to);

      if (opts.cascade) {
        const note = `Taker ${to === TakerStatus.SUSPENDED ? 'suspended' : 'declined'}${statusReason ? ` — ${statusReason}` : ''}`;
        await this.cascadeCancelActive(tx, id, note);
      }

      return tx.taker.update({
        where: { id },
        data: {
          status: to,
          statusReason: statusReason ?? null,
          statusChangedAt: new Date(),
          statusChangedById: manager.id,
        },
      });
    });
  }

  /**
   * Cancel every active claim (PENDING/APPROVED) and allocation (PLANNED/CONFIRMED) for
   * this taker, plus any BOOKED pickup tied to them, so the kg frees back to the pool.
   */
  private async cascadeCancelActive(
    tx: Prisma.TransactionClient,
    takerId: string,
    note: string,
  ): Promise<void> {
    const [activeClaims, activeAllocations] = await Promise.all([
      tx.claim.findMany({
        where: {
          takerId,
          status: { in: [ClaimStatus.PENDING, ClaimStatus.APPROVED] },
        },
        select: { id: true },
      }),
      tx.allocation.findMany({
        where: {
          takerId,
          status: {
            in: [AllocationStatus.PLANNED, AllocationStatus.CONFIRMED],
          },
        },
        select: { id: true },
      }),
    ]);
    const claimIds = activeClaims.map((c) => c.id);
    const allocationIds = activeAllocations.map((a) => a.id);

    if (claimIds.length > 0) {
      await tx.booking.updateMany({
        where: { claimId: { in: claimIds }, status: BookingStatus.BOOKED },
        data: { status: BookingStatus.CANCELLED, cancelNote: note },
      });
      await tx.claim.updateMany({
        where: { id: { in: claimIds } },
        data: {
          status: ClaimStatus.CANCELLED,
          cancellationReason: CancellationReason.OTHER,
          reasonNote: note,
          cancelledAt: new Date(),
        },
      });
    }
    if (allocationIds.length > 0) {
      await tx.booking.updateMany({
        where: {
          allocationId: { in: allocationIds },
          status: BookingStatus.BOOKED,
        },
        data: { status: BookingStatus.CANCELLED, cancelNote: note },
      });
      await tx.allocation.updateMany({
        where: { id: { in: allocationIds } },
        data: { status: AllocationStatus.CANCELLED, note },
      });
    }
  }

  // ─── individuals (self-service) ──────────────────────────────────────────

  findByUserId(userId: string): Promise<Taker | null> {
    return this.prisma.taker.findUnique({ where: { userId } });
  }

  /** One Taker per login. Lands PENDING until a manager approves (§20 default). */
  async register(dto: RegisterTakerDto, user: User): Promise<Taker> {
    const existing = await this.findByUserId(user.id);
    if (existing) {
      throw new DomainException(
        'TAKER_EXISTS',
        'You are already registered',
        HttpStatus.CONFLICT,
      );
    }
    const name = dto.name ?? user.name;
    const phone = dto.phone ?? user.phone;
    return this.prisma.$transaction(async (tx) => {
      if (dto.name || dto.phone) {
        await tx.user.update({ where: { id: user.id }, data: { name, phone } });
      }
      return tx.taker.create({
        data: {
          name,
          email: user.email,
          phone,
          intendedUse: dto.intendedUse,
          type: TakerType.INDIVIDUAL,
          status: TakerStatus.PENDING,
          userId: user.id,
        },
      });
    });
  }

  async getMine(user: User): Promise<Taker> {
    const taker = await this.findByUserId(user.id);
    if (!taker) {
      throw new NotFoundException('You have not registered as a taker yet');
    }
    return taker;
  }

  /** Profile edits — name/phone are mirrored onto the User so contact details stay in sync. */
  async updateMine(dto: RegisterTakerDto, user: User): Promise<Taker> {
    const taker = await this.getMine(user);
    return this.prisma.$transaction(async (tx) => {
      if (dto.name || dto.phone) {
        await tx.user.update({
          where: { id: user.id },
          data: { name: dto.name, phone: dto.phone },
        });
      }
      return tx.taker.update({
        where: { id: taker.id },
        data: {
          name: dto.name,
          phone: dto.phone,
          intendedUse: dto.intendedUse,
        },
      });
    });
  }

  /** The gate in front of every self-serve claim action. */
  async requireApprovedIndividual(user: User): Promise<Taker> {
    const taker = await this.findByUserId(user.id);
    if (!taker) {
      throw new DomainException(
        'TAKER_NOT_REGISTERED',
        'Complete your taker registration before claiming compost',
        HttpStatus.FORBIDDEN,
      );
    }
    if (taker.status === TakerStatus.PENDING) {
      throw new DomainException(
        'TAKER_NOT_APPROVED',
        'Your registration is awaiting manager approval',
        HttpStatus.FORBIDDEN,
      );
    }
    if (taker.status === TakerStatus.REJECTED) {
      throw new DomainException(
        'TAKER_REJECTED',
        'Your taker registration was declined — contact the SUSS compost team',
        HttpStatus.FORBIDDEN,
      );
    }
    if (taker.status === TakerStatus.SUSPENDED) {
      throw new DomainException(
        'TAKER_SUSPENDED',
        'Your taker account has been suspended — contact the SUSS compost team',
        HttpStatus.FORBIDDEN,
      );
    }
    return taker;
  }
}
