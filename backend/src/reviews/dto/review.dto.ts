import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
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
import { GrowingPlan, PickupEase } from '../../generated/prisma/client';

/** "Rate your pickup" — the taker reviews a collected claim. */
export class CreateReviewDto {
  /** The claim being reviewed; the server resolves its (live) handover. */
  @IsUUID()
  claimId: string;

  /** "How was the compost?" 1–5. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  compostRating: number;

  /** "Was pickup easy?" */
  @IsOptional()
  @IsEnum(PickupEase)
  pickupEase?: PickupEase;

  /** "What will you grow?" — any of the chips. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsEnum(GrowingPlan, { each: true })
  growing?: GrowingPlan[];

  /** "Anything to tell the SUSS team?" */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Filters shared by the manager list and the summary. */
export class ReviewFilterDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsUUID()
  takerId?: string;

  /** Exact star rating, e.g. `rating=1` for the complaints. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** `withNote=true` — only reviews that left a comment. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  withNote?: boolean;

  /** Inclusive bounds on when the review was sent. */
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
