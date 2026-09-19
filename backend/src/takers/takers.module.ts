import { Module } from '@nestjs/common';
import { TakersController } from './takers.controller';
import { TakersService } from './takers.service';

@Module({
  controllers: [TakersController],
  providers: [TakersService],
  exports: [TakersService],
})
export class TakersModule {}
