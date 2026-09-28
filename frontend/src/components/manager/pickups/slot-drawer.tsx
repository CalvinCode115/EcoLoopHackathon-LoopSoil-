"use client";

import { X } from "@phosphor-icons/react/dist/ssr/X";
import { useEffect, useRef, useState } from "react";
import { ProgressBar } from "@/components/manager/panel";
import { Badge, BookingStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatKg } from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { ManagerBooking, Slot } from "@/lib/types";
import {
  SLOT_STATE,
  bookingParty,
  expectedKg,
  slotState,
  slotTitle,
} from "./calendar-utils";

/**
 * Slot drawer (boards "Pickups · drawer / drawer closed"): who's booked, per-booking actions
 * (Start handover, Mark no-show, Move to another slot) and slot actions (Edit, Close /
 * Reopen, Cancel). POST /slots/:id/close|open.
 */
export function SlotDrawer({
  slot,
  bookings,
  now,
  onClose,
  onEdit,
  onCancelSlot,
  onNoShow,
  onMoveBooking,
  onChanged,
  onError,
}: {
  slot: Slot;
  bookings: ManagerBooking[] | null;
  now: number;
  onClose: () => void;
  onEdit: () => void;
  onCancelSlot: () => void;
  onNoShow: (b: ManagerBooking) => void;
  onMoveBooking: (b: ManagerBooking) => void;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const state = slotState(slot);
  const cancelled = slot.status === "CANCELLED";
  // The backend only allows a no-show once the slot has started.
  const started = new Date(slot.startTime).getTime() <= now;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  async function toggleOpen() {
    setBusy(true);
    try {
      await api.post(
        `/slots/${slot.id}/${slot.status === "CLOSED" ? "open" : "close"}`,
      );
      onChanged(
        slot.status === "CLOSED"
          ? "Slot reopened to new bookings"
          : "Slot closed to new bookings",
      );
    } catch (err) {
      onError(
        friendlyError(err, "Couldn’t update this slot. Please try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  // Active bookings first, then the history (no-shows, cancelled).
  const ordered = [...(bookings ?? [])].sort(
    (a, b) => Number(b.status === "BOOKED") - Number(a.status === "BOOKED"),
  );

  return (
    <div className="fixed inset-0 z-[55]">
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgba(28,36,22,0.35)]"
        onClick={onClose}
      />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-t"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-cream shadow-photo outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-5 shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
              Slot details
            </span>
            <h2
              id="drawer-t"
              className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
            >
              {slotTitle(slot)}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-small text-muted">
              {slot.effectiveLocation}
              <Badge
                tone={
                  state === "full"
                    ? "deep"
                    : state === "almost"
                      ? "amber"
                      : state === "open"
                        ? "sage"
                        : "grey"
                }
                size="sm"
              >
                {SLOT_STATE[state].label}
              </Badge>
              {slot.batch && <span>· Batch {slot.batch.reference}</span>}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-sage"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        <div className="flex grow flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-2">
            <strong className="text-small">
              {slot.bookedCount} of {slot.capacity} booked ·{" "}
              {bookings ? expectedKg(bookings) : "–"}kg expected
            </strong>
            <ProgressBar
              value={slot.bookedCount}
              max={slot.capacity}
              label={`${slot.bookedCount} of ${slot.capacity} places booked`}
            />
          </div>
          {slot.note && (
            <p className="rounded-control bg-surface px-3.5 py-2.5 text-small">
              {slot.note}
            </p>
          )}

          <h3 className="m-0 text-xs font-bold uppercase tracking-[0.08em] text-muted">
            Orders in this slot
          </h3>
          {bookings === null ? (
            <p className="text-small text-muted">
              Couldn’t load the bookings for this slot.
            </p>
          ) : ordered.length === 0 ? (
            <p className="rounded-control bg-surface px-3.5 py-3 text-small text-muted">
              Nobody has booked this slot yet.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {ordered.map((b) => {
                const p = bookingParty(b);
                const live = b.status === "BOOKED";
                return (
                  <li
                    key={b.id}
                    className="flex flex-col gap-2.5 rounded-control bg-surface p-3.5 shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.3)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="truncate">{p.name}</strong>
                          <Badge tone={p.bulk ? "soil" : "sage"} size="sm">
                            {p.bulk ? "Bulk" : "Individual"}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted">
                          {p.reference}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <strong className="text-deep">
                          {formatKg(p.kg)}kg
                        </strong>
                        <BookingStatusBadge status={b.status} />
                      </div>
                    </div>
                    {live && !cancelled && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Button
                          href={`/manager/handover?booking=${b.id}`}
                          size="sm"
                          className="h-10 px-4"
                        >
                          Start handover
                        </Button>
                        {started && (
                          <button
                            type="button"
                            onClick={() => onNoShow(b)}
                            className="text-[13px] font-bold text-error underline"
                          >
                            Mark no-show
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onMoveBooking(b)}
                          className="text-[13px] font-bold text-deep underline"
                        >
                          Move to another slot
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!cancelled && (
          <div className="flex flex-wrap items-center gap-2.5 px-6 py-4 shadow-[inset_0_1px_0_rgba(var(--rgb-hair),0.14)]">
            <Button
              variant="secondary"
              size="sm"
              className="px-4"
              onClick={onEdit}
            >
              Edit slot
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="px-4"
              loading={busy}
              onClick={() => void toggleOpen()}
            >
              {slot.status === "CLOSED" ? "Reopen" : "Close to new bookings"}
            </Button>
            <button
              type="button"
              onClick={onCancelSlot}
              className="ml-auto h-11 rounded-control px-3 text-small font-bold text-error hover:bg-danger-tint"
            >
              Cancel slot
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
