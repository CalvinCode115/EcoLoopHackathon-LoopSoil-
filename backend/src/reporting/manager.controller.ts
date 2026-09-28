import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { SearchQueryDto } from './dto/reporting-query.dto';
import { ReportingService } from './reporting.service';
import { SearchService } from './search.service';

@Controller('manager')
export class ManagerController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly searchService: SearchService,
  ) {}

  /** The manager home screen in one call: impact totals, pipeline, open pools, recent handovers. */
  @Roles(UserRole.MANAGER)
  @Get('dashboard')
  dashboard() {
    return this.reporting.dashboard();
  }

  /** Sidebar search across claims, allocations, takers and batches (5 per group). */
  @Roles(UserRole.MANAGER)
  @Get('search')
  search(@Query() q: SearchQueryDto) {
    return this.searchService.search(q.q);
  }
}
