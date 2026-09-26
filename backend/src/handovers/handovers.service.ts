import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ALLOCATION_TRANSITIONS } from '../allocations/allocations.service';
import { CLAIM_TRANSITIONS } from '../claims/claims.service';
import { HANDOVER_OVER_TOLERANCE } from '../common/constants';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import {
  decimalExceeds,
  decimalToNumber,
  toDecimal,
  type DecimalValue,
} from '../common/kg';
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

const batchSummary = {
  select: { id: true, reference: true, harvestDate: true },
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
          batch: batchSummary,
        },
      },
      claim: {
        select: {
          id: true,
          reference: true,
          status: true,
          approvedKg: true,
          taker: takerSummary,
          batch: batchSummary,
        },
      },
      allocation: {
        select: {
          id: true,
          reference: true,
          status: true,
          allocatedKg: true,
          taker: takerSummary,
          batch: batchSummary,
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
export type HandoverDetail = Omit<
  HandoverRow,
  'photoUrl' | 'actualKg' | 'looseKg'
> & {
  actualKg: number;
  looseKg: number;
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
   * THE integrity write (CLAUDE.md §13). A photo is required and uploaded first so the row
   * is born with its evidence; then ONE transaction creates the Handover and flips Booking
   * and Claim/Allocation to COLLECTED. If the transaction fails the photo is removed again.
   * actualKg is computed from the bag breakdown and may exceed the approved/allocated kg
   * by at most HANDOVER_OVER_TOLERANCE.
   */
  async create(
    dto: CreateHandoverDto,
    photo: UploadedPhoto | undefined,
    manager: User,
  ): Promise<HandoverDetail> {
    if (!photo) {
      throw new DomainException(
        'PHOTO_REQUIRED',
        'A handover photo is required',
      );
    }
    const halfKgBags = dto.halfKgBags ?? 0;
    const oneKgBags = dto.oneKgBags ?? 0;
    const looseKg = toDecimal(dto.looseKg ?? 0);
    const actualKg = computeActualKg(halfKgBags, oneKgBags, looseKg);
    const handedOverAt = dto.handedOverAt
      ? new Date(dto.handedOverAt)
      : new Date();
    assertNotFuture(handedOverAt);

    // Fail fast (before any upload) if the booking cannot be collected.
    const preflight = await loadCollectableBooking(this.prisma, dto.bookingId);
    assertWithinTolerance(actualKg, expectedKgOf(preflight));

    const photoPath = await this.storage.uploadHandoverPhoto(
      photoObjectPath(
        batchReferenceOf(preflight),
        preflight.id,
        photo.mimetype,
      ),
      photo,
    );

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Re-validate inside the transaction — state may have moved since preflight.
        const booking = await loadCollectableBooking(tx, dto.bookingId);
        assertWithinTolerance(actualKg, expectedKgOf(booking));

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
            actualKg,
            halfKgBags,
            oneKgBags,
            looseKg,
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
      await this.storage.removeHandoverPhoto(photoPath);
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

    const batchRef = existing.booking
      ? batchReferenceOf(existing.booking)
      : 'unlinked';
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
      // AND, not spread: each of these filters on `booking` and would overwrite the others.
      // Batch comes from the claim/allocation — a general slot has no batch of its own.
      AND: [
        q.batchId
          ? {
              booking: {
                OR: [
                  { claim: { batchId: q.batchId } },
                  { allocation: { batchId: q.batchId } },
                ],
              },
            }
          : {},
        q.takerId
          ? {
              booking: {
                OR: [
                  { claim: { takerId: q.takerId } },
                  { allocation: { takerId: q.takerId } },
                ],
              },
            }
          : {},
        user.role === UserRole.TAKER
          ? { booking: { claim: { taker: { userId: user.id } } } }
          : {},
      ],
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

  /**
   * Manager correction (e.g. miscounted bags). Omitted bag fields keep their stored value;
   * actualKg is recomputed and re-checked against the tolerance. `updatedAt` records the edit.
   */
  async update(id: string, dto: UpdateHandoverDto): Promise<HandoverDetail> {
    const existing = await this.prisma.handover.findUnique({
      where: { id },
      include: handoverInclude,
    });
    if (!existing) throw new NotFoundException('Handover not found');

    const halfKgBags = dto.halfKgBags ?? existing.halfKgBags;
    const oneKgBags = dto.oneKgBags ?? existing.oneKgBags;
    const looseKg = toDecimal(dto.looseKg ?? existing.looseKg);
    const actualKg = computeActualKg(halfKgBags, oneKgBags, looseKg);
    if (existing.booking) {
      assertWithinTolerance(actualKg, expectedKgOf(existing.booking));
    }

    const row = await this.prisma.handover.update({
      where: { id },
      data: { actualKg, halfKgBags, oneKgBags, looseKg, note: dto.note },
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
      const expectedKg = row.booking ? expectedKgOf(row.booking) : null;
      return {
        ...rest,
        actualKg: decimalToNumber(row.actualKg),
        looseKg: decimalToNumber(row.looseKg),
        photoPath,
        photoUrl: photoPath ? (signed.get(photoPath) ?? null) : null,
        batch:
          row.booking?.slot.batch ?? claim?.batch ?? allocation?.batch ?? null,
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
        expectedKg: expectedKg === null ? null : decimalToNumber(expectedKg),
      };
    });
  }
}

// ─── rules (unit-tested) ──────────────────────────────────────────────────────

const collectableInclude = {
  claim: {
    select: {
      id: true,
      reference: true,
      status: true,
      approvedKg: true,
      batch: { select: { reference: true } },
    },
  },
  allocation: {
    select: {
      id: true,
      reference: true,
      status: true,
      allocatedKg: true,
      batch: { select: { reference: true } },
    },
  },
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

/** NET kg from the bag breakdown: 0.5 x half-kg bags + 1 x one-kg bags + loose. */
export function computeActualKg(
  halfKgBags: number,
  oneKgBags: number,
  looseKg: DecimalValue,
): Prisma.Decimal {
  const total = toDecimal(halfKgBags)
    .times(0.5)
    .plus(oneKgBags)
    .plus(toDecimal(looseKg));
  if (!total.greaterThan(0)) {
    throw new DomainException(
      'HANDOVER_EMPTY',
      'Enter at least one bag or some loose kg',
    );
  }
  return total;
}

/** actualKg may exceed the approved/allocated kg by at most HANDOVER_OVER_TOLERANCE (10%). */
export function assertWithinTolerance(
  actualKg: DecimalValue,
  expectedKg: DecimalValue | null,
): void {
  if (expectedKg === null) return;
  const ceiling = toDecimal(expectedKg).times(1 + HANDOVER_OVER_TOLERANCE);
  if (decimalExceeds(actualKg, ceiling)) {
    throw new DomainException(
      'HANDOVER_OVER_TOLERANCE',
      `Handed-over ${decimalToNumber(actualKg)} kg exceeds the ${decimalToNumber(expectedKg)} kg ` +
        `approved by more than ${HANDOVER_OVER_TOLERANCE * 100}%`,
    );
  }
}

/** approvedKg (claim) or allocatedKg (allocation); null for a claim not yet approved. */
function expectedKgOf(booking: {
  claim: { approvedKg: DecimalValue | null } | null;
  allocation: { allocatedKg: DecimalValue } | null;
}): DecimalValue | null {
  return booking.claim?.approvedKg ?? booking.allocation?.allocatedKg ?? null;
}

/** Folder for the photo: the slot's batch, else the claim/allocation's (general slots). */
function batchReferenceOf(booking: {
  slot: { batch: { reference: string } | null };
  claim: { batch: { reference: string } } | null;
  allocation: { batch: { reference: string } } | null;
}): string {
  return (
    booking.slot.batch?.reference ??
    booking.claim?.batch.reference ??
    booking.allocation?.batch.reference ??
    'general'
  );
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
