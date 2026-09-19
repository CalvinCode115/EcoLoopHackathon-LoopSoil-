import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AllocationsModule } from './allocations/allocations.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BatchesModule } from './batches/batches.module';
import { ClaimsModule } from './claims/claims.module';
import { HandoversModule } from './handovers/handovers.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportingModule } from './reporting/reporting.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SupabaseModule } from './supabase/supabase.module';
import { TakersModule } from './takers/takers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // enables @Cron (collection-deadline sweep)
    PrismaModule,
    SupabaseModule,
    AuthModule,
    TakersModule,
    BatchesModule,
    AllocationsModule,
    ClaimsModule,
    SchedulingModule,
    HandoversModule,
    ReportingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
