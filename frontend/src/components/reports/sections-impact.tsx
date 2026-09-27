"use client";

import { Lightbulb } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ColumnChart,
  Donut,
  HBarList,
  Legend,
} from "@/components/charts/charts";
import { Delta, KpiCard } from "@/components/manager/dashboard/widgets-top";
import {
  DataTable,
  ProgressBar,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import { BatchStatusBadge } from "@/components/ui/badge";
import { formatDayMonth, formatFullDate, formatKg } from "@/lib/format";
import type { BatchStatus } from "@/lib/labels";
import type { AnalyticsReport, ReportData } from "@/lib/types";
import { ChartCard, Segmented, SectionHead } from "./chart-card";
import {
  GROUP_LABEL,
  bucketSeries,
  type Granularity,
  type Insight,
} from "./report-model";

// ─── Overview ─────────────────────────────────────────────────────────────────

export function OverviewSection({
  data,
  analytics,
  compare,
  insights,
}: {
  data: ReportData;
  analytics: AnalyticsReport;
  compare: string;
  insights: Insight[];
}) {
  const k = analytics.kpis;
  const spark = (key: keyof AnalyticsReport["sparklines"]) =>
    analytics.sparklines[key].map((p, i) => ({
      label: `W${i + 1}`,
      value: p.value,
    }));
  const pct = (v: number | null) => (v == null ? "—" : String(v));
  return (
    <section aria-labelledby="sec-overview" className="flex flex-col gap-4">
      <SectionHead
        id="overview"
        title="Overview"
        description="Waste Diary headline, key figures and what stands out"
      />
      <div className="flex flex-col gap-1 rounded-card bg-deep p-6 text-cream shadow-card">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-cream/75">
          Waste Diary · all time
        </span>
        <span className="font-display text-[44px] font-semibold leading-[52px]">
          {formatKg(data.allTime.kg)} kg
        </span>
        <span className="text-body">
          of food waste turned into compost and returned to the soil
        </span>
        <span className="text-small text-cream/80">
          {data.allTime.pickups} pickup{data.allTime.pickups === 1 ? "" : "s"} ·{" "}
          {data.allTime.takers} taker
          {data.allTime.takers === 1 ? "" : "s"}
          {data.allTime.since
            ? ` · since ${formatFullDate(data.allTime.since)}`
            : ""}
        </span>
      </div>
      <div
        aria-label="Key figures"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
      >
        <KpiCard
          label="Total kg diverted"
          value={formatKg(k.kgDiverted.value ?? 0)}
          unit="kg"
          spark={spark("kgDiverted")}
          delta={<Delta mode="percent" label={compare} {...k.kgDiverted} />}
        />
        <KpiCard
          label="kg generated"
          value={formatKg(k.kgGenerated.value ?? 0)}
          unit="kg"
          spark={spark("kgGenerated")}
          delta={<Delta mode="percent" label={compare} {...k.kgGenerated} />}
        />
        <KpiCard
          label="Distribution rate"
          value={pct(k.distributionRate.value)}
          unit={k.distributionRate.value == null ? undefined : "%"}
          spark={spark("distributionRate")}
          delta={
            <Delta mode="points" label={compare} {...k.distributionRate} />
          }
        />
        <KpiCard
          label="Collection rate"
          value={pct(k.collectionRate.value)}
          unit={k.collectionRate.value == null ? undefined : "%"}
          spark={spark("collectionRate")}
          delta={<Delta mode="points" label={compare} {...k.collectionRate} />}
        />
        <KpiCard
          label="No-show rate"
          value={pct(k.noShowRate.value)}
          unit={k.noShowRate.value == null ? undefined : "%"}
          spark={spark("noShowRate")}
          delta={
            <Delta
              mode="points"
              label={compare}
              higherIsBetter={false}
              {...k.noShowRate}
            />
          }
        />
        <KpiCard
          label="Active takers"
          value={String(k.activeTakers.value ?? 0)}
          spark={spark("activeTakers")}
          delta={<Delta mode="percent" label={compare} {...k.activeTakers} />}
        />
      </div>
      {insights.length > 0 && (
        <section
          aria-labelledby="insights"
          className="flex flex-col gap-3 rounded-card bg-cream p-5 shadow-card"
        >
          <div>
            <h3
              id="insights"
              className="font-display m-0 text-lg font-semibold text-deep"
            >
              Insights
            </h3>
            <p className="text-[13px] text-muted">
              Rule-based findings for this period
            </p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {insights.map((i) => (
              <li
                key={i.title}
                className="flex gap-3 rounded-control bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]"
              >
                <Lightbulb
                  size={20}
                  className="mt-0.5 shrink-0 text-soil"
                  aria-hidden
                />
                <span className="flex flex-col gap-0.5">
                  <strong className="text-small">{i.title}</strong>
                  {i.detail && (
                    <span className="text-[13px] text-muted">{i.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

// ─── Impact ───────────────────────────────────────────────────────────────────

const PLANT_KG = 0.25;

export function ImpactSection({
  data,
  byGroup,
  compare,
  print,
  onFilterGroup,
}: {
  data: ReportData;
  /** Complete kg per recipient group (from /reporting/analytics). */
  byGroup: AnalyticsReport["byGroup"];
  compare: boolean;
  print?: boolean;
  onFilterGroup?: (group: string) => void;
}) {
  const [g, setG] = useState<Granularity>("weekly");
  const [who, setWho] = useState<"BULK" | "INDIVIDUAL">("BULK");
  const buckets = bucketSeries(data, g);
  const total = data.daily.reduce((s, d) => s + d.kg, 0);

  // Donut: top 3 groups + Other.
  const ranked = byGroup.map((g) => [g.group, g.kg] as [string, number]);
  const colors = ["#4F7A3A", "#E0A030", "#3A7FC4", "#A0672E"];
  const head = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const slices = [
    ...head.map(([k, v], i) => ({
      key: k,
      label: GROUP_LABEL[k] ?? k,
      value: Math.round(v * 100) / 100,
      color: colors[i],
    })),
    ...(rest.length
      ? [
          {
            key: "OTHER_GROUPS",
            label: "Other",
            value: Math.round(rest.reduce((s, [, v]) => s + v, 0) * 100) / 100,
            color: colors[3],
          },
        ]
      : []),
  ];
  const recipients = data.topRecipients
    .filter((r) =>
      who === "BULK" ? r.type === "BULK" : r.type === "INDIVIDUAL",
    )
    .slice(0, 10);

  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        id="impact"
        title="Impact"
        description="How much compost went back to the soil, and where"
      />
      <ChartCard
        print={print}
        title="kg diverted over time"
        description={`From confirmed handovers · kg per ${g === "daily" ? "day" : g === "monthly" ? "month" : "week"}${g === "cumulative" ? " (running total)" : ""}`}
        controls={
          <Segmented
            label="Granularity"
            value={g}
            onChange={setG}
            options={[
              { key: "daily", label: "Daily" },
              { key: "weekly", label: "Weekly" },
              { key: "monthly", label: "Monthly" },
              { key: "cumulative", label: "Cumulative" },
            ]}
          />
        }
        data={{
          filename: "kg-diverted.csv",
          header: [
            "Period",
            "This period (kg)",
            ...(compare ? ["Previous (kg)"] : []),
          ],
          rows: buckets.map((b) => [
            b.title,
            b.kg,
            ...(compare ? [b.previous] : []),
          ]),
        }}
      >
        <Legend
          items={[
            { label: "This period", color: "#4F7A3A" },
            ...(compare
              ? [
                  {
                    label: "Previous period (dashed)",
                    color: "#2B2B24",
                    dashed: true,
                  },
                ]
              : []),
          ]}
        />
        {total === 0 && !compare ? (
          <p className="py-10 text-center text-small text-muted">
            Nothing handed over in this period.
          </p>
        ) : (
          <ColumnChart
            ariaLabel="kg diverted, this period vs previous"
            height={240}
            series={[{ key: "kg", label: "This period", color: "#4F7A3A" }]}
            columns={buckets.map((b, i) => ({
              key: b.key,
              label:
                buckets.length > 14 && i % Math.ceil(buckets.length / 10)
                  ? ""
                  : b.label,
              title: b.title,
              values: { kg: b.kg },
              compare: compare ? b.previous : undefined,
            }))}
          />
        )}
      </ChartCard>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          print={print}
          title="Where the compost went"
          description={
            onFilterGroup ? "By category · click to filter" : "By category"
          }
          data={{
            filename: "compost-by-category.csv",
            header: ["Category", "kg", "Share %"],
            rows: ranked.map(([k, v]) => [
              GROUP_LABEL[k] ?? k,
              Math.round(v * 100) / 100,
              total ? Math.round((v / total) * 100) : 0,
            ]),
          }}
        >
          {total === 0 ? (
            <p className="py-8 text-center text-small text-muted">
              No handovers yet.
            </p>
          ) : (
            <>
              <Donut
                ariaLabel="Compost by taker category"
                center={`${formatKg(total)} kg`}
                centerSub="total"
                slices={slices}
                onSlice={
                  onFilterGroup &&
                  ((s) => s.key !== "OTHER_GROUPS" && onFilterGroup(s.key))
                }
              />
              {rest.length > 0 && (
                <p className="text-xs text-muted">
                  Other ={" "}
                  {rest
                    .map(([k, v]) => `${GROUP_LABEL[k] ?? k} ${formatKg(v)}kg`)
                    .join(", ")}
                </p>
              )}
            </>
          )}
        </ChartCard>
        <ChartCard
          print={print}
          title="Top recipients"
          description="Top 10 this period"
          controls={
            <Segmented
              label="Recipient type"
              value={who}
              onChange={setWho}
              options={[
                { key: "BULK", label: "Organisations" },
                { key: "INDIVIDUAL", label: "Individuals" },
              ]}
            />
          }
          data={{
            filename: "top-recipients.csv",
            header: ["Recipient", "Type", "kg", "Pickups"],
            rows: data.topRecipients.map((r) => [
              r.name,
              r.type,
              r.kg,
              r.pickups,
            ]),
          }}
        >
          {recipients.length === 0 ? (
            <p className="py-8 text-center text-small text-muted">
              No {who === "BULK" ? "organisations" : "individuals"} collected in
              this period.
            </p>
          ) : (
            <HBarList
              ariaLabel="Top recipients"
              shareOfTotal={false}
              rows={recipients.map((r) => ({
                key: r.takerId,
                label: r.name,
                value: r.kg,
                sub: `${r.pickups} pickup${r.pickups === 1 ? "" : "s"}`,
              }))}
            />
          )}
        </ChartCard>
      </div>
      <section
        aria-labelledby="equiv"
        className="grid gap-4 rounded-card bg-cream p-5 shadow-card md:grid-cols-[1fr_1fr_1.2fr]"
      >
        <div>
          <h3
            id="equiv"
            className="font-display m-0 text-lg font-semibold text-deep"
          >
            Impact equivalents
          </h3>
          <p className="text-xs text-muted">
            Estimates only — not measured values.
          </p>
        </div>
        <div>
          <div className="font-display text-[34px] font-semibold text-deep">
            {formatKg(total)} kg
          </div>
          <p className="text-small text-muted">
            of food waste kept out of the incinerator
          </p>
        </div>
        <div>
          <div className="font-display text-[34px] font-semibold text-deep">
            ≈ {Math.round(total / PLANT_KG)}
          </div>
          <p className="text-small text-muted">
            potted plants topped up (about 250g each)
          </p>
          <details className="mt-1 text-xs text-muted">
            <summary className="font-bold text-deep underline">
              How we estimate
            </summary>
            Plants = kg ÷ 0.25kg per 20cm pot top-up. Food waste kept out of the
            incinerator = kg of compost × 1.0 (1kg food waste → about 1kg
            finished compost after bulking).
          </details>
        </div>
      </section>
    </section>
  );
}

// ─── Supply & stock ───────────────────────────────────────────────────────────

const SUPPLY_SERIES = [
  { key: "reserve", label: "School reserve", color: "#A0672E" },
  { key: "bulk", label: "Bulk allocations", color: "#E0A030" },
  { key: "individual", label: "Individual claims collected", color: "#2F6E24" },
  { key: "unclaimed", label: "Released or unclaimed", color: "#C9C5B8" },
];

export function SupplySection({
  data,
  print,
}: {
  data: ReportData;
  print?: boolean;
}) {
  const router = useRouter();
  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        id="supply"
        title="Supply & stock"
        description="What was generated and where each batch went"
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <ChartCard
          print={print}
          title="Batch breakdown"
          description={
            print ? "kg per batch" : "kg per batch · click a bar to open it"
          }
          data={{
            filename: "batch-breakdown.csv",
            header: [
              "Batch",
              "Total kg",
              "School reserve",
              "Bulk collected",
              "Individual collected",
              "Released / unclaimed",
            ],
            rows: data.batches.map((b) => [
              b.reference,
              b.totalKg,
              b.schoolReserveKg,
              b.bulkKg,
              b.individualKg,
              b.unclaimedKg,
            ]),
          }}
        >
          <Legend items={SUPPLY_SERIES} />
          {data.batches.length === 0 ? (
            <p className="py-10 text-center text-small text-muted">
              No batches in this period.
            </p>
          ) : (
            <ColumnChart
              ariaLabel="Batch breakdown stacked bars"
              height={240}
              series={SUPPLY_SERIES}
              columns={data.batches.slice(-10).map((b) => ({
                key: b.id,
                label: b.reference,
                title: `${b.reference} · ${formatKg(b.totalKg)}kg`,
                values: {
                  reserve: b.schoolReserveKg,
                  bulk: b.bulkKg,
                  individual: b.individualKg,
                  unclaimed: b.unclaimedKg,
                },
              }))}
              onColumn={
                print
                  ? undefined
                  : (c) => router.push(`/manager/batches/${c.key}`)
              }
            />
          )}
        </ChartCard>
        <ChartCard
          print={print}
          title="Generated vs collected"
          description="kg per month · gap = unused"
          data={{
            filename: "generated-vs-collected.csv",
            header: ["Month", "Generated kg", "Collected kg", "Unused kg"],
            rows: data.generatedVsCollected.map((m) => [
              m.month,
              m.generated,
              m.collected,
              Math.max(0, Math.round((m.generated - m.collected) * 100) / 100),
            ]),
          }}
        >
          <Legend
            items={[
              { label: "Collected", color: "#2F6E24" },
              { label: "Unused", color: "#DCE5CF" },
            ]}
          />
          <ColumnChart
            ariaLabel="Generated vs collected per month"
            height={240}
            series={[
              { key: "collected", label: "Collected", color: "#2F6E24" },
              { key: "unused", label: "Unused", color: "#DCE5CF" },
            ]}
            columns={data.generatedVsCollected.map((m) => ({
              key: m.month,
              label: new Date(
                `${m.month}-01T12:00:00+08:00`,
              ).toLocaleDateString("en-SG", { month: "short" }),
              title: `${new Date(`${m.month}-01T12:00:00+08:00`).toLocaleDateString("en-SG", { month: "short", year: "numeric" })} · generated ${formatKg(m.generated)}kg`,
              values: {
                collected: m.collected,
                unused: Math.max(0, m.generated - m.collected),
              },
            }))}
          />
        </ChartCard>
      </div>
      <ChartCard
        print={print}
        title="Batch performance"
        description={print ? undefined : "Click a row to open the batch"}
        data={{
          filename: "batch-performance.csv",
          header: [
            "Batch",
            "Harvest date",
            "Total kg",
            "Top-ups kg",
            "Collected kg",
            "% distributed",
            "Days to fully claimed",
            "Status",
          ],
          rows: data.batches.map((b) => [
            b.reference,
            b.harvestDate.slice(0, 10),
            b.totalKg,
            b.topUpKg,
            b.collectedKg,
            b.distributedPct,
            b.daysToFullyClaimed,
            b.status,
          ]),
        }}
      >
        <DataTable
          head={[
            "Batch",
            "Harvest date",
            "Total",
            "Top-ups",
            "Collected",
            "% distributed",
            "Days to fully claimed",
            "Status",
          ]}
        >
          {[...data.batches].reverse().map((b) => (
            <tr
              key={b.id}
              onClick={
                print
                  ? undefined
                  : () => router.push(`/manager/batches/${b.id}`)
              }
              className={`${rowClass} ${print ? "" : "cursor-pointer"}`}
            >
              <td className={`${tdClass} font-bold text-deep`}>
                {b.reference}
              </td>
              <td className={`${tdClass} whitespace-nowrap`}>
                {formatDayMonth(b.harvestDate)}
              </td>
              <td className={tdClass}>{formatKg(b.totalKg)}kg</td>
              <td className={tdClass}>
                {b.topUpKg ? `${formatKg(b.topUpKg)}kg` : "—"}
              </td>
              <td className={tdClass}>{formatKg(b.collectedKg)}kg</td>
              <td className={tdClass}>
                <div className="flex min-w-[120px] items-center gap-2">
                  <div className="grow">
                    <ProgressBar
                      value={b.distributedPct}
                      max={100}
                      label={`${b.distributedPct}% distributed`}
                    />
                  </div>
                  <span className="text-xs font-bold">{b.distributedPct}%</span>
                </div>
              </td>
              <td className={tdClass}>
                {b.daysToFullyClaimed == null
                  ? "—"
                  : `${b.daysToFullyClaimed} day${b.daysToFullyClaimed === 1 ? "" : "s"}`}
              </td>
              <td className={tdClass}>
                <BatchStatusBadge status={b.status as BatchStatus} />
              </td>
            </tr>
          ))}
        </DataTable>
      </ChartCard>
    </section>
  );
}
