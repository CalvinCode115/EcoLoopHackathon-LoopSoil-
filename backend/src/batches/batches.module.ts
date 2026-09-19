import { Module } from '@nestjs/common';
import { BatchPoolService } from './batch-pool.service';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';

@Module({
  controllers: [BatchesController],
  providers: [BatchesService, BatchPoolService],
  // BatchPoolService is the single source of pool math — allocations, claims and
  // handovers all import it rather than re-deriving kg.
  exports: [BatchesService, BatchPoolService],
})
export class BatchesModule {}
