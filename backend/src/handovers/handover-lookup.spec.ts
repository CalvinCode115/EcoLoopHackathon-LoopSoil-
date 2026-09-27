import { NotFoundException } from '@nestjs/common';
import {
  AllocationStatus,
  BookingStatus,
  ClaimStatus,
  TakerStatus,
} from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupabaseService } from '../supabase/supabase.service';
import { assessLookup, type LookupSubject } from './handover-lookup';
import { HandoversService } from './handovers.service';

// 29 Sep 2026, 11am Singapore
const now = new Date('2026-09-29T03:00:00Z');

function subject(overrides: Partial<LookupSubject> = {}): LookupSubject {
  return {
    kind: 'CLAIM',
    status: ClaimStatus.APPROVED,
    takerStatus: TakerStatus.APPROVED,
    booking: {
      status: BookingStatus.BOOKED,
      collectionDeadline: new Date('2026-10-01T10:00:00Z'),
      slotStart: new Date('2026-09-29T06:00:00Z'), // 2pm today, SG
    },
    hasHandover: false,
    ...overrides,
  };
}

const codes = (s: LookupSubject) => assessLookup(s, now).map((i) => i.code);

describe('assessLookup', () => {
  it('a booked, approved claim for today is ready with no issues', () => {
    expect(assessLookup(subject(), now)).toEqual([]);
  });

  it('warns — but allows — past the deadline and on the wrong day', () => {
    const issues = assessLookup(
      subject({
        booking: {
          status: BookingStatus.BOOKED,
          collectionDeadline: new Date('2026-09-28T10:00:00Z'),
          slotStart: new Date('2026-10-01T02:00:00Z'),
        },
      }),
      now,
    );
    expect(issues.map((i) => i.code)).toEqual(['PAST_DEADLINE', 'WRONG_DAY']);
    expect(issues.every((i) => !i.blocking)).toBe(true);
  });

  it('blocks collected, released (no-show), pending and suspended', () => {
    expect(codes(subject({ hasHandover: true }))).toEqual([
      'ALREADY_COLLECTED',
    ]);
    expect(
      codes(
        subject({
          status: ClaimStatus.CANCELLED,
          booking: {
            status: BookingStatus.NO_SHOW,
            collectionDeadline: null,
            slotStart: now,
          },
        }),
      ),
    ).toEqual(['RELEASED']);
    expect(
      codes(subject({ status: ClaimStatus.PENDING, booking: null })),
    ).toEqual(['NOT_APPROVED', 'NO_BOOKING']);
    expect(codes(subject({ takerStatus: TakerStatus.SUSPENDED }))).toEqual([
      'TAKER_SUSPENDED',
    ]);
  });

  it('a planned allocation is not ready; a confirmed one is', () => {
    expect(
      codes(subject({ kind: 'ALLOCATION', status: AllocationStatus.PLANNED })),
    ).toEqual(['NOT_APPROVED']);
    expect(
      codes(
        subject({ kind: 'ALLOCATION', status: AllocationStatus.CONFIRMED }),
      ),
    ).toEqual([]);
  });
});

describe('HandoversService.lookup', () => {
  it('404s when no claim or allocation has that reference', async () => {
    const prisma = {
      claim: { findFirst: jest.fn().mockResolvedValue(null) },
      allocation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new HandoversService(
      prisma as unknown as PrismaService,
      {} as SupabaseService,
    );
    await expect(service.lookup(' CLM-0000-000 ', now)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.claim.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reference: { equals: 'CLM-0000-000', mode: 'insensitive' } },
      }),
    );
  });
});
