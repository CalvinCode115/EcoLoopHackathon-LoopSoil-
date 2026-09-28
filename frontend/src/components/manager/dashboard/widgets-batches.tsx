"use client";

import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColumnChart, Donut, Legend } from "@/components/charts/charts";
import { Panel, ProgressBar } from "@/components/manager/panel";
import { BatchStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  formatClock,
  formatDayMonth,
  formatKg,
  formatTimeLeft,
  formatWeekdayDay,
  sgDayKey,
} from "@/lib/format";
import { BATCH_STATUS_LABEL, type BatchStatus } from "@/lib/labels";
import type { Batch, BatchPool } from "@/lib/types";

/** Dashboard stock split: Reserved = school reserve + bulk not yet collected. */
export const DASH_SERIES = [
  { key: "reserved", label: "Reserved", color: "var(--color-chart-reserve)" },
  { key: "claimed", label: "Claimed", color: "var(--color-chart-claimed)" },
  {
    key: "collected",
    label: "Collected",
    color: "var(--color-chart-collected)",
  },
  {
    key: "remaining",
    label: "Remaining",
    color: "var(--color-chart-remaining)",
  },
] as const;

export function dashSplit(p: BatchPool): Record<string, number> {
  return {
    reserved:
      p.schoolReserveKg + Math.max(0, p.allocatedKg - p.collectedAllocationKg),
    claimed: Math.max(
      0,
      p.pendingClaimKg + p.approvedClaimKg - p.collectedClaimKg,
    ),
    collected: p.collectedKg,
    remaining: Math.max(0, p.kgRemaining),
  };
}

const ACTIVE: BatchStatus[] = ["DRAFT", "OPEN", "CLOSED"];

/** "Stock by batch": one stacked column per batch, click to open it. */
export function StockByBatch({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const [scope, setScope] = useState<"active" | "all">("active");
  const shown = batches
    .filter((b) => scope === "all" || ACTIVE.includes(b.status))
    .sort((a, b) => a.harvestDate.localeCompare(b.harvestDate))
    .slice(-10);
  return (
    <Panel
      title="Stock by batch"
      description="kg per batch · click a bar to open"
      actions={
        <>
          <div
            role="group"
            aria-label="Batches shown"
            className="inline-flex gap-0.5 rounded-control bg-track p-[3px]"
          >
            {(["active", "all"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={scope === k}
                onClick={() => setScope(k)}
                className={cn(
                  "h-8 rounded-[9px] px-3 text-[13px]",
                  scope === k
                    ? "bg-cream font-bold text-deep shadow-card"
                    : "font-medium hover:bg-sage",
                )}
              >
                {k === "active" ? "Active batches" : "All batches"}
              </button>
            ))}
          </div>
          <Link
            href="/manager/batches"
            className="whitespace-nowrap text-[13px] font-bold text-deep"
          >
            Batches →
          </Link>
        </>
      }
    >
      <Legend
        items={DASH_SERIES.map((s) => ({ label: s.label, color: s.color }))}
      />
      {shown.length === 0 ? (
        <p className="py-10 text-center text-small text-muted">
          No {scope === "active" ? "active " : ""}batches yet.
        </p>
      ) : (
        <ColumnChart
          ariaLabel="Stock by batch, stacked bars"
          height={260}
          series={[...DASH_SERIES]}
          columns={shown.map((b) => ({
            key: b.id,
            label: b.reference,
            title: `${b.reference} · total ${formatKg(b.pool.totalKg)}kg`,
            values: dashSplit(b.pool),
          }))}
          onColumn={(c) => router.push(`/manager/batches/${c.key}`)}
          footer={() => (
            <span className="mt-1 block font-bold text-deep">
              Click to open batch →
            </span>
          )}
        />
      )}
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-10">
          {shown.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1.5 text-xs"
            >
              {b.reference} <BatchStatusBadge status={b.status} />
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** "Stock remaining" donut for all open batches or one. */
export function StockRemaining({ batches }: { batches: Batch[] }) {
  const open = batches.filter((b) => b.status === "OPEN");
  const [id, setId] = useState("");
  const chosen = id ? open.filter((b) => b.id === id) : open;
  const sums = chosen.reduce<Record<string, number>>((acc, b) => {
    const s = dashSplit(b.pool);
    for (const k of Object.keys(s)) acc[k] = (acc[k] ?? 0) + s[k];
    return acc;
  }, {});
  const total = chosen.reduce((s, b) => s + b.pool.totalKg, 0);
  const left = sums.remaining ?? 0;
  const order = ["remaining", "claimed", "collected", "reserved"];
  return (
    <Panel
      title="Stock remaining"
      actions={
        open.length > 1 ? (
          <select
            aria-label="Batch"
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="h-9 rounded-[9px] bg-surface px-2 text-[13px] shadow-[inset_0_0_0_1px_var(--color-edge)]"
          >
            <option value="">All open batches</option>
            {open.map((b) => (
              <option key={b.id} value={b.id}>
                {b.reference}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {open.length === 0 ? (
        <p className="py-8 text-center text-small text-muted">
          No open batches right now.
        </p>
      ) : (
        <>
          <Donut
            ariaLabel={`Stock remaining: ${formatKg(left)}kg left of ${formatKg(total)}kg`}
            center={`${formatKg(left)} kg`}
            centerSub={`left of ${formatKg(total)} kg`}
            slices={order.map((k) => {
              const s = DASH_SERIES.find((x) => x.key === k)!;
              return {
                key: k,
                label: s.label,
                value: sums[k] ?? 0,
                color: s.color,
              };
            })}
          />
          <p className="text-xs text-muted">
            Reserved = school reserve + bulk allocations.
          </p>
        </>
      )}
    </Panel>
  );
}

/** Counts per status; each links to Batches. */
export function BatchStatusSummary({ batches }: { batches: Batch[] }) {
  const statuses: BatchStatus[] = ["DRAFT", "OPEN", "CLOSED", "COMPLETED"];
  return (
    <Panel title="Batch status">
      <div className="grid grid-cols-4 gap-2">
        {statuses.map((s) => (
          <Link
            key={s}
            href="/manager/batches"
            className="flex flex-col items-center gap-1 rounded-control bg-surface py-3 text-ink no-underline shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.3)] hover:bg-row-hover"
          >
            <span className="font-display text-2xl font-semibold text-deep">
              {batches.filter((b) => b.status === s).length}
            </span>
            <span className="text-xs font-semibold text-muted">
              {BATCH_STATUS_LABEL[s]}
            </span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted">Tap a status to open Batches.</p>
    </Panel>
  );
}

/** The next batch whose claim window opens in the future. */
export function NextRelease({
  batches,
  now,
}: {
  batches: Batch[];
  now: number;
}) {
  const next = batches
    .filter(
      (b) =>
        (b.status === "DRAFT" || b.status === "OPEN") &&
        b.availableFrom &&
        new Date(b.availableFrom).getTime() > now,
    )
    .sort((a, b) => a.availableFrom!.localeCompare(b.availableFrom!))[0];
  return (
    <Panel title="Next batch release">
      {next ? (
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2">
            <strong className="text-body">{next.reference}</strong>
            <BatchStatusBadge status={next.status} />
          </span>
          <span className="text-small text-muted">
            Releases {formatWeekdayDay(next.availableFrom!).replace(",", "")},{" "}
            {formatClock(next.availableFrom!)} · {formatKg(next.pool.totalKg)}kg
            planned
          </span>
          <span className="inline-flex items-center gap-1.5 text-small font-bold text-deep">
            <CalendarBlank size={16} aria-hidden />
            Releases in {formatTimeLeft(next.availableFrom!, now)}
          </span>
          <Button
            href={`/manager/batches/${next.id}`}
            variant="secondary"
            size="sm"
            className="self-start px-4"
          >
            View batch
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-small text-muted">No release scheduled.</p>
          <Button
            href="/manager/batches/new"
            variant="secondary"
            size="sm"
            className="self-start px-4"
          >
            Log new batch
          </Button>
        </div>
      )}
    </Panel>
  );
}

/** Open batch whose remaining public stock is ≤ 20% — nudge a top-up. Hidden when none. */
export function RunningLow({
  batches,
  now,
}: {
  batches: Batch[];
  now: number;
}) {
  const low = batches
    .filter(
      (b) =>
        b.status === "OPEN" &&
        b.pool.publicPoolKg > 0 &&
        b.pool.kgRemaining / b.pool.publicPoolKg <= 0.2,
    )
    .sort(
      (a, b) =>
        a.pool.kgRemaining / a.pool.publicPoolKg -
        b.pool.kgRemaining / b.pool.publicPoolKg,
    )[0];
  if (!low) return null;
  const pct = Math.round(
    (Math.max(0, low.pool.kgRemaining) / low.pool.publicPoolKg) * 100,
  );
  const closes = low.availableUntil
    ? sgDayKey(low.availableUntil) === sgDayKey(new Date(now).toISOString())
      ? "claiming closes today"
      : `claiming closes ${formatDayMonth(low.availableUntil)}`
    : "no closing date";
  return (
    <section
      aria-label="Running low"
      className="flex flex-col gap-3 rounded-card bg-amber-tint p-5 text-amber-ink shadow-card"
    >
      <strong className="flex items-center gap-2 text-body">
        <WarningCircle size={20} weight="bold" aria-hidden />
        Running low
      </strong>
      <span className="text-small text-ink">
        <strong>{low.reference}</strong> ·{" "}
        {formatKg(Math.max(0, low.pool.kgRemaining))}kg left
      </span>
      <span className="text-[13px] text-ink">
        {pct}% of {formatKg(low.pool.publicPoolKg)}kg · {closes}
      </span>
      <ProgressBar
        value={Math.max(0, low.pool.kgRemaining)}
        max={low.pool.publicPoolKg}
        label={`${formatKg(Math.max(0, low.pool.kgRemaining))} of ${formatKg(low.pool.publicPoolKg)} kg remaining`}
      />
      <Button
        href={`/manager/batches/${low.id}?topup=1`}
        size="sm"
        className="self-start px-4"
      >
        Top up stock
      </Button>
    </section>
  );
}
