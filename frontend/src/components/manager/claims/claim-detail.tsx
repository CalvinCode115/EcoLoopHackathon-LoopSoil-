"use client";

import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { XCircle } from "@phosphor-icons/react/dist/ssr/XCircle";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ProgressBar } from "@/components/manager/panel";
import { initials } from "@/components/nav/account-menu";
import { Badge, ClaimStatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { MAX_CLAIM_KG, MIN_CLAIM_KG } from "@/lib/constants";
import {
  firstName,
  formatClock,
  formatDayTime,
  formatFullDate,
  formatKg,
  formatTimeRange,
  formatWeekdayDay,
} from "@/lib/format";
import {
  CANCELLATION_REASON_LABEL,
  REJECTION_REASON_MANAGER_LABEL,
  friendlyError,
  type CancellationReason,
  type RejectionReason,
} from "@/lib/labels";
import type { BatchPool, Claim, Handover } from "@/lib/types";
import type { ClaimFlag } from "./claim-queue";
import { RejectClaimSheet, ReleaseClaimSheet } from "./claim-sheets";
import {
  claimStatus,
  collectBy,
  formatElapsed,
  hasActiveBooking,
  isOverdue,
  slotText,
  whatsAppLink,
} from "./claim-utils";

const TAKER_TONE: Record<string, { label: string; tone: BadgeTone }> = {
  APPROVED: { label: "Approved", tone: "leaf" },
  PENDING: { label: "Pending approval", tone: "amber" },
  REJECTED: { label: "Declined", tone: "red" },
  SUSPENDED: { label: "Suspended", tone: "red" },
};

export interface ClaimContext {
  /** The claim's batch pool (for "kg remaining in batch" and the approve cap). */
  pool: BatchPool | null;
  /** Every claim by this taker (all batches) — stats + allowance. */
  history: Claim[] | null;
  /** The handover record for a collected claim. */
  handover: Handover | null;
}

/**
 * Claim detail (right half of the split view): warnings, claim + timeline, a status
 * section (collection / rejection / cancellation / handover), the taker, an activity log
 * and — for pending claims — the sticky approve / reject bar.
 */
export function ClaimDetail({
  claim,
  context,
  flags,
  now,
  onDone,
}: {
  claim: Claim;
  context: ClaimContext;
  flags: ClaimFlag[];
  now: number;
  /** After any action: toast text; `advance` moves the queue to the next pending claim. */
  onDone: (message: string, opts?: { advance?: boolean }) => void;
}) {
  const status = claimStatus(claim);
  const requested = Number(claim.requestedKg);
  const approved = claim.approvedKg != null ? Number(claim.approvedKg) : null;
  const pool = context.pool;
  // A pending claim's own kg is already held inside kgRemaining, so it is available to itself.
  const available = pool
    ? Math.max(0, pool.kgRemaining + (status === "PENDING" ? requested : 0))
    : null;
  const [sheet, setSheet] = useState<"reject" | "release" | null>(null);

  const kgLabel =
    status === "COLLECTED"
      ? "Collected"
      : status === "APPROVED"
        ? "Approved"
        : "Requested";
  const kgValue =
    status === "APPROVED" || status === "COLLECTED"
      ? (approved ?? requested)
      : requested;

  return (
    <section
      aria-label="Claim detail"
      className="flex min-w-0 flex-col self-start rounded-card bg-cream shadow-card"
    >
      {flags.length > 0 && (
        <div
          role="note"
          aria-label="Warnings"
          className="flex flex-wrap gap-2 px-6 pt-4"
        >
          {flags.map((f) => (
            <span
              key={f.label}
              className={cn(
                "inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[13px] font-bold",
                f.tone === "red"
                  ? "bg-danger-tint text-danger-ink"
                  : "bg-amber-tint text-amber-ink",
              )}
            >
              <WarningCircle size={16} weight="bold" aria-hidden />
              {f.label}
            </span>
          ))}
        </div>
      )}

      <Block title="Claim">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display m-0 text-2xl font-semibold leading-8 text-deep">
                {claim.reference}
              </h2>
              <ClaimStatusBadge status={status} />
            </div>
            <span className="text-[13px] text-muted">
              Submitted {formatDayTime(claim.submittedAt)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-muted">{kgLabel}</span>
            <div className="font-display text-[40px] font-semibold leading-[44px] text-deep">
              {formatKg(kgValue)} kg
            </div>
          </div>
        </div>
        <Link
          href={`/manager/batches/${claim.batchId}`}
          className="flex items-center justify-between gap-3 rounded-control bg-white px-3.5 py-3 text-ink no-underline shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)] hover:bg-row-hover"
        >
          <span className="flex flex-wrap items-center gap-2.5">
            <Package size={18} className="text-deep" aria-hidden />
            <strong className="text-small">
              Batch {claim.batch?.reference}
            </strong>
            {pool && (
              <span className="text-[13px] text-muted">
                kg remaining in batch:{" "}
                <strong
                  className={cn(
                    status === "PENDING" &&
                      available != null &&
                      available < requested
                      ? "text-error"
                      : "text-ink",
                  )}
                >
                  {formatKg(Math.max(0, pool.kgRemaining))}kg
                </strong>
              </span>
            )}
          </span>
          <CaretRight size={16} className="text-muted" aria-hidden />
        </Link>
        <Timeline claim={claim} now={now} />
      </Block>

      {status === "APPROVED" && (
        <CollectionBlock
          claim={claim}
          now={now}
          onRelease={() => setSheet("release")}
        />
      )}
      {status === "REJECTED" && (
        <Block title="Rejection">
          <Facts
            rows={[
              [
                "Reason",
                claim.rejectionReason
                  ? REJECTION_REASON_MANAGER_LABEL[
                      claim.rejectionReason as RejectionReason
                    ]
                  : "—",
              ],
              ["Note to taker", claim.reasonNote ?? "—"],
              [
                "When",
                claim.decidedAt
                  ? `${formatFullDate(claim.decidedAt)}, ${formatClock(claim.decidedAt)}`
                  : "—",
              ],
            ]}
          />
        </Block>
      )}
      {(status === "CANCELLED" || status === "NO_SHOW") && (
        <Block title={status === "NO_SHOW" ? "No-show" : "Cancellation"}>
          <Facts
            rows={[
              ...(status === "NO_SHOW"
                ? ([["What happened", "Didn’t collect by the deadline"]] as [
                    string,
                    ReactNode,
                  ][])
                : ([
                    [
                      "Reason",
                      claim.cancellationReason
                        ? CANCELLATION_REASON_LABEL[
                            claim.cancellationReason as CancellationReason
                          ]
                        : "—",
                    ],
                    ["Note", claim.reasonNote ?? "—"],
                  ] as [string, ReactNode][])),
              [
                "Cancelled",
                claim.cancelledAt
                  ? `${formatFullDate(claim.cancelledAt)}, ${formatClock(claim.cancelledAt)}`
                  : "—",
              ],
              [
                "kg returned",
                `${formatKg(approved ?? requested)}kg back to ${claim.batch?.reference ?? "the batch"}`,
              ],
            ]}
          />
        </Block>
      )}
      {status === "COLLECTED" && <HandoverBlock handover={context.handover} />}

      <TakerBlock claim={claim} history={context.history} />

      <Block title="Activity log" last={status !== "PENDING"}>
        <ul className="m-0 list-none p-0">
          {activity(claim).map((a) => (
            <li
              key={a.text}
              className="flex items-center gap-2.5 py-2 text-[13px] shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-leaf"
              />
              <span className="grow">{a.text}</span>
              <span className="whitespace-nowrap text-muted">
                {formatDayTime(a.at)}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {status === "PENDING" && (
        <ApproveBar
          key={claim.id}
          claim={claim}
          available={available}
          takerApproved={claim.taker?.status === "APPROVED"}
          onReject={() => setSheet("reject")}
          onApproved={(msg) => onDone(msg, { advance: true })}
        />
      )}

      {sheet === "reject" && (
        <RejectClaimSheet
          claim={claim}
          onClose={() => setSheet(null)}
          onDone={(msg) => {
            setSheet(null);
            onDone(msg, { advance: true });
          }}
        />
      )}
      {sheet === "release" && (
        <ReleaseClaimSheet
          claim={claim}
          onClose={() => setSheet(null)}
          onDone={(msg) => {
            setSheet(null);
            onDone(msg);
          }}
        />
      )}
    </section>
  );
}

function Block({
  title,
  children,
  last,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 px-6 py-5",
        !last && "shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]",
      )}
    >
      <h3 className="m-0 text-xs font-bold uppercase tracking-[0.08em] text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(110px,150px)_minmax(0,1fr)] text-small">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="py-2 text-muted shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
            {k}
          </dt>
          <dd className="m-0 py-2 font-semibold shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

type StepState = "done" | "current" | "todo" | "failed";

function Timeline({ claim, now }: { claim: Claim; now: number }) {
  const status = claimStatus(claim);
  const booking = claim.booking;
  const booked =
    booking && (booking.status === "BOOKED" || booking.status === "COLLECTED");
  const steps: { label: string; detail: string; state: StepState }[] = [
    {
      label: "Submitted",
      detail: formatDayTime(claim.submittedAt),
      state: "done",
    },
  ];
  if (status === "REJECTED") {
    steps.push({
      label: "Rejected",
      detail: claim.decidedAt ? formatDayTime(claim.decidedAt) : "—",
      state: "failed",
    });
  } else if (claim.decidedAt && claim.approvedKg != null) {
    steps.push({
      label: "Approved",
      detail: formatDayTime(claim.decidedAt),
      state: "done",
    });
  } else if (status === "PENDING") {
    steps.push({
      label: "Approved",
      detail: "Waiting for your review",
      state: "current",
    });
  } else {
    steps.push({ label: "Approved", detail: "—", state: "todo" });
  }

  if (status === "CANCELLED" || status === "NO_SHOW") {
    steps.push({
      label: status === "NO_SHOW" ? "No-show" : "Cancelled",
      detail: claim.cancelledAt ? formatDayTime(claim.cancelledAt) : "—",
      state: "failed",
    });
  } else if (booked) {
    steps.push({
      label: "Pickup booked",
      detail: booking?.bookedAt
        ? formatDayTime(booking.bookedAt)
        : slotText(booking.slot),
      state: "done",
    });
  } else {
    steps.push({
      label: "Pickup booked",
      detail: status === "APPROVED" ? "Not booked" : "—",
      state: status === "APPROVED" ? "current" : "todo",
    });
  }

  if (status === "COLLECTED") {
    steps.push({
      label: "Collected",
      detail: claim.collectedAt ? formatDayTime(claim.collectedAt) : "—",
      state: "done",
    });
  } else if (status === "APPROVED" && booked && booking) {
    const today =
      formatWeekdayDay(booking.slot.startTime) ===
      formatWeekdayDay(new Date(now).toISOString());
    steps.push({
      label: "Collected",
      detail: `${today ? "Today" : formatWeekdayDay(booking.slot.startTime)}, ${formatTimeRange(booking.slot.startTime, booking.slot.endTime)}`,
      state: "todo",
    });
  } else if (
    status !== "REJECTED" &&
    status !== "CANCELLED" &&
    status !== "NO_SHOW"
  ) {
    steps.push({ label: "Collected", detail: "—", state: "todo" });
  }

  return (
    <ol
      aria-label="Status timeline"
      className="m-0 flex list-none flex-col p-0"
    >
      {steps.map((s, i) => (
        <li
          key={s.label}
          aria-current={s.state === "current" ? "step" : undefined}
          className="relative flex gap-3 pb-3.5 last:pb-0"
        >
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute bottom-[-6px] left-2.5 top-6 w-0.5",
                s.state === "done" ? "bg-leaf" : "bg-[#E3DDCF]",
              )}
            />
          )}
          <span
            aria-hidden
            className={cn(
              "flex size-[22px] shrink-0 items-center justify-center rounded-full text-cream",
              s.state === "done" && "bg-leaf",
              s.state === "failed" && "bg-error",
              s.state === "current" &&
                "bg-cream shadow-[inset_0_0_0_2px_var(--color-amber-ink)]",
              s.state === "todo" && "bg-cream shadow-[inset_0_0_0_2px_#C9C5B8]",
            )}
          >
            {s.state === "done" && <Check size={12} weight="bold" />}
            {s.state === "failed" && <X size={12} weight="bold" />}
          </span>
          <div className="flex flex-col">
            <strong
              className={cn(
                "text-small",
                s.state === "todo" ? "text-muted" : "text-ink",
              )}
            >
              {s.label}
            </strong>
            <span className="text-xs text-muted">{s.detail}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Status sections ──────────────────────────────────────────────────────────

function CollectionBlock({
  claim,
  now,
  onRelease,
}: {
  claim: Claim;
  now: number;
  onRelease: () => void;
}) {
  const booking = hasActiveBooking(claim) ? claim.booking! : null;
  const due = collectBy(claim);
  const overdue = isOverdue(claim, now);
  const reminder = whatsAppLink(
    claim.taker?.phone,
    booking
      ? `Hi ${firstName(claim.taker?.name)}, a reminder from SUSS LoopSoil: your compost (${claim.reference}, ${formatKg(Number(claim.approvedKg ?? claim.requestedKg))}kg) is ready for pickup on ${slotText(booking.slot)} at ${booking.slot.location ?? claim.batch?.pickupLocation ?? "the SUSS bin centre"}.`
      : `Hi ${firstName(claim.taker?.name)}, a reminder from SUSS LoopSoil: your compost claim ${claim.reference} is approved. Please book a pickup time in the app${due ? ` by ${formatWeekdayDay(due)}` : ""}.`,
  );

  return (
    <Block title="Collection">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-control bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
          <span className="text-xs font-bold text-muted">Booking</span>
          <div className="font-display text-lg font-semibold text-deep">
            {booking ? slotText(booking.slot) : "Not booked yet"}
          </div>
          <span className="text-[13px] text-muted">
            {booking
              ? (booking.slot.location ?? claim.batch?.pickupLocation ?? "")
              : "The taker books a time in the app"}
          </span>
        </div>
        <div
          className={cn(
            "rounded-control p-3.5",
            overdue
              ? "bg-danger-tint"
              : "bg-white shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]",
          )}
        >
          <span
            className={cn(
              "text-xs font-bold",
              overdue ? "text-danger-ink" : "text-muted",
            )}
          >
            Collection deadline
          </span>
          <div
            className={cn(
              "font-display text-lg font-semibold",
              overdue ? "text-danger-ink" : "text-deep",
            )}
          >
            {!due
              ? "No deadline"
              : overdue
                ? `Overdue ${formatElapsed(due, now)}`
                : `${daysLeft(due, now)} left`}
          </div>
          {due && (
            <span
              className={cn(
                "text-[13px]",
                overdue ? "text-danger-ink" : "text-muted",
              )}
            >
              {overdue ? "Was due" : "Collect by"}{" "}
              {formatWeekdayDay(due).replace(",", "")}, {formatClock(due)}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {booking ? (
          <>
            <Button
              href={`/manager/slots?slot=${booking.slot.id}`}
              size="sm"
              className="px-[18px]"
            >
              Go to pickup slot
            </Button>
            <Button
              href={`/manager/handover?claim=${claim.id}`}
              variant="secondary"
              size="sm"
              className="px-[18px]"
            >
              Start handover
            </Button>
          </>
        ) : reminder ? (
          <Button
            href={reminder}
            target="_blank"
            rel="noreferrer"
            size="sm"
            className="px-[18px]"
          >
            Send reminder
          </Button>
        ) : (
          <span className="self-center text-[13px] text-muted">
            No valid phone number for a WhatsApp reminder.
          </span>
        )}
        {!booking && (
          // Walk-in: the taker turned up without booking — the handover books it itself.
          <Button
            href={`/manager/handover?claim=${claim.id}`}
            variant="secondary"
            size="sm"
            className="px-[18px]"
          >
            Start handover
          </Button>
        )}
        {booking && reminder && !overdue && (
          <Button
            href={reminder}
            target="_blank"
            rel="noreferrer"
            variant="ghost"
            size="sm"
          >
            Send reminder
          </Button>
        )}
        {overdue && (
          <Button
            variant="secondary"
            size="sm"
            className="px-[18px]"
            icon={<XCircle size={18} />}
            onClick={onRelease}
          >
            {booking ? "Mark no-show" : "Release claim"}
          </Button>
        )}
      </div>
    </Block>
  );
}

function HandoverBlock({ handover }: { handover: Handover | null }) {
  if (!handover) {
    return (
      <Block title="Handover">
        <p className="text-small text-muted">
          The handover record isn’t available.
        </p>
      </Block>
    );
  }
  const bags = [
    handover.oneKgBags > 0 &&
      `${handover.oneKgBags} × 1kg bag${handover.oneKgBags === 1 ? "" : "s"}`,
    handover.halfKgBags > 0 &&
      `${handover.halfKgBags} × 0.5kg bag${handover.halfKgBags === 1 ? "" : "s"}`,
    handover.looseKg > 0 && `${formatKg(handover.looseKg)}kg loose`,
  ].filter(Boolean);
  return (
    <Block title="Handover">
      <div className="flex flex-col gap-4 sm:flex-row">
        {handover.photoUrl && (
          <a
            href={handover.photoUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0"
          >
            <Image
              src={handover.photoUrl}
              alt="Handover photo"
              width={120}
              height={120}
              unoptimized
              className="size-[120px] rounded-control object-cover"
            />
          </a>
        )}
        <div className="grow">
          <Facts
            rows={[
              ["Actual kg", `${formatKg(handover.actualKg)}kg`],
              ["Bags", bags.join(", ") || "—"],
              ["When", formatDayTime(handover.handedOverAt)],
            ]}
          />
        </div>
      </div>
    </Block>
  );
}

function TakerBlock({
  claim,
  history,
}: {
  claim: Claim;
  history: Claim[] | null;
}) {
  const taker = claim.taker;
  if (!taker) return null;
  const t = TAKER_TONE[taker.status] ?? TAKER_TONE.PENDING;
  const noShows =
    history?.filter((c) => c.booking?.status === "NO_SHOW").length ?? 0;
  const collectedKg =
    history
      ?.filter((c) => c.status === "COLLECTED")
      .reduce((s, c) => s + Number(c.approvedKg ?? c.requestedKg), 0) ?? 0;
  // The 1kg-per-batch allowance counts pending + approved + collected claims on this batch.
  const usedOnBatch =
    history
      ?.filter(
        (c) =>
          c.batchId === claim.batchId &&
          ["PENDING", "APPROVED", "COLLECTED"].includes(c.status),
      )
      .reduce((s, c) => s + Number(c.approvedKg ?? c.requestedKg), 0) ?? null;

  return (
    <Block title="Taker">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sage font-bold text-deep">
          {initials(taker.name)}
        </span>
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[17px]">{taker.name}</strong>
            <Badge tone={t.tone} size="sm">
              {t.label}
            </Badge>
          </div>
          <span className="text-[13px] text-muted">
            {[taker.phone && formatPhone(taker.phone), taker.email]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Link
          href={`/manager/takers?taker=${taker.id}`}
          className="whitespace-nowrap text-[13px] font-bold text-deep"
        >
          View taker profile →
        </Link>
      </div>
      {taker.intendedUse && (
        <div className="text-small">
          <span className="text-muted">Intended use: </span>
          {taker.intendedUse}
        </div>
      )}
      <div className="flex gap-2">
        <Stat
          label="Total claims"
          value={history ? String(history.length) : "–"}
        />
        <Stat
          label="Collected"
          value={history ? `${formatKg(collectedKg)}kg` : "–"}
        />
        <Stat
          label="No-shows"
          value={history ? String(noShows) : "–"}
          warn={noShows > 0}
        />
      </div>
      {usedOnBatch != null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-muted">Allowance on this batch</span>
            <strong>
              {formatKg(Math.min(usedOnBatch, MAX_CLAIM_KG))}kg of{" "}
              {MAX_CLAIM_KG}kg used
            </strong>
          </div>
          <ProgressBar
            value={Math.min(usedOnBatch, MAX_CLAIM_KG)}
            max={MAX_CLAIM_KG}
            label={`${formatKg(usedOnBatch)} of ${MAX_CLAIM_KG} kg used on this batch`}
          />
        </div>
      )}
    </Block>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-control px-3 py-2.5",
        warn ? "bg-amber-tint" : "bg-[#F4EFE4]",
      )}
    >
      <div className="text-xs text-muted">{label}</div>
      <strong
        className={cn("text-[17px]", warn ? "text-amber-ink" : "text-ink")}
      >
        {value}
      </strong>
    </div>
  );
}

// ─── Approve bar ──────────────────────────────────────────────────────────────

function ApproveBar({
  claim,
  available,
  takerApproved,
  onReject,
  onApproved,
}: {
  claim: Claim;
  available: number | null;
  takerApproved: boolean;
  onReject: () => void;
  onApproved: (message: string) => void;
}) {
  const requested = Number(claim.requestedKg);
  const [kg, setKg] = useState(formatKg(requested));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(kg);
  const cap = available == null ? requested : Math.min(requested, available);

  const kgError =
    kg === "" || !(amount >= MIN_CLAIM_KG)
      ? `Minimum is ${MIN_CLAIM_KG}kg`
      : Math.round(amount * 10) !== amount * 10
        ? "Use steps of 0.1kg"
        : amount > requested
          ? `Can’t be more than requested (${formatKg(requested)}kg)`
          : available != null && amount > available
            ? `Only ${formatKg(available)}kg left in this batch.`
            : null;

  async function approve() {
    if (kgError || !takerApproved) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/claims/${claim.id}/approve`, {
        approvedKg: amount,
        managerNote: note.trim() || undefined,
      });
      onApproved(
        `Claim approved · ${claim.reference} · ${formatKg(amount)}kg. Showing the next pending claim.`,
      );
    } catch (err) {
      setSaving(false);
      setError(
        friendlyError(err, "Couldn’t update this claim. Please try again."),
      );
    }
  }

  const disabled = !takerApproved || saving;

  return (
    <div className="sticky bottom-0 flex flex-col gap-3 rounded-b-card bg-[#F3EEE3] px-6 pb-5 pt-[18px] shadow-[0_-8px_20px_rgba(47,74,36,0.08),inset_0_1px_0_rgba(107,107,94,0.14)]">
      {!takerApproved && (
        <p className="rounded-control bg-danger-tint px-3.5 py-2.5 text-[13px] font-semibold text-danger-ink">
          Approve {firstName(claim.taker?.name)}’s account before approving this
          claim.{" "}
          <Link
            href={`/manager/takers?taker=${claim.taker?.id ?? ""}`}
            className="text-danger-ink underline"
          >
            Review in Takers →
          </Link>
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-control bg-danger-tint px-3.5 py-2.5 text-[13px] font-semibold text-danger-ink"
        >
          <WarningCircle size={16} weight="bold" aria-hidden />
          {error}
        </p>
      )}
      <div className="grid items-start gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ap-kg" className="text-small font-semibold">
            Approved kg
          </label>
          <div
            className={cn(
              "flex h-12 items-center overflow-hidden rounded-control bg-white focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(79,122,58,0.25)]",
              kgError
                ? "shadow-[inset_0_0_0_2px_var(--color-error)]"
                : "shadow-[inset_0_0_0_1px_var(--color-edge)]",
              disabled && "bg-disabled",
            )}
          >
            <input
              id="ap-kg"
              type="number"
              inputMode="decimal"
              min={MIN_CLAIM_KG}
              max={requested}
              step="0.1"
              value={kg}
              disabled={disabled}
              onChange={(e) => setKg(e.target.value)}
              aria-invalid={kgError ? true : undefined}
              aria-describedby="ap-kg-msg"
              className="w-full border-none bg-transparent px-3 text-body outline-none disabled:cursor-not-allowed"
            />
            <span className="pr-3 text-muted">kg</span>
          </div>
          {kgError ? (
            <p
              id="ap-kg-msg"
              className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-error"
            >
              <WarningCircle size={14} weight="bold" aria-hidden />
              {kgError}
              {available != null &&
                amount > available &&
                available >= MIN_CLAIM_KG && (
                  <button
                    type="button"
                    onClick={() => setKg(formatKg(Math.floor(cap * 10) / 10))}
                    className="font-bold text-deep underline"
                  >
                    Use {formatKg(Math.floor(cap * 10) / 10)}kg
                  </button>
                )}
            </p>
          ) : (
            <p id="ap-kg-msg" className="text-xs text-muted">
              Can be lowered, not raised (max {formatKg(requested)}kg)
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ap-note" className="text-small font-semibold">
            Note to taker{" "}
            <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="ap-note"
            type="text"
            value={note}
            disabled={disabled}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Please bring your own bag"
            maxLength={500}
            className="h-12 rounded-control border-none bg-white px-3 text-[15px] text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(79,122,58,0.25)] disabled:cursor-not-allowed disabled:bg-disabled"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">
          Approving reserves the kg and lets the taker book a pickup.
        </span>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onReject}
            disabled={saving}
            className="inline-flex h-12 items-center gap-1.5 rounded-control px-[18px] text-body font-bold text-error shadow-[inset_0_0_0_1.5px_var(--color-error)] hover:bg-danger-tint disabled:opacity-50"
          >
            <X size={18} weight="bold" aria-hidden />
            Reject
          </button>
          <Button
            size="md"
            loading={saving}
            disabled={!takerApproved || !!kgError}
            onClick={() => void approve()}
          >
            {saving ? "Approving…" : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Built from the claim's own timestamps (claims don't record who decided). */
function activity(c: Claim): { text: string; at: string }[] {
  const who = c.taker?.name ?? "The taker";
  const items: { text: string; at: string }[] = [
    {
      text: `${who} submitted ${c.reference} for ${formatKg(Number(c.requestedKg))}kg`,
      at: c.submittedAt,
    },
  ];
  if (c.decidedAt && c.status === "REJECTED")
    items.push({ text: "Rejected", at: c.decidedAt });
  else if (c.decidedAt && c.approvedKg != null)
    items.push({
      text: `Approved ${formatKg(Number(c.approvedKg))}kg`,
      at: c.decidedAt,
    });
  if (c.booking?.bookedAt)
    items.push({
      text: `${who} booked ${slotText(c.booking.slot)}`,
      at: c.booking.bookedAt,
    });
  if (c.cancelledAt)
    items.push({
      text: c.booking?.status === "NO_SHOW" ? "Marked as no-show" : "Cancelled",
      at: c.cancelledAt,
    });
  if (c.collectedAt) items.push({ text: "Collected", at: c.collectedAt });
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** "8 days" / "5 hrs" until `iso`. */
function daysLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hrs = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hrs} hr${hrs === 1 ? "" : "s"}`;
}

/** "91234471" → "+65 9123 4471". */
function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "").replace(/^65(?=\d{8}$)/, "");
  return d.length === 8 ? `+65 ${d.slice(0, 4)} ${d.slice(4)}` : phone;
}
