import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsUUID, Max } from 'class-validator';

export class CreateClaimDto {
  @IsUUID()
  batchId: string;

  /** What the taker is asking for, NET kg. The manager may approve less. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(1000)
  requestedKg: number;
}
