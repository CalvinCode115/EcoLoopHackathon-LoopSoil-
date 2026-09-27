"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FormErrorBanner } from "@/components/auth/auth-layout";
import { SheetActions } from "@/components/manager/batch-detail/batch-sheets";
import { Button } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { api, type Paginated } from "@/lib/api";
import { addDays } from "@/lib/batch-form";
import { cn } from "@/lib/cn";
import { formatKg, sgDayKey } from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { Allocation, Batch, ManagerBooking, Slot } from "@/lib/types";
import {
  bookingParty,
  dayLabel,
  daysBetween,
  sgInstant,
  sgTimeInput,
  slotTitle,
  weekdayIndex,
} from "./calendar-utils";

const titleClass =
  "font-display m-0 text-[22px] font-semibold leading-[30px] text-deep";
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MAX_REPEAT = 60;
export const DEFAULT_LOCATION = "SUSS bin centre";

type Repeat = "none" | "daily" | "weekly";

/**
 * New / edit slot (boards "Pickups · create / create errors / create busy / edit").
 * Repeat creates one slot per matching day (POST /slots each). Edit: PATCH /slots/:id —
 * the linked batch can't change, and capacity can't drop below who's booked.
 */
export function SlotFormSheet({
  slot,
  defaults,
  batches,
  existing,
  onClose,
  onDone,
}: {
  slot?: Slot | null;
  defaults: { day: string; time?: string; batchId?: string };
  batches: Batch[];
  existing: Slot[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const editing = !!slot;
  const startDefault = defaults.time ?? "10:00";
  const [day, setDay] = useState(
    slot ? sgDayKey(slot.startTime) : defaults.day,
  );
  const [start, setStart] = useState(
    slot ? sgTimeInput(slot.startTime) : startDefault,
  );
  const [end, setEnd] = useState(
    slot
      ? sgTimeInput(slot.endTime)
      : `${String(Math.min(23, Number(startDefault.slice(0, 2)) + 2)).padStart(2, "0")}:${startDefault.slice(3)}`,
  );
  const [location, setLocation] = useState(
    slot?.location ?? slot?.effectiveLocation ?? DEFAULT_LOCATION,
  );
  const [capacity, setCapacity] = useState(String(slot?.capacity ?? 5));
  const [batchId, setBatchId] = useState(
    slot?.batchId ?? defaults.batchId ?? "",
  );
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [weekdays, setWeekdays] = useState<number[]>(() => [
    weekdayIndex(defaults.day),
  ]);
  const [until, setUntil] = useState(addDays(defaults.day, 14));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = Number(capacity);
  const booked = slot?.bookedCount ?? 0;
  const occurrences =
    editing || repeat === "none" || !day
      ? day
        ? [day]
        : []
      : daysBetween(day, addDays(until, 1))
          .filter(
            (d) => repeat === "daily" || weekdays.includes(weekdayIndex(d)),
          )
          .slice(0, MAX_REPEAT);

  const errors: Record<string, string> = {};
  if (!day) errors.day = "Pick a date";
  if (!start) errors.start = "Pick a start time";
  if (!end) errors.end = "Pick an end time";
  else if (start && end <= start)
    errors.end = "End time must be after start time";
  if (!(cap >= 1) || !Number.isInteger(cap))
    errors.capacity = "Capacity must be at least 1";
  else if (cap < booked)
    errors.capacity = `${booked} already booked · capacity can’t go below ${booked}`;
  if (!editing && repeat !== "none") {
    if (!until || until < day)
      errors.until = "“Until” must be on or after the date";
    else if (repeat === "weekly" && weekdays.length === 0)
      errors.until = "Pick at least one day";
    else if (occurrences.length === 0)
      errors.until = "No days match — check the repeat days";
  }
  const shown = attempted ? errors : {};

  const overlap =
    day && start && end && end > start
      ? existing.find(
          (s) =>
            s.id !== slot?.id &&
            s.status !== "CANCELLED" &&
            (s.effectiveLocation ?? "").toLowerCase() ===
              location.trim().toLowerCase() &&
            occurrences.includes(sgDayKey(s.startTime)) &&
            sgTimeInput(s.startTime) < end &&
            sgTimeInput(s.endTime) > start &&
            sgDayKey(s.startTime) === sgDayKey(s.endTime),
        )
      : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);
    if (Object.keys(errors).length) return;
    setSaving(true);
    const body = (d: string) => ({
      startTime: sgInstant(d, start),
      endTime: sgInstant(d, end),
      location: location.trim() || undefined,
      capacity: cap,
    });
    try {
      if (slot) {
        await api.patch(`/slots/${slot.id}`, body(day));
        onDone(
          `Slot updated · ${slotTitle({ startTime: sgInstant(day, start), endTime: sgInstant(day, end) })}`,
        );
        return;
      }
      let made = 0;
      try {
        for (const d of occurrences) {
          await api.post("/slots", {
            ...body(d),
            batchId: batchId || undefined,
          });
          made += 1;
        }
      } catch (err) {
        if (made === 0) throw err;
        onDone(
          `${made} of ${occurrences.length} slots created. The rest failed: ${friendlyError(err)}`,
        );
        return;
      }
      const first = {
        startTime: sgInstant(occurrences[0], start),
        endTime: sgInstant(occurrences[0], end),
      };
      onDone(
        made === 1
          ? `Slot created · ${slotTitle(first)}`
          : `${made} slots created · ${
              repeat === "daily"
                ? "Daily"
                : weekdays
                    .map(
                      (w) =>
                        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][w],
                    )
                    .join(" & ")
            } until ${dayLabel(until, { day: "numeric", month: "short" })}`,
      );
    } catch (err) {
      setSaving(false);
      setError(
        friendlyError(err, "Couldn’t save this slot. Please try again."),
      );
    }
  }

  const linkable = batches.filter((b) => b.status !== "COMPLETED");

  return (
    <Sheet
      labelledBy="slot-form-title"
      onClose={onClose}
      className="md:max-w-[560px]"
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <h3 id="slot-form-title" className={titleClass}>
          {editing ? "Edit slot" : "New pickup slot"}
        </h3>
        {editing && booked > 0 && (
          <p className="rounded-control bg-amber-tint px-3.5 py-2.5 text-small text-amber-ink">
            <strong>{booked} already booked</strong> in this slot. They’ll see
            any time change in the app.
          </p>
        )}
        {error && <FormErrorBanner>{error}</FormErrorBanner>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="sl-date"
            label="Date"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            errorText={shown.day}
            required
          />
          <Field
            id="sl-start"
            label="Start time"
            type="time"
            step={900}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            errorText={shown.start}
            required
          />
          <Field
            id="sl-end"
            label="End time"
            type="time"
            step={900}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            errorText={shown.end}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field
            id="sl-loc"
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            required
          />
          <Field
            id="sl-cap"
            label="Capacity (people)"
            type="number"
            inputMode="numeric"
            min={Math.max(1, booked)}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            helperText="How many takers can book this slot"
            errorText={shown.capacity}
            required
          />
        </div>
        <SelectField
          id="sl-batch"
          label="Linked batch (optional)"
          value={batchId}
          disabled={editing}
          onChange={(e) => setBatchId(e.target.value)}
          helperText={
            editing
              ? "A slot’s batch can’t change — cancel and create a new slot instead."
              : undefined
          }
        >
          <option value="">Any open batch</option>
          {linkable.map((b) => (
            <option key={b.id} value={b.id}>
              {b.reference}
            </option>
          ))}
        </SelectField>

        {!editing && (
          <fieldset className="m-0 flex flex-col gap-3 border-none p-0">
            <legend className="mb-2 p-0 text-small font-semibold">
              Repeat
            </legend>
            <div
              role="radiogroup"
              aria-label="Repeat"
              className="flex flex-wrap gap-x-5 gap-y-2"
            >
              {(
                [
                  ["none", "Does not repeat"],
                  ["daily", "Daily"],
                  ["weekly", "Weekly on selected days"],
                ] as [Repeat, string][]
              ).map(([v, label]) => (
                <label
                  key={v}
                  className="inline-flex cursor-pointer items-center gap-2 text-small"
                >
                  <input
                    type="radio"
                    name="repeat"
                    value={v}
                    checked={repeat === v}
                    onChange={() => setRepeat(v)}
                    className="size-4 accent-[var(--color-leaf)]"
                  />
                  {label}
                </label>
              ))}
            </div>
            {repeat === "weekly" && (
              <div
                role="group"
                aria-label="Repeat on"
                className="flex flex-wrap gap-1.5"
              >
                {WEEKDAYS.map((w, i) => {
                  const on = weekdays.includes(i);
                  return (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setWeekdays((prev) =>
                          on
                            ? prev.filter((x) => x !== i)
                            : [...prev, i].sort(),
                        )
                      }
                      className={cn(
                        "size-10 rounded-full text-[13px] font-bold",
                        on
                          ? "bg-leaf text-cream"
                          : "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] hover:bg-sage",
                      )}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            )}
            {repeat !== "none" && (
              <>
                <Field
                  id="sl-until"
                  label="Until"
                  type="date"
                  value={until}
                  min={day}
                  onChange={(e) => setUntil(e.target.value)}
                  errorText={shown.until}
                  className="max-w-[220px]"
                  required
                />
                {occurrences.length > 0 && (
                  <div className="rounded-control bg-sage px-3.5 py-2.5 text-small font-semibold text-deep">
                    This will create {occurrences.length} slot
                    {occurrences.length === 1 ? "" : "s"} between{" "}
                    {dayLabel(occurrences[0], {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    and{" "}
                    {dayLabel(occurrences[occurrences.length - 1], {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    .
                  </div>
                )}
              </>
            )}
          </fieldset>
        )}

        {overlap && (
          <div
            role="note"
            className="flex items-start gap-2 rounded-control bg-amber-tint px-3.5 py-2.5 text-small text-amber-ink"
          >
            <WarningCircle
              size={18}
              weight="bold"
              className="mt-0.5 shrink-0"
              aria-hidden
            />
            <span>
              Overlaps an existing slot at {overlap.effectiveLocation}:{" "}
              {slotTitle(overlap)}
              {overlap.batch ? ` (${overlap.batch.reference})` : ""}. You can
              still create it.
            </span>
          </div>
        )}

        <SheetActions>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="px-[18px]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="md"
            className="px-[18px]"
            loading={saving}
          >
            {editing
              ? "Save changes"
              : occurrences.length > 1
                ? `Create ${occurrences.length} slots`
                : "Create slot"}
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}

/** Board "Pickups · cancel": bookings are cancelled and the people asked to rebook. POST /slots/:id/cancel. */
export function CancelSlotSheet({
  slot,
  onClose,
  onDone,
}: {
  slot: Slot;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = slot.bookedCount;

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/slots/${slot.id}/cancel`, {
        message: message.trim() || undefined,
      });
      onDone(
        n
          ? `Slot cancelled · ${n} ${n === 1 ? "person" : "people"} asked to rebook`
          : "Slot cancelled",
      );
    } catch (err) {
      setSaving(false);
      setError(
        friendlyError(err, "Couldn’t update this slot. Please try again."),
      );
    }
  }

  return (
    <Sheet labelledBy="cancel-slot-title" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h3 id="cancel-slot-title" className={titleClass}>
          Cancel this slot?
        </h3>
        <span className="text-body text-muted">
          {n
            ? `${n} ${n === 1 ? "person is" : "people are"} booked. Their bookings will be cancelled and they’ll be asked to rebook.`
            : "Nobody is booked into this slot."}
        </span>
      </div>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      {n > 0 && (
        <TextAreaField
          id="cs-msg"
          label="Message to takers (optional)"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. The bin centre is closed this afternoon. Please pick another time this week."
          maxLength={500}
        />
      )}
      <p className="text-[13px] text-muted">
        {slotTitle(slot)} · {slot.effectiveLocation}
      </p>
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Keep slot
        </Button>
        <Button
          variant="danger"
          size="md"
          className="px-[18px]"
          loading={saving}
          onClick={() => void confirm()}
        >
          Cancel slot
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** Board "Pickups · drag": confirm moving a slot to the time it was dropped on. PATCH /slots/:id. */
export function MoveSlotSheet({
  slot,
  to,
  onClose,
  onDone,
}: {
  slot: Slot;
  to: { startTime: string; endTime: string };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/slots/${slot.id}`, to);
      onDone(`Slot moved · ${slotTitle(to)}`);
    } catch (err) {
      setSaving(false);
      setError(
        friendlyError(err, "Couldn’t update this slot. Please try again."),
      );
    }
  }

  return (
    <Sheet labelledBy="move-slot-title" onClose={onClose}>
      <h3 id="move-slot-title" className={titleClass}>
        Move this slot?
      </h3>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-control bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
        <div>
          <span className="text-xs text-muted">From</span>
          <div className="font-semibold">{slotTitle(slot)}</div>
        </div>
        <ArrowRight size={20} className="text-leaf" aria-hidden />
        <div>
          <span className="text-xs text-muted">To</span>
          <div className="font-semibold text-leaf">{slotTitle(to)}</div>
        </div>
      </div>
      {slot.bookedCount > 0 && (
        <p className="text-small text-muted">
          {slot.bookedCount}{" "}
          {slot.bookedCount === 1 ? "person is" : "people are"} booked. They’ll
          see the new time in the app — message them if it’s short notice.
        </p>
      )}
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          size="md"
          className="px-[18px]"
          loading={saving}
          onClick={() => void confirm()}
        >
          Move slot
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** Open, upcoming slots with space (for booking / moving). */
function useBookableSlots(excludeId?: string): Slot[] | null | "error" {
  const [slots, setSlots] = useState<Slot[] | null | "error">(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<Paginated<Slot>>("/slots?status=OPEN&upcoming=true&pageSize=100")
      .then(
        (p) =>
          !cancelled &&
          setSlots(
            p.data.filter((s) => s.remainingCapacity > 0 && s.id !== excludeId),
          ),
      )
      .catch(() => !cancelled && setSlots("error"));
    return () => {
      cancelled = true;
    };
  }, [excludeId]);
  return slots;
}

function SlotChoices({
  slots,
  value,
  onChange,
  empty,
}: {
  slots: Slot[] | null | "error";
  value: string;
  onChange: (id: string) => void;
  empty: string;
}) {
  if (slots === "error")
    return (
      <FormErrorBanner>
        Couldn’t load the open slots. Close this and try again.
      </FormErrorBanner>
    );
  if (slots === null)
    return <p className="text-small text-muted">Loading open slots…</p>;
  if (slots.length === 0)
    return (
      <p className="rounded-control bg-amber-tint px-3.5 py-2.5 text-small text-amber-ink">
        {empty}
      </p>
    );
  return (
    <div
      role="radiogroup"
      className="flex max-h-[240px] flex-col gap-2 overflow-y-auto"
    >
      {slots.map((s) => (
        <Choice
          key={s.id}
          name="slot"
          checked={value === s.id}
          onChange={() => onChange(s.id)}
        >
          <strong className="text-small">{slotTitle(s)}</strong>
          <div className="text-xs text-muted">{s.effectiveLocation}</div>
          <span className="text-xs font-bold text-deep">
            {s.remainingCapacity} spot{s.remainingCapacity === 1 ? "" : "s"}{" "}
            left
          </span>
        </Choice>
      ))}
    </div>
  );
}

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-control bg-white p-3",
        checked
          ? "shadow-[inset_0_0_0_2px_var(--color-leaf)]"
          : "shadow-[inset_0_0_0_1px_rgba(143,142,128,0.4)] hover:bg-row-hover",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 accent-[var(--color-leaf)]"
      />
      <span className="flex min-w-0 flex-col gap-0.5">{children}</span>
    </label>
  );
}

/**
 * Board "Pickups · book for bulk taker": pick a confirmed allocation without a pickup, then
 * an open slot. POST /bookings/on-behalf. Bulk takers don't log in, so the manager books.
 */
export function BulkBookSheet({
  allocations,
  initialAllocationId,
  onClose,
  onDone,
}: {
  allocations: Allocation[];
  initialAllocationId?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [allocationId, setAllocationId] = useState(
    initialAllocationId ?? allocations[0]?.id ?? "",
  );
  const [slotId, setSlotId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slots = useBookableSlots();
  const allocation = allocations.find((a) => a.id === allocationId);
  const bookBy = allocation?.batch?.availableUntil ?? null;
  const fitting = Array.isArray(slots)
    ? slots.filter((s) => !bookBy || s.startTime <= bookBy)
    : slots;

  async function submit() {
    if (!allocationId || !slotId) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/bookings/on-behalf", { slotId, allocationId });
      const s = Array.isArray(slots)
        ? slots.find((x) => x.id === slotId)
        : undefined;
      onDone(
        `Pickup booked · ${allocation?.taker.name}${s ? `, ${slotTitle(s)}` : ""}`,
      );
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet
      labelledBy="bulk-book-title"
      onClose={onClose}
      className="md:max-w-[560px]"
    >
      <h3 id="bulk-book-title" className={titleClass}>
        Book pickup for bulk taker
      </h3>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <div className="flex flex-col gap-2">
        <span className="text-small font-bold">1. Allocation</span>
        <p className="text-xs text-muted">
          Only confirmed allocations without a pickup are shown.
        </p>
        {allocations.length === 0 ? (
          <p className="rounded-control bg-sage px-3.5 py-2.5 text-small text-deep">
            Every confirmed allocation already has a pickup. Confirm allocations
            on a batch’s Allocations tab.
          </p>
        ) : (
          <div
            role="radiogroup"
            className="flex max-h-[200px] flex-col gap-2 overflow-y-auto"
          >
            {allocations.map((a) => (
              <Choice
                key={a.id}
                name="allocation"
                checked={allocationId === a.id}
                onChange={() => {
                  setAllocationId(a.id);
                  setSlotId("");
                }}
              >
                <strong className="text-small">
                  {a.taker.name} · {formatKg(Number(a.allocatedKg))}kg
                </strong>
                <span className="text-xs text-muted">
                  {a.reference} · Batch {a.batch?.reference} · Confirmed
                </span>
                {a.batch?.availableUntil && (
                  <span className="text-xs font-bold text-amber-ink">
                    Book by{" "}
                    {
                      slotTitle({
                        startTime: a.batch.availableUntil,
                        endTime: a.batch.availableUntil,
                      }).split(" · ")[0]
                    }
                  </span>
                )}
              </Choice>
            ))}
          </div>
        )}
      </div>
      {allocations.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-small font-bold">2. Slot</span>
          <p className="text-xs text-muted">
            Open slots with space
            {bookBy
              ? `, before ${dayLabel(sgDayKey(bookBy), { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}`
              : ""}
            .
          </p>
          <SlotChoices
            slots={fitting}
            value={slotId}
            onChange={setSlotId}
            empty="No open slots with space before the deadline. Create one first."
          />
        </div>
      )}
      {allocation && (
        <p className="text-[13px] text-muted">
          Bulk takers don’t log in, so you book for them. Let{" "}
          {allocation.taker.name} know the time.
        </p>
      )}
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          size="md"
          className="px-[18px]"
          loading={saving}
          disabled={!allocationId || !slotId}
          onClick={() => void submit()}
        >
          Book pickup
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** Drawer → "Move to another slot": PATCH /bookings/:id { slotId }. */
export function MoveBookingSheet({
  booking,
  onClose,
  onDone,
}: {
  booking: ManagerBooking;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [slotId, setSlotId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slots = useBookableSlots(booking.slot.id);
  const who = bookingParty(booking).name;

  async function submit() {
    if (!slotId) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/bookings/${booking.id}`, { slotId });
      const s = Array.isArray(slots)
        ? slots.find((x) => x.id === slotId)
        : undefined;
      onDone(`Booking moved · ${who}${s ? ` to ${slotTitle(s)}` : ""}`);
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="move-booking-title" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h3 id="move-booking-title" className={titleClass}>
          Move {who} to another slot
        </h3>
        <span className="text-small text-muted">
          Currently {slotTitle(booking.slot)}
        </span>
      </div>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <SlotChoices
        slots={slots}
        value={slotId}
        onChange={setSlotId}
        empty="No other open slots with space. Create one first."
      />
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          size="md"
          className="px-[18px]"
          loading={saving}
          disabled={!slotId}
          onClick={() => void submit()}
        >
          Move booking
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** Drawer → "Mark no-show": POST /bookings/:id/no-show; the kg goes back to the batch. */
export function NoShowSheet({
  booking,
  onClose,
  onDone,
}: {
  booking: ManagerBooking;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = bookingParty(booking);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/bookings/${booking.id}/no-show`);
      onDone(
        `Marked as no-show · ${p.name}. ${formatKg(p.kg)}kg is back in the batch.`,
      );
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="noshow-title" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h3 id="noshow-title" className={titleClass}>
          Mark {p.name} as a no-show?
        </h3>
        <span className="text-body text-muted">
          Their {formatKg(p.kg)}kg ({p.reference}) goes back to the batch and
          the no-show is counted on their record.
        </span>
      </div>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Keep booking
        </Button>
        <Button
          variant="danger"
          size="md"
          className="px-[18px]"
          loading={saving}
          onClick={() => void confirm()}
        >
          Mark no-show
        </Button>
      </SheetActions>
    </Sheet>
  );
}
