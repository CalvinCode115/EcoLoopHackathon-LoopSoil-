import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

/** Manager tops up a batch's stock (CLAUDE.md Part A: weekly, no daily counter). */
export class TopUpBatchDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(100000)
  kg: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
