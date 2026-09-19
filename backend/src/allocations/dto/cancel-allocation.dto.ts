import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAllocationDto {
  /** Why it fell through — optional for allocations (required reasons apply to claims). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
