import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ALLOCATION_TRANSITIONS } from '../allocations/allocations.service';
import { CLAIM_TRANSITIONS } from '../claims/claims.service';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import { nextSequence, yearMonthSG } from '../common/reference';
import {
  AllocationStatus,
  BookingStatus,
  ClaimStatus,
  Prisma,
  UserRole,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BOOKING_TRANSITIONS } from '../scheduling/bookings.service';
import { photoExtension, SupabaseService } from '../supabase/supabase.service';
import type {
  CreateHandoverDto,
  ListHandoversQueryDto,
  UpdateHandoverDto,
} from './dto/handover.dto';

/** What multer hands us for the `photo` field (memory storage). */
export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

const takerSummary = {
  select: { id: true, userId: true, name: true, type: true, category: true },
} as const;

const handoverInclude = {
  booking: {
    select: {
      id: true,
      status: true,
      bookedAt: true,
      slot: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          location: true,
          batch: { select: { id: true, reference: true, harvestDate: true } },
        },
      },
      claim: {
        select: {
          id: true,
          reference: true,
          status: true,
          approvedKg: true,
          taker: takerSummary,
        },
      },
      allocation: {
        select: {
          id: true,
          reference: true,
          status: true,
          allocatedKg: true,
          taker: takerSummary,
        },
      },
    },
  },
  handedOverBy: { select: { id: true, name: true } },
} satisfies Prisma.HandoverInclude;

type HandoverRow = Prisma.HandoverGetPayload<{
  include: typeof handoverInclude;
}>;

/** The stored row plus the flattened chain (batch, taker, expected kg) and a fresh signed photo URL. */
export type HandoverDetail = Omit<HandoverRow, 'photoUrl'> & {
  /** Object path in the private bucket (what the DB stores). */
  photoPath: string | null;
  /** Signed URL valid ~1h, or null when no photo. */
  photoUrl: string | null;
  batch: { id: string; reference: string; harvestDate: Date } | null;
  taker: {
    id: string;
    name: string;
    type: string;
    category: string | null;
  } | null;
  source: 'CLAIM' | 'ALLOCATION' | null;
  sourceReference: string | null;
  /** approvedKg (claim) or allocatedKg (allocation) — for spotting discrepancies vs actualKg. */
  expectedKg: number | null;
};

@Injectable()
export class HandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseService,
  ) {}

  /**
   * THE integrity write (CLAUDE.md §13). Photo is uploaded first so the row is born with
   * its evidence; then ONE transaction creates the Handover and flips Booking and
   * Claim/Allocation to COLLECTED. If the transaction fails the photo is removed again.
   */
  async create(
    dto: CreateHandoverDto,
    photo: UploadedPhoto | undefined,
    manager: User,
  ): Promise<HandoverDetail> {
    const handedOverAt = dto.handedOverAt
      ? new Date(dto.handedOverAt)
      : new Date();
    assertNotFuture(handedOverAt);

    // Fail fast (before any upload) if the booking cannot be collected.
    const preflight = await loadCollectableBooking(this.prisma, dto.bookingId);

    let photoPath: string | null = null;
    if (photo) {
      photoPath = await this.storage.uploadHandoverPhoto(
        photoObjectPath(
          preflight.slot.batch.reference,
          preflight.id,
          photo.mimetype,
        ),
        photo,
      );
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Re-validate inside the transaction — state may have moved since preflight.
        const booking = await loadCollectableBooking(tx, dto.bookingId);

        await tx.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.COLLECTED },
        });
        if (booking.claim) {
          await tx.claim.update({
            where: { id: booking.claim.id },
            data: { status: ClaimStatus.COLLECTED, collectedAt: handedOverAt },
          });
        }
        if (booking.allocation) {
          await tx.allocation.update({
            where: { id: booking.allocation.id },
            data: {
              status: AllocationStatus.COLLECTED,
              collectedAt: handedOverAt,
            },
          });
        }

        const reference = await nextHandoverReference(tx, handedOverAt);
        return tx.handover.create({
          data: {
            reference,
            bookingId: booking.id,
            actualKg: dto.actualKg,
            photoUrl: photoPath,
            handedOverById: manager.id,
            handedOverAt,
            takerConfirmed: dto.takerConfirmed ?? false,
            note: dto.note,
          },
          include: handoverInclude,
        });
      });
      return (await this.present([row]))[0];
    } catch (err) {
      if (photoPath) await this.storage.removeHandoverPhoto(photoPath);
      throw err;
    }
  }

  /** Attach (or replace) the photo after the fact — the integrity follow-up. */
  async attachPhoto(id: string, photo: UploadedPhoto): Promise<HandoverDetail> {
    const existing = await this.prisma.handover.findUnique({
      where: { id },
      include: handoverInclude,
    });
    if (!existing) throw new NotFoundException('Handover not found');

    const batchRef = existing.booking?.slot.batch.reference ?? 'unlinked';
    const newPath = await this.storage.uploadHandoverPhoto(
      photoObjectPath(
        batchRef,
        existing.bookingId ?? existing.id,
        photo.mimetype,
      ),
      photo,
    );
    const row = await this.prisma.handover.update({
      where: { id },
      data: { photoUrl: newPath },
      include: handoverInclude,
    });
    if (existing.photoUrl) {
      await this.storage.removeHandoverPhoto(existing.photoUrl);
    }
    return (await this.present([row]))[0];
  }

  /** Managers: everything (filterable). Takers: their own collections. */
  async list(
    q: ListHandoversQueryDto,
    user: User,
  ): Promise<Paginated<HandoverDetail>> {
    const where: Prisma.HandoverWhereInput = {
      ...(q.from || q.to
        ? {
            handedOverAt: {
              gte: q.from ? new Date(q.from) : undefined,
              lte: q.to ? new Date(q.to) : undefined,
            },
          }
        : {}),
      ...(q.missingPhoto ? { photoUrl: null } : {}),
      ...(q.batchId ? { booking: { slot: { batchId: q.batchId } } } : {}),
      ...(q.takerId
        ? {
            booking: {
              OR: [
                { claim: { takerId: q.takerId } },
                { allocation: { takerId: q.takerId } },
              ],
            },
          }
        : {}),
      ...(user.role === UserRole.TAKER
        ? { booking: { claim: { taker: { userId: user.id } } } }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.handover.count({ where }),
      this.prisma.handover.findMany({
        where,
        include: handoverInclude,
        orderBy: { handedOverAt: 'desc' },
        ...pageArgs(q),
      }),
    ]);
    return paginated(await this.present(rows), total, q);
  }

  async getById(id: string, user: User): Promise<HandoverDetail> {
    const row = await this.prisma.handover.findUnique({
      where: { id },
      include: handoverInclude,
    });
    if (!row || !canSee(row, user)) {
      throw new NotFoundException('Handover not found');
    }
    return (await this.present([row]))[0];
  }

  /** Two-party attestation: the taker confirms they received it. */
  async confirm(id: string, user: User): Promise<HandoverDetail> {
    await this.getById(id, user); // ownership check
    const row = await this.prisma.handover.update({
      where: { id },
      data: { takerConfirmed: true },
      include: handoverInclude,
    });
    return (await this.present([row]))[0];
  }

  /** Manager correction (e.g. a mistyped weight). `updatedAt` records that it was edited. */
  async update(id: string, dto: UpdateHandoverDto): Promise<HandoverDetail> {
    const existing = await this.prisma.handover.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Handover not found');
    const row = await this.prisma.handover.update({
      where: { id },
      data: { actualKg: dto.actualKg, note: dto.note },
      include: handoverInclude,
    });
    return (await this.present([row]))[0];
  }

  // ─── presentation ─────────────────────────────────────────────────────────

  private async present(rows: HandoverRow[]): Promise<HandoverDetail[]> {
    const paths = rows.map((r) => r.photoUrl).filter((p): p is string => !!p);
    const signed = await this.storage.signedHandoverPhotoUrls(paths);
    return rows.map((row) => {
      const { photoUrl: photoPath, ...rest } = row;
      const claim = row.booking?.claim ?? null;
      const allocation = row.booking?.allocation ?? null;
      const taker = claim?.taker ?? allocation?.taker ?? null;
      return {
        ...rest,
        photoPath,
        photoUrl: photoPath ? (signed.get(photoPath) ?? null) : null,
        batch: row.booking?.slot.batch ?? null,
        taker: taker
          ? {
              id: taker.id,
              name: taker.name,
              type: taker.type,
              category: taker.category,
            }
          : null,
        source: claim ? 'CLAIM' : allocation ? 'ALLOCATION' : null,
        sourceReference: claim?.reference ?? allocation?.reference ?? null,
        expectedKg: claim
          ? claim.approvedKg
          : allocation
            ? allocation.allocatedKg
            : null,
      };
    });
  }
}

// ─── rules (unit-tested) ──────────────────────────────────────────────────────

const collectableInclude = {
  claim: { select: { id: true, reference: true, status: true } },
  allocation: { select: { id: true, reference: true, status: true } },
  slot: { select: { batch: { select: { reference: true } } } },
  handover: { select: { id: true, reference: true } },
} satisfies Prisma.BookingInclude;

/**
 * A booking can be handed over only if it is BOOKED, has no handover yet, and its claim
 * (APPROVED) or allocation (CONFIRMED) may legally move to COLLECTED (§11).
 */
export async function loadCollectableBooking(
  db: Prisma.TransactionClient | PrismaService,
  bookingId: string,
): Promise<Prisma.BookingGetPayload<{ include: typeof collectableInclude }>> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: collectableInclude,
  });
  if (!booking) throw new NotFoundException('Booking not found');
  if (booking.handover) {
    throw new DomainException(
      'HANDOVER_EXISTS',
      `This booking was already handed over as ${booking.handover.reference}`,
      HttpStatus.CONFLICT,
    );
  }
  assertTransition(
    'Booking',
    BOOKING_TRANSITIONS,
    booking.status,
    BookingStatus.COLLECTED,
  );
  if (booking.claim) {
    assertTransition(
      'Claim',
      CLAIM_TRANSITIONS,
      booking.claim.status,
      ClaimStatus.COLLECTED,
    );
  }
  if (booking.allocation) {
    assertTransition(
      'Allocation',
      ALLOCATION_TRANSITIONS,
      booking.allocation.status,
      AllocationStatus.COLLECTED,
    );
  }
  return booking;
}

export function assertNotFuture(handedOverAt: Date): void {
  if (handedOverAt.getTime() > Date.now() + 60_000) {
    throw new DomainException(
      'HANDOVER_IN_FUTURE',
      'handedOverAt cannot be in the future',
    );
  }
}

/** "2026-09-A/<bookingId>-<timestamp>.jpg" — grouped by batch in the bucket. */
export function photoObjectPath(
  batchReference: string,
  bookingId: string,
  mimetype: string,
): string {
  return `${batchReference}/${bookingId}-${Date.now()}.${photoExtension(mimetype)}`;
}

/** "HND-2026-09-001" — per handover month, Singapore time. */
async function nextHandoverReference(
  tx: Prisma.TransactionClient,
  handedOverAt: Date,
): Promise<string> {
  const { year, month } = yearMonthSG(handedOverAt);
  const prefix = `HND-${year}-${month}-`;
  const existing = await tx.handover.findMany({
    where: { reference: { startsWith: prefix } },
    select: { reference: true },
  });
  return nextSequence(
    prefix,
    existing.map((h) => h.reference),
  );
}

function canSee(row: HandoverRow, user: User): boolean {
  if (user.role === UserRole.MANAGER) return true;
  return row.booking?.claim?.taker.userId === user.id;
}
