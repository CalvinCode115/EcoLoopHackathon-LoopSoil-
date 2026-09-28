import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { TakerCategory, TakerType } from '../../generated/prisma/client';

/** Optional handedOverAt window; omit both for all-time figures. */
export class ImpactQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TopTakersQueryDto extends ImpactQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}

/** Reports filters: period + batch / taker type / bulk category. */
export class ReportQueryDto extends ImpactQueryDto {
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsEnum(TakerType)
  takerType?: TakerType;

  @IsOptional()
  @IsEnum(TakerCategory)
  category?: TakerCategory;
}

/** POST /reporting/views — a named set of Reports filters. */
export class CreateSavedViewDto {
  @IsString()
  @MaxLength(80)
  name: string;

  /** The filter state as the frontend keeps it (range, compare, batch, taker type, category). */
  @IsObject()
  filters: Record<string, unknown>;
}

/** GET /manager/search?q= */
export class SearchQueryDto {
  @IsString()
  @MaxLength(80)
  q: string;
}
