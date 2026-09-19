import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BatchStatus } from '../../generated/prisma/client';

export class ListBatchesQueryDto extends PaginationQueryDto {
  /** Managers may filter by any status. Takers always get OPEN only. */
  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;
}
