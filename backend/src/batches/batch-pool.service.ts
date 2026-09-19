import { Injectable } from '@nestjs/common';
import { roundKg } from '../common/kg';
import {
  AllocationStatus,
  ClaimStatus,
  type Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Live pool figures for a batch (CLAUDE.md §12). Never stored — always derived:
 *
 *   publicPoolKg = totalKg − schoolReserveKg − allocatedKg
 *   kgRemaining  = publicPoolKg − pendingClaimKg − approvedClaimKg
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
  allocatedKg: number;
  pendingClaimKg: number;
  approvedClaimKg: number;
}

/** Pure math — unit-tested against the §12 worked example. */
export function computePool(
  totalKg: number,
  schoolReserveKg: number,
  sums: PoolSums,
): BatchPool {
  const allocatedKg = roundKg(sums.allocatedKg);
  const pendingClaimKg = roundKg(sums.pendingClaimKg);
  const approvedClaimKg = roundKg(sums.approvedClaimKg);
  const publicPoolKg = roundKg(totalKg - schoolReserveKg - allocatedKg);
  const kgRemaining = roundKg(publicPoolKg - pendingClaimKg - approvedClaimKg);
  return {
    totalKg: roundKg(totalKg),
    schoolReserveKg: roundKg(schoolReserveKg),
    allocatedKg,
    publicPoolKg,
    pendingClaimKg,
    approvedClaimKg,
    kgRemaining,
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
    const sums = new Map<string, PoolSums>(
      ids.map((id) => [
        id,
        { allocatedKg: 0, pendingClaimKg: 0, approvedClaimKg: 0 },
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
        sums.get(row.batchId)!.allocatedKg = row._sum.allocatedKg ?? 0;
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
          s.pendingClaimKg += row._sum.requestedKg ?? 0;
        } else {
          s.approvedClaimKg += row._sum.approvedKg ?? 0;
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
}
