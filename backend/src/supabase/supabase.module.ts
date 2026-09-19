import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

/** Global like PrismaModule — storage (and later admin-auth ops) are shared infrastructure. */
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
