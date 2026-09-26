import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertTransition,
  DomainException,
} from '../common/errors/domain.exception';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import {
  BatchStatus,
  BookingStatus,
  Prisma,
  SlotStatus,
  UserRole,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateSlotDto,
  ListSlotsQueryDto,
  UpdateSlotDto,
} from './dto/slot.dto';

/** Bookings that occupy a seat in the slot (CLAUDE.md §13). */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.BOOKED,
  BookingStatus.COLLECTED,
];

export const SLOT_TRANSITIONS: Record<SlotStatus, readonly SlotStatus[]> = {
  OPEN: [SlotStatus.CLOSED, SlotStatus.CANCELLED],
  CLOSED: [SlotStatus.OPEN, SlotStatus.CANCELLED],
  CANCELLED: [],
};

/** Fullness is derived from a filtered relation count — never a stored flag. */
export const slotInclude = {
  batch: {
    select: { id: true, reference: true, status: true, pickupLocation: true },
  },
  _count: {
    select: {
      bookings: { where: { status: { in: [...ACTIVE_BOOKING_STATUSES] } } },
    },
  },
} satisfies Prisma.PickupSlotInclude;

type SlotRow = Prisma.PickupSlotGetPayload<{ include: typeof slotInclude }>;

export type SlotDetail = Omit<SlotRow, '_count'> & {
  bookedCount: number;
  remainingCapacity: number;
  /** slot.location, falling back to the batch's pickupLocation. */
  effectiveLocation: string | null;
};

export function presentSlot(row: SlotRow): SlotDetail {
  const { _count, ...slot } = row;
  return {
    ...slot,
    bookedCount: _count.bookings,
    remainingCapacity: Math.max(0, slot.capacity - _count.bookings),
    effectiveLocation: slot.location ?? slot.batch?.pickupLocation ?? null,
  };
}

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Slots can be tied to any batch that is not COMPLETED — CLOSED batches still need
   * pickups — or have no batch at all: a general availability window (Backend-Updates.md
   * §C2) that any batch's claim/allocation can book into.
   */
  async create(dto: CreateSlotDto): Promise<SlotDetail> {
    if (dto.batchId) {
      const batch = await this.prisma.batch.findUnique({
        where: { id: dto.batchId },
      });
      if (!batch) throw new NotFoundException('Batch not found');
      if (batch.status === BatchStatus.COMPLETED) {
        throw new DomainException(
          'BATCH_COMPLETED',
          `Batch ${batch.reference} is completed — no more pickups`,
          HttpStatus.CONFLICT,
        );
      }
    }
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    assertWindow(startTime, endTime);

    const row = await this.prisma.pickupSlot.create({
      data: {
        batchId: dto.batchId,
        startTime,
        endTime,
        location: dto.location,
        capacity: dto.capacity ?? 1,
        note: dto.note,
      },
      include: slotInclude,
    });
    return presentSlot(row);
  }

  /** Takers see OPEN slots of non-draft batches; managers see everything (filterable). */
  async list(q: ListSlotsQueryDto, user: User): Promise<Paginated<SlotDetail>> {
    const where: Prisma.PickupSlotWhereInput = {
      batchId: q.batchId,
      ...(user.role === UserRole.TAKER
        ? {
            status: SlotStatus.OPEN,
            // General windows (no batch) are always visible; batch slots hide while DRAFT.
            OR: [
              { batchId: null },
              { batch: { status: { not: BatchStatus.DRAFT } } },
            ],
          }
        : { status: q.status }),
      ...(q.upcoming ? { endTime: { gte: new Date() } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.pickupSlot.count({ where }),
      this.prisma.pickupSlot.findMany({
        where,
        include: slotInclude,
        orderBy: { startTime: 'asc' },
        ...pageArgs(q),
      }),
    ]);
    return paginated(rows.map(presentSlot), total, q);
  }

  async getById(id: string, user: User): Promise<SlotDetail> {
    const row = await this.prisma.pickupSlot.findUnique({
      where: { id },
      include: slotInclude,
    });
    if (
      !row ||
      (user.role === UserRole.TAKER && row.batch?.status === BatchStatus.DRAFT)
    ) {
      throw new NotFoundException('Pickup slot not found');
    }
    return presentSlot(row);
  }

  async update(id: string, dto: UpdateSlotDto): Promise<SlotDetail> {
    const current = await this.findOrThrow(id);
    if (current.status === SlotStatus.CANCELLED) {
      throw new DomainException(
        'SLOT_CANCELLED',
        'A cancelled slot cannot be edited — create a new one',
        HttpStatus.CONFLICT,
      );
    }
    const startTime = dto.startTime
      ? new Date(dto.startTime)
      : current.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : current.endTime;
    assertWindow(startTime, endTime);

    // Capacity can shrink, but never below the people already booked in.
    if (dto.capacity !== undefined && dto.capacity < current._count.bookings) {
      throw new DomainException(
        'CAPACITY_BELOW_BOOKED',
        `${current._count.bookings} booking(s) already occupy this slot; capacity cannot be ${dto.capacity}`,
      );
    }

    const row = await this.prisma.pickupSlot.update({
      where: { id },
      data: {
        startTime,
        endTime,
        location: dto.location,
        capacity: dto.capacity,
        note: dto.note,
      },
      include: slotInclude,
    });
    return presentSlot(row);
  }

  open(id: string): Promise<SlotDetail> {
    return this.transition(id, SlotStatus.OPEN);
  }

  /** Stop taking bookings; existing ones stand. */
  close(id: string): Promise<SlotDetail> {
    return this.transition(id, SlotStatus.CLOSED);
  }

  /**
   * Scrap the slot. Its BOOKED bookings are cancelled so the people can rebook — their
   * claims / allocations stay APPROVED / CONFIRMED, nothing is lost (CLAUDE.md §10).
   */
  cancel(id: string): Promise<SlotDetail> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.pickupSlot.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Pickup slot not found');
      assertTransition(
        'PickupSlot',
        SLOT_TRANSITIONS,
        current.status,
        SlotStatus.CANCELLED,
      );
      await tx.booking.updateMany({
        where: { slotId: id, status: BookingStatus.BOOKED },
        // Claims/allocations stay APPROVED/CONFIRMED with no active booking — that is
        // exactly the "needs booking" state (GET /claims/needs-booking), derived not stored.
        data: {
          status: BookingStatus.CANCELLED,
          cancelNote: 'Slot cancelled by manager — please rebook',
        },
      });
      const row = await tx.pickupSlot.update({
        where: { id },
        data: { status: SlotStatus.CANCELLED },
        include: slotInclude,
      });
      return presentSlot(row);
    });
  }

  /** Only a slot nobody ever booked can be deleted; otherwise cancel it. */
  async remove(id: string): Promise<void> {
    const slot = await this.prisma.pickupSlot.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    });
    if (!slot) throw new NotFoundException('Pickup slot not found');
    if (slot._count.bookings > 0) {
      throw new DomainException(
        'SLOT_HAS_BOOKINGS',
        `Slot has ${slot._count.bookings} booking(s) — cancel it instead`,
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.pickupSlot.delete({ where: { id } });
  }

  private async transition(id: string, to: SlotStatus): Promise<SlotDetail> {
    const current = await this.findOrThrow(id);
    assertTransition('PickupSlot', SLOT_TRANSITIONS, current.status, to);
    const row = await this.prisma.pickupSlot.update({
      where: { id },
      data: { status: to },
      include: slotInclude,
    });
    return presentSlot(row);
  }

  private async findOrThrow(id: string): Promise<SlotRow> {
    const row = await this.prisma.pickupSlot.findUnique({
      where: { id },
      include: slotInclude,
    });
    if (!row) throw new NotFoundException('Pickup slot not found');
    return row;
  }
}

function assertWindow(startTime: Date, endTime: Date): void {
  if (!(endTime > startTime)) {
    throw new DomainException(
      'INVALID_SLOT_WINDOW',
      'endTime must be after startTime',
    );
  }
}
