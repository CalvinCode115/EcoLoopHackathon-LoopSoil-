import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, type User } from '../generated/prisma/client';
import { BookingsService } from './bookings.service';
import {
  CancelBookingDto,
  CreateBookingDto,
  ListBookingsQueryDto,
  RescheduleBookingDto,
} from './dto/booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** Taker: own APPROVED claim. Manager: any claim, or a CONFIRMED allocation. */
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateBookingDto) {
    return this.bookings.create(dto, user);
  }

  /** Runs the collection-deadline sweep now (the cron does this every 30 min). */
  @Roles(UserRole.MANAGER)
  @Post('expire-overdue')
  @HttpCode(HttpStatus.OK)
  expireOverdue() {
    return this.bookings.expireOverdue();
  }

  @Get()
  list(@CurrentUser() user: User, @Query() q: ListBookingsQueryDto) {
    return this.bookings.list(q, user);
  }

  @Get(':id')
  getById(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.getById(id, user);
  }

  /** Move to another slot, or re-activate a booking whose slot was cancelled. */
  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  reschedule(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.bookings.reschedule(id, dto, user);
  }

  /** Free the seat; the claim / allocation stays live. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.cancel(id, dto, user);
  }

  /** Didn't turn up: booking → NO_SHOW, claim / allocation released, kg freed. */
  @Roles(UserRole.MANAGER)
  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  markNoShow(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.markNoShow(id);
  }
}
