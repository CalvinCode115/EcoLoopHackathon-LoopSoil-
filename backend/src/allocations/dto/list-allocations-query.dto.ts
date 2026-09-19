import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AllocationStatus } from '../../generated/prisma/client';

export class ListAllocationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsUUID()
  takerId?: string;

  @IsOptional()
  @IsEnum(AllocationStatus)
  status?: AllocationStatus;
}
