import { dayKeySG } from '../common/reference';
import {
  AllocationStatus,
  BookingStatus,
  ClaimStatus,
  TakerStatus,
} from '../generated/prisma/client';

/**
 * GET /handovers/lookup — what the manager sees after scanning a pickup pass (its QR holds
 * the claim reference) or typing a reference. Rules mirror POST /handovers: only an
 * APPROVED claim / CONFIRMED allocation can be recorded (without a booking it becomes a
 * walk-in). The rest
 * of the design's edge cases are either blocking or just a heads-up.
 */
export type LookupIssueCode =
  // blocking
  | 'ALREADY_COLLECTED'
  | 'NOT_APPROVED'
  | 'RELEASED'
  | 'TAKER_SUSPENDED'
  // warnings — recording is still allowed
  | 'NO_BOOKING'
  | 'PAST_DEADLINE'
  | 'WRONG_DAY';

export interface LookupIssue {
  code: LookupIssueCode;
  blocking: boolean;
  message: string;
}

export interface LookupSubject {
  kind: 'CLAIM' | 'ALLOCATION';
  status: ClaimStatus | AllocationStatus;
  takerStatus: TakerStatus;
  booking: {
    status: BookingStatus;
    collectionDeadline: Date | null;
    slotStart: Date;
  } | null;
  hasHandover: boolean;
}

export function assessLookup(s: LookupSubject, now: Date): LookupIssue[] {
  const issues: LookupIssue[] = [];
  const block = (code: LookupIssueCode, message: string) =>
    issues.push({ code, blocking: true, message });
  const warn = (code: LookupIssueCode, message: string) =>
    issues.push({ code, blocking: false, message });

  // Claim and allocation share the COLLECTED / CANCELLED values, so one check covers both.
  if (s.hasHandover || s.status === ClaimStatus.COLLECTED) {
    block('ALREADY_COLLECTED', 'Already collected');
    return issues; // nothing else matters once it's handed over
  }
  if (s.status === ClaimStatus.CANCELLED) {
    block(
      'RELEASED',
      s.booking?.status === BookingStatus.NO_SHOW
        ? 'The collection deadline passed and the compost was released back to the batch'
        : 'This was cancelled and the compost released back to the batch',
    );
    return issues;
  }
  if (s.status === ClaimStatus.PENDING || s.status === ClaimStatus.REJECTED) {
    block(
      'NOT_APPROVED',
      s.status === ClaimStatus.PENDING
        ? 'This claim is still pending — approve it in Claims first'
        : 'This claim was rejected',
    );
  }
  if (s.status === AllocationStatus.PLANNED) {
    block('NOT_APPROVED', 'This allocation is only planned — confirm it first');
  }
  if (s.takerStatus !== TakerStatus.APPROVED) {
    block(
      'TAKER_SUSPENDED',
      s.takerStatus === TakerStatus.SUSPENDED
        ? 'This taker’s account is suspended — handovers are blocked'
        : 'This taker’s account isn’t approved',
    );
  }

  const booked = s.booking?.status === BookingStatus.BOOKED ? s.booking : null;
  if (!booked) {
    // Allowed: POST /handovers with claimId / allocationId books a walk-in slot itself.
    warn(
      'NO_BOOKING',
      'No pickup was booked — recording now books it as a walk-in',
    );
    return issues;
  }
  if (booked.collectionDeadline && booked.collectionDeadline < now) {
    warn(
      'PAST_DEADLINE',
      'The collection deadline has passed, but the kg hasn’t been released yet',
    );
  }
  if (dayKeySG(booked.slotStart) !== dayKeySG(now)) {
    warn(
      'WRONG_DAY',
      'This pickup is booked for another day — recording now frees that slot',
    );
  }
  return issues;
}
