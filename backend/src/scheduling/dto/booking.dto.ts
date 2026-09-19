import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BookingStatus } from '../../generated/prisma/client';

/** Exactly one of claimId / allocationId (enforced in the service, CLAUDE.md §13). */
export class CreateBookingDto {
  @IsUUID()
  slotId: string;

  /** An APPROVED claim — the taker's own, or any claim when the manager books on their behalf. */
  @IsOptional()
  @IsUUID()
  claimId?: string;

  /** A CONFIRMED bulk allocation — manager only (bulk orgs have no login). */
  @IsOptional()
  @IsUUID()
  allocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RescheduleBookingDto {
  @IsUUID()
  slotId: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListBookingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  slotId?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
