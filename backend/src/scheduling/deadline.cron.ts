import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';

/**
 * Collection-deadline cron (CLAUDE.md §13): overdue BOOKED bookings become NO_SHOW and
 * their claim / allocation is released so the kg returns to the pool — with zero manager
 * effort. The sweep itself lives in BookingsService so it can be unit-tested and run on
 * demand via POST /bookings/expire-overdue.
 */
@Injectable()
export class DeadlineCron {
  private readonly logger = new Logger(DeadlineCron.name);

  constructor(private readonly bookings: BookingsService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweep(): Promise<void> {
    try {
      await this.bookings.expireOverdue();
    } catch (err) {
      this.logger.error(
        'Deadline sweep failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
