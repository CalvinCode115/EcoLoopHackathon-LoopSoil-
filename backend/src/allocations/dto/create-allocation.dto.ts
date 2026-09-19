import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { REFERENCE_PATTERN } from '../../batches/dto/create-batch.dto';

export class CreateAllocationDto {
  @IsUUID()
  batchId: string;

  /** Must be a BULK taker — individuals receive compost through claims. */
  @IsUUID()
  takerId: string;

  /** Agreed amount, set directly by the manager (no request/approval step). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(100000)
  allocatedKg: number;

  /** e.g. "ALC-2026-09-A-NParks". Auto-generated from batch + taker if omitted. */
  @IsOptional()
  @Matches(REFERENCE_PATTERN, {
    message: 'reference must be 2-40 letters, digits or hyphens',
  })
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
