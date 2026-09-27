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
  SlotStatus,
  UserRole,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BOOKING_TRANSITIONS } from '../scheduling/bookings.service';
import { photoExtension, SupabaseService } from '../supabase/supabase.service';
import { assessLookup, type LookupIssue } from './handover-lookup';
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

const lookupBooking = {
  select: {
    id: true,
    status: true,
    collectionDeadline: true,
    slot: {
      select: { id: true, startTime: true, endTime: true, location: true },
    },
    handover: {
      select: {
        id: true,
        reference: true,
        actualKg: true,
        handedOverAt: true,
        handedOverBy: { select: { name: true } },
      },
    },
  },
} as const;

const lookupTaker = {
  select: { id: true, name: true, phone: true, type: true, status: true },
} as const;

const lookupBatch = {
  select: { id: true, reference: true, pickupLocation: true },
} as const;

/** GET /handovers/lookup response. `canRecord` is false whenever any issue is blocking. */
export interface HandoverLookup {
  kind: 'CLAIM' | 'ALLOCATION';
  id: string;
  reference: string;
  status: string;
  /** Approved (claim) or allocated (allocation) kg — what should be handed over. */
  kg: number;
  requestedKg: number | null;
  decidedAt: Date | null;
  taker: {
    id: string;
    name: string;
    phone: string | null;
    type: string;
    status: string;
  };
  batch: { id: string; reference: string; pickupLocation: string | null };
  booking: {
    id: string;
    status: string;
    collectionDeadline: Date | null;
    slot: {
      id: string;
      startTime: Date;
      endTime: Date;
      location: string | null;
    };
  } | null;
  handover: {
    id: string;
    reference: string;
    actualKg: number;
    handedOverAt: Date;
    handedOverBy: string;
  } | null;
  canRecord: boolean;
  issues: LookupIssue[];
}

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
    const actualKg = assertActualKg(dto.actualKg);
    const handedOverAt = dto.handedOverAt
      ? new Date(dto.handedOverAt)
      : new Date();
    assertNotFuture(handedOverAt);

    // Fail fast (before any upload) if the target cannot be collected.
    const preflight = await resolveTarget(this.prisma, dto);
    const preflightInfo =
      preflight.kind === 'booking'
        ? await loadCollectableBooking(this.prisma, preflight.bookingId).then(
            (b) => ({
              expectedKg: expectedKgOf(b),
              batchReference: batchReferenceOf(b),
              pathId: b.id,
            }),
          )
        : preflight;
    assertWithinTolerance(actualKg, preflightInfo.expectedKg);

    const photoPath = await this.storage.uploadHandoverPhoto(
      photoObjectPath(
        preflightInfo.batchReference,
        preflightInfo.pathId,
        photo.mimetype,
      ),
      photo,
    );

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Re-validate inside the transaction — state may have moved since preflight.
        const target = await resolveTarget(tx, dto);
        const bookingId =
          target.kind === 'booking'
            ? target.bookingId
            : await bookWalkIn(tx, target, handedOverAt, manager);
        const booking = await loadCollectableBooking(tx, bookingId);
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

  /**
   * Pickup-pass QR / typed reference → claim (CLM-…) or bulk allocation (ALC-…), with
   * everything the handover screen needs and a verdict. 404 when nothing matches.
   */
  async lookup(code: string, now = new Date()): Promise<HandoverLookup> {
    const reference = code.trim();
    const match = {
      reference: { equals: reference, mode: 'insensitive' as const },
    };
    const claim = await this.prisma.claim.findFirst({
      where: match,
      include: {
        taker: lookupTaker,
        batch: lookupBatch,
        booking: lookupBooking,
      },
    });
    const allocation = claim
      ? null
      : await this.prisma.allocation.findFirst({
          where: match,
          include: {
            taker: lookupTaker,
            batch: lookupBatch,
            booking: lookupBooking,
          },
        });
    const row = claim ?? allocation;
    if (!row) {
      throw new NotFoundException(`No pickup found for "${reference}"`);
    }

    const booking = row.booking;
    const issues = assessLookup(
      {
        kind: claim ? 'CLAIM' : 'ALLOCATION',
        status: row.status,
        takerStatus: row.taker.status,
        booking: booking
          ? {
              status: booking.status,
              collectionDeadline: booking.collectionDeadline,
              slotStart: booking.slot.startTime,
            }
          : null,
        hasHandover: !!booking?.handover,
      },
      now,
    );
    const kg = claim
      ? (claim.approvedKg ?? claim.requestedKg).toNumber()
      : allocation!.allocatedKg.toNumber();

    return {
      kind: claim ? 'CLAIM' : 'ALLOCATION',
      id: row.id,
      reference: row.reference,
      status: row.status,
      kg,
      requestedKg: claim ? claim.requestedKg.toNumber() : null,
      decidedAt: claim ? claim.decidedAt : null,
      taker: row.taker,
      batch: row.batch,
      booking: booking
        ? {
            id: booking.id,
            status: booking.status,
            collectionDeadline: booking.collectionDeadline,
            slot: booking.slot,
          }
        : null,
      handover: booking?.handover
        ? {
            id: booking.handover.id,
            reference: booking.handover.reference,
            actualKg: booking.handover.actualKg.toNumber(),
            handedOverAt: booking.handover.handedOverAt,
            handedOverBy: booking.handover.handedOverBy.name,
          }
        : null,
      canRecord: !issues.some((i) => i.blocking),
      issues,
    };
  }

  /**
   * The success screen's Undo, within UNDO_WINDOW_MS of recording. Reverses the COLLECTED
   * flip in one transaction: booking → BOOKED, claim → APPROVED / allocation → CONFIRMED.
   * The handover row is kept for audit (`undoneAt`) but detached from the booking so the
   * pickup can be recorded again; its photo is deleted.
   */
  async undo(
    id: string,
    now = new Date(),
  ): Promise<{ id: string; reference: string; undoneAt: Date }> {
    const existing = await this.prisma.handover.findUnique({
      where: { id },
      include: {
        booking: { select: { id: true, claimId: true, allocationId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Handover not found');
    if (existing.undoneAt) {
      throw new DomainException(
        'HANDOVER_UNDONE',
        'This handover was already undone',
        HttpStatus.CONFLICT,
      );
    }
    if (now.getTime() - existing.createdAt.getTime() > UNDO_WINDOW_MS) {
      throw new DomainException(
        'UNDO_EXPIRED',
        'Too late to undo — edit the handover instead',
        HttpStatus.CONFLICT,
      );
    }
    const booking = existing.booking;
    await this.prisma.$transaction(async (tx) => {
      await tx.handover.update({
        where: { id },
        data: { undoneAt: now, bookingId: null, photoUrl: null },
      });
      if (!booking) return;
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.BOOKED },
      });
      if (booking.claimId) {
        await tx.claim.update({
          where: { id: booking.claimId },
          data: { status: ClaimStatus.APPROVED, collectedAt: null },
        });
      }
      if (booking.allocationId) {
        await tx.allocation.update({
          where: { id: booking.allocationId },
          data: { status: AllocationStatus.CONFIRMED, collectedAt: null },
        });
      }
    });
    if (existing.photoUrl)
      await this.storage.removeHandoverPhoto(existing.photoUrl);
    return { id, reference: existing.reference, undoneAt: now };
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
      undoneAt: null, // an undone handover never happened (row kept only for audit)
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

    if (existing.undoneAt) {
      throw new DomainException(
        'HANDOVER_UNDONE',
        'This handover was undone and can no longer be edited',
        HttpStatus.CONFLICT,
      );
    }
    const halfKgBags = dto.halfKgBags ?? existing.halfKgBags;
    const oneKgBags = dto.oneKgBags ?? existing.oneKgBags;
    const looseKg = toDecimal(dto.looseKg ?? existing.looseKg);
    const actualKg =
      dto.actualKg !== undefined
        ? assertActualKg(dto.actualKg)
        : toDecimal(existing.actualKg);
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

const WALK_IN_MINUTES = 30;

interface WalkInTarget {
  kind: 'walk-in';
  claimId: string | null;
  allocationId: string | null;
  /** A leftover booking row (e.g. its slot was cancelled) — claimId/allocationId are unique on Booking, so it is reused. */
  existingBookingId: string | null;
  batchId: string;
  batchReference: string;
  expectedKg: DecimalValue;
  pathId: string;
}

type HandoverTarget = { kind: 'booking'; bookingId: string } | WalkInTarget;

/**
 * Which booking a handover goes against. A claim/allocation that already has a BOOKED
 * booking just uses it; otherwise it is a walk-in, validated here (APPROVED claim /
 * CONFIRMED allocation, not handed over yet) before anything is written.
 */
export async function resolveTarget(
  db: Prisma.TransactionClient | PrismaService,
  dto: Pick<CreateHandoverDto, 'bookingId' | 'claimId' | 'allocationId'>,
): Promise<HandoverTarget> {
  const given = [dto.bookingId, dto.claimId, dto.allocationId].filter(Boolean);
  if (given.length !== 1) {
    throw new DomainException(
      'HANDOVER_TARGET',
      'Send exactly one of bookingId, claimId or allocationId',
    );
  }
  if (dto.bookingId) return { kind: 'booking', bookingId: dto.bookingId };

  const booking = {
    select: {
      id: true,
      status: true,
      handover: { select: { reference: true } },
    },
  } as const;
  const batch = { select: { id: true, reference: true } } as const;
  const source = dto.claimId
    ? await db.claim.findUnique({
        where: { id: dto.claimId },
        select: { id: true, status: true, approvedKg: true, batch, booking },
      })
    : await db.allocation.findUnique({
        where: { id: dto.allocationId },
        select: { id: true, status: true, allocatedKg: true, batch, booking },
      });
  if (!source) {
    throw new NotFoundException(
      dto.claimId ? 'Claim not found' : 'Allocation not found',
    );
  }
  if (source.booking?.handover) {
    throw new DomainException(
      'HANDOVER_EXISTS',
      `This was already handed over as ${source.booking.handover.reference}`,
      HttpStatus.CONFLICT,
    );
  }
  if (source.booking?.status === BookingStatus.BOOKED) {
    return { kind: 'booking', bookingId: source.booking.id };
  }
  if ('approvedKg' in source) {
    assertTransition(
      'Claim',
      CLAIM_TRANSITIONS,
      source.status,
      ClaimStatus.COLLECTED,
    );
  } else {
    assertTransition(
      'Allocation',
      ALLOCATION_TRANSITIONS,
      source.status,
      AllocationStatus.COLLECTED,
    );
  }
  return {
    kind: 'walk-in',
    claimId: dto.claimId ?? null,
    allocationId: dto.allocationId ?? null,
    existingBookingId: source.booking?.id ?? null,
    batchId: source.batch.id,
    batchReference: source.batch.reference,
    expectedKg:
      'approvedKg' in source ? source.approvedKg! : source.allocatedKg,
    pathId: source.id,
  };
}

/**
 * Every booking needs a slot, so a walk-in gets its own: capacity 1, CLOSED (nobody else
 * can book it), starting at the handover time. The booking is then BOOKED so the normal
 * COLLECTED flip applies. Runs inside the handover transaction.
 */
async function bookWalkIn(
  tx: Prisma.TransactionClient,
  target: WalkInTarget,
  handedOverAt: Date,
  manager: User,
): Promise<string> {
  const slot = await tx.pickupSlot.create({
    data: {
      batchId: target.batchId,
      startTime: handedOverAt,
      endTime: new Date(handedOverAt.getTime() + WALK_IN_MINUTES * 60_000),
      capacity: 1,
      status: SlotStatus.CLOSED,
      note: 'Walk-in handover (no pickup was booked)',
    },
  });
  if (target.existingBookingId) {
    await tx.booking.update({
      where: { id: target.existingBookingId },
      data: {
        slotId: slot.id,
        status: BookingStatus.BOOKED,
        cancelNote: null,
        rescheduledAt: handedOverAt,
      },
    });
    return target.existingBookingId;
  }
  const booking = await tx.booking.create({
    data: {
      slotId: slot.id,
      claimId: target.claimId,
      allocationId: target.allocationId,
      status: BookingStatus.BOOKED,
      bookedById: manager.id,
      note: 'Walk-in handover',
    },
  });
  return booking.id;
}

/** The scale reading must be a positive NET kg (the DTO checks too; this guards direct calls). */
export function assertActualKg(actualKg: number | undefined): Prisma.Decimal {
  const total = toDecimal(actualKg ?? 0);
  if (!total.greaterThan(0)) {
    throw new DomainException('HANDOVER_EMPTY', 'Enter the kg handed over');
  }
  return total;
}

/** How long after recording a handover can still be undone (the success screen's Undo). */
export const UNDO_WINDOW_MS = 30_000;

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
