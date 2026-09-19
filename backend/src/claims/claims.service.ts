import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { BatchPoolService } from '../batches/batch-pool.service';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import { formatKg, kgExceeds } from '../common/kg';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import {
  BatchStatus,
  BookingStatus,
  ClaimStatus,
  Prisma,
  UserRole,
  type Batch,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TakersService } from '../takers/takers.service';
import type { CreateClaimDto } from './dto/create-claim.dto';
import type {
  ApproveClaimDto,
  CancelClaimDto,
  RejectClaimDto,
  UpdateClaimNoteDto,
} from './dto/decide-claim.dto';
import type { ListClaimsQueryDto } from './dto/list-claims-query.dto';

/** CLAUDE.md §11. COLLECTED is only ever set by the handovers module. */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  PENDING: [ClaimStatus.APPROVED, ClaimStatus.REJECTED, ClaimStatus.CANCELLED],
  APPROVED: [ClaimStatus.CANCELLED, ClaimStatus.COLLECTED],
  REJECTED: [],
  CANCELLED: [],
  COLLECTED: [],
};

const claimInclude = {
  taker: {
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      phone: true, // the manager's WhatsApp contact (§17: WhatsApp is manual for the pilot)
      type: true,
      status: true,
      intendedUse: true,
    },
  },
  batch: {
    select: {
      id: true,
      reference: true,
      status: true,
      harvestDate: true,
      pickupLocation: true,
      bagSizeKg: true,
    },
  },
  booking: {
    select: {
      id: true,
      status: true,
      collectionDeadline: true,
      slot: {
        select: { id: true, startTime: true, endTime: true, location: true },
      },
    },
  },
} satisfies Prisma.ClaimInclude;

export type ClaimDetail = Prisma.ClaimGetPayload<{
  include: typeof claimInclude;
}>;

const MAX_REFERENCE_RETRIES = 3;

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: BatchPoolService,
    private readonly takers: TakersService,
  ) {}

  /**
   * Taker submits a claim from the public pool. The requested kg is locked (PENDING
   * counts against kgRemaining) from this moment until the manager decides.
   */
  async create(dto: CreateClaimDto, user: User): Promise<ClaimDetail> {
    const taker = await this.takers.requireApprovedIndividual(user);

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const batch = await tx.batch.findUnique({
            where: { id: dto.batchId },
          });
          if (!batch) throw new NotFoundException('Batch not found');
          assertBatchClaimable(batch, new Date());

          // One live claim per taker per batch — cancel it to ask for a different amount.
          const existing = await tx.claim.findFirst({
            where: {
              batchId: batch.id,
              takerId: taker.id,
              status: { in: [ClaimStatus.PENDING, ClaimStatus.APPROVED] },
            },
            select: { reference: true },
          });
          if (existing) {
            throw new DomainException(
              'CLAIM_EXISTS',
              `You already have claim ${existing.reference} on batch ${batch.reference} — cancel it to submit a different amount`,
              HttpStatus.CONFLICT,
            );
          }

          const pool = await this.pool.forBatch(batch, tx);
          if (kgExceeds(dto.requestedKg, pool.kgRemaining)) {
            throw new DomainException(
              'INSUFFICIENT_POOL',
              `Only ${formatKg(Math.max(0, pool.kgRemaining))} left in batch ${batch.reference}; cannot claim ${formatKg(dto.requestedKg)}`,
            );
          }

          const reference = await nextClaimReference(tx, new Date());
          return tx.claim.create({
            data: {
              reference,
              batchId: batch.id,
              takerId: taker.id,
              requestedKg: dto.requestedKg,
            },
            include: claimInclude,
          });
        });
      } catch (err) {
        // Two takers submitting in the same instant can race for the same reference.
        if (isUniqueViolation(err) && attempt < MAX_REFERENCE_RETRIES) continue;
        throw err;
      }
    }
  }

  /** Managers see everything (filterable); takers see only their own claims. */
  async list(
    q: ListClaimsQueryDto,
    user: User,
  ): Promise<Paginated<ClaimDetail>> {
    const where: Prisma.ClaimWhereInput = {
      batchId: q.batchId,
      status: q.status,
    };
    if (user.role === UserRole.TAKER) {
      const taker = await this.takers.findByUserId(user.id);
      if (!taker) return paginated([], 0, q);
      where.takerId = taker.id;
    } else {
      where.takerId = q.takerId;
    }

    const [total, data] = await Promise.all([
      this.prisma.claim.count({ where }),
      this.prisma.claim.findMany({
        where,
        include: claimInclude,
        orderBy: { submittedAt: 'desc' },
        ...pageArgs(q),
      }),
    ]);
    return paginated(data, total, q);
  }

  async getById(id: string, user: User): Promise<ClaimDetail> {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: claimInclude,
    });
    if (!claim || !canSee(claim, user)) {
      throw new NotFoundException('Claim not found');
    }
    return claim;
  }

  /**
   * PENDING → APPROVED. Locks `approvedKg` and stamps `decidedAt`; the amount is final
   * from here (CLAUDE.md §13). Checked against the pool inside the same transaction.
   */
  approve(id: string, dto: ApproveClaimDto): Promise<ClaimDetail> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.claim.findUnique({
        where: { id },
        include: { batch: true },
      });
      if (!claim) throw new NotFoundException('Claim not found');
      assertTransition(
        'Claim',
        CLAIM_TRANSITIONS,
        claim.status,
        ClaimStatus.APPROVED,
      );

      const approvedKg = dto.approvedKg ?? claim.requestedKg;
      if (kgExceeds(approvedKg, claim.requestedKg)) {
        throw new DomainException(
          'APPROVED_EXCEEDS_REQUESTED',
          `Cannot approve ${formatKg(approvedKg)} — the taker asked for ${formatKg(claim.requestedKg)}`,
        );
      }

      // The claim's own PENDING lock is inside kgRemaining already, so it is available to itself.
      const pool = await this.pool.forBatch(claim.batch, tx);
      const available = pool.kgRemaining + claim.requestedKg;
      if (kgExceeds(approvedKg, available)) {
        throw new DomainException(
          'INSUFFICIENT_POOL',
          `Only ${formatKg(Math.max(0, available))} available in batch ${claim.batch.reference}; cannot approve ${formatKg(approvedKg)}`,
        );
      }

      return tx.claim.update({
        where: { id },
        data: {
          status: ClaimStatus.APPROVED,
          approvedKg,
          decidedAt: new Date(),
          managerNote: dto.managerNote ?? claim.managerNote,
        },
        include: claimInclude,
      });
    });
  }

  /** PENDING → REJECTED. Reason is required (enforced by the DTO); kg frees automatically. */
  async reject(id: string, dto: RejectClaimDto): Promise<ClaimDetail> {
    const claim = await this.findOrThrow(id);
    assertTransition(
      'Claim',
      CLAIM_TRANSITIONS,
      claim.status,
      ClaimStatus.REJECTED,
    );
    return this.prisma.claim.update({
      where: { id },
      data: {
        status: ClaimStatus.REJECTED,
        rejectionReason: dto.rejectionReason,
        reasonNote: dto.reasonNote,
        managerNote: dto.managerNote ?? claim.managerNote,
        decidedAt: new Date(),
      },
      include: claimInclude,
    });
  }

  /**
   * PENDING | APPROVED → CANCELLED, by the taker (own claims) or the manager.
   * Releases the kg and any booked pickup slot in one transaction.
   */
  cancel(id: string, dto: CancelClaimDto, user: User): Promise<ClaimDetail> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.claim.findUnique({
        where: { id },
        include: { taker: { select: { userId: true } } },
      });
      if (!claim || !canSee(claim, user)) {
        throw new NotFoundException('Claim not found');
      }
      assertTransition(
        'Claim',
        CLAIM_TRANSITIONS,
        claim.status,
        ClaimStatus.CANCELLED,
      );

      await tx.booking.updateMany({
        where: { claimId: id, status: BookingStatus.BOOKED },
        data: { status: BookingStatus.CANCELLED },
      });
      return tx.claim.update({
        where: { id },
        data: {
          status: ClaimStatus.CANCELLED,
          cancellationReason: dto.cancellationReason,
          reasonNote: dto.reasonNote,
          cancelledAt: new Date(),
        },
        include: claimInclude,
      });
    });
  }

  /** Manager's working note — "WhatsApp'd 19/9, waiting" — editable at any stage. */
  async updateManagerNote(
    id: string,
    dto: UpdateClaimNoteDto,
  ): Promise<ClaimDetail> {
    await this.findOrThrow(id);
    return this.prisma.claim.update({
      where: { id },
      data: { managerNote: dto.managerNote.trim() || null },
      include: claimInclude,
    });
  }

  private async findOrThrow(id: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }
}

// ─── rules (unit-tested via the service) ──────────────────────────────────────

/** Takers are scoped to their own claims (§15); managers see all. */
function canSee(
  claim: { taker: { userId: string | null } },
  user: User,
): boolean {
  return user.role === UserRole.MANAGER || claim.taker.userId === user.id;
}

/** OPEN status is the manager's switch; the availability window (when set) is the clock. */
export function assertBatchClaimable(batch: Batch, now: Date): void {
  if (batch.status !== BatchStatus.OPEN) {
    throw new DomainException(
      'BATCH_NOT_OPEN',
      `Batch ${batch.reference} is ${batch.status} and not accepting claims`,
      HttpStatus.CONFLICT,
    );
  }
  if (batch.availableFrom && now < batch.availableFrom) {
    throw new DomainException(
      'BATCH_NOT_YET_AVAILABLE',
      `Claiming for batch ${batch.reference} opens on ${batch.availableFrom.toISOString()}`,
      HttpStatus.CONFLICT,
    );
  }
  if (batch.availableUntil && now > batch.availableUntil) {
    throw new DomainException(
      'BATCH_WINDOW_CLOSED',
      `Claiming for batch ${batch.reference} closed on ${batch.availableUntil.toISOString()}`,
      HttpStatus.CONFLICT,
    );
  }
}

/** "CLM-2026-001", "CLM-2026-002", … per calendar year (Singapore time). */
async function nextClaimReference(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<string> {
  const year = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
  }).format(now);
  const prefix = `CLM-${year}-`;
  const existing = await tx.claim.findMany({
    where: { reference: { startsWith: prefix } },
    select: { reference: true },
  });
  return nextClaimNumber(
    prefix,
    existing.map((c) => c.reference),
  );
}

export function nextClaimNumber(prefix: string, existing: string[]): string {
  let max = 0;
  for (const ref of existing) {
    const n = Number.parseInt(ref.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
