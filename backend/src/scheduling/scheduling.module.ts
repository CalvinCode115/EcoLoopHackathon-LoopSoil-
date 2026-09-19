import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { DeadlineCron } from './deadline.cron';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({
  controllers: [SlotsController, BookingsController],
  providers: [SlotsService, BookingsService, DeadlineCron],
  exports: [SlotsService, BookingsService],
})
export class SchedulingModule {}
