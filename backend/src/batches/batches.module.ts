import { Module } from '@nestjs/common';
import { TakersModule } from '../takers/takers.module';
import { BatchPoolService } from './batch-pool.service';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';

@Module({
  // TakersModule has no imports of its own, so this cannot create a cycle — needed to
  // resolve the current user's Taker record for the allowanceLeftKg field on responses.
  imports: [TakersModule],
  controllers: [BatchesController],
  providers: [BatchesService, BatchPoolService],
  // BatchPoolService is the single source of pool math — allocations, claims and
  // handovers all import it rather than re-deriving kg.
  exports: [BatchesService, BatchPoolService],
})
export class BatchesModule {}
