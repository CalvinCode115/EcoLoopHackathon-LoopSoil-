import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DomainException } from '../common/errors/domain.exception';

/** Matches the bucket's allowedMimeTypes; phones produce JPEG/HEIC, browsers PNG/WebP. */
export const PHOTO_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Server-side Supabase client (service-role key — BACKEND ONLY, never sent to a browser).
 * Authentication stays with Supabase Auth; this is for Storage (handover photos).
 * The bucket is private: we store object paths and hand out short-lived signed URLs.
 */
@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  readonly admin: SupabaseClient;
  readonly handoverBucket: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL');
    const serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — check backend/.env',
      );
    }
    this.handoverBucket =
      config.get<string>('SUPABASE_HANDOVER_BUCKET') ?? 'handover-photos';
    this.admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** Validates type/size, uploads, returns the stored object path. */
  async uploadHandoverPhoto(
    path: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<string> {
    assertPhoto(file);
    const { error } = await this.admin.storage
      .from(this.handoverBucket)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) {
      this.logger.error(`Photo upload failed for ${path}: ${error.message}`);
      throw new DomainException(
        'PHOTO_UPLOAD_FAILED',
        'Could not store the handover photo — try again, or record without a photo and attach it later',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return path;
  }

  /** Best-effort cleanup when a write fails after its photo was already uploaded. */
  async removeHandoverPhoto(path: string): Promise<void> {
    const { error } = await this.admin.storage
      .from(this.handoverBucket)
      .remove([path]);
    if (error) {
      this.logger.warn(
        `Could not remove orphaned photo ${path}: ${error.message}`,
      );
    }
  }

  /** Fresh signed URLs for a set of stored paths (one round-trip). Unknown paths map to null. */
  async signedHandoverPhotoUrls(
    paths: string[],
  ): Promise<Map<string, string | null>> {
    const unique = [...new Set(paths.filter((p) => p.length > 0))];
    const result = new Map<string, string | null>();
    if (unique.length === 0) return result;

    const { data, error } = await this.admin.storage
      .from(this.handoverBucket)
      .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      this.logger.warn(
        `Could not sign photo URLs: ${error?.message ?? 'no data'}`,
      );
      for (const p of unique) result.set(p, null);
      return result;
    }
    for (const item of data) {
      if (item.path) result.set(item.path, item.error ? null : item.signedUrl);
    }
    return result;
  }
}

export function assertPhoto(file: { mimetype: string; size: number }): void {
  if (!PHOTO_MIME_TYPES.includes(file.mimetype)) {
    throw new DomainException(
      'PHOTO_TYPE_INVALID',
      `Photo must be one of ${PHOTO_MIME_TYPES.join(', ')}; got ${file.mimetype}`,
    );
  }
  if (file.size > PHOTO_MAX_BYTES) {
    throw new DomainException(
      'PHOTO_TOO_LARGE',
      `Photo must be at most ${PHOTO_MAX_BYTES / 1024 / 1024} MB`,
    );
  }
}

/** ".jpg" etc. from a MIME type, for the stored object name. */
export function photoExtension(mimetype: string): string {
  switch (mimetype) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    default:
      return 'bin';
  }
}
