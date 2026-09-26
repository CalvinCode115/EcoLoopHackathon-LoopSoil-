import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { ReportingService } from './reporting.service';

@Controller('manager')
export class ManagerController {
  constructor(private readonly reporting: ReportingService) {}

  /** The manager home screen in one call: impact totals, pipeline, open pools, recent handovers. */
  @Roles(UserRole.MANAGER)
  @Get('dashboard')
  dashboard() {
    return this.reporting.dashboard();
  }
}
