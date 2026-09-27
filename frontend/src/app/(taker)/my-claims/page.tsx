"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Handbag } from "@phosphor-icons/react/dist/ssr/Handbag";
import { Hourglass } from "@phosphor-icons/react/dist/ssr/Hourglass";
import { Leaf } from "@phosphor-icons/react/dist/ssr/Leaf";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { QrCode } from "@phosphor-icons/react/dist/ssr/QrCode";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { IconArrowRight } from "@/components/brand/icons";
import { Sprout } from "@/components/brand/illustrations";
import { CancelClaimSheet } from "@/components/taker/cancel-claim-sheet";
import { StatusTimeline } from "@/components/taker/status-timeline";
import { ClaimStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { api, type Paginated } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatDayMonth,
  formatKg,
  formatTimeLeft,
  formatTimeRange,
  formatWeekdayDay,
} from "@/lib/format";
import {
  CANCELLATION_REASON_LABEL,
  REJECTION_REASON_LABEL,
  type CancellationReason,
  type RejectionReason,
} from "@/lib/labels";
import type { Claim } from "@/lib/types";

type Tab = "active" | "history";
type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; claims: Claim[]; loadedAt: number };

/**
 * Taker · My Claims (/my-claims) — boards "My Claims · Active / History / Cancel sheet /
 * Empty", mobile + desktop. Data: GET /claims (a taker only ever gets their own), each with
 * its batch and booking; cancel via POST /claims/:id/cancel.
 * Active = pending + approved; History = collected, rejected, cancelled (incl. no-shows).
 */
export default function MyClaimsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [cancelling, setCancelling] = useState<Claim | null>(null);

  const fetchClaims = useCallback(async (): Promise<Load> => {
    try {
      const page = await api.get<Paginated<Claim>>("/claims?pageSize=100");
      return { kind: "ready", claims: page.data, loadedAt: Date.now() };
    } catch {
      return { kind: "error" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchClaims().then((next) => !cancelled && setLoad(next));
    return () => {
      cancelled = true;
    };
  }, [fetchClaims]);

  async function reload() {
    setLoad(await fetchClaims());
  }

  const claims = load.kind === "ready" ? load.claims : [];
  const active = claims.filter(
    (c) => c.status === "PENDING" || c.status === "APPROVED",
  );
  const history = claims.filter(
    (c) => !(c.status === "PENDING" || c.status === "APPROVED"),
  );
  const shown = tab === "active" ? active : history;

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pb-8 pt-5 md:gap-8 md:px-8 md:pb-16 md:pt-10 lg:px-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display m-0 text-[28px] font-semibold leading-9 text-deep md:text-[40px] md:leading-[48px]">
          My claims
        </h1>
        <p className="text-body text-muted">
          Track every claim and pickup in one place.
        </p>
      </header>

      <ClaimTabs
        tab={tab}
        onChange={setTab}
        counts={
          load.kind === "ready"
            ? { active: active.length, history: history.length }
            : null
        }
      />

      <div id="claims-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {load.kind === "loading" && <LoadingState />}
        {load.kind === "error" && (
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
                We couldn’t load your claims. Check your connection and try
                again.
              </span>
            </div>
            <div>
              <Button
                variant="secondary"
                size="sm"
                className="bg-cream"
                icon={<ArrowClockwise size={18} weight="bold" />}
                onClick={() => {
                  setLoad({ kind: "loading" });
                  void reload();
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}
        {load.kind === "ready" &&
          (shown.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6">
              {shown.map((c) => (
                <ClaimCard
                  key={c.id}
                  claim={c}
                  now={load.loadedAt}
                  onCancel={() => setCancelling(c)}
                />
              ))}
            </div>
          ))}
      </div>

      {cancelling && (
        <CancelClaimSheet
          claim={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function ClaimTabs({
  tab,
  onChange,
  counts,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  counts: { active: number; history: number } | null;
}) {
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({
    active: null,
    history: null,
  });
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "active" ? "history" : "active";
    onChange(next);
    refs.current[next]?.focus();
  }
  const items: { id: Tab; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "history", label: "History" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Claims"
      onKeyDown={onKeyDown}
      className="flex gap-1 rounded-[14px] bg-[#E9E3D5] p-1 md:max-w-[420px]"
    >
      {items.map((t) => {
        const selected = tab === t.id;
        const count = counts?.[t.id];
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="claims-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] text-[15px]",
              selected
                ? "bg-cream font-bold text-deep shadow-card"
                : "font-medium text-ink hover:bg-sage",
            )}
          >
            {t.label}
            {count !== undefined && (
              <span
                className={cn(
                  "h-[22px] min-w-[22px] rounded-full px-1.5 text-center text-xs font-bold leading-[22px]",
                  selected ? "bg-leaf text-cream" : "bg-[#D9D3C4] text-ink",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Claim card ──────────────────────────────────────────────────────────────

/** One card per claim; the middle and the actions depend on status and booking. */
function ClaimCard({
  claim,
  now,
  onCancel,
}: {
  claim: Claim;
  now: number;
  onCancel: () => void;
}) {
  const booking = claim.booking ?? null;
  const booked = booking?.status === "BOOKED";
  const noShow = claim.status === "CANCELLED" && booking?.status === "NO_SHOW";
  const requested = Number(claim.requestedKg);
  const approved = claim.approvedKg !== null ? Number(claim.approvedKg) : null;
  const kg = approved ?? requested;

  // Timeline: pending → "Approved" in progress; approved → booking; booked → collecting.
  const step =
    claim.status === "PENDING"
      ? 1
      : claim.status === "APPROVED"
        ? booked
          ? 3
          : 2
        : 4;

  let amount: ReactNode;
  if (claim.status === "COLLECTED") {
    amount = (
      <>
        Collected {formatKg(kg)}kg
        {claim.collectedAt && ` on ${formatDayMonth(claim.collectedAt)}`}
      </>
    );
  } else if (
    approved !== null &&
    approved !== requested &&
    claim.status === "APPROVED"
  ) {
    amount = (
      <>
        Requested {formatKg(requested)}kg →{" "}
        <strong>Approved {formatKg(approved)}kg</strong>
      </>
    );
  } else if (approved !== null) {
    amount = <>Approved {formatKg(approved)}kg</>;
  } else {
    amount = <>Requested {formatKg(requested)}kg</>;
  }

  return (
    <article className="flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
            {claim.reference}
          </h3>
          <span className="text-small text-muted">
            {claim.batch ? `Batch ${claim.batch.reference} · ` : ""}Submitted{" "}
            {formatDayMonth(claim.submittedAt)}
          </span>
        </div>
        <ClaimStatusBadge status={noShow ? "NO_SHOW" : claim.status} />
      </div>

      <p className="flex items-center gap-2 text-body leading-6">
        <Handbag size={18} className="shrink-0 text-deep" aria-hidden />
        <span>{amount}</span>
      </p>

      {(claim.status === "PENDING" ||
        claim.status === "APPROVED" ||
        claim.status === "COLLECTED") && <StatusTimeline current={step} />}

      {claim.status === "PENDING" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-small font-semibold text-amber-ink">
            <Hourglass size={16} weight="bold" aria-hidden /> Waiting for review
          </p>
          <DangerLink onClick={onCancel}>Cancel claim</DangerLink>
        </div>
      )}

      {claim.status === "APPROVED" && !booked && (
        <>
          {claim.batch?.availableUntil && (
            <div className="flex items-start gap-2.5 rounded-control bg-amber-tint p-3 text-small text-amber-ink">
              <WarningCircle
                size={18}
                weight="bold"
                className="mt-px shrink-0"
                aria-hidden
              />
              <span>
                <strong>
                  Book by {formatWeekdayDay(claim.batch.availableUntil)}.
                </strong>{" "}
                After that, the compost goes back to the pool for others.
              </span>
            </div>
          )}
          <Button
            href={`/book-pickup?claim=${claim.id}`}
            fullWidth
            iconAfter={<IconArrowRight size={18} />}
          >
            Book your pickup
          </Button>
          <div className="flex justify-center">
            <DangerLink onClick={onCancel}>Cancel claim</DangerLink>
          </div>
        </>
      )}

      {claim.status === "APPROVED" && booked && booking && (
        <>
          <div className="flex flex-col gap-3 rounded-control bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]">
            <InfoRow
              icon={<CalendarBlank size={18} />}
              label="Pickup slot"
              value={`${formatWeekdayDay(booking.slot.startTime)} · ${formatTimeRange(booking.slot.startTime, booking.slot.endTime)}`}
            />
            <InfoRow
              icon={<MapPin size={18} />}
              label="Location"
              value={
                booking.slot.location ??
                claim.batch?.pickupLocation ??
                "SUSS bin centre"
              }
            />
          </div>
          {booking.collectionDeadline && (
            <p className="flex items-center gap-2 rounded-control bg-sage px-3 py-2.5 text-[15px] font-bold leading-[22px] text-deep">
              <Clock size={18} weight="bold" aria-hidden />
              Collect within {formatTimeLeft(booking.collectionDeadline, now)}
            </p>
          )}
          <Button
            href={`/pickup-pass?booking=${booking.id}`}
            fullWidth
            icon={<QrCode size={18} weight="bold" />}
          >
            Show pickup pass
          </Button>
          <div className="flex items-center gap-2">
            <Button
              href={`/change-pickup?booking=${booking.id}`}
              variant="secondary"
              size="sm"
              className="flex-1"
            >
              Change time
            </Button>
            <DangerLink onClick={onCancel}>Cancel</DangerLink>
          </div>
        </>
      )}

      {claim.status === "COLLECTED" && (
        <p className="flex items-center gap-2.5 rounded-control bg-sage p-3 text-[15px] font-semibold leading-[22px] text-deep">
          <Leaf size={18} weight="bold" aria-hidden />
          You helped divert {formatKg(kg)}kg of food waste
        </p>
      )}

      {claim.status === "REJECTED" && (
        <>
          <p className="text-[15px] leading-[22px]">
            <strong>
              {REJECTION_REASON_LABEL[
                claim.rejectionReason as RejectionReason
              ] ?? "Your claim wasn’t approved."}
            </strong>
            {claim.reasonNote && ` ${claim.reasonNote}`}
          </p>
          {claim.managerNote && (
            <blockquote className="m-0 flex flex-col gap-1 rounded-control bg-white px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]">
              <span className="text-xs font-bold uppercase leading-4 tracking-[0.06em] text-muted">
                Note from the SUSS team
              </span>
              <span className="text-[15px] italic leading-[22px]">
                “{claim.managerNote}”
              </span>
            </blockquote>
          )}
          <Button href="/batches" variant="secondary" size="sm" fullWidth>
            Browse other batches
          </Button>
        </>
      )}

      {claim.status === "CANCELLED" && noShow && (
        <p className="flex items-start gap-2.5 text-[15px] leading-[22px]">
          <Clock
            size={18}
            weight="bold"
            className="mt-0.5 shrink-0 text-soil"
            aria-hidden
          />
          <span>
            The collection deadline
            {booking?.collectionDeadline
              ? ` (${formatDayMonth(booking.collectionDeadline)})`
              : ""}{" "}
            passed, so the {formatKg(kg)}kg was released back to the pool for
            others.
          </span>
        </p>
      )}

      {claim.status === "CANCELLED" && !noShow && (
        <p className="text-[15px] leading-[22px] text-ink">
          <span className="text-muted">You cancelled this claim: </span>
          <strong>
            {claim.cancellationReason === "OTHER" && claim.reasonNote
              ? claim.reasonNote
              : (CANCELLATION_REASON_LABEL[
                  claim.cancellationReason as CancellationReason
                ] ?? "Cancelled")}
          </strong>
        </p>
      )}
    </article>
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

function DangerLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center rounded-control px-3 font-semibold text-error underline underline-offset-4 hover:bg-danger-tint"
    >
      {children}
    </button>
  );
}

// ─── Empty / loading ─────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-10 text-center shadow-card">
      <div className="mb-2 flex size-40 items-center justify-center rounded-full bg-sage">
        <Sprout width={120} />
      </div>
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        {tab === "active" ? "No claims yet" : "No past claims yet"}
      </h2>
      <p className="max-w-[360px] text-body text-muted">
        {tab === "active"
          ? "When you claim compost, you’ll track its status and pickup here."
          : "Collected, cancelled and declined claims will show up here."}
      </p>
      <div className="mt-2 w-full md:w-auto">
        <Button href="/batches" fullWidth>
          Browse available compost
        </Button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      <LoadingLabel>Loading your claims…</LoadingLabel>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden
          className="flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card"
        >
          <div className="flex justify-between">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-[26px] w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}
