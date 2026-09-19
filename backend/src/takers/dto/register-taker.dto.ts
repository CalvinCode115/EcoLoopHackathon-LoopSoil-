import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** An individual completing their profile after Supabase sign-up. Lands as PENDING (CLAUDE.md §20). */
export class RegisterTakerDto {
  /** Display name — overrides whatever the login provider supplied. */
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  /** Contact number for pickup coordination (WhatsApp). Stored on User and Taker. */
  @IsOptional()
  @IsString()
  @Length(3, 30)
  phone?: string;

  /** What the compost is for — helps the manager vet and prioritise. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  intendedUse?: string;
}
