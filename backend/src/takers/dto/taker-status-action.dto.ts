import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveTakerDto {
  /** Optional — approving is the default, happy-path decision. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  statusReason?: string;
}

export class DeclineTakerDto {
  /** Free text, not an enum (Backend-Updates.md §C2) — required, unlike approve. */
  @IsString()
  @MaxLength(500)
  statusReason: string;
}

export class SuspendTakerDto {
  @IsString()
  @MaxLength(500)
  statusReason: string;
}

export class ReinstateTakerDto {
  /** Optional — e.g. "appeal accepted", but not required to lift a suspension. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  statusReason?: string;
}
