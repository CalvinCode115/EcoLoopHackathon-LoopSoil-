import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CancellationReason,
  RejectionReason,
} from '../../generated/prisma/client';

export class ApproveClaimDto {
  /** Locked amount. Defaults to requestedKg; may be less, never more. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  approvedKg?: number;

  /** e.g. "only 3kg avail — WhatsApp 9XXX to confirm" (CLAUDE.md §9). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  managerNote?: string;
}

export class RejectClaimDto {
  @IsEnum(RejectionReason)
  rejectionReason: RejectionReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  managerNote?: string;
}

export class CancelClaimDto {
  @IsEnum(CancellationReason)
  cancellationReason: CancellationReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;
}

export class UpdateClaimNoteDto {
  /** Send an empty string to clear the note. */
  @IsString()
  @MaxLength(500)
  managerNote: string;
}
