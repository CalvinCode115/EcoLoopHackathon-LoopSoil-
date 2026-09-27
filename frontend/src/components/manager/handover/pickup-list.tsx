"use client";

import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { UserMinus } from "@phosphor-icons/react/dist/ssr/UserMinus";
import { useRef, useState, type PointerEvent } from "react";
import { bookingParty } from "@/components/manager/pickups/calendar-utils";
import { BookingStatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatKg, formatTimeRange } from "@/lib/format";
import type { ManagerBooking, Slot } from "@/lib/types";
import { TypeTag } from "./handover-ui";

type Phase = "earlier" | "now" | "later";
const PHASE: Record<Phase, { label: string; className: string }> = {
  earlier: { label: "Earlier", className: "bg-grey-tint text-grey-ink" },
  now: { label: "Now", className: "bg-leaf text-cream" },
  later: { label: "Later", className: "bg-[#ECE6D8] text-muted" },
};

/**
 * Today's pickups (board "Handover · home"): one group per slot — Earlier / Now / Later —
 * with who's waiting and who's collected. Tap a waiting row to record it; swipe it left
 * (or use the No-show button on wider screens) to mark a no-show once the slot has started.
 */
export function PickupList({
  slots,
  bookings,
  now,
  query,
  selectedId,
  onOpen,
  onNoShow,
}: {
  slots: Slot[];
  bookings: ManagerBooking[];
  now: number;
  query: string;
  selectedId: string | null;
  onOpen: (b: ManagerBooking) => void;
  onNoShow: (b: ManagerBooking) => void;
}) {
  const q = query.trim().toLowerCase();
  const groups = slots
    .filter((s) => s.status !== "CANCELLED")
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((s) => {
      const phase: Phase =
        new Date(s.endTime).getTime() < now
          ? "earlier"
          : new Date(s.startTime).getTime() <= now
            ? "now"
            : "later";
      const rows = bookings
        .filter((b) => b.slot.id === s.id && b.status !== "CANCELLED")
        .filter((b) => {
          if (!q) return true;
          const p = bookingParty(b);
          return (
            p.name.toLowerCase().includes(q) ||
            p.reference.toLowerCase().includes(q)
          );
        })
        .sort(
          (a, b) =>
            Number(a.status !== "BOOKED") - Number(b.status !== "BOOKED"),
        );
      const active = bookings.filter(
        (b) =>
          b.slot.id === s.id &&
          (b.status === "BOOKED" || b.status === "COLLECTED"),
      );
      return {
        slot: s,
        phase,
        rows,
        collected: active.filter((b) => b.status === "COLLECTED").length,
        total: active.length,
      };
    })
    .filter((g) => g.total > 0 || g.rows.length > 0)
    .filter((g) => !q || g.rows.length > 0);

  if (groups.length === 0 && q) {
    return (
      <p className="px-1 py-6 text-center text-body text-muted">
        No pickups today match “{query.trim()}”. Press Enter to look up the
        reference.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((g) => (
        <SlotGroup
          key={g.slot.id}
          {...g}
          now={now}
          forceOpen={!!q}
          selectedId={selectedId}
          onOpen={onOpen}
          onNoShow={onNoShow}
        />
      ))}
    </div>
  );
}

function SlotGroup({
  slot,
  phase,
  rows,
  collected,
  total,
  now,
  forceOpen,
  selectedId,
  onOpen,
  onNoShow,
}: {
  slot: Slot;
  phase: Phase;
  rows: ManagerBooking[];
  collected: number;
  total: number;
  now: number;
  forceOpen: boolean;
  selectedId: string | null;
  onOpen: (b: ManagerBooking) => void;
  onNoShow: (b: ManagerBooking) => void;
}) {
  // Earlier slots start folded unless someone there is still waiting.
  const [open, setOpen] = useState(
    phase !== "earlier" || rows.some((b) => b.status === "BOOKED"),
  );
  const shown = open || forceOpen;
  const time = formatTimeRange(slot.startTime, slot.endTime);
  const started = new Date(slot.startTime).getTime() <= now;
  return (
    <section aria-label={`Slot ${time}`} className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full items-center gap-2.5 px-1 py-2 text-left text-ink"
      >
        <div className="flex grow flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <strong className="text-body">{time}</strong>
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold",
                PHASE[phase].className,
              )}
            >
              {PHASE[phase].label}
            </span>
          </span>
          <span className="text-[13px] text-muted">
            {slot.effectiveLocation ?? "No location"} · {collected}/{total}{" "}
            collected
          </span>
        </div>
        <CaretDown
          size={18}
          className={cn(
            "text-muted transition-transform",
            !shown && "-rotate-90",
          )}
          aria-hidden
        />
      </button>
      {shown && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((b) => (
            <PickupRow
              key={b.id}
              booking={b}
              canNoShow={started}
              selected={b.id === selectedId}
              onOpen={onOpen}
              onNoShow={onNoShow}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const REVEAL = 112;

function PickupRow({
  booking,
  canNoShow,
  selected,
  onOpen,
  onNoShow,
}: {
  booking: ManagerBooking;
  canNoShow: boolean;
  selected: boolean;
  onOpen: (b: ManagerBooking) => void;
  onNoShow: (b: ManagerBooking) => void;
}) {
  const p = bookingParty(booking);
  const waiting = booking.status === "BOOKED";
  const swipeable = waiting && canNoShow;
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; base: number; moved: boolean } | null>(
    null,
  );

  function down(e: PointerEvent) {
    if (!swipeable || e.pointerType === "mouse") return;
    start.current = { x: e.clientX, base: dx, moved: false };
  }
  function move(e: PointerEvent) {
    if (!start.current) return;
    const d = e.clientX - start.current.x;
    if (Math.abs(d) > 8) start.current.moved = true;
    setDx(Math.min(0, Math.max(-REVEAL, start.current.base + d)));
  }
  function up() {
    if (!start.current) return;
    setDx((x) => (x < -REVEAL / 2 ? -REVEAL : 0));
    setTimeout(() => (start.current = null));
  }

  const label = `${p.name}, ${p.reference}, ${formatKg(p.kg)}kg, ${waiting ? "waiting" : booking.status.toLowerCase().replace("_", "-")}`;

  return (
    <li className="relative flex items-stretch gap-2">
      <div className="relative grow overflow-hidden rounded-[14px]">
        {swipeable && (
          <button
            type="button"
            tabIndex={dx < 0 ? 0 : -1}
            aria-hidden={dx === 0}
            onClick={() => {
              setDx(0);
              onNoShow(booking);
            }}
            className="absolute inset-y-0 right-0 flex w-[112px] flex-col items-center justify-center gap-1 bg-error text-[13px] font-bold text-cream"
          >
            <UserMinus size={20} aria-hidden />
            Mark no-show
          </button>
        )}
        <button
          type="button"
          aria-label={label}
          aria-current={selected || undefined}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onClick={() => {
            if (start.current?.moved || dx !== 0) {
              setDx(0);
              return;
            }
            onOpen(booking);
          }}
          style={{
            transform: `translateX(${dx}px)`,
            touchAction: swipeable ? "pan-y" : undefined,
          }}
          className={cn(
            "relative z-[2] flex min-h-[76px] w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-ink transition-transform",
            waiting ? "bg-white hover:bg-row-hover" : "bg-[#F1EDE3]",
            selected
              ? "shadow-[inset_0_0_0_2px_var(--color-leaf)]"
              : "shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]",
          )}
        >
          {booking.status === "COLLECTED" && (
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-leaf text-cream"
            >
              <Check size={16} weight="bold" />
            </span>
          )}
          <div className="flex min-w-0 grow flex-col gap-1">
            <strong className="truncate text-body">{p.name}</strong>
            <div className="flex min-w-0 items-center gap-1.5">
              <TypeTag bulk={p.bulk} />
              <span className="truncate text-[13px] text-muted">
                {p.reference}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              className={cn(
                "font-display text-2xl font-semibold leading-[26px]",
                waiting ? "text-deep" : "text-muted",
              )}
            >
              {formatKg(p.kg)}
              <span className="text-small">kg</span>
            </span>
            {waiting ? (
              <span className="inline-flex h-6 items-center rounded-full bg-amber-tint px-2.5 text-xs font-bold text-amber-ink">
                Waiting
              </span>
            ) : (
              <BookingStatusBadge status={booking.status} />
            )}
          </div>
        </button>
      </div>
      {swipeable && (
        <button
          type="button"
          onClick={() => onNoShow(booking)}
          aria-label={`Mark ${p.name} as no-show`}
          className="hidden w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] text-xs font-bold text-error shadow-[inset_0_0_0_1.5px_var(--color-error)] hover:bg-danger-tint md:flex"
        >
          <UserMinus size={18} aria-hidden />
          No-show
        </button>
      )}
    </li>
  );
}
