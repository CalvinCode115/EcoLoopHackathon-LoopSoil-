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
import { ClaimsService } from './claims.service';
import { BulkApproveClaimsDto } from './dto/bulk-approve-claims.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import {
  ApproveClaimDto,
  CancelClaimDto,
  RejectClaimDto,
  UpdateClaimNoteDto,
} from './dto/decide-claim.dto';
import { ListClaimsQueryDto } from './dto/list-claims-query.dto';

@Controller('claims')
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  /** Taker submits a claim from an OPEN batch's public pool. */
  @Roles(UserRole.TAKER)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateClaimDto) {
    return this.claims.create(dto, user);
  }

  /** Manager: all claims (use `status=PENDING` for the queue). Taker: own claims. */
  @Get()
  list(@CurrentUser() user: User, @Query() q: ListClaimsQueryDto) {
    return this.claims.list(q, user);
  }

  /**
   * APPROVED claims with no active booking. Declared before `:id` so the literal
   * segment wins over the UUID param (which would otherwise 400 on "needs-booking").
   */
  @Roles(UserRole.MANAGER)
  @Get('needs-booking')
  needsBooking(@Query() q: ListClaimsQueryDto) {
    return this.claims.listNeedsBooking(q);
  }

  @Get(':id')
  getById(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.claims.getById(id, user);
  }

  @Roles(UserRole.MANAGER)
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveClaimDto,
  ) {
    return this.claims.approve(id, dto);
  }

  /** Approve several at once. Partial success — see the `skipped` list in the response. */
  @Roles(UserRole.MANAGER)
  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  bulkApprove(@Body() dto: BulkApproveClaimsDto) {
    return this.claims.bulkApprove(dto.claimIds);
  }

  @Roles(UserRole.MANAGER)
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectClaimDto) {
    return this.claims.reject(id, dto);
  }

  /** Taker cancels their own claim; manager can cancel any. Reason required. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelClaimDto,
  ) {
    return this.claims.cancel(id, dto, user);
  }

  @Roles(UserRole.MANAGER)
  @Patch(':id/manager-note')
  updateManagerNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClaimNoteDto,
  ) {
    return this.claims.updateManagerNote(id, dto);
  }
}
