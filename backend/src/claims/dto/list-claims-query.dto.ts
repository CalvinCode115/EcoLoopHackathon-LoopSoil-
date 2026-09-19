import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ClaimStatus } from '../../generated/prisma/client';

export class ListClaimsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  batchId?: string;

  /** Manager only — takers are always scoped to their own claims. */
  @IsOptional()
  @IsUUID()
  takerId?: string;

  /** `status=PENDING` is the manager's approval queue. */
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;
}
