/**
 * Response shapes from the NestJS API (see Backend-skeleton.md). Only the fields the
 * frontend reads are typed. Raw Decimal columns arrive as strings (e.g. totalKg "20");
 * everything under `pool` and `allowanceLeftKg` is already a number.
 */
import type { BatchStatus } from "./labels";

export interface BatchPool {
  totalKg: number;
  schoolReserveKg: number;
  allocatedKg: number;
  /** totalKg − schoolReserveKg − allocatedKg: the share open to individuals. */
  publicPoolKg: number;
  pendingClaimKg: number;
  approvedClaimKg: number;
  /** What is left for new claims right now. */
  kgRemaining: number;
  /** Display only: collected so far (claims + allocations, already inside the figures above). */
  collectedKg: number;
  collectedClaimKg: number;
  collectedAllocationKg: number;
}

export interface Batch {
  id: string;
  reference: string;
  harvestDate: string;
  totalKg: string;
  schoolReserveKg: string;
  phReading: number | null;
  status: BatchStatus;
  availableFrom: string | null;
  availableUntil: string | null;
  pickupLocation: string | null;
  notes: string | null;
  pool: BatchPool;
  /** This taker's remaining 1kg-per-batch allowance; null unless an APPROVED individual. */
  allowanceLeftKg: number | null;
}

export type ClaimStatusValue =
  "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "COLLECTED";

export type BookingStatusValue =
  "BOOKED" | "COLLECTED" | "NO_SHOW" | "CANCELLED";

/** GET /claims item / POST /claims response (fields the taker screens use). */
export interface Claim {
  id: string;
  reference: string;
  batchId: string;
  /** Decimal columns arrive as strings, e.g. "0.5". */
  requestedKg: string;
  approvedKg: string | null;
  status: ClaimStatusValue;
  rejectionReason: string | null;
  cancellationReason: string | null;
  reasonNote: string | null;
  managerNote: string | null;
  submittedAt: string;
  decidedAt: string | null;
  cancelledAt: string | null;
  collectedAt: string | null;
  batch?: {
    id: string;
    reference: string;
    pickupLocation: string | null;
    availableUntil: string | null;
  };
  /** Manager views only. */
  taker?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
    intendedUse: string | null;
  };
  booking?: {
    id: string;
    status: BookingStatusValue;
    collectionDeadline: string | null;
    bookedAt?: string;
    slot: {
      id: string;
      startTime: string;
      endTime: string;
      location: string | null;
    };
  } | null;
}

/** GET /slots item. */
export interface Slot {
  id: string;
  batchId: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  capacity: number;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  bookedCount: number;
  remainingCapacity: number;
  /** slot.location, else the batch's pickupLocation. */
  effectiveLocation: string | null;
  note?: string | null;
  batch?: {
    id: string;
    reference: string;
    status: string;
    pickupLocation: string | null;
  } | null;
}

/** POST /bookings / PATCH /bookings/:id response (fields the taker screens use). */
export interface Booking {
  id: string;
  status: BookingStatusValue;
  collectionDeadline: string | null;
  cancelNote?: string | null;
  slot: {
    id: string;
    startTime: string;
    endTime: string;
    location: string | null;
    batch?: {
      id: string;
      reference: string;
      pickupLocation: string | null;
    } | null;
  };
  claim?: {
    id: string;
    reference: string;
    status: ClaimStatusValue;
    approvedKg: string | null;
    batchId: string;
  } | null;
}

/** Manager GET /batches/:id adds who logged it and the top-up history (newest first). */
export interface BatchDetail extends Batch {
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
  topUps?: {
    id: string;
    kg: number;
    note: string | null;
    createdAt: string;
    createdBy: { id: string; name: string };
  }[];
}

export type AllocationStatusValue =
  "PLANNED" | "CONFIRMED" | "COLLECTED" | "CANCELLED";

export type TakerCategoryValue =
  | "NPARKS"
  | "TOWN_COUNCIL"
  | "SCHOOL"
  | "COMMUNITY_GARDEN"
  | "INDEPENDENT_FARMER"
  | "OTHER";

/** GET /allocations item. */
export interface Allocation {
  id: string;
  reference: string;
  batchId: string;
  takerId: string;
  /** Decimal string, e.g. "2". */
  allocatedKg: string;
  status: AllocationStatusValue;
  note: string | null;
  collectedAt: string | null;
  createdAt: string;
  taker: {
    id: string;
    name: string;
    category: TakerCategoryValue | null;
    monthlyKgTarget: number | null;
  };
  batch?: {
    id: string;
    reference: string;
    status: string;
    availableUntil: string | null;
  };
  booking?: { id: string; status: BookingStatusValue } | null;
}

/** GET /takers item (the fields the manager screens use). */
export interface TakerRecord {
  id: string;
  name: string;
  type: "INDIVIDUAL" | "BULK";
  category: TakerCategoryValue | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  monthlyKgTarget: number | null;
  createdAt?: string;
  email?: string;
  phone?: string | null;
  intendedUse?: string | null;
  statusReason?: string | null;
  statusChangedAt?: string | null;
  statusChangedBy?: { id: string; name: string } | null;
  /** Manager list / detail only. */
  stats?: {
    collectedKg: number;
    claims: number;
    allocations: number;
    noShows: number;
    lastActiveAt: string | null;
    monthAllocatedKg: number;
    monthCollectedKg: number;
  };
}

/** GET /handovers item (numbers are already numbers; photoUrl is a ~1h signed URL). */
export interface Handover {
  id: string;
  reference: string;
  actualKg: number;
  halfKgBags: number;
  oneKgBags: number;
  looseKg: number;
  photoUrl: string | null;
  handedOverAt: string;
  undoneAt: string | null;
  taker: {
    id: string;
    name: string;
    type?: "INDIVIDUAL" | "BULK";
    category?: string | null;
  } | null;
  source: "CLAIM" | "ALLOCATION" | null;
  sourceReference: string | null;
  /** Approved (claim) / allocated (allocation) kg. */
  expectedKg?: number | null;
  note?: string | null;
  handedOverBy?: { id: string; name: string };
  batch?: { id: string; reference: string } | null;
  booking?: {
    slot: {
      startTime: string;
      endTime: string;
      location: string | null;
    } | null;
    claim?: { id: string } | null;
  } | null;
}

interface BookingParty {
  id: string;
  name: string;
  phone: string | null;
  type: "INDIVIDUAL" | "BULK";
}

/** GET /bookings item (manager view): who, how much, which slot. */
export interface ManagerBooking {
  id: string;
  status: BookingStatusValue;
  collectionDeadline: string | null;
  bookedAt: string;
  slot: {
    id: string;
    startTime: string;
    endTime: string;
    location: string | null;
    status: "OPEN" | "CLOSED" | "CANCELLED";
    batch: {
      id: string;
      reference: string;
      pickupLocation: string | null;
    } | null;
  };
  claim: {
    id: string;
    reference: string;
    status: ClaimStatusValue;
    approvedKg: string | null;
    batchId: string;
    taker: BookingParty;
  } | null;
  allocation: {
    id: string;
    reference: string;
    status: AllocationStatusValue;
    allocatedKg: string;
    batchId: string;
    taker: BookingParty;
  } | null;
  handover: { id: string; actualKg: string; handedOverAt: string } | null;
}

export type LookupIssueCode =
  | "ALREADY_COLLECTED"
  | "NOT_APPROVED"
  | "RELEASED"
  | "TAKER_SUSPENDED"
  | "NO_BOOKING"
  | "PAST_DEADLINE"
  | "WRONG_DAY";

/** GET /handovers/lookup?code= — a scanned / typed reference, ready for the Record screen. */
export interface HandoverLookup {
  kind: "CLAIM" | "ALLOCATION";
  id: string;
  reference: string;
  status: string;
  kg: number;
  requestedKg: number | null;
  decidedAt: string | null;
  taker: {
    id: string;
    name: string;
    phone: string | null;
    type: "INDIVIDUAL" | "BULK";
    status: string;
  };
  batch: { id: string; reference: string; pickupLocation: string | null };
  booking: {
    id: string;
    status: BookingStatusValue;
    collectionDeadline: string | null;
    slot: {
      id: string;
      startTime: string;
      endTime: string;
      location: string | null;
    };
  } | null;
  handover: {
    id: string;
    reference: string;
    actualKg: number;
    handedOverAt: string;
    handedOverBy: string;
  } | null;
  canRecord: boolean;
  issues: { code: LookupIssueCode; blocking: boolean; message: string }[];
}

export type KpiKey =
  | "kgDiverted"
  | "kgGenerated"
  | "distributionRate"
  | "collectionRate"
  | "noShowRate"
  | "activeTakers"
  | "batchesCompleted";

/** GET /reporting/analytics?from=&to= — KPIs vs the previous period, sparklines, trends. */
export interface AnalyticsReport {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  kpis: Record<KpiKey, { value: number | null; previous: number | null }>;
  sparklines: Record<KpiKey, { weekStart: string; value: number | null }[]>;
  weekly: { weekStart: string; kg: number; previousKg: number }[];
  byGroup: { group: string; kg: number }[];
}

/** GET /manager/dashboard (the parts the dashboard reads). */
export interface ManagerDashboard {
  generatedAt: string;
  pipeline: {
    batches: { draft: number; open: number; closed: number };
    takers: { pendingVetting: number };
    claims: {
      pending: number;
      approvedUnbooked: number;
      approvedBooked: number;
    };
    bookings: { upcoming: number; overdue: number };
    handovers: { missingPhoto: number };
  };
  impact: {
    allTime: {
      kgDiverted: number;
      handovers: number;
      beneficiaries: number;
      batches: number;
    };
    thisMonth: { month: string; kgDiverted: number; handovers: number };
  };
}

/** GET /reporting/report — every Reports section for a period + filters. */
export interface ReportData {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  allTime: {
    kg: number;
    pickups: number;
    takers: number;
    since: string | null;
  };
  daily: { day: string; kg: number }[];
  previousDaily: { day: string; kg: number }[];
  topRecipients: {
    takerId: string;
    name: string;
    type: string;
    category: string | null;
    kg: number;
    pickups: number;
  }[];
  batches: {
    id: string;
    reference: string;
    harvestDate: string;
    status: string;
    totalKg: number;
    topUpKg: number;
    schoolReserveKg: number;
    bulkKg: number;
    individualKg: number;
    unclaimedKg: number;
    collectedKg: number;
    distributedPct: number;
    daysToFullyClaimed: number | null;
  }[];
  generatedVsCollected: {
    month: string;
    generated: number;
    collected: number;
  }[];
  funnel: {
    submitted: { count: number; kg: number };
    approved: { count: number; kg: number };
    booked: { count: number; kg: number };
    collected: { count: number; kg: number };
    rejected: number;
    approvedUnbooked: number;
    noShows: number;
    upcoming: number;
  };
  rejectionReasons: Record<string, number>;
  cancellationReasons: Record<string, number>;
  responseTime: {
    avgHours: number | null;
    previousAvgHours: number | null;
    within24Pct: number | null;
    sparkline: { weekStart: string; value: number | null }[];
  };
  claimSizes: { small: number; medium: number; large: number; atCap: number };
  pickups: {
    fillRate: number | null;
    previousFillRate: number | null;
    noShows: number;
    noShowKg: number;
    heatmap: {
      weekday: number;
      band: number;
      slots: number;
      booked: number;
      capacity: number;
    }[];
    weekly: { weekStart: string; collected: number; noShows: number }[];
  };
  takers: {
    returning: number;
    firstTime: number;
    avgKgPerPickup: number | null;
    repeatNoShows: number;
    newPerMonth: { month: string; individual: number; bulk: number }[];
    bulkPartners: {
      takerId: string;
      name: string;
      category: string | null;
      target: number | null;
      collected: number;
      previousCollected: number;
    }[];
  };
}

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
}
