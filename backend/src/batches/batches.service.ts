import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import { formatKg, kgExceeds } from '../common/kg';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import {
  AllocationStatus,
  BatchStatus,
  ClaimStatus,
  Prisma,
  UserRole,
  type Batch,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BatchPoolService, type BatchPool } from './batch-pool.service';
import type { CreateBatchDto } from './dto/create-batch.dto';
import type { ListBatchesQueryDto } from './dto/list-batches-query.dto';
import type { UpdateBatchDto } from './dto/update-batch.dto';

export type BatchWithPool = Batch & { pool: BatchPool };

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
          bagSizeKg: dto.bagSizeKg,
          phReading: dto.phReading,
          availableFrom: toDate(dto.availableFrom),
          availableUntil: toDate(dto.availableUntil),
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
    const pools = await this.pool.forBatches(batches);
    return paginated(
      batches.map((b) => ({ ...b, pool: pools.get(b.id)! })),
      total,
      q,
    );
  }

  async getById(id: string, user: User): Promise<BatchWithPool> {
    const batch = await this.findOrThrow(id);
    if (user.role === UserRole.TAKER && batch.status === BatchStatus.DRAFT) {
      throw new NotFoundException('Batch not found'); // drafts are invisible to takers
    }
    return this.withPool(batch);
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

    const totalKg = dto.totalKg ?? batch.totalKg;
    const schoolReserveKg = dto.schoolReserveKg ?? batch.schoolReserveKg;
    assertReserve(totalKg, schoolReserveKg);
    assertWindow(
      dto.availableFrom ?? batch.availableFrom?.toISOString(),
      dto.availableUntil ?? batch.availableUntil?.toISOString(),
    );

    // Shrinking the pool must never strand kg that is already allocated or claimed.
    if (
      totalKg !== batch.totalKg ||
      schoolReserveKg !== batch.schoolReserveKg
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
        bagSizeKg: dto.bagSizeKg,
        phReading: dto.phReading,
        availableFrom: toDate(dto.availableFrom),
        availableUntil: toDate(dto.availableUntil),
        pickupLocation: dto.pickupLocation,
        notes: dto.notes,
      },
    });
    return this.withPool(updated);
  }

  open(id: string): Promise<BatchWithPool> {
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

  /** Only an unused DRAFT can be deleted; anything else is closed/completed instead. */
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
    if (batch.status !== BatchStatus.DRAFT) {
      throw new DomainException(
        'BATCH_NOT_DRAFT',
        'Only DRAFT batches can be deleted — close or complete it instead',
        HttpStatus.CONFLICT,
      );
    }
    const { allocations, claims, pickupSlots } = batch._count;
    if (allocations + claims + pickupSlots > 0) {
      throw new DomainException(
        'BATCH_IN_USE',
        `Batch has ${allocations} allocation(s), ${claims} claim(s) and ${pickupSlots} pickup slot(s)`,
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.batch.delete({ where: { id } });
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

  private async withPool(batch: Batch): Promise<BatchWithPool> {
    return { ...batch, pool: await this.pool.forBatch(batch) };
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

function assertReserve(totalKg: number, schoolReserveKg: number): void {
  if (kgExceeds(schoolReserveKg, totalKg)) {
    throw new DomainException(
      'INVALID_RESERVE',
      `schoolReserveKg (${formatKg(schoolReserveKg)}) cannot exceed totalKg (${formatKg(totalKg)})`,
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
