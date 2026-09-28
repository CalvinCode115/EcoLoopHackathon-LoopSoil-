import type { BatchPoolService } from '../batches/batch-pool.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SearchService } from './search.service';

function setup() {
  const prisma = {
    claim: { findMany: jest.fn().mockResolvedValue([]) },
    allocation: { findMany: jest.fn().mockResolvedValue([]) },
    taker: { findMany: jest.fn().mockResolvedValue([]) },
    batch: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const pools = { forBatches: jest.fn().mockResolvedValue(new Map()) };
  const service = new SearchService(
    prisma as unknown as PrismaService,
    pools as unknown as BatchPoolService,
  );
  return { service, prisma };
}

describe('SearchService', () => {
  it('ignores queries shorter than 2 characters', async () => {
    const { service, prisma } = setup();
    const r = await service.search(' a ');
    expect(r.claims).toEqual([]);
    expect(prisma.claim.findMany).not.toHaveBeenCalled();
  });

  it('matches "Batch 3" against the batch reference "3"', async () => {
    const { service, prisma } = setup();
    await service.search('Batch 3');
    expect(prisma.batch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reference: { contains: '3', mode: 'insensitive' } },
      }),
    );
  });
});
