"use client";

import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatTimeRange, formatWeekdayDay, sgDayKey } from "@/lib/format";
import type { Slot } from "@/lib/types";

/**
 * Pickup slots (Taker components): date chips, then that day's time slots. Full slots
 * stay visible but disabled, so takers can see the demand. Used by Book Pickup and
 * Change Pickup. `currentSlotId` marks the slot a booking is already on (Change Pickup).
 */
export function SlotPicker({
  slots,
  day,
  onDayChange,
  selectedId,
  onSelect,
  currentSlotId,
}: {
  slots: Slot[];
  day: string | null;
  onDayChange: (day: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentSlotId?: string;
}) {
  const days = useMemo(() => groupByDay(slots), [slots]);
  const activeDay =
    day && days.some((d) => d.key === day) ? day : (days[0]?.key ?? null);
  const daySlots = days.find((d) => d.key === activeDay)?.slots ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="group"
        aria-label="Pickup date"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {days.map((d) => {
          const on = d.key === activeDay;
          const [weekday, ...rest] = formatWeekdayDay(
            d.slots[0].startTime,
          ).split(" ");
          return (
            <button
              key={d.key}
              type="button"
              aria-pressed={on}
              onClick={() => onDayChange(d.key)}
              className={cn(
                "flex min-w-[92px] flex-1 flex-col items-center gap-0.5 rounded-[14px] px-2 py-2.5",
                on
                  ? "bg-leaf text-cream"
                  : "bg-white text-ink shadow-[inset_0_0_0_1px_rgba(143,142,128,0.6)] hover:bg-sage",
              )}
            >
              <span className="text-[13px] font-semibold leading-4">
                {weekday}
              </span>
              <span className="text-lg font-bold leading-6">
                {rest.join(" ")}
              </span>
              <span className="text-xs leading-4 opacity-85">
                {d.slots.length} slot{d.slots.length === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label={
          activeDay
            ? `Times on ${formatWeekdayDay(daySlots[0].startTime)}`
            : "Times"
        }
        className="flex flex-col gap-2.5"
      >
        {daySlots.map((s) => {
          const current = s.id === currentSlotId;
          const full = s.remainingCapacity <= 0 && !current;
          const on = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={full || current}
              onClick={() => onSelect(s.id)}
              className={cn(
                "flex w-full items-center gap-3.5 rounded-[14px] px-4 py-3.5 text-left text-ink",
                on
                  ? "bg-sage shadow-[inset_0_0_0_2px_var(--color-leaf)]"
                  : full || current
                    ? "cursor-not-allowed bg-disabled opacity-70"
                    : "bg-white shadow-[inset_0_0_0_1px_rgba(143,142,128,0.6)] hover:shadow-[inset_0_0_0_2px_var(--color-leaf)]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-5 shrink-0 rounded-full",
                  on
                    ? "bg-leaf shadow-[inset_0_0_0_5px_var(--color-sage),0_0_0_2px_var(--color-leaf)]"
                    : full || current
                      ? "shadow-[inset_0_0_0_2px_#C9C5B8]"
                      : "bg-white shadow-[inset_0_0_0_2px_var(--color-edge)]",
                )}
              />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[17px] font-bold leading-6">
                  {formatTimeRange(s.startTime, s.endTime)}
                </span>
                <span className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
                  <MapPin size={14} aria-hidden />{" "}
                  {s.effectiveLocation ?? "SUSS bin centre"}
                </span>
              </span>
              <span className="whitespace-nowrap text-[13px] font-bold leading-[18px] text-deep">
                {current
                  ? "Your current slot"
                  : full
                    ? "Full"
                    : `${s.remainingCapacity} of ${s.capacity} spot${s.capacity === 1 ? "" : "s"} left`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function groupByDay(slots: Slot[]): { key: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of [...slots].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )) {
    const key = sgDayKey(s.startTime);
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map.entries()].map(([key, list]) => ({ key, slots: list }));
}
