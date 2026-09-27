"use client";

import { CalendarPlus } from "@phosphor-icons/react/dist/ssr/CalendarPlus";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { ChatCircleText } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import {
  DataTable,
  ProgressBar,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatClock, formatKg, sgDayKey } from "@/lib/format";
import type { ManagerBooking, Slot } from "@/lib/types";
import {
  SLOT_STATE,
  addMonths,
  blockTime,
  dayLabel,
  daysBetween,
  expectedKg,
  formatHour,
  monthStart,
  sgClock,
  slotState,
  weekStart,
  type SlotState,
} from "./calendar-utils";
import { addDays } from "@/lib/batch-form";

const STATE_TONE: Record<SlotState, BadgeTone> = {
  open: "sage",
  almost: "amber",
  full: "deep",
  closed: "grey",
  cancelled: "grey",
};

// ─── Month ────────────────────────────────────────────────────────────────────

export function monthRange(anchor: string): { from: string; to: string } {
  const first = monthStart(anchor);
  const last = addDays(addMonths(anchor, 1), -1);
  return { from: weekStart(first), to: addDays(weekStart(last), 7) };
}

/** Board "Pickups · month": up to three slots per day, then "+N more". */
export function MonthGrid({
  anchor,
  slots,
  today,
  onOpen,
  onDay,
}: {
  anchor: string;
  slots: Slot[];
  today: string;
  onOpen: (s: Slot) => void;
  onDay: (day: string) => void;
}) {
  const { from, to } = monthRange(anchor);
  const days = daysBetween(from, to);
  const month = anchor.slice(0, 7);
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = sgDayKey(s.startTime);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-control shadow-[inset_0_0_0_1px_rgba(107,107,94,0.14)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-xs font-bold text-muted"
          >
            {d}
          </div>
        ))}
        {days.map((d) => {
          const list = (byDay.get(d) ?? []).sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          );
          return (
            <div
              key={d}
              className={cn(
                "flex min-h-[104px] flex-col gap-1 p-1.5 shadow-[inset_0_1px_0_rgba(107,107,94,0.14),inset_1px_0_0_rgba(107,107,94,0.1)]",
                d.slice(0, 7) !== month && "bg-[#F4EFE4]",
              )}
            >
              <button
                type="button"
                onClick={() => onDay(d)}
                aria-label={`Open ${dayLabel(d, { day: "numeric", month: "short" })} in day view`}
                className={cn(
                  "inline-flex size-7 items-center justify-center self-start rounded-full text-[13px] font-bold hover:bg-sage",
                  d === today
                    ? "bg-leaf text-cream hover:bg-deep"
                    : d.slice(0, 7) === month
                      ? "text-ink"
                      : "text-muted",
                )}
              >
                {Number(d.slice(8))}
              </button>
              {list.slice(0, 3).map((s) => {
                const { h, m } = sgClock(s.startTime);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpen(s)}
                    className={cn(
                      "truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-bold",
                      SLOT_STATE[slotState(s)].block,
                    )}
                  >
                    {formatHour(h, m)} · {s.bookedCount}/{s.capacity}
                  </button>
                );
              })}
              {list.length > 3 && (
                <button
                  type="button"
                  onClick={() => onDay(d)}
                  className="text-left text-[11px] font-bold text-deep underline"
                >
                  +{list.length - 3} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

/** Board "Pickups · list": every slot in range with fill, expected kg and quick actions. */
export function SlotList({
  slots,
  bookingsBySlot,
  today,
  onOpen,
  onEdit,
}: {
  slots: Slot[];
  bookingsBySlot: Map<string, ManagerBooking[]>;
  today: string;
  onOpen: (s: Slot) => void;
  onEdit: (s: Slot) => void;
}) {
  return (
    <DataTable
      head={[
        "Date",
        "Time",
        "Location",
        "Booked",
        "Expected",
        "Status",
        "Actions",
      ]}
    >
      {[...slots]
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((s) => {
          const state = slotState(s);
          const day = sgDayKey(s.startTime);
          return (
            <tr key={s.id} className={rowClass}>
              <td className={`${tdClass} whitespace-nowrap`}>
                <strong>
                  {dayLabel(day, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }).replace(",", "")}
                </strong>
                {day === today && (
                  <Badge tone="leaf" size="sm" className="ml-2">
                    Today
                  </Badge>
                )}
              </td>
              <td className={`${tdClass} whitespace-nowrap`}>{blockTime(s)}</td>
              <td className={tdClass}>{s.effectiveLocation ?? "—"}</td>
              <td className={tdClass}>
                <div className="flex min-w-[140px] items-center gap-2.5">
                  <div className="grow">
                    <ProgressBar
                      value={s.bookedCount}
                      max={s.capacity}
                      label={`${s.bookedCount} of ${s.capacity} places booked`}
                    />
                  </div>
                  <strong className="text-[13px]">
                    {s.bookedCount}/{s.capacity}
                  </strong>
                </div>
              </td>
              <td className={tdClass}>
                {expectedKg(bookingsBySlot.get(s.id) ?? [])}kg
              </td>
              <td className={tdClass}>
                <Badge tone={STATE_TONE[state]} size="sm">
                  {state === "closed" ? "Closed" : SLOT_STATE[state].label}
                </Badge>
              </td>
              <td className={tdClass}>
                <div className="flex gap-3.5 text-[13px] font-bold">
                  <button
                    type="button"
                    onClick={() => onOpen(s)}
                    className="text-deep underline underline-offset-2"
                  >
                    View
                  </button>
                  {s.status !== "CANCELLED" && (
                    <button
                      type="button"
                      onClick={() => onEdit(s)}
                      className="text-deep underline underline-offset-2"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
    </DataTable>
  );
}

// ─── Side panel ───────────────────────────────────────────────────────────────

/** Mini month: jump to any day; dots mark days with slots, the visible range is tinted. */
export function MiniMonth({
  month,
  onMonth,
  today,
  inRange,
  hasSlots,
  onPick,
}: {
  month: string;
  onMonth: (m: string) => void;
  today: string;
  inRange: (day: string) => boolean;
  hasSlots: Set<string>;
  onPick: (day: string) => void;
}) {
  const first = monthStart(month);
  const days = daysBetween(
    weekStart(first),
    addDays(weekStart(addDays(addMonths(first, 1), -1)), 7),
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <strong className="text-small">
          {dayLabel(first, { month: "long", year: "numeric" })}
        </strong>
        <div className="flex">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onMonth(addMonths(first, -1))}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-sage"
          >
            <CaretLeft size={14} weight="bold" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => onMonth(addMonths(first, 1))}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-sage"
          >
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-[11px] font-bold text-muted">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const label = dayLabel(d, { day: "numeric", month: "short" });
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={hasSlots.has(d) ? `${label}, has pickups` : label}
              className={cn(
                "relative h-8 rounded-lg text-xs hover:bg-sage",
                d === today
                  ? "bg-leaf font-bold text-cream hover:bg-deep"
                  : inRange(d)
                    ? "bg-sage font-medium"
                    : "",
                d.slice(0, 7) !== first.slice(0, 7) &&
                  d !== today &&
                  "text-muted",
              )}
            >
              {Number(d.slice(8))}
              {hasSlots.has(d) && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full",
                    d === today ? "bg-cream" : "bg-leaf",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface NeedsBookingItem {
  key: string;
  name: string;
  kg: number;
  bulk: boolean;
  reference: string;
  bookBy: string | null;
  /** Individual: a WhatsApp reminder link. Bulk: book on their behalf. */
  remindHref: string | null;
  allocationId: string | null;
}

/** "Needs booking": approved claims and confirmed allocations with no slot yet. */
export function NeedsBooking({
  items,
  now,
  onBook,
}: {
  items: NeedsBookingItem[] | null;
  now: number;
  onBook: (allocationId: string) => void;
}) {
  return (
    <section aria-label="Needs booking" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h3 className="m-0 font-display text-base font-semibold text-deep">
          Needs booking
        </h3>
        {items && items.length > 0 && (
          <span className="h-5 min-w-5 rounded-full bg-amber-tint px-1.5 text-center text-xs font-bold leading-5 text-amber-ink">
            {items.length}
          </span>
        )}
      </div>
      <p className="text-xs text-muted">
        Approved claims and confirmed bulk allocations with no slot yet.
      </p>
      {items === null ? (
        <p className="text-xs text-muted">Couldn’t load this list.</p>
      ) : items.length === 0 ? (
        <p className="rounded-control bg-sage px-3 py-2.5 text-xs font-semibold text-deep">
          Everyone approved has a pickup booked.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((it) => {
            const hoursLeft = it.bookBy
              ? (new Date(it.bookBy).getTime() - now) / 3_600_000
              : null;
            const urgent = hoursLeft != null && hoursLeft < 48;
            return (
              <li
                key={it.key}
                className="flex flex-col gap-1.5 rounded-control bg-white p-3 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-small">{it.name}</strong>
                  <strong className="text-small text-deep">
                    {formatKg(it.kg)}kg
                  </strong>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <Badge tone={it.bulk ? "soil" : "sage"} size="sm">
                    {it.bulk ? "Bulk" : "Individual"}
                  </Badge>
                  <span>{it.reference}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px] font-bold",
                      urgent ? "text-danger-ink" : "text-muted",
                    )}
                  >
                    <Clock size={12} weight="bold" aria-hidden />
                    {it.bookBy
                      ? `Book by ${dayLabel(sgDayKey(it.bookBy), { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}, ${formatClock(it.bookBy)}`
                      : "No deadline"}
                  </span>
                  {it.allocationId ? (
                    <button
                      type="button"
                      onClick={() => onBook(it.allocationId!)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-leaf px-2.5 text-xs font-bold text-cream hover:bg-deep"
                    >
                      <CalendarPlus size={14} weight="bold" aria-hidden />
                      Book
                    </button>
                  ) : it.remindHref ? (
                    <a
                      href={it.remindHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-deep no-underline shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage"
                    >
                      <ChatCircleText size={14} weight="bold" aria-hidden />
                      Remind
                    </a>
                  ) : null}
                </div>
                {urgent && hoursLeft! > 0 && (
                  <span className="text-[11px] font-bold text-danger-ink">
                    {Math.floor(hoursLeft!)} hrs left
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
