"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CalendarPlus } from "@phosphor-icons/react/dist/ssr/CalendarPlus";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { ChatCircleText } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Handbag } from "@phosphor-icons/react/dist/ssr/Handbag";
import { IdentificationCard } from "@phosphor-icons/react/dist/ssr/IdentificationCard";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { QrCode } from "@phosphor-icons/react/dist/ssr/QrCode";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Sprout } from "@/components/brand/illustrations";
import { SlotPicker } from "@/components/taker/slot-picker";
import { ClaimStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, type Paginated } from "@/lib/api";
import { downloadIcs } from "@/lib/calendar";
import {
  formatKg,
  formatLongDay,
  formatTimeRange,
  formatWeekdayDay,
} from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { Booking, Claim, Slot } from "@/lib/types";

/**
 * Taker · Book Pickup (/book-pickup?claim=<id>) — boards "Book pickup · Mobile / Desktop /
 * Slot just filled / No slots yet / You're booked". Data: GET /claims/:id, GET /slots
 * (takers only get OPEN slots), POST /bookings { slotId, claimId }.
 *
 * [draft copy] — not in the design: the claim-not-found, waiting-for-approval,
 * can’t-be-booked and already-booked notices.
 */
export default function BookPickupPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <BookPickupScreen />
    </Suspense>
  );
}

type Load =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; claim: Claim; slots: Slot[]; loadedAt: number };

function BookPickupScreen() {
  const claimId = useSearchParams().get("claim");
  const [load, setLoad] = useState<Load>(
    claimId ? { kind: "loading" } : { kind: "notfound" },
  );
  const [day, setDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slotFilled, setSlotFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{
    booking: Booking;
    claim: Claim;
  } | null>(null);

  const fetchAll = useCallback(async (): Promise<Load> => {
    if (!claimId) return { kind: "notfound" };
    try {
      const [claim, slots] = await Promise.all([
        api.get<Claim>(`/claims/${claimId}`),
        api.get<Paginated<Slot>>("/slots?upcoming=true&pageSize=100"),
      ]);
      return { kind: "ready", claim, slots: slots.data, loadedAt: Date.now() };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400))
        return { kind: "notfound" };
      return { kind: "error" };
    }
  }, [claimId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAll().then((next) => !cancelled && setLoad(next));
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  if (booked) {
    return (
      <Page narrow>
        <BookedCard booking={booked.booking} claim={booked.claim} />
      </Page>
    );
  }
  if (load.kind === "loading") return <LoadingState />;
  if (load.kind === "notfound") {
    return (
      <Page>
        <PageHeader />
        <Notice
          title="We couldn’t find this claim"
          body="It may have been cancelled, or the link is incorrect."
          action={
            <Button href="/my-claims" fullWidth>
              Back to My Claims
            </Button>
          }
        />
      </Page>
    );
  }
  if (load.kind === "error") {
    return (
      <Page>
        <PageHeader />
        <ErrorBox
          onRetry={() => {
            setLoad({ kind: "loading" });
            void fetchAll().then(setLoad);
          }}
        />
      </Page>
    );
  }

  const { claim } = load;
  const deadline = claim.batch?.availableUntil ?? null;
  const alreadyBooked = claim.booking?.status === "BOOKED";

  // Bookable slots: this batch's or general ones, not over yet, before the deadline.
  const slots = load.slots.filter(
    (s) =>
      s.status === "OPEN" &&
      (s.batchId === null || s.batchId === claim.batchId) &&
      new Date(s.endTime).getTime() > load.loadedAt &&
      (!deadline ||
        new Date(s.startTime).getTime() <= new Date(deadline).getTime()),
  );
  const selectedSlot = slots.find((s) => s.id === selected) ?? null;

  async function confirm() {
    if (!selectedSlot) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await api.post<Booking>("/bookings", {
        slotId: selectedSlot.id,
        claimId: claim.id,
      });
      setBooked({ booking, claim });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (
        code === "SLOT_FULL" ||
        code === "SLOT_NOT_OPEN" ||
        code === "SLOT_PAST"
      ) {
        setSlotFilled(true);
        setSelected(null);
        const next = await fetchAll();
        setLoad(next);
      } else {
        setError(
          friendlyError(err, "Couldn’t book this slot. Please try again."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  let picker: ReactNode;
  if (claim.status !== "APPROVED") {
    picker = (
      <Notice
        title={
          claim.status === "PENDING"
            ? "Waiting for approval"
            : "This claim can’t be booked"
        }
        body={
          claim.status === "PENDING"
            ? "You can book a pickup as soon as the SUSS team approves your claim."
            : "Only approved claims can be booked for pickup."
        }
        action={
          <Button href="/my-claims" variant="secondary" fullWidth>
            Back to My Claims
          </Button>
        }
      />
    );
  } else if (alreadyBooked && claim.booking) {
    picker = (
      <Notice
        title="You’ve already booked a pickup"
        body={`${formatWeekdayDay(claim.booking.slot.startTime)} · ${formatTimeRange(claim.booking.slot.startTime, claim.booking.slot.endTime)}. Need a different time? Change it instead of booking again.`}
        action={
          <Button href={`/change-pickup?booking=${claim.booking.id}`} fullWidth>
            Change time
          </Button>
        }
      />
    );
  } else if (slots.length === 0) {
    picker = (
      <Notice
        title="No pickup times yet"
        body="We’ll message you on WhatsApp as soon as slots open. Your claim stays reserved until then."
        action={
          <Button href="/my-claims" variant="secondary" fullWidth>
            Back to My Claims
          </Button>
        }
      />
    );
  } else {
    picker = (
      <section aria-labelledby="slot-title" className="flex flex-col gap-3.5">
        <h2
          id="slot-title"
          className="font-display m-0 text-h3 font-semibold text-deep"
        >
          Pick a time
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
                We’ve refreshed the times below.
              </span>
            </span>
          </div>
        )}
        <SlotPicker
          slots={slots}
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
          Only times before your collection deadline are shown.
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
        {selectedSlot && (
          // Sticky above the bottom tab bar on phones, at the bottom on desktop.
          <div className="sticky bottom-20 z-[25] bg-[linear-gradient(rgba(245,239,227,0),var(--color-beige)_30%)] pt-3 md:bottom-0 md:pb-2">
            <Button
              size="lg"
              fullWidth
              loading={busy}
              onClick={() => void confirm()}
            >
              {busy
                ? "Booking…"
                : `Confirm pickup · ${formatWeekdayDay(selectedSlot.startTime)}, ${formatTimeRange(selectedSlot.startTime, selectedSlot.endTime)}`}
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
        <ClaimSummary claim={claim} deadline={deadline} />
        {picker}
      </div>
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
        Book your pickup
      </h1>
    </div>
  );
}

function ClaimSummary({
  claim,
  deadline,
}: {
  claim: Claim;
  deadline: string | null;
}) {
  const kg = formatKg(Number(claim.approvedKg ?? claim.requestedKg));
  return (
    <section className="flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card lg:p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold uppercase leading-4 tracking-[0.06em] text-muted">
            Booking for
          </span>
          <h2 className="font-display m-0 text-h3 font-semibold text-deep">
            {claim.reference}
          </h2>
        </div>
        <ClaimStatusBadge status={claim.status} />
      </div>
      <div className="flex flex-col gap-3">
        <InfoRow
          icon={<Handbag size={18} />}
          label={claim.approvedKg ? "Approved amount" : "Requested amount"}
          value={`${kg}kg`}
        />
        <InfoRow
          icon={<MapPin size={18} />}
          label="Location"
          value={locationText(claim)}
        />
      </div>
      {deadline && (
        <p className="flex items-center gap-2 rounded-control bg-amber-tint px-3 py-2.5 text-small font-bold text-amber-ink">
          <Clock size={18} weight="bold" aria-hidden /> Book and collect by{" "}
          {formatWeekdayDay(deadline)}
        </p>
      )}
    </section>
  );
}

function locationText(claim: Claim): string {
  return claim.batch?.pickupLocation
    ? `SUSS bin centre · ${claim.batch.pickupLocation}`
    : "SUSS bin centre";
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
          We couldn’t load pickup times. Check your connection and try again.
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

/** "You're booked!" — date, time, location, what to bring, pass / calendar / claims. */
function BookedCard({ booking, claim }: { booking: Booking; claim: Claim }) {
  const kg = formatKg(Number(claim.approvedKg ?? claim.requestedKg));
  const location = booking.slot.location ?? locationText(claim);
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
          <Check size={34} weight="bold" />
        </div>
        <h1 className="font-display m-0 text-[30px] font-semibold leading-[38px] text-deep">
          You’re <em className="font-medium text-leaf italic">booked!</em>
        </h1>
        <p className="text-[15px] leading-[23px] text-muted">
          {claim.reference} · {kg}kg
        </p>
      </div>
      <div className="flex flex-col gap-3.5 rounded-[14px] bg-white p-4 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]">
        <InfoRow
          icon={<CalendarBlank size={18} />}
          label="Date"
          value={formatLongDay(booking.slot.startTime)}
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
          value={location}
        />
      </div>
      <div className="flex items-start gap-3 rounded-[14px] bg-sage p-3.5 text-deep">
        <IdentificationCard size={20} className="mt-px shrink-0" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <strong className="text-[15px] leading-[22px]">What to bring</strong>
          <span className="text-small">
            Show your claim reference <strong>{claim.reference}</strong> at the
            bin centre.
          </span>
        </div>
      </div>
      <p className="flex items-center gap-2.5 text-small text-muted">
        <ChatCircleText size={18} aria-hidden /> We’ll send a WhatsApp reminder
        the day before.
      </p>
      <div className="flex flex-col gap-2">
        <Button
          href={`/pickup-pass?booking=${booking.id}`}
          variant="secondary"
          fullWidth
          icon={<QrCode size={18} weight="bold" />}
        >
          View pickup pass
        </Button>
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
          Add to calendar (.ics)
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
      <LoadingLabel>Loading pickup times…</LoadingLabel>
      <PageHeader />
      <div
        aria-hidden
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:gap-8"
      >
        <div className="flex flex-col gap-4 rounded-card bg-cream p-5 shadow-card">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-3/5" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-40" />
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
