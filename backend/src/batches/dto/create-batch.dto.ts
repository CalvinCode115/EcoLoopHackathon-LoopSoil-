import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/;

export class CreateBatchDto {
  /** Human label, e.g. "2026-09-A". Auto-generated from the harvest month if omitted. */
  @IsOptional()
  @Matches(REFERENCE_PATTERN, {
    message: 'reference must be 2-40 letters, digits or hyphens',
  })
  reference?: string;

  @IsDateString()
  harvestDate: string;

  /** Usable compost harvested, NET kg. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(100000)
  totalKg: number;

  /** Carved off first for the SUSS rooftop garden (CLAUDE.md §3). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  schoolReserveKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  bagSizeKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(14)
  phReading?: number;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @IsDateString()
  availableUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pickupLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
