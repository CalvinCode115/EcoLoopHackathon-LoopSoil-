"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CalendarPlus } from "@phosphor-icons/react/dist/ssr/CalendarPlus";
import { CalendarX } from "@phosphor-icons/react/dist/ssr/CalendarX";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Handbag } from "@phosphor-icons/react/dist/ssr/Handbag";
import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import { Leaf } from "@phosphor-icons/react/dist/ssr/Leaf";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { MapTrifold } from "@phosphor-icons/react/dist/ssr/MapTrifold";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { Sun } from "@phosphor-icons/react/dist/ssr/Sun";
import { User as UserIcon } from "@phosphor-icons/react/dist/ssr/User";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { IconArrowRight, IconLeaf } from "@/components/brand/icons";
import { EmptyPot } from "@/components/brand/illustrations";
import { ClaimStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/ui/qr-code";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { downloadIcs } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import {
  formatDayMonth,
  formatKg,
  formatTimeLeft,
  formatWeekdayDay,
  sgDayKey,
} from "@/lib/format";
import { BIN_CENTRE_MAP_URL } from "@/lib/site-config";
import type { Booking, Claim } from "@/lib/types";

/**
 * Taker · Pickup Pass (/pickup-pass?booking=<id>) — boards "PickupPass / Upcoming / Today ·
 * starts soon / Today · window open / Collected / Missed / Cancelled / Not booked /
 * Loading / Error / Not found / Desktop". A ticket-style card: status, the claim reference
 * in large type, a QR code of that reference for staff, and the pickup details.
 * Data: GET /bookings/:id, GET /claims/:claimId (collected/cancelled dates).
 */
export default function PickupPassPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PickupPassScreen />
    </Suspense>
  );
}

type Load =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; booking: Booking; claim: Claim; loadedAt: number };

type PassState =
  | "upcoming"
  | "today"
  | "open"
  | "late"
  | "collected"
  | "missed"
  | "cancelled"
  | "unbooked";

function PickupPassScreen() {
  const bookingId = useSearchParams().get("booking");
  const { user } = useAuth();
  const [load, setLoad] = useState<Load>(
    bookingId ? { kind: "loading" } : { kind: "notfound" },
  );

  const fetchAll = useCallback(async (): Promise<Load> => {
    if (!bookingId) return { kind: "notfound" };
    try {
      const booking = await api.get<Booking>(`/bookings/${bookingId}`);
      if (!booking.claim) return { kind: "notfound" };
      const claim = await api.get<Claim>(`/claims/${booking.claim.id}`);
      return { kind: "ready", booking, claim, loadedAt: Date.now() };
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

  // Keep the countdown / "window open" state fresh while the pass is on screen.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (load.kind === "loading") return <LoadingState />;
  if (load.kind === "notfound") {
    return (
      <Wrap>
        <MessageCard
          title="This pickup pass doesn’t exist."
          body="The link may be old or mistyped. Your passes are in My Claims."
          action={
            <Button href="/my-claims" fullWidth>
              Go to My Claims
            </Button>
          }
        />
      </Wrap>
    );
  }
  if (load.kind === "error") {
    return (
      <Wrap>
        <MessageCard
          title="We couldn’t load your pickup pass."
          body="Please check your connection and try again."
          action={
            <Button
              fullWidth
              icon={<ArrowClockwise size={18} weight="bold" />}
              onClick={() => {
                setLoad({ kind: "loading" });
                void fetchAll().then(setLoad);
              }}
            >
              Try again
            </Button>
          }
        />
      </Wrap>
    );
  }

  const { booking, claim } = load;
  const t = now ?? load.loadedAt;
  const state = passState(booking, claim, t);
  const kg = formatKg(Number(claim.approvedKg ?? claim.requestedKg));
  const location = booking.slot.location ?? claim.batch?.pickupLocation;
  const locationText = location
    ? `SUSS bin centre, ${location}`
    : "SUSS bin centre";
  const inactive = state === "missed" || state === "cancelled";

  return (
    <Wrap>
      <article
        aria-label={`Pickup pass for ${claim.reference}`}
        className="overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(47,74,36,0.06),0_8px_24px_rgba(47,74,36,0.08),0_0_0_1px_rgba(47,74,36,0.08)]"
      >
        <div className="flex flex-col items-center gap-3.5 px-5 pb-2 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 self-stretch">
            <StatusBadge state={state} />
            {state === "upcoming" && (
              <Chip tone="sage" icon={<Clock size={16} weight="bold" />}>
                Pickup in {formatTimeLeft(booking.slot.startTime, t)}
              </Chip>
            )}
          </div>
          {(state === "today" || state === "open" || state === "late") && (
            <div className="self-stretch">
              {state === "today" && (
                <Chip tone="amber" icon={<Clock size={16} weight="bold" />}>
                  Starts in {formatTimeLeft(booking.slot.startTime, t)}
                </Chip>
              )}
              {state === "open" && (
                <Chip
                  tone="sage"
                  icon={
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 animate-[pp-pulse_1.6s_ease-out_infinite] rounded-full bg-leaf"
                    />
                  }
                >
                  Your pickup window is open now · until{" "}
                  {timeOf(booking.slot.endTime)}
                </Chip>
              )}
              {state === "late" && booking.collectionDeadline && (
                // Slot has ended but the collection deadline hasn't. [draft copy]
                <Chip tone="amber" icon={<Clock size={16} weight="bold" />}>
                  Collect by {formatWeekdayDay(booking.collectionDeadline)},{" "}
                  {timeOf(booking.collectionDeadline)}
                </Chip>
              )}
            </div>
          )}

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-muted">
              Claim reference
            </span>
            <p
              className={cn(
                "text-[34px] font-extrabold leading-[42px] tracking-[0.02em] tabular-nums",
                inactive ? "text-grey-ink" : "text-[#141410]",
              )}
            >
              {claim.reference}
            </p>
          </div>

          {state === "collected" ? (
            <CollectedMark />
          ) : state === "unbooked" ? (
            <div className="flex size-[264px] flex-col items-center justify-center gap-2.5 rounded-card bg-beige p-6 text-center text-muted shadow-[inset_0_0_0_2px_#CFCABB]">
              <CalendarX size={40} aria-hidden />
              <span className="text-[15px] font-semibold leading-[21px]">
                No pickup time yet
              </span>
            </div>
          ) : inactive ? (
            <div className="relative size-[264px]">
              <div className="opacity-35 grayscale">
                <QrCode
                  value={claim.reference}
                  label={`QR code for claim reference ${claim.reference}`}
                  faded
                />
              </div>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[10px] bg-white px-5 py-2 text-[26px] font-extrabold uppercase leading-8 tracking-[0.12em] text-danger-ink shadow-[inset_0_0_0_3px_var(--color-danger-ink),0_4px_12px_rgba(0,0,0,0.12)]">
                {state === "missed" ? "Expired" : "Cancelled"}
              </span>
            </div>
          ) : (
            <>
              <QrCode
                value={claim.reference}
                label={`QR code for claim reference ${claim.reference}`}
              />
              <p className="text-center text-[15px] font-semibold leading-[22px]">
                Show this to the staff at the bin centre
              </p>
            </>
          )}
        </div>

        <NotchedDivider />

        <div className="px-5 pb-[22px] pt-2">
          <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-4">
            <Detail
              icon={<UserIcon size={16} />}
              label="Name"
              value={user?.name ?? "—"}
            />
            <Detail
              icon={<Handbag size={16} />}
              label="Amount"
              value={`${kg}kg`}
            />
            <Detail
              icon={<CalendarBlank size={16} />}
              label="Date"
              value={
                state === "unbooked"
                  ? "—"
                  : dateWithYear(booking.slot.startTime)
              }
            />
            <Detail
              icon={<Clock size={16} />}
              label="Time"
              value={
                state === "unbooked"
                  ? "—"
                  : `${timeOf(booking.slot.startTime, true)} – ${timeOf(booking.slot.endTime, true)}`
              }
            />
            <Detail
              icon={<MapPin size={16} />}
              label="Location"
              value={locationText}
              wide
            />
            <Detail
              icon={<Info size={16} />}
              label="Collect by"
              value={
                booking.collectionDeadline && state !== "unbooked"
                  ? `${formatWeekdayDay(booking.collectionDeadline)}, ${timeOf(booking.collectionDeadline)}`
                  : "—"
              }
              wide
            />
          </dl>
        </div>
      </article>

      {(state === "upcoming" ||
        state === "today" ||
        state === "open" ||
        state === "late") && (
        <>
          <div className="flex flex-col gap-2">
            {BIN_CENTRE_MAP_URL && (
              <Button
                href={BIN_CENTRE_MAP_URL}
                variant="secondary"
                fullWidth
                icon={<MapTrifold size={18} weight="bold" />}
                target="_blank"
                rel="noreferrer"
              >
                View on map
              </Button>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="link"
                icon={<CalendarPlus size={18} weight="bold" />}
                onClick={() =>
                  downloadIcs({
                    uid: booking.id,
                    title: `Collect compost · ${claim.reference}`,
                    start: booking.slot.startTime,
                    end: booking.slot.endTime,
                    location: locationText,
                    description: `Show your claim reference ${claim.reference} (${kg}kg) at the SUSS bin centre.`,
                    filename: `loopsoil-${claim.reference}.ics`,
                  })
                }
              >
                Add to calendar
              </Button>
              {state === "upcoming" && (
                <Button
                  href={`/change-pickup?booking=${booking.id}`}
                  variant="link"
                  icon={<PencilSimple size={18} weight="bold" />}
                >
                  Change time
                </Button>
              )}
            </div>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 rounded-card bg-cream p-4 shadow-[inset_0_0_0_1px_rgba(47,74,36,0.1)]">
            <Tip icon={<Sun size={18} />}>
              Turn up your screen brightness so the code scans easily.
            </Tip>
            <Tip icon={<Package size={18} />}>
              Your compost will be packed in ½kg/1kg bags or scooped to your
              amount.
            </Tip>
            <Tip icon={<Lightbulb size={18} />}>
              <strong>Tip:</strong> take a screenshot in case you lose signal.
            </Tip>
          </ul>
        </>
      )}

      {state === "collected" && (
        <>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="text-body font-bold leading-6">
              Collected {kg}kg
              {claim.collectedAt
                ? ` on ${formatWeekdayDay(claim.collectedAt)}, ${timeOf(claim.collectedAt)}`
                : ""}
            </p>
            <p className="inline-flex items-center gap-2 rounded-[14px] bg-sage px-3.5 py-2 text-[15px] font-semibold leading-[22px] text-deep">
              <Leaf size={18} weight="bold" aria-hidden /> You helped divert{" "}
              {kg}kg of food waste
            </p>
          </div>
          <Button href="/my-claims" fullWidth>
            Back to My Claims
          </Button>
        </>
      )}

      {state === "missed" && (
        <>
          <StatusNote>
            The pickup deadline has passed, so this compost was released for
            others.
          </StatusNote>
          <Button
            href="/batches"
            fullWidth
            iconAfter={<IconArrowRight size={18} />}
          >
            Browse compost
          </Button>
        </>
      )}

      {state === "cancelled" && (
        <>
          <StatusNote>
            This claim was cancelled
            {claim.cancelledAt
              ? ` on ${formatDayMonth(claim.cancelledAt)}`
              : ""}
            .
          </StatusNote>
          <Button href="/my-claims" variant="secondary" fullWidth>
            Back to My Claims
          </Button>
        </>
      )}

      {state === "unbooked" && (
        <>
          <StatusNote>Book a pickup time to get your pass.</StatusNote>
          <Button href={`/change-pickup?booking=${booking.id}`} fullWidth>
            Book pickup
          </Button>
        </>
      )}
    </Wrap>
  );
}

/** Which pass variant to show, from the booking + claim status and the clock. */
function passState(booking: Booking, claim: Claim, now: number): PassState {
  if (claim.status === "COLLECTED" || booking.status === "COLLECTED")
    return "collected";
  if (booking.status === "NO_SHOW") return "missed";
  if (claim.status !== "APPROVED") return "cancelled";
  // Slot cancelled by the manager but the claim is still approved: needs a new time.
  if (booking.status === "CANCELLED") return "unbooked";
  const start = new Date(booking.slot.startTime).getTime();
  const end = new Date(booking.slot.endTime).getTime();
  if (now >= start && now < end) return "open";
  if (now >= end) return "late";
  if (
    sgDayKey(booking.slot.startTime) === sgDayKey(new Date(now).toISOString())
  )
    return "today";
  return "upcoming";
}

/** "4pm", or "4:00pm" with `long` (the pass details use the long form). */
function timeOf(iso: string, long = false): string {
  const s = new Date(iso)
    .toLocaleTimeString("en-SG", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Singapore",
    })
    .replace(/\s/g, "")
    .toLowerCase();
  return long ? s : s.replace(":00", "");
}

/** "Tue 30 Sep 2026". */
function dateWithYear(iso: string): string {
  const year = new Date(iso).toLocaleDateString("en-SG", {
    year: "numeric",
    timeZone: "Asia/Singapore",
  });
  return `${formatWeekdayDay(iso)} ${year}`;
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Wrap({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pb-8 pt-4 md:pt-8">
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-[18px]">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: PassState }) {
  if (state === "collected") return <ClaimStatusBadge status="COLLECTED" />;
  if (state === "missed") return <ClaimStatusBadge status="NO_SHOW" />;
  if (state === "cancelled") return <ClaimStatusBadge status="CANCELLED" />;
  if (state === "unbooked") return <ClaimStatusBadge status="APPROVED" />;
  return (
    <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-leaf px-2.5 text-[13px] font-bold text-cream">
      <Check size={14} weight="bold" aria-hidden /> Booked
    </span>
  );
}

function Chip({
  tone,
  icon,
  children,
}: {
  tone: "sage" | "amber";
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <p
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-[14px] px-3 py-1.5 text-small font-bold",
        tone === "sage" ? "bg-sage text-deep" : "bg-amber-tint text-amber-ink",
      )}
    >
      {icon}
      <span>{children}</span>
    </p>
  );
}

/** Big check in a leafy circle — the pass has been used. */
function CollectedMark() {
  return (
    <div
      role="img"
      aria-label="Pass used — compost collected"
      className="relative flex size-[264px] items-center justify-center rounded-[116px] bg-sage"
    >
      <span className="flex size-[132px] items-center justify-center rounded-full bg-leaf text-cream shadow-[0_0_0_12px_#EEF3E6]">
        <Check size={76} weight="bold" />
      </span>
      <span className="absolute right-[18px] top-[26px] text-leaf">
        <IconLeaf size={34} />
      </span>
      <span className="absolute bottom-[30px] left-[22px] -scale-x-100 text-leaf">
        <IconLeaf size={28} />
      </span>
    </div>
  );
}

/** Ticket perforation: a dashed line with half-circle notches cut from each side. */
function NotchedDivider() {
  return (
    <div aria-hidden className="relative h-7 bg-white">
      <span className="absolute -left-3.5 top-1/2 size-7 -translate-y-1/2 rounded-full bg-beige shadow-[inset_-3px_0_4px_-2px_rgba(47,74,36,0.12)]" />
      <span className="absolute -right-3.5 top-1/2 size-7 -translate-y-1/2 rounded-full bg-beige shadow-[inset_3px_0_4px_-2px_rgba(47,74,36,0.12)]" />
      <span className="absolute left-[22px] right-[22px] top-[13px] border-t-2 border-dashed border-[#CFCABB]" />
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
  wide = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn("flex min-w-0 items-start gap-2.5", wide && "col-span-2")}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-sage text-deep">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <dt className="text-xs font-semibold leading-4 text-muted">{label}</dt>
        <dd className="m-0 text-[15px] font-bold leading-[21px] text-ink">
          {value}
        </dd>
      </div>
    </div>
  );
}

function Tip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-small text-ink">
      <span className="pt-px text-leaf">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function StatusNote({ children }: { children: ReactNode }) {
  return <p className="text-center text-body leading-6 text-ink">{children}</p>;
}

function MessageCard({
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
        <EmptyPot width={130} />
      </div>
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        {title}
      </h2>
      <p className="max-w-[360px] text-body text-muted">{body}</p>
      <div className="mt-2 w-full">{action}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <Wrap>
      <LoadingLabel>Loading your pickup pass…</LoadingLabel>
      <div
        aria-hidden
        className="flex flex-col items-center gap-4 rounded-[20px] bg-white p-5 shadow-card"
      >
        <div className="flex justify-between self-stretch">
          <Skeleton className="h-[26px] w-24 rounded-full" />
          <Skeleton className="h-8 w-36 rounded-[14px]" />
        </div>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="size-[264px] rounded-card" />
        <div className="grid w-full grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    </Wrap>
  );
}
