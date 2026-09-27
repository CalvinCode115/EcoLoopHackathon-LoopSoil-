import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SlotStatus } from '../../generated/prisma/client';

export class CreateSlotDto {
  /** Optional: omit for a general availability window not tied to one harvest. */
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  /** Overrides the batch's pickupLocation for this slot only. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  /** Max bookings in this window — the heart of the booking system (CLAUDE.md §9). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CancelSlotDto {
  /** Shown to the people whose bookings are cancelled ("please rebook"). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class UpdateSlotDto extends PartialType(
  OmitType(CreateSlotDto, ['batchId'] as const),
) {}

export class ListSlotsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  batchId?: string;

  /** Managers may filter by any status. Takers always get OPEN only. */
  @IsOptional()
  @IsEnum(SlotStatus)
  status?: SlotStatus;

  /** `upcoming=true` hides slots that have already ended. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  upcoming?: boolean;

  /** Calendar window: slots starting at or after `from` … */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** … and before `to` (ISO datetimes). */
  @IsOptional()
  @IsDateString()
  to?: string;
}
