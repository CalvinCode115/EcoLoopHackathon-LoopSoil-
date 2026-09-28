import { Module } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { ManagerController } from './manager.controller';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { SearchService } from './search.service';

@Module({
  // BatchPoolService for the dashboard's open-batch pools.
  imports: [BatchesModule],
  controllers: [ReportingController, ManagerController],
  providers: [ReportingService, SearchService],
})
export class ReportingModule {}
