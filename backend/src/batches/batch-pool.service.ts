import { Injectable } from '@nestjs/common';
import { MAX_CLAIM_KG } from '../common/constants';
import {
  decimalToNumber,
  roundDecimal,
  toDecimal,
  type DecimalValue,
} from '../common/kg';
import {
  AllocationStatus,
  ClaimStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Live pool figures for a batch (CLAUDE.md §12). Never stored — always derived:
 *
 *   publicPoolKg = totalKg − schoolReserveKg − allocatedKg
 *   kgRemaining  = publicPoolKg − pendingClaimKg − approvedClaimKg
 *
 * Fields here are plain `number` — the public shape every consumer (API responses,
 * claims/allocations services) already expects. The summation that PRODUCES them uses
 * genuine Prisma.Decimal arithmetic (see computePool below), which is the actual point
 * of the Decimal migration: many small claims summed without JS float drift.
 */
export interface BatchPool {
  totalKg: number;
  schoolReserveKg: number;
  /** PLANNED + CONFIRMED + COLLECTED allocations. CANCELLED frees kg. */
  allocatedKg: number;
  publicPoolKg: number;
  /** requestedKg of PENDING claims — locked while the manager decides. */
  pendingClaimKg: number;
  /** approvedKg of APPROVED + COLLECTED claims — locked at approval, gone once collected. */
  approvedClaimKg: number;
  /** What an individual can still claim. Can be negative only if data was edited unsafely. */
  kgRemaining: number;
}

export const ACTIVE_ALLOCATION_STATUSES: readonly AllocationStatus[] = [
  AllocationStatus.PLANNED,
  AllocationStatus.CONFIRMED,
  AllocationStatus.COLLECTED,
];

/** Claims that hold kg against the pool. REJECTED / CANCELLED release it. */
export const LOCKING_CLAIM_STATUSES: readonly ClaimStatus[] = [
  ClaimStatus.PENDING,
  ClaimStatus.APPROVED,
  ClaimStatus.COLLECTED,
];

export interface PoolSums {
  allocatedKg: DecimalValue;
  pendingClaimKg: DecimalValue;
  approvedClaimKg: DecimalValue;
}

/** Pure math — unit-tested against the §12 worked example. Genuine Decimal arithmetic. */
export function computePool(
  totalKg: DecimalValue,
  schoolReserveKg: DecimalValue,
  sums: PoolSums,
): BatchPool {
  const total = toDecimal(totalKg);
  const reserve = toDecimal(schoolReserveKg);
  const allocatedKg = roundDecimal(sums.allocatedKg);
  const pendingClaimKg = roundDecimal(sums.pendingClaimKg);
  const approvedClaimKg = roundDecimal(sums.approvedClaimKg);
  const publicPoolKg = roundDecimal(total.minus(reserve).minus(allocatedKg));
  const kgRemaining = roundDecimal(
    publicPoolKg.minus(pendingClaimKg).minus(approvedClaimKg),
  );
  return {
    totalKg: decimalToNumber(total),
    schoolReserveKg: decimalToNumber(reserve),
    allocatedKg: allocatedKg.toNumber(),
    publicPoolKg: publicPoolKg.toNumber(),
    pendingClaimKg: pendingClaimKg.toNumber(),
    approvedClaimKg: approvedClaimKg.toNumber(),
    kgRemaining: kgRemaining.toNumber(),
  };
}

type BatchTotals = Pick<
  Prisma.BatchGetPayload<object>,
  'id' | 'totalKg' | 'schoolReserveKg'
>;

@Injectable()
export class BatchPoolService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pool for one batch. Pass `tx` to read inside a transaction (claims approval,
   * allocation checks) so the figure is consistent with the write that follows.
   * `totals` may carry *proposed* totalKg / schoolReserveKg to preview an edit.
   */
  async forBatch(
    totals: BatchTotals,
    tx?: Prisma.TransactionClient,
  ): Promise<BatchPool> {
    const pools = await this.forBatches([totals], tx);
    return pools.get(totals.id)!;
  }

  /** Pools for a page of batches in two grouped queries (no N+1). */
  async forBatches(
    batches: BatchTotals[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, BatchPool>> {
    const db = tx ?? this.prisma;
    const ids = batches.map((b) => b.id);
    const zero = new Prisma.Decimal(0);
    const sums = new Map<string, PoolSums>(
      ids.map((id) => [
        id,
        { allocatedKg: zero, pendingClaimKg: zero, approvedClaimKg: zero },
      ]),
    );

    if (ids.length > 0) {
      const allocations = await db.allocation.groupBy({
        by: ['batchId'],
        where: {
          batchId: { in: ids },
          status: { in: [...ACTIVE_ALLOCATION_STATUSES] },
        },
        _sum: { allocatedKg: true },
      });
      for (const row of allocations) {
        const s = sums.get(row.batchId)!;
        s.allocatedKg = toDecimal(row._sum.allocatedKg ?? 0);
      }

      const claims = await db.claim.groupBy({
        by: ['batchId', 'status'],
        where: {
          batchId: { in: ids },
          status: { in: [...LOCKING_CLAIM_STATUSES] },
        },
        _sum: { requestedKg: true, approvedKg: true },
      });
      for (const row of claims) {
        const s = sums.get(row.batchId)!;
        if (row.status === ClaimStatus.PENDING) {
          s.pendingClaimKg = toDecimal(s.pendingClaimKg).plus(
            row._sum.requestedKg ?? 0,
          );
        } else {
          s.approvedClaimKg = toDecimal(s.approvedClaimKg).plus(
            row._sum.approvedKg ?? 0,
          );
        }
      }
    }

    return new Map(
      batches.map((b) => [
        b.id,
        computePool(b.totalKg, b.schoolReserveKg, sums.get(b.id)!),
      ]),
    );
  }

  /**
   * How much of MAX_CLAIM_KG this taker has left to claim on this one batch
   * (Backend-Updates.md §E) — a running total, not "one claim per batch": PENDING claims
   * count their requestedKg, APPROVED/COLLECTED count their locked approvedKg. Lives here
   * rather than in ClaimsService so both Batches and Claims can use it without either
   * module depending on the other.
   */
  async allowanceLeftKgFor(
    batchId: string,
    takerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const map = await this.allowanceLeftKgForMany([batchId], takerId, tx);
    return map.get(batchId)!;
  }

  /** Batched version for list endpoints (no N+1) — same shape as forBatches above. */
  async allowanceLeftKgForMany(
    batchIds: string[],
    takerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, number>> {
    const db = tx ?? this.prisma;
    const used = new Map<string, Prisma.Decimal>(
      batchIds.map((id) => [id, new Prisma.Decimal(0)]),
    );

    if (batchIds.length > 0) {
      const rows = await db.claim.groupBy({
        by: ['batchId', 'status'],
        where: {
          batchId: { in: batchIds },
          takerId,
          status: { in: [...LOCKING_CLAIM_STATUSES] },
        },
        _sum: { requestedKg: true, approvedKg: true },
      });
      for (const row of rows) {
        const amount =
          row.status === ClaimStatus.PENDING
            ? (row._sum.requestedKg ?? 0)
            : (row._sum.approvedKg ?? 0);
        used.set(row.batchId, used.get(row.batchId)!.plus(amount));
      }
    }

    const cap = toDecimal(MAX_CLAIM_KG);
    return new Map(
      batchIds.map((id) => {
        const left = cap.minus(used.get(id)!);
        return [
          id,
          decimalToNumber(left.isNegative() ? new Prisma.Decimal(0) : left),
        ];
      }),
    );
  }
}
