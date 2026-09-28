import { Injectable } from '@nestjs/common';
import { BatchPoolService } from '../batches/batch-pool.service';
import { decimalToNumber } from '../common/kg';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const PER_GROUP = 5;

export interface SearchResults {
  query: string;
  claims: {
    id: string;
    reference: string;
    status: string;
    kg: number;
    takerName: string;
    batchReference: string;
  }[];
  allocations: {
    id: string;
    reference: string;
    status: string;
    kg: number;
    takerName: string;
    batchId: string;
    batchReference: string;
  }[];
  takers: {
    id: string;
    name: string;
    type: string;
    status: string;
    claims: number;
    allocations: number;
  }[];
  batches: {
    id: string;
    reference: string;
    status: string;
    kgRemaining: number;
  }[];
}

/**
 * GET /manager/search?q= — the sidebar search ("Search claims, takers, batches…"). Matches
 * claim / allocation references and taker names, taker name / email / phone, and batch
 * references (case-insensitive, substring). Up to 5 per group, most recent first.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pools: BatchPoolService,
  ) {}

  async search(raw: string): Promise<SearchResults> {
    const q = raw.trim();
    const empty = {
      query: q,
      claims: [],
      allocations: [],
      takers: [],
      batches: [],
    };
    if (q.length < 2) return empty;

    const has = { contains: q, mode: Prisma.QueryMode.insensitive };
    // "Batch 3" / "batch 2026-09-C" → search the reference part too.
    const batchQ = q.replace(/^batch\s+/i, '');
    const digits = q.replace(/\D/g, '');
    const takerMatch: Prisma.TakerWhereInput = {
      OR: [
        { name: has },
        { email: has },
        ...(digits.length >= 4
          ? [{ phone: { contains: digits.slice(-8) } }]
          : []),
      ],
    };

    const [claims, allocations, takers, batches] = await Promise.all([
      this.prisma.claim.findMany({
        where: { OR: [{ reference: has }, { taker: { name: has } }] },
        orderBy: { submittedAt: 'desc' },
        take: PER_GROUP,
        select: {
          id: true,
          reference: true,
          status: true,
          requestedKg: true,
          approvedKg: true,
          taker: { select: { name: true } },
          batch: { select: { reference: true } },
        },
      }),
      this.prisma.allocation.findMany({
        where: { OR: [{ reference: has }, { taker: { name: has } }] },
        orderBy: { createdAt: 'desc' },
        take: PER_GROUP,
        select: {
          id: true,
          reference: true,
          status: true,
          allocatedKg: true,
          batchId: true,
          taker: { select: { name: true } },
          batch: { select: { reference: true } },
        },
      }),
      this.prisma.taker.findMany({
        where: takerMatch,
        orderBy: { name: 'asc' },
        take: PER_GROUP,
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          _count: { select: { claims: true, allocations: true } },
        },
      }),
      this.prisma.batch.findMany({
        where: {
          reference: { contains: batchQ, mode: Prisma.QueryMode.insensitive },
        },
        orderBy: { harvestDate: 'desc' },
        take: PER_GROUP,
      }),
    ]);
    const pools = await this.pools.forBatches(batches);

    return {
      query: q,
      claims: claims.map((c) => ({
        id: c.id,
        reference: c.reference,
        status: c.status,
        kg: decimalToNumber(c.approvedKg ?? c.requestedKg),
        takerName: c.taker.name,
        batchReference: c.batch.reference,
      })),
      allocations: allocations.map((a) => ({
        id: a.id,
        reference: a.reference,
        status: a.status,
        kg: decimalToNumber(a.allocatedKg),
        takerName: a.taker.name,
        batchId: a.batchId,
        batchReference: a.batch.reference,
      })),
      takers: takers.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        status: t.status,
        claims: t._count.claims,
        allocations: t._count.allocations,
      })),
      batches: batches.map((b) => ({
        id: b.id,
        reference: b.reference,
        status: b.status,
        kgRemaining: Math.max(0, pools.get(b.id)?.kgRemaining ?? 0),
      })),
    };
  }
}
