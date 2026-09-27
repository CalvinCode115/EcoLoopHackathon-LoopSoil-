import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
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
  type DecimalValue,
} from '../common/kg';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import {
  AllocationStatus,
  BatchStatus,
  ClaimStatus,
  Prisma,
  TakerStatus,
  UserRole,
  type Batch,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TakersService } from '../takers/takers.service';
import { BatchPoolService, type BatchPool } from './batch-pool.service';
import type { CreateBatchDto } from './dto/create-batch.dto';
import type { ListBatchesQueryDto } from './dto/list-batches-query.dto';
import type { TopUpBatchDto } from './dto/topup-batch.dto';
import type { UpdateBatchDto } from './dto/update-batch.dto';

export type BatchWithPool = Batch & {
  pool: BatchPool;
  /** Backend-Updates.md §E/§F: how much of the taker's 1kg-per-batch cap is left.
   *  Only meaningful for an APPROVED individual taker — null for managers, unregistered
   *  or unapproved takers (they cannot claim regardless of the number). */
  allowanceLeftKg: number | null;
  /** Manager GET /batches/:id only. */
  createdBy?: { id: string; name: string } | null;
  /** Manager GET /batches/:id only, newest first. */
  topUps?: {
    id: string;
    kg: number;
    note: string | null;
    createdAt: Date;
    createdBy: { id: string; name: string };
  }[];
};

/** DRAFT → OPEN → CLOSED → COMPLETED, with reopen. COMPLETED is terminal. */
export const BATCH_TRANSITIONS: Record<BatchStatus, readonly BatchStatus[]> = {
  DRAFT: [BatchStatus.OPEN],
  OPEN: [BatchStatus.CLOSED, BatchStatus.COMPLETED],
  CLOSED: [BatchStatus.OPEN, BatchStatus.COMPLETED],
  COMPLETED: [],
};

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: BatchPoolService,
    private readonly takers: TakersService,
  ) {}

  async create(dto: CreateBatchDto, manager: User): Promise<BatchWithPool> {
    const harvestDate = new Date(dto.harvestDate);
    const schoolReserveKg = dto.schoolReserveKg ?? 0;
    assertReserve(dto.totalKg, schoolReserveKg);
    assertWindow(dto.availableFrom, dto.availableUntil);
    const reference =
      dto.reference ?? (await this.generateReference(harvestDate));

    try {
      const batch = await this.prisma.batch.create({
        data: {
          reference,
          harvestDate,
          totalKg: dto.totalKg,
          schoolReserveKg,
          phReading: dto.phReading,
          availableFrom: toDate(dto.availableFrom),
          availableUntil: toDate(dto.availableUntil),
          // Omitted → the schema default "Near bin centre / composter" applies.
          pickupLocation: dto.pickupLocation,
          notes: dto.notes,
          createdById: manager.id,
        },
      });
      return this.withPool(batch);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new DomainException(
          'REFERENCE_TAKEN',
          `Batch reference "${reference}" is already in use`,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  /** Takers only ever see OPEN batches; managers can filter by any status. */
  async list(
    q: ListBatchesQueryDto,
    user: User,
  ): Promise<Paginated<BatchWithPool>> {
    const where: Prisma.BatchWhereInput =
      user.role === UserRole.TAKER
        ? { status: BatchStatus.OPEN }
        : q.status
          ? { status: q.status }
          : {};

    const [total, batches] = await Promise.all([
      this.prisma.batch.count({ where }),
      this.prisma.batch.findMany({
        where,
        orderBy: { harvestDate: 'desc' },
        ...pageArgs(q),
      }),
    ]);
    const [pools, allowances] = await Promise.all([
      this.pool.forBatches(batches),
      this.allowancesFor(
        batches.map((b) => b.id),
        user,
      ),
    ]);
    return paginated(
      batches.map((b) => ({
        ...b,
        pool: pools.get(b.id)!,
        allowanceLeftKg: allowances.get(b.id) ?? null,
      })),
      total,
      q,
    );
  }

  async getById(id: string, user: User): Promise<BatchWithPool> {
    const batch = await this.findOrThrow(id);
    if (user.role === UserRole.TAKER && batch.status === BatchStatus.DRAFT) {
      throw new NotFoundException('Batch not found'); // drafts are invisible to takers
    }
    const allowances = await this.allowancesFor([id], user);
    const detail = await this.withPool(
      batch,
      undefined,
      allowances.get(id) ?? null,
    );
    if (user.role !== UserRole.MANAGER) return detail;

    // Manager batch detail: who logged it + the top-up history (Overview tab).
    const [createdBy, topUps] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: batch.createdById },
        select: { id: true, name: true },
      }),
      this.prisma.batchTopUp.findMany({
        where: { batchId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          kg: true,
          note: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
      }),
    ]);
    return {
      ...detail,
      createdBy,
      topUps: topUps.map((t) => ({ ...t, kg: t.kg.toNumber() })),
    };
  }

  async update(id: string, dto: UpdateBatchDto): Promise<BatchWithPool> {
    const batch = await this.findOrThrow(id);
    if (batch.status === BatchStatus.COMPLETED) {
      throw new DomainException(
        'BATCH_COMPLETED',
        'A completed batch is read-only',
        HttpStatus.CONFLICT,
      );
    }

    const totalKg =
      dto.totalKg !== undefined ? toDecimal(dto.totalKg) : batch.totalKg;
    const schoolReserveKg =
      dto.schoolReserveKg !== undefined
        ? toDecimal(dto.schoolReserveKg)
        : batch.schoolReserveKg;
    assertReserve(totalKg, schoolReserveKg);
    assertWindow(
      dto.availableFrom ?? batch.availableFrom?.toISOString(),
      dto.availableUntil ?? batch.availableUntil?.toISOString(),
    );

    // Shrinking the pool must never strand kg that is already allocated or claimed.
    if (
      !totalKg.equals(batch.totalKg) ||
      !schoolReserveKg.equals(batch.schoolReserveKg)
    ) {
      const preview = await this.pool.forBatch({
        id,
        totalKg,
        schoolReserveKg,
      });
      if (kgExceeds(0, preview.kgRemaining)) {
        const committed =
          preview.allocatedKg +
          preview.pendingClaimKg +
          preview.approvedClaimKg;
        throw new DomainException(
          'INSUFFICIENT_POOL',
          `Change would leave ${formatKg(preview.kgRemaining)} in the public pool — ${formatKg(committed)} is already allocated or claimed`,
        );
      }
    }

    const updated = await this.prisma.batch.update({
      where: { id },
      data: {
        harvestDate: toDate(dto.harvestDate),
        totalKg,
        schoolReserveKg,
        phReading: dto.phReading,
        availableFrom: toDate(dto.availableFrom),
        availableUntil: toDate(dto.availableUntil),
        pickupLocation: dto.pickupLocation,
        notes: dto.notes,
      },
    });
    return this.withPool(updated);
  }

  /**
   * Weekly stock top-up (CLAUDE.md Part A) — one transaction creates the BatchTopUp
   * audit row AND increments Batch.totalKg, so the two can never disagree. Only while
   * DRAFT or OPEN (Part E); a CLOSED/COMPLETED batch is done receiving stock.
   */
  topUp(id: string, dto: TopUpBatchDto, manager: User): Promise<BatchWithPool> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({ where: { id } });
      if (!batch) throw new NotFoundException('Batch not found');
      if (
        batch.status !== BatchStatus.DRAFT &&
        batch.status !== BatchStatus.OPEN
      ) {
        throw new DomainException(
          'BATCH_NOT_TOPUPABLE',
          `Batch ${batch.reference} is ${batch.status} — top-ups are only allowed while DRAFT or OPEN`,
          HttpStatus.CONFLICT,
        );
      }
      await tx.batchTopUp.create({
        data: {
          batchId: id,
          kg: dto.kg,
          note: dto.note,
          createdById: manager.id,
        },
      });
      const updated = await tx.batch.update({
        where: { id },
        data: { totalKg: { increment: dto.kg } },
      });
      return this.withPool(updated, tx);
    });
  }

  /** DRAFT → OPEN: the batch becomes visible and claimable to takers. */
  publish(id: string): Promise<BatchWithPool> {
    return this.transition(id, BatchStatus.OPEN);
  }

  close(id: string): Promise<BatchWithPool> {
    return this.transition(id, BatchStatus.CLOSED);
  }

  /** COMPLETED only once every claim/allocation is collected or released (CLAUDE.md §13). */
  async complete(id: string): Promise<BatchWithPool> {
    const batch = await this.findOrThrow(id);
    assertTransition(
      'Batch',
      BATCH_TRANSITIONS,
      batch.status,
      BatchStatus.COMPLETED,
    );

    const [openClaims, openAllocations] = await Promise.all([
      this.prisma.claim.count({
        where: {
          batchId: id,
          status: { in: [ClaimStatus.PENDING, ClaimStatus.APPROVED] },
        },
      }),
      this.prisma.allocation.count({
        where: {
          batchId: id,
          status: {
            in: [AllocationStatus.PLANNED, AllocationStatus.CONFIRMED],
          },
        },
      }),
    ]);
    if (openClaims > 0 || openAllocations > 0) {
      throw new DomainException(
        'BATCH_HAS_OPEN_ITEMS',
        `${openClaims} claim(s) and ${openAllocations} allocation(s) still await a decision or collection`,
        HttpStatus.CONFLICT,
      );
    }
    return this.setStatus(batch, BatchStatus.COMPLETED);
  }

  /**
   * Delete a batch logged by mistake — Draft, Open or Closed — as long as nothing points
   * at it yet (no claims, allocations or pickup slots). Top-ups are just its own stock
   * history, so they go with it. Anything in use, or COMPLETED, is kept for the audit trail.
   */
  async remove(id: string): Promise<void> {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        _count: {
          select: { allocations: true, claims: true, pickupSlots: true },
        },
      },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status === BatchStatus.COMPLETED) {
      throw new DomainException(
        'BATCH_COMPLETED',
        'A completed batch is kept for the records and cannot be deleted',
        HttpStatus.CONFLICT,
      );
    }
    const { allocations, claims, pickupSlots } = batch._count;
    if (allocations + claims + pickupSlots > 0) {
      const parts = [
        claims && plural(claims, 'claim'),
        allocations && plural(allocations, 'allocation'),
        pickupSlots && plural(pickupSlots, 'pickup slot'),
      ].filter(Boolean);
      throw new DomainException(
        'BATCH_IN_USE',
        `${batch.reference} can’t be deleted — it has ${parts.join(', ')}. Remove those first, or close the batch instead.`,
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.$transaction([
      this.prisma.batchTopUp.deleteMany({ where: { batchId: id } }),
      this.prisma.batch.delete({ where: { id } }),
    ]);
  }

  private async transition(
    id: string,
    to: BatchStatus,
  ): Promise<BatchWithPool> {
    const batch = await this.findOrThrow(id);
    assertTransition('Batch', BATCH_TRANSITIONS, batch.status, to);
    return this.setStatus(batch, to);
  }

  private async setStatus(
    batch: Batch,
    status: BatchStatus,
  ): Promise<BatchWithPool> {
    const updated = await this.prisma.batch.update({
      where: { id: batch.id },
      data: { status },
    });
    return this.withPool(updated);
  }

  private async findOrThrow(id: string): Promise<Batch> {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  /** `allowanceLeftKg` defaults to null — every manager-only call site doesn't need it. */
  private async withPool(
    batch: Batch,
    tx?: Prisma.TransactionClient,
    allowanceLeftKg: number | null = null,
  ): Promise<BatchWithPool> {
    return {
      ...batch,
      pool: await this.pool.forBatch(batch, tx),
      allowanceLeftKg,
    };
  }

  /** Only an APPROVED individual taker has a claim allowance; everyone else gets null. */
  private async allowancesFor(
    batchIds: string[],
    user: User,
  ): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>(
      batchIds.map((id) => [id, null]),
    );
    if (user.role !== UserRole.TAKER) return result;
    const taker = await this.takers.findByUserId(user.id);
    if (!taker || taker.status !== TakerStatus.APPROVED) return result;
    const allowances = await this.pool.allowanceLeftKgForMany(
      batchIds,
      taker.id,
    );
    for (const [id, kg] of allowances) result.set(id, kg);
    return result;
  }

  private async generateReference(harvestDate: Date): Promise<string> {
    const prefix = monthPrefix(harvestDate);
    const existing = await this.prisma.batch.findMany({
      where: { reference: { startsWith: prefix } },
      select: { reference: true },
    });
    return nextBatchReference(
      prefix,
      existing.map((e) => e.reference),
    );
  }
}

// ─── pure helpers (unit-tested) ───────────────────────────────────────────────

/** "2026-09-" for a harvest in September 2026, Singapore time. */
export function monthPrefix(date: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}-`;
}

/** First unused letter suffix: A, B, … Z, AA, AB … */
export function nextBatchReference(prefix: string, existing: string[]): string {
  const used = new Set(
    existing
      .filter((r) => r.startsWith(prefix))
      .map((r) => r.slice(prefix.length)),
  );
  for (let i = 0; ; i++) {
    const suffix = indexToLetters(i);
    if (!used.has(suffix)) return prefix + suffix;
  }
}

function indexToLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function assertReserve(
  totalKg: DecimalValue,
  schoolReserveKg: DecimalValue,
): void {
  if (decimalExceeds(schoolReserveKg, totalKg)) {
    throw new DomainException(
      'INVALID_RESERVE',
      `schoolReserveKg (${formatDecimalKg(schoolReserveKg)}) cannot exceed totalKg (${formatDecimalKg(totalKg)})`,
    );
  }
}

function assertWindow(from?: string, until?: string): void {
  if (from && until && new Date(until) < new Date(from)) {
    throw new DomainException(
      'INVALID_WINDOW',
      'availableUntil must not be before availableFrom',
    );
  }
}

function toDate(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
