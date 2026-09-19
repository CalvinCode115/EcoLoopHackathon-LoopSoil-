import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { AllocationsService } from './allocations.service';
import { CancelAllocationDto } from './dto/cancel-allocation.dto';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { ListAllocationsQueryDto } from './dto/list-allocations-query.dto';
import { UpdateAllocationDto } from './dto/update-allocation.dto';

/** Bulk orgs have no login (CLAUDE.md §8), so every allocation action is the manager's. */
@Roles(UserRole.MANAGER)
@Controller('allocations')
export class AllocationsController {
  constructor(private readonly allocations: AllocationsService) {}

  @Post()
  create(@Body() dto: CreateAllocationDto) {
    return this.allocations.create(dto);
  }

  @Get()
  list(@Query() q: ListAllocationsQueryDto) {
    return this.allocations.list(q);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.allocations.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAllocationDto,
  ) {
    return this.allocations.update(id, dto);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.allocations.confirm(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAllocationDto,
  ) {
    return this.allocations.cancel(id, dto);
  }
}
