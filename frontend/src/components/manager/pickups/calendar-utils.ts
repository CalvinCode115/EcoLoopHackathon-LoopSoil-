import { addDays } from "@/lib/batch-form";
import { formatKg, sgDayKey } from "@/lib/format";
import type { ManagerBooking, Slot } from "@/lib/types";

/** Day grid: 8am to 7pm, 56px per hour (board "Week grid"). */
export const GRID_START_HOUR = 8;
export const GRID_END_HOUR = 19;
export const HOUR_PX = 56;

export type SlotState = "open" | "almost" | "full" | "closed" | "cancelled";

export const SLOT_STATE: Record<
  SlotState,
  { label: string; block: string; swatch: string }
> = {
  open: {
    label: "Open",
    block: "bg-[#DDEBCF] text-deep",
    swatch: "bg-[#DDEBCF]",
  },
  almost: {
    label: "Almost full",
    block: "bg-[#F6DFAE] text-amber-ink",
    swatch: "bg-[#F6DFAE]",
  },
  full: { label: "Full", block: "bg-deep text-cream", swatch: "bg-deep" },
  closed: {
    label: "Closed to new bookings",
    block:
      "bg-transparent text-deep shadow-[inset_0_0_0_2px_var(--color-deep)]",
    swatch: "shadow-[inset_0_0_0_2px_var(--color-deep)]",
  },
  cancelled: {
    label: "Cancelled",
    block: "bg-grey-tint text-grey-ink line-through",
    swatch: "bg-grey-tint",
  },
};

export function slotState(s: Slot): SlotState {
  if (s.status === "CANCELLED") return "cancelled";
  if (s.status === "CLOSED") return "closed";
  if (s.bookedCount >= s.capacity) return "full";
  if (s.bookedCount / s.capacity >= 0.8) return "almost";
  return "open";
}

/** Bookings that hold a seat (the ones the calendar counts). */
export function isActive(b: ManagerBooking): boolean {
  return b.status === "BOOKED" || b.status === "COLLECTED";
}

export function bookingParty(b: ManagerBooking) {
  const src = b.claim ?? b.allocation;
  return {
    name: src?.taker.name ?? "Unknown",
    phone: src?.taker.phone ?? null,
    bulk: !!b.allocation,
    reference: src?.reference ?? "",
    kg: b.claim
      ? Number(b.claim.approvedKg ?? 0)
      : Number(b.allocation?.allocatedKg ?? 0),
  };
}

export function expectedKg(bookings: ManagerBooking[]): string {
  return formatKg(
    bookings.filter(isActive).reduce((s, b) => s + bookingParty(b).kg, 0),
  );
}

/** Hours + minutes of an instant in Singapore time. */
export function sgClock(iso: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { h, m };
}

/** "HH:MM" of an instant in Singapore time (for <input type="time">). */
export function sgTimeInput(iso: string): string {
  const { h, m } = sgClock(iso);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** YYYY-MM-DD + "HH:MM" (Singapore) → ISO instant. */
export function sgInstant(day: string, time: string): string {
  return new Date(`${day}T${time}:00+08:00`).toISOString();
}

/** Monday (YYYY-MM-DD) of the week containing `day`. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(day: string, n: number): string {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, toExclusive: string): string[] {
  const out: string[] = [];
  for (let d = from; d < toExclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Weekday index 0 = Monday … 6 = Sunday for a YYYY-MM-DD. */
export function weekdayIndex(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Label helpers on a YYYY-MM-DD (treated as a Singapore calendar day). */
export function dayLabel(
  day: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  return new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-SG", {
    ...opts,
    timeZone: "Asia/Singapore",
  });
}

export function slotDayKey(s: { startTime: string }): string {
  return sgDayKey(s.startTime);
}

/** "10am", "2:30pm". */
export function formatHour(h: number, m = 0): string {
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${suffix}` : `${hr}${suffix}`;
}

/** "10am–12pm" (short form used on blocks). */
export function blockTime(s: { startTime: string; endTime: string }): string {
  const a = sgClock(s.startTime);
  const b = sgClock(s.endTime);
  return `${formatHour(a.h, a.m)}–${formatHour(b.h, b.m)}`;
}

/** "Tue 29 Sep · 10am – 12pm". */
export function slotTitle(s: { startTime: string; endTime: string }): string {
  const a = sgClock(s.startTime);
  const b = sgClock(s.endTime);
  return `${dayLabel(sgDayKey(s.startTime), { weekday: "short", day: "numeric", month: "short" }).replace(",", "")} · ${formatHour(a.h, a.m)} – ${formatHour(b.h, b.m)}`;
}
