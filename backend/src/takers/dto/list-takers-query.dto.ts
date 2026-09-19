import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TakerStatus, TakerType } from '../../generated/prisma/client';

export class ListTakersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TakerType)
  type?: TakerType;

  @IsOptional()
  @IsEnum(TakerStatus)
  status?: TakerStatus;

  /** Case-insensitive match on name or email. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
