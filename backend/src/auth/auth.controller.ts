import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UserRole, type User } from '../generated/prisma/client';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { UpdateThemeDto } from './dto/theme.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Who am I? The frontend calls this after login to learn the user's role (and `theme`). */
  @Get('me')
  me(@CurrentUser() user: User): User {
    return user;
  }

  /** Save the manager's light/dark choice on their account, so it survives log-out. */
  @Roles(UserRole.MANAGER)
  @Patch('me/theme')
  setTheme(
    @CurrentUser() user: User,
    @Body() dto: UpdateThemeDto,
  ): Promise<User> {
    return this.auth.setTheme(user.id, dto.theme);
  }
}
