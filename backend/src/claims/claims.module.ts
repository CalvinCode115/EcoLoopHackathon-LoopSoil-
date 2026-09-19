import { Module } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { TakersModule } from '../takers/takers.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [BatchesModule, TakersModule], // BatchPoolService + the taker vetting gate
  controllers: [ClaimsController],
  providers: [ClaimsService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
