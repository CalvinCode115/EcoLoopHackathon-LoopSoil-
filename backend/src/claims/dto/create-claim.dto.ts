import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Max, Min } from 'class-validator';
import { MAX_CLAIM_KG, MIN_CLAIM_KG } from '../../common/constants';

export class CreateClaimDto {
  @IsUUID()
  batchId: string;

  /**
   * What the taker is asking for, NET kg. The manager may approve less.
   * Bounds here are a fast, clear 400 for wildly invalid input; the exact 0.1kg-step
   * check (which needs Decimal precision, not float-based class-validator rules) and the
   * running per-batch allowance check both live in ClaimsService — see assertValidClaimAmount.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(MIN_CLAIM_KG)
  @Max(MAX_CLAIM_KG)
  requestedKg: number;
}
