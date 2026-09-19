import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import {
  AllocationStatus,
  BookingStatus,
  CancellationReason,
  ClaimStatus,
  Prisma,
  SlotStatus,
  TakerType,
  UserRole,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CancelBookingDto,
  CreateBookingDto,
  ListBookingsQueryDto,
  RescheduleBookingDto,
} from './dto/booking.dto';
import { ACTIVE_BOOKING_STATUSES } from './slots.service';

/** CLAUDE.md §11. COLLECTED is only ever set by the handovers module. */
export const BOOKING_TRANSITIONS: Record<
  BookingStatus,
  readonly BookingStatus[]
> = {
  BOOKED: [
    BookingStatus.COLLECTED,
    BookingStatus.NO_SHOW,
    BookingStatus.CANCELLED,
  ],
  COLLECTED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

/** Days after the slot ends before an uncollected booking is treated as a no-show (§13). */
export const GRACE_DAYS: Record<TakerType, number> = {
  INDIVIDUAL: 2,
  BULK: 7,
};

const AUTO_CANCEL_NOTE = 'Auto-cancelled: pickup not collected by the deadline';

const takerContact = {
  select: { id: true, userId: true, name: true, phone: true, type: true },
} as const;

const bookingInclude = {
  slot: {
    select: {
      id: true,
      startTime: true,
      endTime: true,
      location: true,
      status: true,
      batch: { select: { id: true, reference: true, pickupLocation: true } },
    },
  },
  claim: {
    select: {
      id: true,
      reference: true,
      status: true,
      approvedKg: true,
      batchId: true,
      taker: takerContact,
    },
  },
  allocation: {
    select: {
      id: true,
      reference: true,
      status: true,
      allocatedKg: true,
      batchId: true,
      taker: takerContact,
    },
  },
  handover: { select: { id: true, actualKg: true, handedOverAt: true } },
} satisfies Prisma.BookingInclude;

export type BookingDetail = Prisma.BookingGetPayload<{
  include: typeof bookingInclude;
}>;

const slotForBooking = {
  _count: {
    select: {
      bookings: { where: { status: { in: [...ACTIVE_BOOKING_STATUSES] } } },
    },
  },
} satisfies Prisma.PickupSlotInclude;

type SlotForBooking = Prisma.PickupSlotGetPayload<{
  include: typeof slotForBooking;
}>;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserve a seat in a slot for exactly one APPROVED claim or CONFIRMED allocation.
   * Capacity is checked inside the transaction (count-then-insert — fine for the pilot,
   * a DB constraint is the documented scale-up step, CLAUDE.md §17).
   */
  async create(dto: CreateBookingDto, user: User): Promise<BookingDetail> {
    if (Boolean(dto.claimId) === Boolean(dto.allocationId)) {
      throw new DomainException(
        'BOOKING_TARGET_REQUIRED',
        'Provide exactly one of claimId or allocationId',
      );
    }
    if (dto.allocationId && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Only the manager books pickups for bulk allocations',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.pickupSlot.findUnique({
        where: { id: dto.slotId },
        include: slotForBooking,
      });
      if (!slot) throw new NotFoundException('Pickup slot not found');

      const target = dto.claimId
        ? await this.loadClaimTarget(tx, dto.claimId, user)
        : await this.loadAllocationTarget(tx, dto.allocationId!);

      assertSlotBookable(slot, target.batchId, new Date());

      return tx.booking.create({
        data: {
          slotId: slot.id,
          claimId: dto.claimId,
          allocationId: dto.allocationId,
          collectionDeadline: collectionDeadlineFor(
            slot.endTime,
            target.takerType,
          ),
          note: dto.note,
        },
        include: bookingInclude,
      });
    });
  }

  /** Managers: all (filterable). Takers: bookings on their own claims. */
  async list(
    q: ListBookingsQueryDto,
    user: User,
  ): Promise<Paginated<BookingDetail>> {
    const where: Prisma.BookingWhereInput = {
      slotId: q.slotId,
      status: q.status,
      ...(q.batchId ? { slot: { batchId: q.batchId } } : {}),
      ...(user.role === UserRole.TAKER
        ? { claim: { taker: { userId: user.id } } }
        : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: { slot: { startTime: 'asc' } },
        ...pageArgs(q),
      }),
    ]);
    return paginated(data, total, q);
  }

  async getById(id: string, user: User): Promise<BookingDetail> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking || !canSee(booking, user)) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  /**
   * Move a booking to another slot. Also how a taker rebooks after the manager cancelled
   * a slot: the CANCELLED row is re-activated (Booking.claimId is unique — one row per claim).
   */
  reschedule(
    id: string,
    dto: RescheduleBookingDto,
    user: User,
  ): Promise<BookingDetail> {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        include: bookingInclude,
      });
      if (!booking || !canSee(booking, user)) {
        throw new NotFoundException('Booking not found');
      }
      if (
        booking.status !== BookingStatus.BOOKED &&
        booking.status !== BookingStatus.CANCELLED
      ) {
        throw new DomainException(
          'BOOKING_LOCKED',
          `A ${booking.status} booking cannot be rescheduled`,
          HttpStatus.CONFLICT,
        );
      }
      const target = booking.claim ?? booking.allocation!;
      const targetActive = booking.claim
        ? booking.claim.status === ClaimStatus.APPROVED
        : booking.allocation!.status === AllocationStatus.CONFIRMED;
      if (!targetActive) {
        throw new DomainException(
          'TARGET_NOT_ACTIVE',
          `${target.reference} is ${target.status} — nothing left to collect`,
          HttpStatus.CONFLICT,
        );
      }
      if (
        dto.slotId === booking.slotId &&
        booking.status === BookingStatus.BOOKED
      ) {
        return booking; // already there
      }

      const slot = await tx.pickupSlot.findUnique({
        where: { id: dto.slotId },
        include: slotForBooking,
      });
      if (!slot) throw new NotFoundException('Pickup slot not found');
      assertSlotBookable(slot, target.batchId, new Date());

      return tx.booking.update({
        where: { id },
        data: {
          slotId: slot.id,
          status: BookingStatus.BOOKED,
          bookedAt: new Date(),
          collectionDeadline: collectionDeadlineFor(
            slot.endTime,
            target.taker.type,
          ),
        },
        include: bookingInclude,
      });
    });
  }

  /** Free the seat. The claim / allocation stays live so the person can rebook. */
  async cancel(
    id: string,
    dto: CancelBookingDto,
    user: User,
  ): Promise<BookingDetail> {
    const booking = await this.getById(id, user);
    assertTransition(
      'Booking',
      BOOKING_TRANSITIONS,
      booking.status,
      BookingStatus.CANCELLED,
    );
    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED, note: dto.note ?? booking.note },
      include: bookingInclude,
    });
  }

  /**
   * They didn't turn up. Booking → NO_SHOW and the claim / allocation is released so the
   * kg flows back to the pool (CLAUDE.md §11, §13). Manager-triggered or by the cron.
   */
  markNoShow(id: string): Promise<BookingDetail> {
    return this.prisma.$transaction((tx) => this.expireBooking(tx, id));
  }

  /**
   * The deadline sweep: every BOOKED booking whose collectionDeadline has passed becomes
   * a NO_SHOW and its kg is freed. Each booking is its own transaction so one failure
   * never blocks the rest. Called by DeadlineCron and by POST /bookings/expire-overdue.
   */
  async expireOverdue(
    now: Date = new Date(),
  ): Promise<{ expired: number; references: string[] }> {
    const overdue = await this.prisma.booking.findMany({
      where: { status: BookingStatus.BOOKED, collectionDeadline: { lt: now } },
      select: { id: true },
    });
    const references: string[] = [];
    for (const { id } of overdue) {
      try {
        const b = await this.prisma.$transaction((tx) =>
          this.expireBooking(tx, id),
        );
        references.push((b.claim ?? b.allocation)?.reference ?? id);
      } catch (err) {
        this.logger.error(
          `Failed to expire booking ${id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    if (references.length > 0) {
      this.logger.log(
        `Expired ${references.length} overdue booking(s): ${references.join(', ')}`,
      );
    }
    return { expired: references.length, references };
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async expireBooking(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<BookingDetail> {
    const booking = await tx.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    assertTransition(
      'Booking',
      BOOKING_TRANSITIONS,
      booking.status,
      BookingStatus.NO_SHOW,
    );

    if (booking.claim && booking.claim.status === ClaimStatus.APPROVED) {
      await tx.claim.update({
        where: { id: booking.claim.id },
        data: {
          status: ClaimStatus.CANCELLED,
          cancellationReason: CancellationReason.CANNOT_MAKE_PICKUP,
          reasonNote: AUTO_CANCEL_NOTE,
          cancelledAt: new Date(),
        },
      });
    }
    if (
      booking.allocation &&
      (booking.allocation.status === AllocationStatus.PLANNED ||
        booking.allocation.status === AllocationStatus.CONFIRMED)
    ) {
      await tx.allocation.update({
        where: { id: booking.allocation.id },
        data: { status: AllocationStatus.CANCELLED, note: AUTO_CANCEL_NOTE },
      });
    }

    return tx.booking.update({
      where: { id },
      data: { status: BookingStatus.NO_SHOW },
      include: bookingInclude,
    });
  }

  private async loadClaimTarget(
    tx: Prisma.TransactionClient,
    claimId: string,
    user: User,
  ): Promise<{ batchId: string; takerType: TakerType }> {
    const claim = await tx.claim.findUnique({
      where: { id: claimId },
      include: { taker: takerContact, booking: { select: { status: true } } },
    });
    if (
      !claim ||
      (user.role === UserRole.TAKER && claim.taker.userId !== user.id)
    ) {
      throw new NotFoundException('Claim not found');
    }
    if (claim.status !== ClaimStatus.APPROVED) {
      throw new DomainException(
        'CLAIM_NOT_APPROVED',
        `Claim ${claim.reference} is ${claim.status} — only APPROVED claims can book a pickup`,
        HttpStatus.CONFLICT,
      );
    }
    if (claim.booking) {
      throw new DomainException(
        'BOOKING_EXISTS',
        `Claim ${claim.reference} already has a ${claim.booking.status} booking — reschedule it instead`,
        HttpStatus.CONFLICT,
      );
    }
    return { batchId: claim.batchId, takerType: claim.taker.type };
  }

  private async loadAllocationTarget(
    tx: Prisma.TransactionClient,
    allocationId: string,
  ): Promise<{ batchId: string; takerType: TakerType }> {
    const allocation = await tx.allocation.findUnique({
      where: { id: allocationId },
      include: { taker: takerContact, booking: { select: { status: true } } },
    });
    if (!allocation) throw new NotFoundException('Allocation not found');
    if (allocation.status !== AllocationStatus.CONFIRMED) {
      throw new DomainException(
        'ALLOCATION_NOT_CONFIRMED',
        `Allocation ${allocation.reference} is ${allocation.status} — confirm it before booking a pickup`,
        HttpStatus.CONFLICT,
      );
    }
    if (allocation.booking) {
      throw new DomainException(
        'BOOKING_EXISTS',
        `Allocation ${allocation.reference} already has a ${allocation.booking.status} booking — reschedule it instead`,
        HttpStatus.CONFLICT,
      );
    }
    return { batchId: allocation.batchId, takerType: allocation.taker.type };
  }
}

// ─── rules (unit-tested) ──────────────────────────────────────────────────────

/** No-show cutoff: the slot has ended and the grace period for that taker type is over. */
export function collectionDeadlineFor(
  slotEnd: Date,
  takerType: TakerType,
): Date {
  const deadline = new Date(slotEnd);
  deadline.setUTCDate(deadline.getUTCDate() + GRACE_DAYS[takerType]);
  return deadline;
}

/** Slot must be OPEN, still ahead of us, for the same batch, and have a free seat. */
export function assertSlotBookable(
  slot: SlotForBooking,
  targetBatchId: string,
  now: Date,
): void {
  if (slot.status !== SlotStatus.OPEN) {
    throw new DomainException(
      'SLOT_NOT_OPEN',
      `This pickup slot is ${slot.status}`,
      HttpStatus.CONFLICT,
    );
  }
  if (slot.endTime <= now) {
    throw new DomainException(
      'SLOT_PAST',
      'This pickup slot has already ended',
      HttpStatus.CONFLICT,
    );
  }
  if (slot.batchId !== targetBatchId) {
    throw new DomainException(
      'SLOT_BATCH_MISMATCH',
      'This pickup slot belongs to a different batch',
    );
  }
  if (slot._count.bookings >= slot.capacity) {
    throw new DomainException(
      'SLOT_FULL',
      `This pickup slot is full (${slot.capacity}/${slot.capacity} booked) — choose another`,
      HttpStatus.CONFLICT,
    );
  }
}

function canSee(
  booking: {
    claim: { taker: { userId: string | null } } | null;
    allocation: unknown;
  },
  user: User,
): boolean {
  if (user.role === UserRole.MANAGER) return true;
  return booking.claim?.taker.userId === user.id;
}
