import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Sent as multipart/form-data (fields + required `photo` file), so every value arrives as a string. */
export class CreateHandoverDto {
  @IsUUID()
  bookingId: string;

  /**
   * Bag breakdown. The server computes NET `actualKg = 0.5*halfKgBags + oneKgBags + looseKg`
   * (tare excluded) — actualKg is never entered directly.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  halfKgBags?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  oneKgBags?: number;

  /** Unbagged remainder, weighed. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1000)
  looseKg?: number;

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

/** Manager corrections after the fact (miscounted bags, extra context). */
export class UpdateHandoverDto {
  /**
   * Corrected bag breakdown — omitted fields keep their stored value and actualKg
   * is recomputed from the result.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  halfKgBags?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  oneKgBags?: number;

  /** Unbagged remainder, weighed. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1000)
  looseKg?: number;

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
