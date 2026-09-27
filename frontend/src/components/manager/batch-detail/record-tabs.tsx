"use client";

import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Image as ImageIcon } from "@phosphor-icons/react/dist/ssr/Image";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DataTable,
  EmptyPanel,
  Panel,
  ProgressBar,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import { Badge, ClaimStatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDayMonth,
  formatDayTime,
  formatKg,
  formatTimeRange,
  formatWeekdayDay,
  sgDayKey,
} from "@/lib/format";
import { CLAIM_STATUS_LABEL, type ClaimStatus } from "@/lib/labels";
import type { Batch, Claim, Handover, Slot } from "@/lib/types";

// ─── Claims ───────────────────────────────────────────────────────────────────

/** Claims tab (board "Batch detail · claims"): read-only; rows open in Claims review. */
export function ClaimsTab({
  batch,
  claims,
  now,
}: {
  batch: Batch;
  claims: Claim[];
  now: number;
}) {
  const router = useRouter();
  if (claims.length === 0) {
    return (
      <EmptyPanel title="No claims yet">
        Claims from takers on this batch will appear here.
      </EmptyPanel>
    );
  }
  const status = (c: Claim): ClaimStatus =>
    c.status === "CANCELLED" && c.booking?.status === "NO_SHOW"
      ? "NO_SHOW"
      : c.status;
  const counts = new Map<ClaimStatus, number>();
  for (const c of claims)
    counts.set(status(c), (counts.get(status(c)) ?? 0) + 1);
  const order: ClaimStatus[] = [
    "PENDING",
    "APPROVED",
    "COLLECTED",
    "REJECTED",
    "CANCELLED",
    "NO_SHOW",
  ];
  const summary = order
    .filter((s) => counts.get(s))
    .map((s) => `${counts.get(s)} ${CLAIM_STATUS_LABEL[s].toLowerCase()}`)
    .join(" · ");
  const today = sgDayKey(new Date(now).toISOString());
  const reviewHref = (id?: string) =>
    `/manager/claims?batchId=${batch.id}${id ? `&claim=${id}` : ""}`;

  return (
    <Panel
      title="Claims on this batch"
      description={summary}
      actions={
        <Link href={reviewHref()} className="text-small font-bold text-deep">
          Open in Claims review →
        </Link>
      }
    >
      <DataTable
        head={[
          "Reference",
          "Taker",
          "Requested",
          "Approved",
          "Status",
          "Submitted",
          <span key="x" className="sr-only">
            Open
          </span>,
        ]}
      >
        {claims.map((c) => (
          <tr
            key={c.id}
            onClick={() => router.push(reviewHref(c.id))}
            className={`${rowClass} cursor-pointer`}
          >
            <td className={tdClass}>
              <Link
                href={reviewHref(c.id)}
                onClick={(e) => e.stopPropagation()}
                className="font-bold text-deep"
              >
                {c.reference}
              </Link>
            </td>
            <td className={tdClass}>{c.taker?.name ?? "—"}</td>
            <td className={tdClass}>{formatKg(Number(c.requestedKg))}kg</td>
            <td className={tdClass}>
              {c.approvedKg != null ? (
                <strong>{formatKg(Number(c.approvedKg))}kg</strong>
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>
            <td className={tdClass}>
              <ClaimStatusBadge status={status(c)} />
            </td>
            <td className={`${tdClass} whitespace-nowrap text-muted`}>
              {sgDayKey(c.submittedAt) === today
                ? formatDayTime(c.submittedAt)
                : formatDayMonth(c.submittedAt)}
            </td>
            <td className={`${tdClass} w-6 text-muted`}>
              <CaretRight size={16} aria-hidden />
            </td>
          </tr>
        ))}
      </DataTable>
      <p className="text-[13px] leading-[21px] text-muted">
        Click a row to open it in Claims review.
      </p>
    </Panel>
  );
}

// ─── Pickups ──────────────────────────────────────────────────────────────────

const SLOT_STATE: Record<
  "today" | "upcoming" | "done" | "closed" | "cancelled",
  { label: string; tone: BadgeTone }
> = {
  today: { label: "Today", tone: "leaf" },
  upcoming: { label: "Upcoming", tone: "amber" },
  done: { label: "Done", tone: "grey" },
  closed: { label: "Closed", tone: "grey" },
  cancelled: { label: "Cancelled", tone: "grey" },
};

function slotState(
  s: Slot,
  now: number,
  today: string,
): keyof typeof SLOT_STATE {
  if (s.status === "CANCELLED") return "cancelled";
  if (new Date(s.endTime).getTime() < now) return "done";
  if (s.status === "CLOSED") return "closed";
  return sgDayKey(s.startTime) === today ? "today" : "upcoming";
}

/** Pickups tab (board "Batch detail · pickups"): this batch's slots, today and upcoming first. */
export function PickupsTab({
  batch,
  slots,
  now,
}: {
  batch: Batch;
  slots: Slot[];
  now: number;
}) {
  if (slots.length === 0) {
    return (
      <EmptyPanel
        title="No pickup slots linked"
        action={
          <Button
            href={`/manager/slots?create=1&batchId=${batch.id}`}
            variant="secondary"
            size="sm"
            className="px-[18px]"
            icon={<CalendarBlank size={18} />}
          >
            Create pickup slot
          </Button>
        }
      >
        Create slots so takers with approved claims can book a time.
      </EmptyPanel>
    );
  }
  const today = sgDayKey(new Date(now).toISOString());
  const past = (s: Slot) => new Date(s.endTime).getTime() < now;
  const sorted = [...slots].sort((a, b) =>
    past(a) !== past(b)
      ? Number(past(a)) - Number(past(b))
      : past(a)
        ? b.startTime.localeCompare(a.startTime)
        : a.startTime.localeCompare(b.startTime),
  );

  return (
    <Panel
      title="Pickup slots for this batch"
      description={batch.pickupLocation ?? undefined}
      actions={
        <Link
          href="/manager/slots"
          className="inline-flex items-center gap-1.5 text-small font-bold text-deep"
        >
          <CalendarBlank size={16} aria-hidden />
          Open in calendar →
        </Link>
      }
    >
      <DataTable
        head={[
          "Date",
          "Time",
          "Booked / capacity",
          "Orders",
          "Status",
          <span key="x" className="sr-only">
            Actions
          </span>,
        ]}
      >
        {sorted.map((s) => {
          const state = SLOT_STATE[slotState(s, now, today)];
          return (
            <tr key={s.id} className={rowClass}>
              <td className={`${tdClass} whitespace-nowrap`}>
                <strong>
                  {formatWeekdayDay(s.startTime).replace(",", "")}
                </strong>
              </td>
              <td className={`${tdClass} whitespace-nowrap`}>
                {formatTimeRange(s.startTime, s.endTime)}
              </td>
              <td className={tdClass}>
                <div className="flex min-w-[200px] items-center gap-2.5">
                  <div className="grow">
                    <ProgressBar
                      value={s.bookedCount}
                      max={s.capacity}
                      label={`${s.bookedCount} of ${s.capacity} places booked`}
                    />
                  </div>
                  <strong className="text-[13px]">
                    {s.bookedCount}/{s.capacity}
                  </strong>
                </div>
              </td>
              <td className={tdClass}>
                {s.bookedCount} order{s.bookedCount === 1 ? "" : "s"}
              </td>
              <td className={tdClass}>
                <Badge tone={state.tone} size="sm">
                  {state.label}
                </Badge>
              </td>
              <td className={`${tdClass} text-right`}>
                <Link
                  href={`/manager/slots?slot=${s.id}`}
                  className="text-[13px] font-bold text-deep"
                >
                  View slot
                </Link>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </Panel>
  );
}

// ─── Handovers ────────────────────────────────────────────────────────────────

/** Handovers tab (board "Batch detail · handovers"): collected vs still to collect, then the records. */
export function HandoversTab({
  batch,
  handovers,
  approvedClaims,
  openAllocations,
}: {
  batch: Batch;
  handovers: Handover[];
  approvedClaims: number;
  openAllocations: number;
}) {
  if (handovers.length === 0) {
    return (
      <EmptyPanel title="No handovers yet">
        Collected records appear here once staff record a handover.
      </EmptyPanel>
    );
  }
  const { pool } = batch;
  const bags = handovers.reduce((n, h) => n + h.halfKgBags + h.oneKgBags, 0);
  const toCollect =
    Math.max(0, pool.approvedClaimKg - pool.collectedClaimKg) +
    Math.max(0, pool.allocatedKg - pool.collectedAllocationKg);

  return (
    <Panel title="Handovers" description="Collected records for this batch">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1 rounded-[14px] bg-sage p-4">
          <span className="text-[13px] font-bold text-deep">
            Total collected from this batch
          </span>
          <div className="font-display text-[32px] font-semibold leading-10 text-deep">
            {formatKg(pool.collectedKg)} kg
          </div>
          <span className="text-[13px] text-deep">
            {handovers.length} handover{handovers.length === 1 ? "" : "s"} ·{" "}
            {bags} bag{bags === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex-1 rounded-[14px] bg-white p-4 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
          <span className="text-[13px] font-bold text-muted">
            Still to collect
          </span>
          <div className="font-display text-[32px] font-semibold leading-10 text-deep">
            {formatKg(toCollect)} kg
          </div>
          <span className="text-[13px] text-muted">
            {approvedClaims} approved claim{approvedClaims === 1 ? "" : "s"} ·{" "}
            {openAllocations} bulk allocation
            {openAllocations === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <DataTable
        head={[
          "Date",
          "Taker",
          "Actual kg",
          "Bags",
          "Photo",
          <span key="x" className="sr-only">
            Actions
          </span>,
        ]}
      >
        {handovers.map((h) => (
          <tr key={h.id} className={rowClass}>
            <td className={`${tdClass} whitespace-nowrap`}>
              {formatDayTime(h.handedOverAt)}
            </td>
            <td className={tdClass}>
              <strong>{h.taker?.name ?? "—"}</strong>
            </td>
            <td className={tdClass}>
              <strong>{formatKg(h.actualKg)}kg</strong>
            </td>
            <td className={tdClass}>{bagText(h)}</td>
            <td className={tdClass}>
              {h.photoUrl ? (
                <Image
                  src={h.photoUrl}
                  alt={`Handover photo, ${h.taker?.name ?? h.reference}`}
                  width={56}
                  height={56}
                  unoptimized
                  className="size-14 rounded-[10px] object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
                />
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                  <ImageIcon size={16} aria-hidden />
                  No photo
                </span>
              )}
            </td>
            <td className={`${tdClass} text-right`}>
              {h.photoUrl && (
                <a
                  href={h.photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-bold text-deep"
                >
                  View
                </a>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
}

/** "2 × 1kg bags, 1 × 0.5kg bag + 0.2kg loose". */
function bagText(h: Handover): string {
  const parts = [
    h.oneKgBags > 0 &&
      `${h.oneKgBags} × 1kg bag${h.oneKgBags === 1 ? "" : "s"}`,
    h.halfKgBags > 0 &&
      `${h.halfKgBags} × 0.5kg bag${h.halfKgBags === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const bagged = parts.join(", ");
  if (h.looseKg > 0)
    return bagged
      ? `${bagged} + ${formatKg(h.looseKg)}kg loose`
      : `${formatKg(h.looseKg)}kg loose`;
  return bagged || "—";
}
