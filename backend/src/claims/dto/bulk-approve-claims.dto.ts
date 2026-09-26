import { ArrayMinSize, ArrayUnique, IsUUID } from 'class-validator';

/** Approve several claims at once. Partial success (Backend-Updates.md §E) — see ClaimsService.bulkApprove. */
export class BulkApproveClaimsDto {
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  claimIds: string[];
}
