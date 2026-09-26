import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { BatchPoolService } from '../batches/batch-pool.service';
import { MAX_CLAIM_KG, MIN_CLAIM_KG } from '../common/constants';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import {
  decimalExceeds,
  formatDecimalKg,
  formatKg,
  kgExceeds,
  toDecimal,
} from '../common/kg';
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

export interface BulkApproveResult {
  approved: ClaimDetail[];
  skipped: { claimId: string; reason: string }[];
}

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
    assertValidClaimAmount(dto.requestedKg);

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const batch = await tx.batch.findUnique({
            where: { id: dto.batchId },
          });
          if (!batch) throw new NotFoundException('Batch not found');
          assertBatchClaimable(batch, new Date());

          // Running total per taker per batch (§E) — several small claims are fine as
          // long as PENDING + APPROVED + COLLECTED never exceeds MAX_CLAIM_KG.
          const allowanceLeft = await this.pool.allowanceLeftKgFor(
            batch.id,
            taker.id,
            tx,
          );
          if (kgExceeds(dto.requestedKg, allowanceLeft)) {
            throw new DomainException(
              'CLAIM_ALLOWANCE_EXCEEDED',
              `You have ${formatKg(allowanceLeft)} left to claim from batch ${batch.reference} (cap ${formatKg(MAX_CLAIM_KG)} per batch)`,
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

  /**
   * Manager's "needs booking" list (§E): APPROVED claims with no active booking — never
   * booked, or their slot was cancelled. Derived from existing state, no new status.
   */
  async listNeedsBooking(
    q: ListClaimsQueryDto,
  ): Promise<Paginated<ClaimDetail>> {
    const where: Prisma.ClaimWhereInput = {
      batchId: q.batchId,
      takerId: q.takerId,
      status: ClaimStatus.APPROVED,
      OR: [
        { booking: null },
        { booking: { status: { not: BookingStatus.BOOKED } } },
      ],
    };
    const [total, data] = await Promise.all([
      this.prisma.claim.count({ where }),
      this.prisma.claim.findMany({
        where,
        include: claimInclude,
        orderBy: { decidedAt: 'asc' }, // longest-waiting first
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

      const approvedKg =
        dto.approvedKg !== undefined
          ? toDecimal(dto.approvedKg)
          : claim.requestedKg;
      if (decimalExceeds(approvedKg, claim.requestedKg)) {
        throw new DomainException(
          'APPROVED_EXCEEDS_REQUESTED',
          `Cannot approve ${formatDecimalKg(approvedKg)} — the taker asked for ${formatDecimalKg(claim.requestedKg)}`,
        );
      }

      // The claim's own PENDING lock is inside kgRemaining already, so it is available to itself.
      const pool = await this.pool.forBatch(claim.batch, tx);
      const available = pool.kgRemaining + claim.requestedKg.toNumber();
      if (kgExceeds(approvedKg.toNumber(), available)) {
        throw new DomainException(
          'INSUFFICIENT_POOL',
          `Only ${formatKg(Math.max(0, available))} available in batch ${claim.batch.reference}; cannot approve ${formatDecimalKg(approvedKg)}`,
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

  /**
   * Approve several claims in one call. Partial success (§E): each claim is its own
   * transaction (via approve()), so one failure never rolls back the ones that already
   * succeeded — it just gets reported in `skipped` alongside why.
   */
  async bulkApprove(claimIds: string[]): Promise<BulkApproveResult> {
    const approved: ClaimDetail[] = [];
    const skipped: { claimId: string; reason: string }[] = [];
    for (const id of claimIds) {
      try {
        approved.push(await this.approve(id, {}));
      } catch (err) {
        skipped.push({ claimId: id, reason: domainErrorMessage(err) });
      }
    }
    return { approved, skipped };
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

/** Amount ≥ MIN_CLAIM_KG, ≤ MAX_CLAIM_KG, in exact 0.1kg steps (Backend-Updates.md §E, §D). */
export function assertValidClaimAmount(requestedKg: number): void {
  const amount = toDecimal(requestedKg);
  if (amount.lessThan(MIN_CLAIM_KG)) {
    throw new DomainException(
      'CLAIM_BELOW_MINIMUM',
      `A claim must be at least ${formatKg(MIN_CLAIM_KG)}`,
    );
  }
  if (amount.greaterThan(MAX_CLAIM_KG)) {
    throw new DomainException(
      'CLAIM_ABOVE_MAXIMUM',
      `A single claim cannot exceed ${formatKg(MAX_CLAIM_KG)}`,
    );
  }
  if (!amount.mod(MIN_CLAIM_KG).isZero()) {
    throw new DomainException(
      'CLAIM_INVALID_STEP',
      `Claims must be in steps of ${formatKg(MIN_CLAIM_KG)} (e.g. 0.5, 0.6, 0.7)`,
    );
  }
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

/** Human-readable reason for a bulkApprove `skipped` entry, from whatever approve() threw. */
function domainErrorMessage(err: unknown): string {
  if (err instanceof DomainException) {
    const body = err.getResponse() as { message?: string };
    return body.message ?? 'Could not approve this claim';
  }
  if (err instanceof NotFoundException) return 'Claim not found';
  return 'Could not approve this claim';
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
