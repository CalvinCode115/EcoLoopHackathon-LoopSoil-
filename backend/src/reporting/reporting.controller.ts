import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, type User } from '../generated/prisma/client';
import {
  CreateSavedViewDto,
  ImpactQueryDto,
  ReportQueryDto,
  TopTakersQueryDto,
} from './dto/reporting-query.dto';
import { ReportingService } from './reporting.service';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  /** Aggregate impact (Σ actualKg, beneficiaries, breakdowns). No personal data → any logged-in user. */
  @Get('impact')
  impact(@Query() q: ImpactQueryDto) {
    return this.reporting.impact(q);
  }

  /**
   * KPIs vs the previous period, 7-week sparklines, weekly kg and kg by recipient group —
   * the Dashboard's figures and the Reports overview. Defaults to this month to date.
   */
  @Roles(UserRole.MANAGER)
  @Get('analytics')
  analytics(@Query() q: ReportQueryDto) {
    return this.reporting.analytics(q);
  }

  /** Every Reports section (impact, supply, funnel, pickups, takers) for a period + filters. */
  @Roles(UserRole.MANAGER)
  @Get('report')
  report(@Query() q: ReportQueryDto) {
    return this.reporting.report(q);
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

  /** The manager's saved Reports views ("Saved view" dropdown). */
  @Roles(UserRole.MANAGER)
  @Get('views')
  views(@CurrentUser() user: User) {
    return this.reporting.listViews(user);
  }

  @Roles(UserRole.MANAGER)
  @Post('views')
  saveView(@CurrentUser() user: User, @Body() dto: CreateSavedViewDto) {
    return this.reporting.saveView(user, dto);
  }

  @Roles(UserRole.MANAGER)
  @Delete('views/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteView(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reporting.deleteView(user, id);
  }
}
