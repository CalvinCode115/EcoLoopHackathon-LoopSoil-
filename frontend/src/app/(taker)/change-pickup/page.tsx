"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowDown } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CalendarPlus } from "@phosphor-icons/react/dist/ssr/CalendarPlus";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { ChatCircleText } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Handbag } from "@phosphor-icons/react/dist/ssr/Handbag";
import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Sprout } from "@/components/brand/illustrations";
import { CancelClaimSheet } from "@/components/taker/cancel-claim-sheet";
import { SlotPicker } from "@/components/taker/slot-picker";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, type Paginated } from "@/lib/api";
import { downloadIcs } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { CHANGE_SLOT_CUTOFF_HOURS } from "@/lib/constants";
import {
  formatKg,
  formatLongDay,
  formatTimeLeft,
  formatTimeRange,
  formatWeekdayDay,
} from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { Booking, Claim, Slot } from "@/lib/types";

/**
 * Taker · Change Pickup (/change-pickup?booking=<id>) — boards "Change pickup · Mobile /
 * Desktop / Confirm move / Pickup moved / Slot just filled / No other slots / Changes
 * closed". Data: GET /bookings/:id, GET /claims/:claimId (batch deadline, cancel sheet),
 * GET /slots, PATCH /bookings/:id { slotId } (atomic: on failure the old slot is kept).
 * Changes close CHANGE_SLOT_CUTOFF_HOURS (2h) before the current slot starts.
 */
export default function ChangePickupPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ChangePickupScreen />
    </Suspense>
  );
}

type Load =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | {
      kind: "ready";
      booking: Booking;
      claim: Claim;
      slots: Slot[];
      loadedAt: number;
    };

function ChangePickupScreen() {
  const bookingId = useSearchParams().get("booking");
  const router = useRouter();
  const [load, setLoad] = useState<Load>(
    bookingId ? { kind: "loading" } : { kind: "notfound" },
  );
  const [day, setDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slotFilled, setSlotFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<Booking | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const fetchAll = useCallback(async (): Promise<Load> => {
    if (!bookingId) return { kind: "notfound" };
    try {
      const booking = await api.get<Booking>(`/bookings/${bookingId}`);
      if (!booking.claim) return { kind: "notfound" };
      const [claim, slots] = await Promise.all([
        api.get<Claim>(`/claims/${booking.claim.id}`),
        api.get<Paginated<Slot>>("/slots?upcoming=true&pageSize=100"),
      ]);
      return {
        kind: "ready",
        booking,
        claim,
        slots: slots.data,
        loadedAt: Date.now(),
      };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400))
        return { kind: "notfound" };
      return { kind: "error" };
    }
  }, [bookingId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAll().then((next) => !cancelled && setLoad(next));
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  if (moved && load.kind === "ready") {
    return (
      <Page narrow>
        <MovedCard booking={moved} claim={load.claim} />
      </Page>
    );
  }
  if (load.kind === "loading") return <LoadingState />;
  if (load.kind === "notfound" || load.kind === "error") {
    return (
      <Page>
        <PageHeader />
        {load.kind === "notfound" ? (
          <Notice
            title="We couldn’t find this pickup"
            body="It may have been cancelled, or the link is incorrect."
            action={
              <Button href="/my-claims" fullWidth>
                Back to My Claims
              </Button>
            }
          />
        ) : (
          <ErrorBox
            onRetry={() => {
              setLoad({ kind: "loading" });
              void fetchAll().then(setLoad);
            }}
          />
        )}
      </Page>
    );
  }

  const { booking, claim } = load;
  const now = load.loadedAt;
  const startsAt = new Date(booking.slot.startTime).getTime();
  const cutoff = startsAt - CHANGE_SLOT_CUTOFF_HOURS * 3_600_000;
  const slotCancelled = booking.status === "CANCELLED";
  // A live booking can't move inside the cutoff; one whose slot was cancelled always can.
  const changesClosed = booking.status === "BOOKED" && now >= cutoff;
  const changeable =
    claim.status === "APPROVED" &&
    (booking.status === "BOOKED" || slotCancelled);

  const deadline = claim.batch?.availableUntil ?? null;
  const otherSlots = load.slots.filter(
    (s) =>
      s.id !== booking.slot.id &&
      s.status === "OPEN" &&
      (s.batchId === null || s.batchId === claim.batchId) &&
      new Date(s.endTime).getTime() > now &&
      (!deadline ||
        new Date(s.startTime).getTime() <= new Date(deadline).getTime()),
  );
  const target = otherSlots.find((s) => s.id === selected) ?? null;

  async function move() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch<Booking>(`/bookings/${booking.id}`, {
        slotId: target.id,
      });
      setConfirming(false);
      setMoved(updated);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setConfirming(false);
      if (
        code === "SLOT_FULL" ||
        code === "SLOT_NOT_OPEN" ||
        code === "SLOT_PAST"
      ) {
        setSlotFilled(true);
        setSelected(null);
        setLoad(await fetchAll());
      } else if (code === "CHANGE_CUTOFF_PASSED") {
        setLoad(await fetchAll());
      } else {
        setError(
          friendlyError(err, "Couldn’t move your pickup. Please try again."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  let right: ReactNode;
  if (!changeable) {
    right = (
      <Notice
        title="This pickup can’t be changed"
        body="It has already been collected, missed or cancelled."
        action={
          <Button href="/my-claims" variant="secondary" fullWidth>
            Back to My Claims
          </Button>
        }
      />
    );
  } else if (changesClosed) {
    right = (
      <section className="flex flex-col gap-3 rounded-card bg-cream p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-tint text-amber-ink">
            <Clock size={20} weight="bold" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
              Changes are closed
            </h2>
            <p className="text-[15px] leading-[23px]">
              It’s too close to your pickup to change it now. If you can’t make
              it, you can cancel your claim.
            </p>
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="inline-flex h-11 items-center justify-center rounded-control px-3 font-semibold text-error underline underline-offset-4 hover:bg-danger-tint"
          >
            Cancel claim
          </button>
        </div>
      </section>
    );
  } else if (otherSlots.length === 0) {
    right = (
      <Notice
        title="No other pickup times"
        body={
          slotCancelled
            ? "No pickup times are available right now. We’ll message you on WhatsApp when new slots open."
            : "No other pickup times available right now. Your current slot is still booked."
        }
        action={
          <Button href="/my-claims" fullWidth>
            {slotCancelled ? "Back to My Claims" : "Keep current slot"}
          </Button>
        }
      />
    );
  } else {
    right = (
      <section aria-labelledby="move-title" className="flex flex-col gap-3.5">
        <h2
          id="move-title"
          className="font-display m-0 text-h3 font-semibold text-deep"
        >
          {slotCancelled ? "Pick a new time" : "Move to another time"}
        </h2>
        {slotFilled && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-control bg-danger-tint px-3.5 py-3 text-[15px] font-bold leading-[22px] text-danger-ink"
          >
            <WarningCircle
              size={20}
              weight="bold"
              className="mt-px shrink-0"
              aria-hidden
            />
            <span>
              That slot just filled up, please pick another.
              <span className="block text-small font-normal">
                We’ve refreshed the times below. Your current slot is still
                booked.
              </span>
            </span>
          </div>
        )}
        <SlotPicker
          slots={otherSlots}
          day={day}
          onDayChange={(d) => {
            setDay(d);
            setSelected(null);
          }}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id);
            setSlotFilled(false);
            setError(null);
          }}
        />
        <p className="text-[13px] leading-[21px] text-muted">
          Your current slot isn’t listed. Times after your collection deadline
          are hidden.
        </p>
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control bg-danger-tint px-4 py-3 text-small font-semibold text-danger-ink"
          >
            <WarningCircle
              size={18}
              weight="bold"
              className="shrink-0"
              aria-hidden
            />
            <span>{error}</span>
          </p>
        )}
        {target && (
          <div className="sticky bottom-20 z-[25] bg-[linear-gradient(rgba(245,239,227,0),var(--color-beige)_30%)] pt-3 md:bottom-0 md:pb-2">
            <Button size="lg" fullWidth onClick={() => setConfirming(true)}>
              {`Move to ${formatWeekdayDay(target.startTime)}, ${formatTimeRange(target.startTime, target.endTime)}`}
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <Page>
      <PageHeader />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:gap-8">
        <CurrentSlotCard
          booking={booking}
          claim={claim}
          now={now}
          closed={changesClosed}
        />
        {right}
      </div>

      {confirming && target && (
        <Sheet
          labelledBy="move-dialog-title"
          onClose={() => !busy && setConfirming(false)}
        >
          <h3
            id="move-dialog-title"
            className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
          >
            {slotCancelled ? "Book this time?" : "Move your pickup?"}
          </h3>
          <div className="flex flex-col gap-1.5">
            {!slotCancelled && (
              <>
                <SlotBox label="From" strike>
                  {formatWeekdayDay(booking.slot.startTime)} ·{" "}
                  {formatTimeRange(
                    booking.slot.startTime,
                    booking.slot.endTime,
                  ).replace("–", " – ")}
                </SlotBox>
                <span aria-hidden className="flex self-center text-leaf">
                  <ArrowDown size={22} weight="bold" />
                </span>
              </>
            )}
            <SlotBox label="To">
              {formatWeekdayDay(target.startTime)} ·{" "}
              {formatTimeRange(target.startTime, target.endTime).replace(
                "–",
                " – ",
              )}
            </SlotBox>
          </div>
          {!slotCancelled && (
            <p className="flex items-start gap-2 text-small text-muted">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>Your old slot will be released for others.</span>
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={busy}
              onClick={() => void move()}
            >
              {busy ? "Moving…" : slotCancelled ? "Confirm" : "Confirm move"}
            </Button>
          </div>
        </Sheet>
      )}

      {cancelOpen && (
        <CancelClaimSheet
          claim={claim}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => router.push("/my-claims")}
        />
      )}
    </Page>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Page({
  children,
  narrow = false,
}: {
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pb-8 pt-5 md:gap-8 md:px-8 md:pb-16 md:pt-10 lg:px-10">
      {narrow ? (
        <div className="mx-auto w-full max-w-[520px]">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-1.5">
      <Link
        href="/my-claims"
        className="-ml-1 inline-flex h-11 items-center gap-1 self-start rounded-control pr-2 text-small font-semibold text-deep no-underline hover:bg-sage"
      >
        <CaretLeft size={18} weight="bold" aria-hidden /> My claims
      </Link>
      <h1 className="font-display m-0 text-[28px] font-semibold leading-9 text-deep md:text-[32px] md:leading-10">
        Change pickup time
      </h1>
    </div>
  );
}

function locationOf(booking: Booking, claim: Claim): string {
  const spot = booking.slot.location ?? claim.batch?.pickupLocation;
  return spot ? `SUSS bin centre · ${spot}` : "SUSS bin centre";
}

/** The booked slot, outlined in leaf green, with a countdown chip and "Keep current slot". */
function CurrentSlotCard({
  booking,
  claim,
  now,
  closed,
}: {
  booking: Booking;
  claim: Claim;
  now: number;
  closed: boolean;
}) {
  const cancelled = booking.status === "CANCELLED";
  const kg = formatKg(Number(claim.approvedKg ?? claim.requestedKg));
  return (
    <section
      aria-label="Your current slot"
      className="flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-[inset_0_0_0_2px_var(--color-leaf),0_1px_2px_rgba(47,74,36,0.06),0_8px_24px_rgba(47,74,36,0.08)] lg:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold uppercase leading-4 tracking-[0.06em] text-muted">
          {cancelled ? "Your cancelled slot" : "Your current slot"}
        </span>
        {cancelled ? (
          <span className="inline-flex h-[26px] items-center rounded-full bg-grey-tint px-2.5 text-[13px] font-bold text-grey-ink">
            Cancelled
          </span>
        ) : (
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-leaf px-2.5 text-[13px] font-bold text-cream">
            <Check size={14} weight="bold" aria-hidden /> Current
          </span>
        )}
      </div>
      <div className={cn("flex flex-col gap-3", cancelled && "opacity-70")}>
        <InfoRow
          icon={<CalendarBlank size={18} />}
          label="Date"
          value={formatWeekdayDay(booking.slot.startTime)}
        />
        <InfoRow
          icon={<Clock size={18} />}
          label="Time"
          value={formatTimeRange(
            booking.slot.startTime,
            booking.slot.endTime,
          ).replace("–", " – ")}
        />
        <InfoRow
          icon={<MapPin size={18} />}
          label="Location"
          value={locationOf(booking, claim)}
        />
      </div>
      <p className="flex items-center gap-2 text-small text-muted">
        <Handbag size={16} className="text-leaf" aria-hidden />
        {claim.reference} · Approved {kg}kg
      </p>
      {cancelled ? (
        <p className="rounded-control bg-amber-tint px-3 py-2 text-small font-semibold text-amber-ink">
          {booking.cancelNote ??
            "This pickup slot was cancelled by the SUSS team. Your claim is still reserved — pick a new time."}
        </p>
      ) : closed ? (
        <p className="inline-flex items-center gap-2 self-start rounded-control bg-amber-tint px-3 py-2 text-small font-bold text-amber-ink">
          <Clock size={16} weight="bold" aria-hidden /> Starts in{" "}
          {formatTimeLeft(booking.slot.startTime, now)}
        </p>
      ) : (
        booking.collectionDeadline && (
          <p className="inline-flex items-center gap-2 self-start rounded-control bg-sage px-3 py-2 text-small font-bold text-deep">
            <Clock size={16} weight="bold" aria-hidden /> Collect by{" "}
            {formatWeekdayDay(booking.collectionDeadline)},{" "}
            {new Date(booking.collectionDeadline)
              .toLocaleTimeString("en-SG", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone: "Asia/Singapore",
              })
              .replace(":00", "")
              .replace(" ", "")
              .toLowerCase()}
          </p>
        )
      )}
      {!cancelled && (
        <Button href="/my-claims" variant="secondary" fullWidth>
          Keep current slot
        </Button>
      )}
    </section>
  );
}

function SlotBox({
  label,
  strike = false,
  children,
}: {
  label: string;
  strike?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-control px-3.5 py-3",
        strike
          ? "bg-white shadow-[inset_0_0_0_1px_rgba(143,142,128,0.4)]"
          : "bg-sage shadow-[inset_0_0_0_2px_var(--color-leaf)]",
      )}
    >
      <span className="text-xs font-bold uppercase leading-4 tracking-[0.06em] text-muted">
        {label}
      </span>
      <span
        className={cn(
          "text-[17px] font-bold leading-6",
          strike && "text-muted line-through",
        )}
      >
        {children}
      </span>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sage text-deep">
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-[13px] leading-[18px] text-muted">{label}</span>
        <span className="text-body font-semibold leading-6">{value}</span>
      </div>
    </div>
  );
}

function Notice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-10 text-center shadow-card">
      <div className="mb-2 flex size-40 items-center justify-center rounded-full bg-sage">
        <Sprout width={110} />
      </div>
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        {title}
      </h2>
      <p className="max-w-[360px] text-body text-muted">{body}</p>
      <div className="mt-2 w-full md:max-w-[320px]">{action}</div>
    </div>
  );
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card bg-danger-tint p-4"
    >
      <div className="flex items-start gap-3 text-small font-semibold text-danger-ink">
        <WarningCircle
          size={20}
          weight="bold"
          className="shrink-0"
          aria-hidden
        />
        <span>
          We couldn’t load your pickup. Check your connection and try again.
        </span>
      </div>
      <div>
        <Button
          variant="secondary"
          size="sm"
          className="bg-cream"
          icon={<ArrowClockwise size={18} weight="bold" />}
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

/** "Pickup moved!" — new date, time, location; calendar file; back to claims. */
function MovedCard({ booking, claim }: { booking: Booking; claim: Claim }) {
  const kg = formatKg(Number(claim.approvedKg ?? claim.requestedKg));
  const location = locationOf(booking, claim);
  return (
    <section className="flex flex-col gap-[18px] rounded-card bg-cream p-6 shadow-card md:p-10">
      <div
        role="status"
        className="flex flex-col items-center gap-3 text-center"
      >
        <div
          aria-hidden
          className="mb-2 mt-3 flex size-[72px] items-center justify-center rounded-full bg-leaf text-cream shadow-[0_0_0_10px_var(--color-sage)]"
        >
          <Check size={36} weight="bold" />
        </div>
        <h1 className="font-display m-0 text-[28px] font-semibold leading-9 text-deep">
          Pickup <em className="font-medium text-leaf italic">moved!</em>
        </h1>
        <p className="text-[15px] leading-[23px] text-muted">
          {claim.reference} · {kg}kg
        </p>
      </div>
      <div className="flex flex-col gap-3.5 rounded-[14px] bg-white p-4 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]">
        <InfoRow
          icon={<CalendarBlank size={18} />}
          label="New date"
          value={formatLongDay(booking.slot.startTime)}
        />
        <InfoRow
          icon={<Clock size={18} />}
          label="New time"
          value={formatTimeRange(
            booking.slot.startTime,
            booking.slot.endTime,
          ).replace("–", " – ")}
        />
        <InfoRow
          icon={<MapPin size={18} />}
          label="Location"
          value={location}
        />
      </div>
      <p className="flex items-center gap-2.5 text-small text-muted">
        <ChatCircleText size={18} className="text-leaf" aria-hidden /> We’ll
        send a WhatsApp reminder before your new time.
      </p>
      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          fullWidth
          icon={<CalendarPlus size={18} weight="bold" />}
          onClick={() =>
            downloadIcs({
              uid: booking.id,
              title: `Collect compost · ${claim.reference}`,
              start: booking.slot.startTime,
              end: booking.slot.endTime,
              location,
              description: `Show your claim reference ${claim.reference} (${kg}kg) at the SUSS bin centre.`,
              filename: `loopsoil-${claim.reference}.ics`,
            })
          }
        >
          Add to calendar
        </Button>
        <Button href="/my-claims" fullWidth>
          View my claims
        </Button>
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <Page>
      <LoadingLabel>Loading your pickup…</LoadingLabel>
      <PageHeader />
      <div
        aria-hidden
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:gap-8"
      >
        <div className="flex flex-col gap-4 rounded-card bg-cream p-5 shadow-card">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-10 w-3/5" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-48" />
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[78px] flex-1 rounded-[14px]" />
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-[14px]" />
          ))}
        </div>
      </div>
    </Page>
  );
}
