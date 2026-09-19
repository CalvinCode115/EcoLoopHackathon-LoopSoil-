import { Module } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { AllocationsController } from './allocations.controller';
import { AllocationsService } from './allocations.service';

@Module({
  imports: [BatchesModule], // for BatchPoolService
  controllers: [AllocationsController],
  providers: [AllocationsService],
  exports: [AllocationsService],
})
export class AllocationsModule {}
