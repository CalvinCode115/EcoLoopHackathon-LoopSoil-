import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, type User } from '../generated/prisma/client';
import {
  CreateSlotDto,
  ListSlotsQueryDto,
  UpdateSlotDto,
} from './dto/slot.dto';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Roles(UserRole.MANAGER)
  @Post()
  create(@Body() dto: CreateSlotDto) {
    return this.slots.create(dto);
  }

  /** Takers: OPEN slots on visible batches, with remaining capacity. Managers: all. */
  @Get()
  list(@CurrentUser() user: User, @Query() q: ListSlotsQueryDto) {
    return this.slots.list(q, user);
  }

  @Get(':id')
  getById(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.slots.getById(id, user);
  }

  @Roles(UserRole.MANAGER)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlotDto) {
    return this.slots.update(id, dto);
  }

  @Roles(UserRole.MANAGER)
  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  open(@Param('id', ParseUUIDPipe) id: string) {
    return this.slots.open(id);
  }

  @Roles(UserRole.MANAGER)
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.slots.close(id);
  }

  /** Cancels the slot and its bookings; claims/allocations stay live for rebooking. */
  @Roles(UserRole.MANAGER)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.slots.cancel(id);
  }

  @Roles(UserRole.MANAGER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.slots.remove(id);
  }
}
