import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  MaxLength,
} from 'class-validator';
import { TakerCategory } from '../../generated/prisma/client';

/** A bulk organisation (NParks, town council, school…) — a record the manager keeps; no login. */
export class CreateBulkTakerDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @IsEnum(TakerCategory)
  category: TakerCategory;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Length(3, 30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  intendedUse?: string;

  /** Standing monthly demand in kg — informs how much to allocate each batch. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(100000)
  monthlyKgTarget?: number;
}
