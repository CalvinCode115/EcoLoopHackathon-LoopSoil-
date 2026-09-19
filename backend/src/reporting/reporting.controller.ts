import { Controller, Get, Header, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { ImpactQueryDto, TopTakersQueryDto } from './dto/reporting-query.dto';
import { ReportingService } from './reporting.service';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  /** Aggregate impact (Σ actualKg, beneficiaries, breakdowns). No personal data → any logged-in user. */
  @Get('impact')
  impact(@Query() q: ImpactQueryDto) {
    return this.reporting.impact(q);
  }

  /** Who collected the most — has names, so manager only. */
  @Roles(UserRole.MANAGER)
  @Get('top-takers')
  topTakers(@Query() q: TopTakersQueryDto) {
    return this.reporting.topTakers(q, q.limit);
  }

  /** Counts of everything awaiting the manager: vetting, approvals, bookings, overdue, photos. */
  @Roles(UserRole.MANAGER)
  @Get('pipeline')
  pipeline() {
    return this.reporting.pipeline();
  }

  /** The Waste Diary export — one row per weighed handover. Opens straight in Excel / Sheets. */
  @Roles(UserRole.MANAGER)
  @Get('waste-diary.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="loopsoil-waste-diary.csv"',
  )
  wasteDiary(@Query() q: ImpactQueryDto) {
    return this.reporting.wasteDiaryCsv(q);
  }
}
