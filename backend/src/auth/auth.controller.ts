import { Controller, Get } from '@nestjs/common';
import type { User } from '../generated/prisma/client';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  /** Who am I? The frontend calls this after login to learn the user's role. */
  @Get('me')
  me(@CurrentUser() user: User): User {
    return user;
  }
}
