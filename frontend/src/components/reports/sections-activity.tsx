"use client";

import { TrendDown } from "@phosphor-icons/react/dist/ssr/TrendDown";
import { TrendUp } from "@phosphor-icons/react/dist/ssr/TrendUp";
import Link from "next/link";
import {
  ColumnChart,
  HBarList,
  Legend,
  Sparkline,
} from "@/components/charts/charts";
import { Delta } from "@/components/manager/dashboard/widgets-top";
import {
  DataTable,
  ProgressBar,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import { cn } from "@/lib/cn";
import { formatDayMonth, formatKg } from "@/lib/format";
import {
  CANCELLATION_REASON_LABEL,
  REJECTION_REASON_MANAGER_LABEL,
  TAKER_CATEGORY_LABEL,
} from "@/lib/labels";
import type { ReportData } from "@/lib/types";
import { ChartCard, SectionHead, StatTile } from "./chart-card";
import { bandLabel, busiestSlot } from "./report-model";

// ─── Claims funnel ────────────────────────────────────────────────────────────

export function FunnelSection({
  data,
  compare,
  print,
}: {
  data: ReportData;
  compare: string;
  print?: boolean;
}) {
  const f = data.funnel;
  const topRejection = Object.entries(data.rejectionReasons).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const steps = [
    { key: "Submitted", ...f.submitted, drop: "" },
    {
      key: "Approved",
      ...f.approved,
      drop: f.rejected
        ? `${f.rejected} rejected${topRejection ? ` (mostly “${REJECTION_REASON_MANAGER_LABEL[topRejection[0] as keyof typeof REJECTION_REASON_MANAGER_LABEL] ?? topRejection[0]}”)` : ""}`
        : "",
    },
    {
      key: "Booked",
      ...f.booked,
      drop: f.approvedUnbooked
        ? `${f.approvedUnbooked} approved but never booked a slot`
        : "",
    },
    {
      key: "Collected",
      ...f.collected,
      drop: [
        f.noShows && `${f.noShows} no-show${f.noShows === 1 ? "" : "s"}`,
        f.upcoming && `${f.upcoming} still upcoming`,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
  const max = Math.max(f.submitted.count, 1);
  const reasonRows = (
    rec: Record<string, number>,
    labels: Record<string, string>,
  ) => {
    const total = Object.values(rec).reduce((s, n) => s + n, 0);
    return {
      total,
      rows: Object.keys(labels).map((k) => ({
        key: k,
        label: labels[k],
        value: rec[k] ?? 0,
      })),
    };
  };
  const rej = reasonRows(data.rejectionReasons, REJECTION_REASON_MANAGER_LABEL);
  const can = reasonRows(data.cancellationReasons, CANCELLATION_REASON_LABEL);
  const rt = data.responseTime;
  const sizes = data.claimSizes;
  const sizeTotal = sizes.small + sizes.medium + sizes.large;

  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        id="funnel"
        title="Claims funnel"
        description="From request to collection"
      />
      <ChartCard
        print={print}
        title="Claims funnel"
        description="Count, kg and % from the previous step"
        data={{
          filename: "claims-funnel.csv",
          header: ["Step", "Claims", "kg", "% of previous"],
          rows: steps.map((s, i) => [
            s.key,
            s.count,
            s.kg,
            i
              ? steps[i - 1].count
                ? Math.round((s.count / steps[i - 1].count) * 100)
                : null
              : 100,
          ]),
        }}
      >
        {f.submitted.count === 0 ? (
          <p className="py-8 text-center text-small text-muted">
            No claims were submitted in this period.
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {steps.map((s, i) => {
              const pct =
                i && steps[i - 1].count
                  ? Math.round((s.count / steps[i - 1].count) * 100)
                  : null;
              return (
                <li
                  key={s.key}
                  className="grid items-center gap-3 md:grid-cols-[110px_minmax(0,1fr)_220px]"
                >
                  <strong className="text-small">{s.key}</strong>
                  <div className="h-10 overflow-hidden rounded-control bg-track">
                    <div
                      className="flex h-full items-center rounded-control px-3 text-small font-bold text-cream"
                      style={{
                        width: `${Math.max(6, (s.count / max) * 100)}%`,
                        background: [
                          "var(--color-deep)",
                          "var(--color-leaf)",
                          "var(--color-chart-mid)",
                          "var(--color-chart-remaining)",
                        ][i],
                      }}
                    >
                      {s.count}
                    </div>
                  </div>
                  <span className="text-[13px] text-muted">
                    <strong className="text-ink">
                      {s.count} claim{s.count === 1 ? "" : "s"} ·{" "}
                      {formatKg(s.kg)}kg
                    </strong>
                    {pct != null && ` · ${pct}% of previous`}
                    {s.drop && (
                      <span className="block text-xs">Drop-off: {s.drop}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </ChartCard>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ChartCard
          print={print}
          title="Why claims didn’t complete"
          description="Counts this period"
          data={{
            filename: "claim-reasons.csv",
            header: ["Kind", "Reason", "Count"],
            rows: [
              ...rej.rows.map((r) => ["Rejection", r.label, r.value]),
              ...can.rows.map((r) => ["Cancellation", r.label, r.value]),
            ],
          }}
        >
          <h4 className="m-0 text-small font-bold">
            Rejection reasons · {rej.total}
          </h4>
          <HBarList
            ariaLabel="Rejection reasons"
            unit=""
            color="var(--color-error)"
            rows={rej.rows}
          />
          <h4 className="m-0 mt-2 text-small font-bold">
            Cancellation reasons · {can.total}
          </h4>
          <HBarList
            ariaLabel="Cancellation reasons"
            unit=""
            color="var(--color-chart-reserve)"
            rows={can.rows}
          />
        </ChartCard>
        <ChartCard
          print={print}
          title="Response time"
          description="Average time to approve or reject"
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-display text-[34px] font-semibold leading-10 text-deep">
                {rt.avgHours == null ? "—" : `${formatKg(rt.avgHours)} hrs`}
              </div>
              <Delta
                mode="count"
                label={compare}
                value={rt.avgHours}
                previous={rt.previousAvgHours}
                higherIsBetter={false}
              />
            </div>
            <Sparkline
              points={rt.sparkline.map((p, i) => ({
                label: `W${i + 1}`,
                value: p.value,
              }))}
              unit=" hrs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-muted">Decided within 24 hours</span>
              <strong>
                {rt.within24Pct == null ? "—" : `${rt.within24Pct}%`}
              </strong>
            </div>
            <ProgressBar
              value={rt.within24Pct ?? 0}
              max={100}
              label={`${rt.within24Pct ?? 0}% decided within 24 hours`}
            />
          </div>
        </ChartCard>
        <ChartCard
          print={print}
          title="Claim size distribution"
          description="Claims by requested kg"
          data={{
            filename: "claim-sizes.csv",
            header: ["Size", "Claims"],
            rows: [
              ["0.1–0.3kg", sizes.small],
              ["0.4–0.6kg", sizes.medium],
              ["0.7–1kg", sizes.large],
            ],
          }}
        >
          <ColumnChart
            ariaLabel="Claims by size"
            height={170}
            unit=""
            series={[{ key: "n", label: "Claims", color: "var(--color-leaf)" }]}
            columns={[
              {
                key: "s",
                label: "0.1–0.3kg",
                title: "0.1–0.3kg",
                values: { n: sizes.small },
              },
              {
                key: "m",
                label: "0.4–0.6kg",
                title: "0.4–0.6kg",
                values: { n: sizes.medium },
              },
              {
                key: "l",
                label: "0.7–1kg",
                title: "0.7–1kg",
                values: { n: sizes.large },
              },
            ]}
          />
          {sizeTotal > 0 && (
            <p className="text-xs text-muted">
              {Math.round((sizes.atCap / sizeTotal) * 100)}% of claims are at
              the 1kg cap
              {sizes.atCap / sizeTotal >= 0.5
                ? " — takers may want more than the cap allows."
                : " — the cap looks about right."}
            </p>
          )}
        </ChartCard>
      </div>
    </section>
  );
}

// ─── Pickups ──────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PickupsSection({
  data,
  compare,
  print,
}: {
  data: ReportData;
  compare: string;
  print?: boolean;
}) {
  const p = data.pickups;
  const busy = busiestSlot(data);
  const bands = [...new Set(p.heatmap.map((c) => c.band))].sort(
    (a, b) => a - b,
  );
  const cell = (d: number, b: number) =>
    p.heatmap.find((c) => c.weekday === d && c.band === b);
  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        id="pickups"
        title="Pickups"
        description="How well slots are used"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Average slot fill rate"
          value={p.fillRate == null ? "—" : `${p.fillRate}%`}
        >
          <Delta
            mode="points"
            label={compare}
            value={p.fillRate}
            previous={p.previousFillRate}
          />
        </StatTile>
        <StatTile
          label="Busiest day and time"
          value={busy ? busy.label : "—"}
          sub={
            busy ? `${busy.pct}% full on average` : "No slots in this period"
          }
        />
        <StatTile
          label="No-shows this period"
          value={p.noShows}
          sub={`${formatKg(p.noShowKg)}kg released back to batches`}
        />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <ChartCard
          print={print}
          title="Slot utilisation"
          description="% of capacity booked · this period"
          data={{
            filename: "slot-utilisation.csv",
            header: ["Day", "Time", "Slots", "Booked", "Capacity", "Fill %"],
            rows: p.heatmap.map((c) => [
              DAYS[c.weekday],
              bandLabel(c.band),
              c.slots,
              c.booked,
              c.capacity,
              Math.round((c.booked / c.capacity) * 100),
            ]),
          }}
        >
          {bands.length === 0 ? (
            <p className="py-8 text-center text-small text-muted">
              No pickup slots in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                role="grid"
                aria-label="Slot utilisation heatmap"
                className="w-full border-separate border-spacing-1 text-xs"
              >
                <thead>
                  <tr>
                    <th />
                    {bands.map((b) => (
                      <th
                        key={b}
                        scope="col"
                        className="px-1 py-1 font-bold text-muted"
                      >
                        {bandLabel(b)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((d, i) => (
                    <tr key={d}>
                      <th
                        scope="row"
                        className="pr-2 text-left font-bold text-muted"
                      >
                        {d}
                      </th>
                      {bands.map((b) => {
                        const c = cell(i, b);
                        const pct = c
                          ? Math.round((c.booked / c.capacity) * 100)
                          : null;
                        return (
                          <td
                            key={b}
                            tabIndex={0}
                            aria-label={
                              c
                                ? `${d} ${bandLabel(b)}: ${pct}% booked, ${c.booked}/${c.capacity} across ${c.slots} slots`
                                : `${d} ${bandLabel(b)}: no slots`
                            }
                            className={cn(
                              "group relative h-10 rounded-md text-center font-bold outline-none focus-visible:outline-3 focus-visible:outline-leaf",
                              pct == null
                                ? "bg-well text-muted"
                                : pct >= 60
                                  ? "text-cream"
                                  : "text-deep",
                            )}
                            style={
                              pct == null
                                ? undefined
                                : {
                                    background: `rgba(var(--rgb-leaf),${0.12 + (pct / 100) * 0.88})`,
                                  }
                            }
                          >
                            {pct == null ? "" : `${pct}%`}
                            {c && (
                              <span className="pointer-events-none invisible absolute bottom-[calc(100%+6px)] left-1/2 z-30 w-[150px] -translate-x-1/2 rounded-[10px] bg-cream p-2.5 text-left font-normal text-ink opacity-0 shadow-photo group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
                                <strong className="block text-deep">
                                  {d} · {bandLabel(b)}
                                </strong>
                                Slots {c.slots} · Booked {c.booked}/{c.capacity}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 flex items-center gap-2 text-xs text-muted">
                <span
                  className="h-3 w-16 rounded-sm bg-gradient-to-r from-[rgba(var(--rgb-leaf),0.12)] to-leaf"
                  aria-hidden
                />{" "}
                0% → 100% booked ·{" "}
                <span
                  className="inline-block size-3 rounded-sm bg-well"
                  aria-hidden
                />{" "}
                No slots
              </p>
            </div>
          )}
        </ChartCard>
        <ChartCard
          print={print}
          title="Pickups per week"
          description="Count of pickups"
          data={{
            filename: "pickups-per-week.csv",
            header: ["Week of", "Collected", "No-shows"],
            rows: p.weekly.map((w) => [w.weekStart, w.collected, w.noShows]),
          }}
        >
          <Legend
            items={[
              { label: "Collected", color: "var(--color-leaf)" },
              { label: "No-shows", color: "var(--color-error)" },
            ]}
          />
          {p.weekly.length === 0 ? (
            <p className="py-8 text-center text-small text-muted">
              No pickups resolved in this period.
            </p>
          ) : (
            <ColumnChart
              ariaLabel="Pickups per week"
              height={200}
              unit=""
              series={[
                {
                  key: "collected",
                  label: "Collected",
                  color: "var(--color-leaf)",
                },
                {
                  key: "noShows",
                  label: "No-shows",
                  color: "var(--color-error)",
                },
              ]}
              columns={p.weekly.map((w) => ({
                key: w.weekStart,
                label: formatDayMonth(`${w.weekStart}T12:00:00+08:00`),
                title: `Week of ${formatDayMonth(`${w.weekStart}T12:00:00+08:00`)}`,
                values: { collected: w.collected, noShows: w.noShows },
              }))}
            />
          )}
        </ChartCard>
      </div>
    </section>
  );
}

// ─── Takers ───────────────────────────────────────────────────────────────────

export function TakersSection({
  data,
  print,
}: {
  data: ReportData;
  print?: boolean;
}) {
  const t = data.takers;
  const seen = t.returning + t.firstTime;
  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        id="takers"
        title="Takers"
        description="Who is receiving compost"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Returning vs first-time"
          value={seen ? `${Math.round((t.returning / seen) * 100)}%` : "—"}
          sub={
            seen
              ? `returning · ${Math.round((t.firstTime / seen) * 100)}% first-time`
              : "No takers collected in this period"
          }
        />
        <StatTile
          label="Average kg per pickup"
          value={
            t.avgKgPerPickup == null ? "—" : `${formatKg(t.avgKgPerPickup)} kg`
          }
        />
        <StatTile label="Takers with 2+ no-shows" value={t.repeatNoShows}>
          {!print && (
            <Link
              href="/manager/takers"
              className="text-[13px] font-bold text-deep"
            >
              View in Takers →
            </Link>
          )}
        </StatTile>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ChartCard
          print={print}
          title="New takers over time"
          description="New sign-ups per month"
          data={{
            filename: "new-takers.csv",
            header: ["Month", "Individual", "Bulk"],
            rows: t.newPerMonth.map((m) => [m.month, m.individual, m.bulk]),
          }}
        >
          <Legend
            items={[
              { label: "Individual", color: "var(--color-leaf)" },
              { label: "Bulk", color: "var(--color-chart-bulk)" },
            ]}
          />
          <ColumnChart
            ariaLabel="New takers per month"
            height={200}
            unit=""
            series={[
              {
                key: "individual",
                label: "Individual",
                color: "var(--color-leaf)",
              },
              { key: "bulk", label: "Bulk", color: "var(--color-chart-bulk)" },
            ]}
            columns={t.newPerMonth.map((m) => ({
              key: m.month,
              label: new Date(
                `${m.month}-01T12:00:00+08:00`,
              ).toLocaleDateString("en-SG", { month: "short" }),
              title: new Date(
                `${m.month}-01T12:00:00+08:00`,
              ).toLocaleDateString("en-SG", { month: "long", year: "numeric" }),
              values: { individual: m.individual, bulk: m.bulk },
            }))}
          />
        </ChartCard>
        <ChartCard
          print={print}
          title="Bulk partners"
          description="This period vs monthly target"
          data={{
            filename: "bulk-partners.csv",
            header: [
              "Organisation",
              "Category",
              "Target kg",
              "Collected kg",
              "% of target",
              "Previous period kg",
            ],
            rows: t.bulkPartners.map((b) => [
              b.name,
              b.category,
              b.target,
              b.collected,
              b.target ? Math.round((b.collected / b.target) * 100) : null,
              b.previousCollected,
            ]),
          }}
        >
          {t.bulkPartners.length === 0 ? (
            <p className="py-8 text-center text-small text-muted">
              No bulk partners yet.
            </p>
          ) : (
            <DataTable
              head={[
                "Organisation",
                "Target",
                "Collected",
                "% of target",
                "Trend",
              ]}
            >
              {t.bulkPartners.map((b) => {
                const pct = b.target
                  ? Math.round((b.collected / b.target) * 100)
                  : null;
                const up = b.collected >= b.previousCollected;
                return (
                  <tr key={b.takerId} className={rowClass}>
                    <td className={tdClass}>
                      <strong className="block">{b.name}</strong>
                      <span className="text-xs text-muted">
                        {b.category
                          ? (TAKER_CATEGORY_LABEL[
                              b.category as keyof typeof TAKER_CATEGORY_LABEL
                            ] ?? b.category)
                          : "—"}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {b.target == null ? "—" : `${formatKg(b.target)}kg`}
                    </td>
                    <td className={tdClass}>{formatKg(b.collected)}kg</td>
                    <td className={tdClass}>
                      {pct == null ? (
                        "—"
                      ) : (
                        <div className="flex min-w-[110px] items-center gap-2">
                          <div className="grow">
                            <ProgressBar
                              value={Math.min(100, pct)}
                              max={100}
                              label={`${pct}% of target`}
                            />
                          </div>
                          <span className="text-xs font-bold">{pct}%</span>
                        </div>
                      )}
                    </td>
                    <td className={tdClass}>
                      {up ? (
                        <TrendUp
                          size={20}
                          className="text-leaf"
                          aria-label="Trend up"
                        />
                      ) : (
                        <TrendDown
                          size={20}
                          className="text-error"
                          aria-label="Trend down"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
