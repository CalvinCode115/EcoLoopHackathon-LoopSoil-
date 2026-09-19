import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { BatchPoolService } from '../batches/batch-pool.service';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import { formatKg, kgExceeds } from '../common/kg';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import {
  AllocationStatus,
  BatchStatus,
  BookingStatus,
  Prisma,
  TakerStatus,
  TakerType,
  type Taker,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CancelAllocationDto } from './dto/cancel-allocation.dto';
import type { CreateAllocationDto } from './dto/create-allocation.dto';
import type { ListAllocationsQueryDto } from './dto/list-allocations-query.dto';
import type { UpdateAllocationDto } from './dto/update-allocation.dto';

/** CLAUDE.md §11. COLLECTED is only ever set by the handovers module. */
export const ALLOCATION_TRANSITIONS: Record<
  AllocationStatus,
  readonly AllocationStatus[]
> = {
  PLANNED: [AllocationStatus.CONFIRMED, AllocationStatus.CANCELLED],
  CONFIRMED: [AllocationStatus.COLLECTED, AllocationStatus.CANCELLED],
  COLLECTED: [],
  CANCELLED: [],
};

const allocationInclude = {
  taker: { select: { id: true, name: true, category: true, type: true } },
  batch: {
    select: { id: true, reference: true, status: true, harvestDate: true },
  },
} satisfies Prisma.AllocationInclude;

export type AllocationDetail = Prisma.AllocationGetPayload<{
  include: typeof allocationInclude;
}>;

@Injectable()
export class AllocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: BatchPoolService,
  ) {}

  /**
   * Manager carves a standing amount off a batch for a bulk org. Runs in one
   * transaction so the pool figure it checks against is the one it writes into.
   */
  create(dto: CreateAllocationDto): Promise<AllocationDetail> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({ where: { id: dto.batchId } });
      if (!batch) throw new NotFoundException('Batch not found');
      if (
        batch.status !== BatchStatus.DRAFT &&
        batch.status !== BatchStatus.OPEN
      ) {
        throw new DomainException(
          'BATCH_NOT_ALLOCATABLE',
          `Batch ${batch.reference} is ${batch.status} — allocations can only be added while DRAFT or OPEN`,
          HttpStatus.CONFLICT,
        );
      }

      const taker = await tx.taker.findUnique({ where: { id: dto.takerId } });
      if (!taker) throw new NotFoundException('Taker not found');
      assertBulkTakerEligible(taker);

      // One standing amount per org per batch — edit it rather than stacking a second.
      const duplicate = await tx.allocation.findFirst({
        where: {
          batchId: dto.batchId,
          takerId: dto.takerId,
          status: { not: AllocationStatus.CANCELLED },
        },
        select: { reference: true },
      });
      if (duplicate) {
        throw new DomainException(
          'ALLOCATION_EXISTS',
          `${taker.name} already has allocation ${duplicate.reference} on batch ${batch.reference} — edit or cancel it instead`,
          HttpStatus.CONFLICT,
        );
      }

      const pool = await this.pool.forBatch(batch, tx);
      assertWithinPool(dto.allocatedKg, pool.kgRemaining, batch.reference);

      const reference =
        dto.reference ??
        (await generateReference(batch.reference, taker.name, tx));
      try {
        return await tx.allocation.create({
          data: {
            reference,
            batchId: dto.batchId,
            takerId: dto.takerId,
            allocatedKg: dto.allocatedKg,
            note: dto.note,
          },
          include: allocationInclude,
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new DomainException(
            'REFERENCE_TAKEN',
            `Allocation reference "${reference}" is already in use`,
            HttpStatus.CONFLICT,
          );
        }
        throw err;
      }
    });
  }

  async list(q: ListAllocationsQueryDto): Promise<Paginated<AllocationDetail>> {
    const where: Prisma.AllocationWhereInput = {
      batchId: q.batchId,
      takerId: q.takerId,
      status: q.status,
    };
    const [total, data] = await Promise.all([
      this.prisma.allocation.count({ where }),
      this.prisma.allocation.findMany({
        where,
        include: allocationInclude,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
      }),
    ]);
    return paginated(data, total, q);
  }

  async getById(id: string): Promise<AllocationDetail> {
    const allocation = await this.prisma.allocation.findUnique({
      where: { id },
      include: allocationInclude,
    });
    if (!allocation) throw new NotFoundException('Allocation not found');
    return allocation;
  }

  /** Amount can change while PLANNED or CONFIRMED, within what the pool can still give. */
  update(id: string, dto: UpdateAllocationDto): Promise<AllocationDetail> {
    return this.prisma.$transaction(async (tx) => {
      const allocation = await tx.allocation.findUnique({
        where: { id },
        include: { batch: true },
      });
      if (!allocation) throw new NotFoundException('Allocation not found');
      if (
        allocation.status !== AllocationStatus.PLANNED &&
        allocation.status !== AllocationStatus.CONFIRMED
      ) {
        throw new DomainException(
          'ALLOCATION_LOCKED',
          `A ${allocation.status} allocation cannot be edited`,
          HttpStatus.CONFLICT,
        );
      }

      if (
        dto.allocatedKg !== undefined &&
        dto.allocatedKg !== allocation.allocatedKg
      ) {
        const pool = await this.pool.forBatch(allocation.batch, tx);
        // Its own current amount is already counted in the pool, so it is available to itself.
        const available = pool.kgRemaining + allocation.allocatedKg;
        assertWithinPool(
          dto.allocatedKg,
          available,
          allocation.batch.reference,
        );
      }

      return tx.allocation.update({
        where: { id },
        data: { allocatedKg: dto.allocatedKg, note: dto.note },
        include: allocationInclude,
      });
    });
  }

  /** PLANNED → CONFIRMED: the org has said they will take it. */
  async confirm(id: string): Promise<AllocationDetail> {
    const allocation = await this.getById(id);
    assertTransition(
      'Allocation',
      ALLOCATION_TRANSITIONS,
      allocation.status,
      AllocationStatus.CONFIRMED,
    );
    return this.prisma.allocation.update({
      where: { id },
      data: { status: AllocationStatus.CONFIRMED },
      include: allocationInclude,
    });
  }

  /** Fell through — the kg flows back to the public pool automatically (derived, §12). */
  cancel(id: string, dto: CancelAllocationDto): Promise<AllocationDetail> {
    return this.prisma.$transaction(async (tx) => {
      const allocation = await tx.allocation.findUnique({ where: { id } });
      if (!allocation) throw new NotFoundException('Allocation not found');
      assertTransition(
        'Allocation',
        ALLOCATION_TRANSITIONS,
        allocation.status,
        AllocationStatus.CANCELLED,
      );
      // A booked pickup for this allocation is now meaningless — release its slot capacity.
      await tx.booking.updateMany({
        where: { allocationId: id, status: BookingStatus.BOOKED },
        data: { status: BookingStatus.CANCELLED },
      });
      return tx.allocation.update({
        where: { id },
        data: {
          status: AllocationStatus.CANCELLED,
          note: dto.note ?? allocation.note,
        },
        include: allocationInclude,
      });
    });
  }
}

// ─── rules (unit-tested via the service) ──────────────────────────────────────

function assertBulkTakerEligible(taker: Taker): void {
  if (taker.type !== TakerType.BULK) {
    throw new DomainException(
      'TAKER_NOT_BULK',
      `${taker.name} is an individual taker — individuals receive compost through claims, not allocations`,
    );
  }
  if (taker.status !== TakerStatus.APPROVED) {
    throw new DomainException(
      'TAKER_NOT_APPROVED',
      `${taker.name} is ${taker.status} and cannot receive an allocation`,
    );
  }
}

/** Hard block: an allocation may never exceed what the public pool can still give. */
function assertWithinPool(
  requestedKg: number,
  availableKg: number,
  batchReference: string,
): void {
  if (kgExceeds(requestedKg, availableKg)) {
    throw new DomainException(
      'INSUFFICIENT_POOL',
      `Only ${formatKg(Math.max(0, availableKg))} remaining in batch ${batchReference}; cannot allocate ${formatKg(requestedKg)}`,
    );
  }
}

/** "ALC-2026-09-A-NParks", with "-2", "-3"… if that label is somehow taken. */
async function generateReference(
  batchReference: string,
  takerName: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const slug = takerName.replace(/[^A-Za-z0-9]+/g, '').slice(0, 16) || 'Taker';
  const base = `ALC-${batchReference}-${slug}`.slice(0, 36);
  const taken = new Set(
    (
      await tx.allocation.findMany({
        where: { reference: { startsWith: base } },
        select: { reference: true },
      })
    ).map((a) => a.reference),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
