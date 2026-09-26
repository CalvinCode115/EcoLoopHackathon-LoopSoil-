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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, type User } from '../generated/prisma/client';
import { CreateBulkTakerDto } from './dto/create-bulk-taker.dto';
import { ListTakersQueryDto } from './dto/list-takers-query.dto';
import { RegisterTakerDto } from './dto/register-taker.dto';
import {
  ApproveTakerDto,
  DeclineTakerDto,
  ReinstateTakerDto,
  SuspendTakerDto,
} from './dto/taker-status-action.dto';
import { UpdateTakerDto } from './dto/update-taker.dto';
import { TakersService } from './takers.service';

/**
 * Manager-only by default; the self-service routes below override that per method.
 * NOTE: `/takers/me` and `/takers/register` are declared before `/takers/:id` so the
 * literal segments win over the UUID param.
 */
@Roles(UserRole.MANAGER)
@Controller('takers')
export class TakersController {
  constructor(private readonly takers: TakersService) {}

  // ─── individual self-service ─────────────────────────────────────────────

  @Roles(UserRole.TAKER)
  @Post('register')
  register(@CurrentUser() user: User, @Body() dto: RegisterTakerDto) {
    return this.takers.register(dto, user);
  }

  @Roles(UserRole.TAKER)
  @Get('me')
  me(@CurrentUser() user: User) {
    return this.takers.getMine(user);
  }

  @Roles(UserRole.TAKER)
  @Patch('me')
  updateMe(@CurrentUser() user: User, @Body() dto: RegisterTakerDto) {
    return this.takers.updateMine(dto, user);
  }

  // ─── manager ─────────────────────────────────────────────────────────────

  @Post('bulk')
  createBulk(@CurrentUser() user: User, @Body() dto: CreateBulkTakerDto) {
    return this.takers.createBulk(dto, user);
  }

  @Get()
  list(@Query() q: ListTakersQueryDto) {
    return this.takers.list(q);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.takers.getById(id);
  }

  /** Profile fields only — vetting decisions go through the actions below. */
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTakerDto) {
    return this.takers.update(id, dto);
  }

  /** PENDING → APPROVED, or REJECTED → APPROVED (manager reconsiders). */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveTakerDto,
  ) {
    return this.takers.approve(id, dto, user);
  }

  /** PENDING → REJECTED. Cancels any active claims/allocations and frees the kg. */
  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineTakerDto,
  ) {
    return this.takers.decline(id, dto, user);
  }

  /** APPROVED → SUSPENDED. Cancels any active claims/allocations and frees the kg. */
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendTakerDto,
  ) {
    return this.takers.suspend(id, dto, user);
  }

  /** SUSPENDED → APPROVED. */
  @Post(':id/reinstate')
  @HttpCode(HttpStatus.OK)
  reinstate(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReinstateTakerDto,
  ) {
    return this.takers.reinstate(id, dto, user);
  }
}
