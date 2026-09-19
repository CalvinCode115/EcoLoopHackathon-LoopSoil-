import { Module } from '@nestjs/common';
import { HandoversController } from './handovers.controller';
import { HandoversService } from './handovers.service';

/** PrismaModule and SupabaseModule are global, so nothing to import here. */
@Module({
  controllers: [HandoversController],
  providers: [HandoversService],
  exports: [HandoversService],
})
export class HandoversModule {}
