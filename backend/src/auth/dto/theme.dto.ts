import { IsEnum } from 'class-validator';
import { ThemePreference } from '../../generated/prisma/client';

/** PATCH /auth/me/theme — the manager's light/dark switch. */
export class UpdateThemeDto {
  @IsEnum(ThemePreference)
  theme: ThemePreference;
}
