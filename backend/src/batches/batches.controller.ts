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
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { ListBatchesQueryDto } from './dto/list-batches-query.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Roles(UserRole.MANAGER)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateBatchDto) {
    return this.batches.create(dto, user);
  }

  /** Managers: any status (filterable). Takers: OPEN batches only. */
  @Get()
  list(@CurrentUser() user: User, @Query() q: ListBatchesQueryDto) {
    return this.batches.list(q, user);
  }

  @Get(':id')
  getById(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.getById(id, user);
  }

  @Roles(UserRole.MANAGER)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBatchDto) {
    return this.batches.update(id, dto);
  }

  @Roles(UserRole.MANAGER)
  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  open(@Param('id', ParseUUIDPipe) id: string) {
    return this.batches.open(id);
  }

  @Roles(UserRole.MANAGER)
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.batches.close(id);
  }

  @Roles(UserRole.MANAGER)
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.batches.complete(id);
  }

  @Roles(UserRole.MANAGER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.batches.remove(id);
  }
}
