"use client";

import Link from "next/link";
import { useState } from "react";
import { ColumnChart, HBarList, Legend } from "@/components/charts/charts";
import { formatElapsed } from "@/components/manager/claims/claim-utils";
import { Panel } from "@/components/manager/panel";
import {
  bookingParty,
  dayLabel,
  daysBetween,
  isActive,
} from "@/components/manager/pickups/calendar-utils";
import { BookingStatusBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { addDays } from "@/lib/batch-form";
import { cn } from "@/lib/cn";
import {
  formatClock,
  formatDayMonth,
  formatKg,
  formatTimeRange,
  sgDayKey,
} from "@/lib/format";
import { TAKER_CATEGORY_LABEL, friendlyError } from "@/lib/labels";
import type { AnalyticsReport, Claim, ManagerBooking, Slot } from "@/lib/types";

/** Mon–Sun strip: pickups per day, hover / focus a day for its slots. */
export function WeekStrip({
  weekStart,
  today,
  slots,
  bookings,
}: {
  weekStart: string;
  today: string;
  slots: Slot[];
  bookings: ManagerBooking[];
}) {
  const days = daysBetween(weekStart, addDays(weekStart, 7));
  return (
    <Panel
      title="This week’s pickups"
      description={`${dayLabel(weekStart, { day: "numeric", month: "short" })} – ${dayLabel(addDays(weekStart, 6), { day: "numeric", month: "short" })} · hover a day for its slots`}
      actions={
        <Link
          href="/manager/slots"
          className="whitespace-nowrap text-[13px] font-bold text-deep"
        >
          Open calendar →
        </Link>
      }
    >
      <div
        role="list"
        aria-label="Pickups this week"
        className="grid grid-cols-7 gap-1.5"
      >
        {days.map((d) => {
          const daySlots = slots
            .filter((s) => sgDayKey(s.startTime) === d)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          const n = bookings.filter(
            (b) => isActive(b) && sgDayKey(b.slot.startTime) === d,
          ).length;
          const isToday = d === today;
          return (
            <div
              key={d}
              role="listitem"
              tabIndex={0}
              aria-label={`${dayLabel(d, { weekday: "short", day: "numeric", month: "short" })}: ${n} pickup${n === 1 ? "" : "s"} in ${daySlots.length} slot${daySlots.length === 1 ? "" : "s"}`}
              className={cn(
                "group relative flex flex-col items-center gap-1 rounded-control px-1 py-2.5 text-center outline-none focus-visible:outline-3 focus-visible:outline-leaf",
                isToday
                  ? "bg-leaf text-cream"
                  : "bg-white shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]",
              )}
            >
              <span
                className={cn(
                  "text-xs font-bold",
                  isToday ? "text-cream" : "text-muted",
                )}
              >
                {dayLabel(d, { weekday: "short" })} {Number(d.slice(8))}
              </span>
              <span className="font-display text-2xl font-semibold leading-7">
                {n}
              </span>
              <span
                className={cn(
                  "text-[11px]",
                  isToday ? "text-cream" : "text-muted",
                )}
              >
                {isToday
                  ? "Today"
                  : daySlots.length === 0
                    ? "No slots"
                    : n === 1
                      ? "pickup"
                      : "pickups"}
              </span>
              <div
                role="tooltip"
                className="pointer-events-none invisible absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-[170px] -translate-x-1/2 rounded-[10px] bg-cream p-3 text-left text-xs text-ink opacity-0 shadow-photo transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
              >
                <strong className="mb-1 block text-deep">
                  {dayLabel(d, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {n} pickup{n === 1 ? "" : "s"}
                </strong>
                {daySlots.length === 0
                  ? "No slots"
                  : daySlots.map((s) => (
                      <span key={s.id} className="flex justify-between gap-2">
                        <span className="text-muted">
                          {formatTimeRange(s.startTime, s.endTime)}
                        </span>
                        <strong>
                          {s.status === "CANCELLED"
                            ? "Cancelled"
                            : `${s.bookedCount}/${s.capacity}`}
                        </strong>
                      </span>
                    ))}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** Today's bookings in time order with their outcome; waiting ones jump to Handover. */
export function TodayAgenda({
  today,
  bookings,
  now,
}: {
  today: string;
  bookings: ManagerBooking[];
  now: number;
}) {
  const rows = bookings
    .filter(
      (b) => sgDayKey(b.slot.startTime) === today && b.status !== "CANCELLED",
    )
    .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));
  const next = rows.find(
    (b) => b.status === "BOOKED" && new Date(b.slot.endTime).getTime() >= now,
  );
  return (
    <Panel
      title="Today’s agenda"
      description={`${dayLabel(today, { weekday: "short", day: "numeric", month: "short" }).replace(",", "")} · ${rows.length} pickup${rows.length === 1 ? "" : "s"}${next ? ` · next ${formatClock(next.slot.startTime)}` : ""}`}
    >
      {rows.length === 0 ? (
        <p className="py-4 text-small text-muted">Nothing booked for today.</p>
      ) : (
        <ol className="m-0 flex max-h-[320px] list-none flex-col overflow-y-auto p-0">
          {rows.map((b) => {
            const p = bookingParty(b);
            return (
              <li
                key={b.id}
                className="flex items-center gap-3 py-2 text-small shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]"
              >
                <span className="w-14 shrink-0 font-bold text-deep">
                  {formatClock(b.slot.startTime)}
                </span>
                <span className="min-w-0 grow truncate">
                  {p.name} · <strong>{formatKg(p.kg)}kg</strong>
                </span>
                {b.status === "BOOKED" ? (
                  <Link
                    href={`/manager/handover?booking=${b.id}`}
                    className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-bold text-deep no-underline shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage"
                  >
                    Handover
                  </Link>
                ) : (
                  <BookingStatusBadge status={b.status} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

/** Top 5 oldest pending claims with one-tap Approve (full amount) and Review. */
export function PendingClaimsPreview({
  claims,
  total,
  now,
  onChanged,
}: {
  claims: Claim[];
  total: number;
  now: number;
  onChanged: (message: string, tone?: "success" | "error") => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const top = [...claims]
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .slice(0, 5);

  async function approve(c: Claim) {
    setBusy(c.id);
    try {
      await api.post(`/claims/${c.id}/approve`, {});
      onChanged(
        `Claim approved · ${c.reference} · ${formatKg(Number(c.requestedKg))}kg`,
      );
    } catch (err) {
      onChanged(friendlyError(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Pending claims" description="Top 5 · oldest first">
      {top.length === 0 ? (
        <p className="py-4 text-small text-muted">
          No claims waiting for review.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {top.map((c) => {
            const blocked = c.taker?.status !== "APPROVED";
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]"
              >
                <div className="flex min-w-0 grow flex-col">
                  <span className="truncate text-small">
                    <strong>{c.taker?.name ?? "Unknown"}</strong> ·{" "}
                    {formatKg(Number(c.requestedKg))}kg
                  </span>
                  <span className="text-xs text-muted">
                    {c.batch?.reference} · Waiting{" "}
                    {formatElapsed(c.submittedAt, now)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === c.id || blocked}
                    title={
                      blocked ? "Approve the taker’s account first" : undefined
                    }
                    onClick={() => void approve(c)}
                    className="h-9 rounded-lg bg-leaf px-3 text-xs font-bold text-cream hover:bg-deep disabled:opacity-50"
                  >
                    {busy === c.id ? "Approving…" : "Approve"}
                  </button>
                  <Link
                    href={`/manager/claims?claim=${c.id}`}
                    className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-bold text-deep no-underline shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage"
                  >
                    Review
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {total > 0 && (
        <Link
          href="/manager/claims"
          className="text-[13px] font-bold text-deep"
        >
          View all {total} claim{total === 1 ? "" : "s"} →
        </Link>
      )}
    </Panel>
  );
}

/** Weekly kg diverted (last 9 weeks) against a target line. */
export function WeeklyTrend({
  weekly,
  targetKg,
}: {
  weekly: AnalyticsReport["weekly"];
  targetKg: number;
}) {
  return (
    <Panel
      title="kg diverted over time"
      description="Weekly · from confirmed handovers"
      actions={
        <Link
          href="/manager/reports"
          className="whitespace-nowrap text-[13px] font-bold text-deep"
        >
          View in Reports →
        </Link>
      }
    >
      <Legend
        items={[
          { label: "kg diverted per week", color: "#4F7A3A" },
          { label: "Target", color: "#A0672E", dashed: true },
        ]}
      />
      <ColumnChart
        ariaLabel={`kg diverted per week, last ${weekly.length} weeks`}
        height={220}
        series={[{ key: "kg", label: "Diverted", color: "#4F7A3A" }]}
        target={{
          value: targetKg,
          label: `Target ${formatKg(targetKg)}kg/week`,
        }}
        columns={weekly.map((w, i) => ({
          key: w.weekStart,
          label:
            i % 2 === 0 ? formatDayMonth(`${w.weekStart}T12:00:00+08:00`) : "",
          title: `Week of ${formatDayMonth(`${w.weekStart}T12:00:00+08:00`)}`,
          values: { kg: w.kg },
        }))}
      />
    </Panel>
  );
}

export const GROUP_LABEL: Record<string, string> = {
  INDIVIDUAL: "Individuals",
  ...TAKER_CATEGORY_LABEL,
};

/** kg collected by recipient group for the selected period. */
export function ByGroup({
  byGroup,
  periodLabel,
}: {
  byGroup: AnalyticsReport["byGroup"];
  periodLabel: string;
}) {
  return (
    <Panel
      title="By taker category"
      description={`kg collected ${periodLabel}`}
      actions={
        <Link
          href="/manager/reports"
          className="whitespace-nowrap text-[13px] font-bold text-deep"
        >
          View in Reports →
        </Link>
      }
    >
      {byGroup.length === 0 ? (
        <p className="py-6 text-center text-small text-muted">
          No handovers in this period yet.
        </p>
      ) : (
        <HBarList
          ariaLabel="kg collected by taker category"
          rows={byGroup.map((g) => ({
            key: g.group,
            label: GROUP_LABEL[g.group] ?? g.group,
            value: g.kg,
          }))}
        />
      )}
    </Panel>
  );
}
