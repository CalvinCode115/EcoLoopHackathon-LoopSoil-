"use client";

import { X } from "@phosphor-icons/react/dist/ssr/X";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ColumnChart, Legend } from "@/components/charts/charts";
import { claimStatus } from "@/components/manager/claims/claim-utils";
import { DataTable, rowClass, tdClass } from "@/components/manager/panel";
import { Badge, ClaimStatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type Paginated } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatDayMonth,
  formatFullDate,
  formatKg,
  sgDayKey,
} from "@/lib/format";
import { ALLOCATION_STATUS_LABEL, TAKER_CATEGORY_LABEL } from "@/lib/labels";
import type { Allocation, Claim, Handover, TakerRecord } from "@/lib/types";
import { useLoad } from "@/lib/use-load";

export const TAKER_STATUS: Record<string, { label: string; tone: BadgeTone }> =
  {
    APPROVED: { label: "Approved", tone: "leaf" },
    PENDING: { label: "Pending", tone: "amber" },
    REJECTED: { label: "Declined", tone: "red" },
    SUSPENDED: { label: "Suspended", tone: "red" },
  };

const ALLOC_TONE: Record<string, BadgeTone> = {
  PLANNED: "amber",
  CONFIRMED: "leaf",
  COLLECTED: "deep",
  CANCELLED: "grey",
};

/**
 * Taker drawer (boards "Takers · drawer individual / individual handovers / bulk"): who they
 * are, totals, history (claims or allocations, and handovers) and actions. Bulk partners
 * also get allocated vs collected per month.
 */
export function TakerDrawer({
  taker,
  onClose,
  onSuspend,
  onReinstate,
  onEdit,
}: {
  taker: TakerRecord;
  onClose: () => void;
  onSuspend: () => void;
  onReinstate: () => void;
  onEdit: () => void;
}) {
  const bulk = taker.type === "BULK";
  const [tab, setTab] = useState<"records" | "handovers">("records");
  const ref = useRef<HTMLElement>(null);
  const history = useLoad(`taker-${taker.id}`, async () => {
    const [records, handovers] = await Promise.all([
      bulk
        ? api
            .get<Paginated<Allocation>>(
              `/allocations?takerId=${taker.id}&pageSize=100`,
            )
            .then((p) => ({ allocations: p.data, claims: [] as Claim[] }))
        : api
            .get<Paginated<Claim>>(`/claims?takerId=${taker.id}&pageSize=100`)
            .then((p) => ({ claims: p.data, allocations: [] as Allocation[] })),
      api
        .get<Paginated<Handover>>(`/handovers?takerId=${taker.id}&pageSize=100`)
        .then((p) => p.data),
    ]);
    return { ...records, handovers };
  });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);

  const st = TAKER_STATUS[taker.status] ?? TAKER_STATUS.PENDING;
  const s = taker.stats;
  const facts: [string, React.ReactNode][] = [
    ...(bulk
      ? ([
          [
            "Category",
            taker.category ? TAKER_CATEGORY_LABEL[taker.category] : "—",
          ],
          [
            "Monthly target",
            taker.monthlyKgTarget != null
              ? `${formatKg(taker.monthlyKgTarget)}kg`
              : "—",
          ],
        ] as [string, React.ReactNode][])
      : []),
    [
      "Email",
      taker.email ? <a href={`mailto:${taker.email}`}>{taker.email}</a> : "—",
    ],
    [
      "Phone",
      taker.phone ? (
        <a href={`tel:${taker.phone.replace(/\s/g, "")}`}>{taker.phone}</a>
      ) : (
        "—"
      ),
    ],
    ["Joined", taker.createdAt ? formatFullDate(taker.createdAt) : "—"],
    ...(taker.status === "SUSPENDED" || taker.status === "REJECTED"
      ? ([
          [
            taker.status === "SUSPENDED" ? "Suspended" : "Declined",
            `${taker.statusChangedAt ? formatFullDate(taker.statusChangedAt) : ""}${taker.statusReason ? ` · ${taker.statusReason}` : ""}`,
          ],
        ] as [string, React.ReactNode][])
      : []),
  ];

  return (
    <div className="fixed inset-0 z-[55]">
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgba(28,36,22,0.35)]"
        onClick={onClose}
      />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="taker-drawer-title"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-cream shadow-photo outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-5 shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
              Taker
            </span>
            <h2
              id="taker-drawer-title"
              className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
            >
              {taker.name}
            </h2>
            <span className="flex gap-2">
              <Badge tone={bulk ? "soil" : "sage"} size="sm">
                {bulk ? "Bulk" : "Individual"}
              </Badge>
              <Badge tone={st.tone} size="sm">
                {st.label}
              </Badge>
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-control text-muted hover:bg-sage"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        <div className="flex grow flex-col gap-4 overflow-y-auto px-6 py-5">
          <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] text-small">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="py-2 text-muted shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
                  {k}
                </dt>
                <dd className="m-0 break-words py-2 font-semibold shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {taker.intendedUse && (
            <div className="rounded-control bg-white p-3.5 text-small shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
              <span className="text-xs font-bold text-muted">Intended use</span>
              <p className="mt-1 italic">“{taker.intendedUse}”</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Total collected", s ? `${formatKg(s.collectedKg)}kg` : "–"],
              [
                bulk ? "Allocations" : "Claims",
                s ? String(bulk ? s.allocations : s.claims) : "–",
              ],
              ["No-shows", s ? String(s.noShows) : "–"],
            ].map(([k, v]) => (
              <div
                key={k}
                className={cn(
                  "rounded-control px-3 py-2.5",
                  k === "No-shows" && s && s.noShows > 0
                    ? "bg-amber-tint"
                    : "bg-[#F4EFE4]",
                )}
              >
                <div className="text-xs text-muted">{k}</div>
                <strong className="text-[17px]">{v}</strong>
              </div>
            ))}
          </div>

          {bulk && history.status === "ready" && (
            <BulkMonthly
              allocations={history.data.allocations}
              handovers={history.data.handovers}
            />
          )}

          <div
            role="tablist"
            aria-label="History"
            className="flex gap-6 shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]"
          >
            {(["records", "handovers"] as const).map((t) => {
              const n =
                history.status === "ready"
                  ? t === "handovers"
                    ? history.data.handovers.length
                    : bulk
                      ? history.data.allocations.length
                      : history.data.claims.length
                  : null;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 px-1 text-small",
                    tab === t
                      ? "font-bold text-deep shadow-[inset_0_-3px_0_var(--color-leaf)]"
                      : "font-medium text-muted",
                  )}
                >
                  {t === "handovers"
                    ? "Handovers"
                    : bulk
                      ? "Allocations"
                      : "Claims"}
                  <span className="h-5 min-w-[22px] rounded-full bg-[#ECE6D8] px-1.5 text-center text-xs font-bold leading-5 text-muted">
                    {n ?? "–"}
                  </span>
                </button>
              );
            })}
          </div>
          {history.status === "loading" && (
            <p className="text-small text-muted">Loading history…</p>
          )}
          {history.status === "error" && (
            <p className="text-small text-danger-ink">
              Couldn’t load the history.{" "}
              <button
                type="button"
                onClick={history.reload}
                className="font-bold underline"
              >
                Retry
              </button>
            </p>
          )}
          {history.status === "ready" &&
            (tab === "handovers" ? (
              history.data.handovers.length === 0 ? (
                <p className="text-small text-muted">No handovers yet.</p>
              ) : (
                <DataTable head={["Date", "Actual kg", "Photo"]}>
                  {history.data.handovers.map((h) => (
                    <tr key={h.id} className={rowClass}>
                      <td className={tdClass}>
                        {formatDayMonth(h.handedOverAt)}
                      </td>
                      <td className={tdClass}>{formatKg(h.actualKg)}kg</td>
                      <td className={tdClass}>
                        {h.photoUrl ? (
                          <a
                            href={h.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Handover photo"
                          >
                            <Image
                              src={h.photoUrl}
                              alt=""
                              width={40}
                              height={40}
                              unoptimized
                              className="size-10 rounded-lg object-cover"
                            />
                          </a>
                        ) : (
                          <span className="text-xs text-muted">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )
            ) : bulk ? (
              history.data.allocations.length === 0 ? (
                <p className="text-small text-muted">No allocations yet.</p>
              ) : (
                <DataTable
                  head={["Reference", "Batch", "kg", "Status", "Date"]}
                >
                  {history.data.allocations.map((a) => (
                    <tr key={a.id} className={rowClass}>
                      <td className={`${tdClass} font-bold`}>
                        <Link
                          href={`/manager/batches/${a.batchId}`}
                          className="text-deep"
                        >
                          {a.reference}
                        </Link>
                      </td>
                      <td className={tdClass}>{a.batch?.reference ?? "—"}</td>
                      <td className={tdClass}>
                        {formatKg(Number(a.allocatedKg))}kg
                      </td>
                      <td className={tdClass}>
                        <Badge tone={ALLOC_TONE[a.status]} size="sm">
                          {ALLOCATION_STATUS_LABEL[a.status]}
                        </Badge>
                      </td>
                      <td className={tdClass}>{formatDayMonth(a.createdAt)}</td>
                    </tr>
                  ))}
                </DataTable>
              )
            ) : history.data.claims.length === 0 ? (
              <p className="text-small text-muted">No claims yet.</p>
            ) : (
              <DataTable head={["Reference", "Batch", "kg", "Status", "Date"]}>
                {history.data.claims.map((c) => (
                  <tr key={c.id} className={rowClass}>
                    <td className={`${tdClass} font-bold`}>
                      <Link
                        href={`/manager/claims?claim=${c.id}`}
                        className="text-deep"
                      >
                        {c.reference}
                      </Link>
                    </td>
                    <td className={tdClass}>{c.batch?.reference ?? "—"}</td>
                    <td className={tdClass}>
                      {formatKg(Number(c.approvedKg ?? c.requestedKg))}kg
                    </td>
                    <td className={tdClass}>
                      <ClaimStatusBadge status={claimStatus(c)} />
                    </td>
                    <td className={tdClass}>{formatDayMonth(c.submittedAt)}</td>
                  </tr>
                ))}
              </DataTable>
            ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 px-6 py-4 shadow-[inset_0_1px_0_rgba(107,107,94,0.14)]">
          {bulk && (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="px-4"
                onClick={onEdit}
              >
                Edit
              </Button>
              {taker.status === "APPROVED" && (
                <Button href="/manager/batches" size="sm" className="px-4">
                  Create allocation
                </Button>
              )}
            </>
          )}
          {taker.status === "APPROVED" && (
            <button
              type="button"
              onClick={onSuspend}
              className="ml-auto h-11 rounded-control px-3 text-small font-bold text-error hover:bg-danger-tint"
            >
              Suspend
            </button>
          )}
          {taker.status === "SUSPENDED" && (
            <Button size="sm" className="ml-auto px-4" onClick={onReinstate}>
              Reinstate
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Bulk: allocated vs collected, kg per month (last 4 months with activity). */
function BulkMonthly({
  allocations,
  handovers,
}: {
  allocations: Allocation[];
  handovers: Handover[];
}) {
  const months = new Map<string, { allocated: number; collected: number }>();
  const add = (iso: string, k: "allocated" | "collected", kg: number) => {
    const m = sgDayKey(iso).slice(0, 7);
    const row = months.get(m) ?? { allocated: 0, collected: 0 };
    row[k] += kg;
    months.set(m, row);
  };
  for (const a of allocations)
    if (a.status !== "CANCELLED")
      add(a.createdAt, "allocated", Number(a.allocatedKg));
  for (const h of handovers) add(h.handedOverAt, "collected", h.actualKg);
  const rows = [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-4);
  if (!rows.length) return null;
  const label = (m: string, long = false) =>
    new Date(`${m}-01T12:00:00+08:00`).toLocaleDateString(
      "en-SG",
      long ? { month: "short", year: "numeric" } : { month: "short" },
    );
  return (
    <section
      aria-labelledby="bulk-monthly"
      className="flex flex-col gap-2 rounded-control bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]"
    >
      <h3 id="bulk-monthly" className="m-0 text-small font-bold">
        Allocated vs collected · kg per month
      </h3>
      <Legend
        items={[
          { label: "Collected", color: "#2F6E24" },
          { label: "Allocated, not yet collected", color: "#E0A030" },
        ]}
      />
      <ColumnChart
        ariaLabel="Allocated vs collected per month"
        height={150}
        series={[
          { key: "collected", label: "Collected", color: "#2F6E24" },
          { key: "open", label: "Allocated, not collected", color: "#E0A030" },
        ]}
        columns={rows.map(([m, r]) => ({
          key: m,
          label: label(m),
          title: `${label(m, true)} · allocated ${formatKg(r.allocated)}kg`,
          values: {
            collected: r.collected,
            open: Math.max(0, r.allocated - r.collected),
          },
        }))}
      />
    </section>
  );
}
