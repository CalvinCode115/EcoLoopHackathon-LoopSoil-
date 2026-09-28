"use client";

import { useState, type DragEvent } from "react";
import { BookingStatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatKg, sgDayKey } from "@/lib/format";
import type { ManagerBooking, Slot } from "@/lib/types";
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  HOUR_PX,
  SLOT_STATE,
  blockTime,
  bookingParty,
  dayLabel,
  expectedKg,
  formatHour,
  isActive,
  sgClock,
  slotState,
} from "./calendar-utils";

export interface CalendarEvent {
  label: string;
}

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
);
const GRID_H = HOURS.length * HOUR_PX;

function topPx(iso: string): number {
  const { h, m } = sgClock(iso);
  return Math.max(0, (h - GRID_START_HOUR + m / 60) * HOUR_PX);
}

/** Side-by-side lanes for slots that overlap in time on one day. */
function lanes(slots: Slot[]): Map<string, { lane: number; of: number }> {
  const sorted = [...slots].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  const ends: string[] = [];
  const lane = new Map<string, number>();
  for (const s of sorted) {
    let i = ends.findIndex((e) => e <= s.startTime);
    if (i === -1) i = ends.push(s.endTime) - 1;
    else ends[i] = s.endTime;
    lane.set(s.id, i);
  }
  return new Map(
    sorted.map((s) => [
      s.id,
      { lane: lane.get(s.id)!, of: Math.max(1, ends.length) },
    ]),
  );
}

/**
 * Day and Week views (boards "Pickups · week / day"): hour rows from 8am, an all-day strip
 * for batch milestones, slot blocks coloured by fullness, hover details, a "now" line.
 * Drag a block to another time to move the slot (confirmed first); click an empty spot to
 * start a new slot there.
 */
export function TimeGrid({
  days,
  slots,
  bookingsBySlot,
  events,
  today,
  now,
  detailed,
  onOpen,
  onCreateAt,
  onMove,
}: {
  days: string[];
  slots: Slot[];
  bookingsBySlot: Map<string, ManagerBooking[]>;
  events: Map<string, CalendarEvent[]>;
  today: string;
  now: number;
  /** Day view: blocks list their orders instead of a hover card. */
  detailed?: boolean;
  onOpen: (slot: Slot) => void;
  onCreateAt: (day: string, time: string) => void;
  onMove: (slot: Slot, day: string, startMinutes: number) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = sgDayKey(s.startTime);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const nowClock = sgClock(new Date(now).toISOString());
  const nowTop = (nowClock.h - GRID_START_HOUR + nowClock.m / 60) * HOUR_PX;

  function minutesAt(e: {
    clientY: number;
    currentTarget: HTMLElement;
  }): number {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const mins = GRID_START_HOUR * 60 + Math.floor(y / HOUR_PX / 0.5) * 30;
    return Math.min(
      (GRID_END_HOUR - 1) * 60,
      Math.max(GRID_START_HOUR * 60, mins),
    );
  }

  function drop(e: DragEvent<HTMLDivElement>, day: string) {
    e.preventDefault();
    const slot = slots.find(
      (s) => s.id === e.dataTransfer.getData("text/slot"),
    );
    setDragging(null);
    if (slot) onMove(slot, day, minutesAt(e));
  }

  return (
    <div className="overflow-x-auto">
      <div
        className={cn(
          "relative flex flex-col",
          days.length > 1 && "min-w-[720px]",
        )}
      >
        <div className="flex pl-12">
          {days.map((d) => (
            <div
              key={d}
              className={cn(
                "min-w-0 flex-1 rounded-t-[10px] px-1 py-1.5 text-center",
                d === today && "bg-sage",
              )}
            >
              <span className="block text-xs font-bold text-muted">
                {dayLabel(d, { weekday: "short" })}
              </span>
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-small font-bold",
                  d === today ? "bg-leaf text-cream" : "text-ink",
                )}
              >
                {Number(d.slice(8))}
              </span>
            </div>
          ))}
        </div>
        <div className="relative flex pl-12 shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]">
          <span className="absolute left-0 w-11 pt-1.5 text-right text-[10px] text-muted">
            All day
          </span>
          {days.map((d) => (
            <div
              key={d}
              className={cn(
                "flex min-h-[26px] min-w-0 flex-1 flex-col gap-0.5 p-[3px]",
                d === today && "bg-leaf-tint",
              )}
            >
              {(events.get(d) ?? []).map((ev) => (
                <span
                  key={ev.label}
                  title={ev.label}
                  className="block truncate rounded-md bg-amber-tint px-1.5 py-[3px] text-[10px] font-bold leading-[13px] text-amber-ink"
                >
                  {ev.label}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="relative ml-12 flex" style={{ height: GRID_H }}>
          <div aria-hidden className="absolute -left-12 top-0 h-full w-12">
            {HOURS.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 text-[11px] text-muted"
                style={{ top: i * HOUR_PX - 7 }}
              >
                {formatHour(h)}
              </span>
            ))}
          </div>
          {HOURS.map((h, i) => (
            <div
              key={h}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 h-px bg-[rgba(var(--rgb-hair),0.14)]"
              style={{ top: i * HOUR_PX }}
            />
          ))}
          {days.map((d) => {
            const daySlots = byDay.get(d) ?? [];
            const lane = lanes(
              daySlots.filter((s) => s.status !== "CANCELLED"),
            );
            return (
              <div
                key={d}
                role="presentation"
                onDragOver={(e) => dragging && e.preventDefault()}
                onDrop={(e) => drop(e, d)}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const mins = minutesAt(e);
                  onCreateAt(
                    d,
                    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`,
                  );
                }}
                className={cn(
                  "relative min-w-0 flex-1 cursor-copy border-l border-[rgba(var(--rgb-hair),0.1)]",
                  d === today && "bg-leaf-tint/60",
                  dragging && "bg-sage/30",
                )}
              >
                {daySlots.map((s) => {
                  const state = slotState(s);
                  const bookings = bookingsBySlot.get(s.id) ?? [];
                  const active = bookings.filter(isActive);
                  const top = topPx(s.startTime);
                  const height = Math.max(26, topPx(s.endTime) - top - 4);
                  const pos = lane.get(s.id) ?? { lane: 0, of: 1 };
                  const past = new Date(s.endTime).getTime() < now;
                  const movable = s.status !== "CANCELLED" && !past;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      draggable={movable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/slot", s.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(s.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => onOpen(s)}
                      aria-label={`${blockTime(s)}, ${s.effectiveLocation ?? "no location"}, ${s.bookedCount} of ${s.capacity} booked, ${SLOT_STATE[state].label}`}
                      className={cn(
                        "group absolute flex flex-col gap-[3px] overflow-visible rounded-[10px] px-2 py-1.5 text-left hover:shadow-[0_0_0_2px_var(--color-deep),0_1px_2px_rgba(var(--rgb-shade),0.06),0_8px_24px_rgba(var(--rgb-shade),0.08)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-leaf",
                        SLOT_STATE[state].block,
                        past && "opacity-70",
                        dragging === s.id && "opacity-40",
                        movable && "cursor-grab",
                      )}
                      style={{
                        top: top + 2,
                        height,
                        left: `calc(${(pos.lane / pos.of) * 100}% + 3px)`,
                        width: `calc(${100 / pos.of}% - 6px)`,
                      }}
                    >
                      <strong className="truncate text-xs">
                        {blockTime(s)}
                      </strong>
                      {height > 44 && (
                        <span className="truncate text-[11px] opacity-80">
                          {detailed
                            ? s.effectiveLocation
                            : shortLocation(s.effectiveLocation)}
                        </span>
                      )}
                      {height > 60 && (
                        <span className="truncate text-[11px] font-bold">
                          {s.bookedCount}/{s.capacity} booked
                          {detailed ? ` · ${SLOT_STATE[state].label}` : ""}
                        </span>
                      )}
                      {detailed && height > 80 && (
                        <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 no-underline">
                          {bookings
                            .slice(0, Math.floor((height - 70) / 26))
                            .map((b) => {
                              const p = bookingParty(b);
                              return (
                                <li
                                  key={b.id}
                                  className="flex items-center justify-between gap-2 rounded-md bg-cream/80 px-2 py-0.5 text-[11px] text-ink"
                                >
                                  <span className="truncate">
                                    <strong>{p.name}</strong> ·{" "}
                                    {p.bulk ? "Bulk" : "Individual"} ·{" "}
                                    {formatKg(p.kg)}kg
                                  </span>
                                  <BookingStatusBadge status={b.status} />
                                </li>
                              );
                            })}
                        </ul>
                      )}
                      {!detailed && active.length > 0 && (
                        <div
                          role="tooltip"
                          className="pointer-events-none invisible absolute left-[calc(100%+8px)] top-0 z-30 w-[230px] rounded-control bg-cream p-3 text-xs text-ink no-underline opacity-0 shadow-photo transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
                        >
                          <strong className="mb-1.5 block text-small text-deep">
                            {blockTime(s)} · {s.bookedCount}/{s.capacity} booked
                          </strong>
                          {active.map((b) => {
                            const p = bookingParty(b);
                            return (
                              <span
                                key={b.id}
                                className="flex justify-between gap-2 py-0.5"
                              >
                                <span className="truncate">{p.name}</span>
                                <strong>{formatKg(p.kg)}kg</strong>
                              </span>
                            );
                          })}
                          <span className="mt-1 flex justify-between border-t border-[rgba(var(--rgb-hair),0.2)] pt-1.5 text-muted">
                            Total expected{" "}
                            <strong className="text-ink">
                              {expectedKg(bookings)}kg
                            </strong>
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
                {d === today && nowTop >= 0 && nowTop <= GRID_H && (
                  <div
                    aria-label={`Now ${formatHour(nowClock.h, nowClock.m)}`}
                    className="pointer-events-none absolute -left-1 right-0 z-10 h-0.5 bg-error"
                    style={{ top: nowTop }}
                  >
                    <span className="absolute -left-0.5 -top-1 size-2.5 rounded-full bg-error" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function shortLocation(loc: string | null): string {
  if (!loc) return "";
  return loc.replace(/^SUSS\s+/i, "").replace(/^\w/, (c) => c.toUpperCase());
}
