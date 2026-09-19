import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Sent as multipart/form-data (fields + optional `photo` file), so every value arrives as a string. */
export class CreateHandoverDto {
  @IsUUID()
  bookingId: string;

  /** NET compost, weighed before bagging, tare excluded (CLAUDE.md §13). The only reported figure. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(1000)
  actualKg: number;

  /** When the handover actually happened; defaults to now. Cannot be in the future. */
  @IsOptional()
  @IsDateString()
  handedOverAt?: string;

  /** The taker acknowledged receipt on the spot. They can also confirm later themselves. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  takerConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Manager corrections after the fact (typo in the weight, extra context). */
export class UpdateHandoverDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(1000)
  actualKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListHandoversQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsUUID()
  takerId?: string;

  /** Inclusive lower bound on handedOverAt. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive upper bound on handedOverAt. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** `missingPhoto=true` — the integrity follow-up list. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  missingPhoto?: boolean;
}
