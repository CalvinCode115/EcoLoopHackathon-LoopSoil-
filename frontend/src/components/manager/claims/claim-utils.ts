import {
  formatDayMonth,
  formatDayTime,
  formatTimeRange,
  formatWeekdayDay,
  sgDayKey,
} from "@/lib/format";
import type { ClaimStatus } from "@/lib/labels";
import type { Claim } from "@/lib/types";

/** A cancelled claim whose booking was marked NO_SHOW shows as "No-show". */
export function claimStatus(c: Claim): ClaimStatus {
  return c.status === "CANCELLED" && c.booking?.status === "NO_SHOW"
    ? "NO_SHOW"
    : c.status;
}

/**
 * When an approved claim must be collected by: the booking's collection deadline, or —
 * before a pickup is booked — the end of the batch's claim window.
 */
export function collectBy(c: Claim): string | null {
  return c.booking?.status === "BOOKED" && c.booking.collectionDeadline
    ? c.booking.collectionDeadline
    : (c.batch?.availableUntil ?? null);
}

export function isOverdue(c: Claim, now: number): boolean {
  const due = collectBy(c);
  return c.status === "APPROVED" && !!due && new Date(due).getTime() < now;
}

export function hasActiveBooking(c: Claim): boolean {
  return c.booking?.status === "BOOKED";
}

/** "40 min", "3 hrs", "1 day", "2 days" since `iso`. */
export function formatElapsed(iso: string, now: number): string {
  const mins = Math.max(
    0,
    Math.floor((now - new Date(iso).getTime()) / 60_000),
  );
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"}`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** "today, 10:05am" / "28 Sep, 2:20pm". */
export function formatWhenShort(iso: string, now: number): string {
  return sgDayKey(iso) === sgDayKey(new Date(now).toISOString())
    ? `today, ${formatDayTime(iso).split(", ")[1]}`
    : formatDayTime(iso);
}

/** "Tue 29 Sep · 2–4pm". */
export function slotText(slot: { startTime: string; endTime: string }): string {
  return `${formatWeekdayDay(slot.startTime).replace(",", "")} · ${formatTimeRange(slot.startTime, slot.endTime)}`;
}

/** The one-line status under a queue row, per status (boards per tab). */
export function queueMeta(
  c: Claim,
  now: number,
): { text: string; tone: "amber" | "grey" | "red" } {
  const status = claimStatus(c);
  switch (status) {
    case "PENDING": {
      const hrs = (now - new Date(c.submittedAt).getTime()) / 3_600_000;
      return {
        text: `Waiting ${formatElapsed(c.submittedAt, now)}`,
        tone: hrs >= 24 ? "amber" : "grey",
      };
    }
    case "APPROVED": {
      const due = collectBy(c);
      const booked =
        hasActiveBooking(c) && c.booking
          ? slotText(c.booking.slot)
          : "Not booked yet";
      if (due && isOverdue(c, now)) {
        return {
          text: `Overdue by ${formatElapsed(due, now)} · ${hasActiveBooking(c) ? booked : "not booked"}`,
          tone: "red",
        };
      }
      return {
        text: due ? `${booked} · Collect by ${formatDayMonth(due)}` : booked,
        tone: "grey",
      };
    }
    case "COLLECTED":
      return {
        text: c.collectedAt
          ? `Collected ${formatWhenShort(c.collectedAt, now)}`
          : "Collected",
        tone: "grey",
      };
    case "REJECTED":
      return {
        text: c.decidedAt
          ? `Rejected ${formatDayMonth(c.decidedAt)}`
          : "Rejected",
        tone: "grey",
      };
    case "NO_SHOW":
      return {
        text: c.cancelledAt
          ? `No-show ${formatDayMonth(c.cancelledAt)}`
          : "No-show",
        tone: "grey",
      };
    default:
      return {
        text: c.cancelledAt
          ? `Cancelled ${formatDayMonth(c.cancelledAt)}`
          : "Cancelled",
        tone: "grey",
      };
  }
}

/** Singapore mobile (8 digits) → WhatsApp click-to-chat link with a prefilled message. */
export function whatsAppLink(
  phone: string | null | undefined,
  text: string,
): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const local =
    digits.length === 10 && digits.startsWith("65") ? digits.slice(2) : digits;
  if (!/^[89]\d{7}$/.test(local)) return null;
  return `https://wa.me/65${local}?text=${encodeURIComponent(text)}`;
}
