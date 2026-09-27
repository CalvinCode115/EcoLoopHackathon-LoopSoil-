"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { PlusCircle } from "@phosphor-icons/react/dist/ssr/PlusCircle";
import { StopCircle } from "@phosphor-icons/react/dist/ssr/StopCircle";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyPot } from "@/components/brand/illustrations";
import { DeleteBatchSheet } from "@/components/manager/batch-detail/batch-sheets";
import { StockBar, StockLegend } from "@/components/manager/stock-bar";
import { ActionMenu, type ActionItem } from "@/components/ui/action-menu";
import { BatchStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDayMonth, formatFullDate, formatKg } from "@/lib/format";
import {
  BATCH_STATUS_LABEL,
  friendlyError,
  type BatchStatus,
} from "@/lib/labels";
import type { Batch } from "@/lib/types";

const STATUSES: BatchStatus[] = ["DRAFT", "OPEN", "CLOSED", "COMPLETED"];
const HINT: Record<BatchStatus, string> = {
  DRAFT: "Not visible to takers",
  OPEN: "Takers can claim",
  CLOSED: "Pickups ongoing",
  COMPLETED: "All handed over",
};
const PAGE = 20;

type Load =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; batches: Batch[] };

/**
 * Manager · Batches (/manager/batches) — boards "Batches list · hover on stock bar /
 * actions menu / loading / empty". Every batch with its live stock split; filter by status
 * (summary cards or tabs), harvest-date range and reference. Data: GET /batches (manager
 * sees all statuses), POST /batches/:id/publish, POST /batches/:id/close, DELETE /batches/:id.
 */
export default function ManagerBatchesPage() {
  // useSearchParams (the "?deleted=" flash) needs a Suspense boundary on a static route.
  return (
    <Suspense fallback={<TableSkeleton />}>
      <BatchesList />
    </Suspense>
  );
}

function BatchesList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [deleting, setDeleting] = useState<Batch | null>(null);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [status, setStatus] = useState<BatchStatus | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(() => {
    const ref = params.get("deleted");
    return ref ? { tone: "success", text: `Batch ${ref} deleted.` } : null;
  });

  useEffect(() => {
    // Drop the one-off flag so a refresh doesn't replay the toast.
    if (params.get("deleted")) router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pilot scale: one page of up to 100 holds every batch; filters run in the browser.
  const fetchBatches = useCallback(async (): Promise<Load> => {
    try {
      const page = await api.get<Paginated<Batch>>("/batches?pageSize=100");
      return { kind: "ready", batches: page.data };
    } catch {
      return { kind: "error" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchBatches().then((next) => !cancelled && setLoad(next));
    return () => {
      cancelled = true;
    };
  }, [fetchBatches]);

  const all = useMemo(
    () => (load.kind === "ready" ? load.batches : []),
    [load],
  );
  const counts = useMemo(() => {
    const c = { ALL: all.length, DRAFT: 0, OPEN: 0, CLOSED: 0, COMPLETED: 0 };
    for (const b of all) c[b.status] += 1;
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((b) => {
      if (status !== "ALL" && b.status !== status) return false;
      if (q && !b.reference.toLowerCase().includes(q)) return false;
      const day = b.harvestDate.slice(0, 10);
      if (from && day < from) return false;
      if (until && day > until) return false;
      return true;
    });
  }, [all, status, query, from, until]);

  const filtersActive = status !== "ALL" || query || from || until;

  async function act(batch: Batch, action: "publish" | "close") {
    try {
      await api.post(`/batches/${batch.id}/${action}`);
      setToast({
        tone: "success",
        text:
          action === "publish"
            ? `${batch.reference} is now open to takers.`
            : `Claiming closed for ${batch.reference}.`,
      });
      setLoad(await fetchBatches());
    } catch (err) {
      setToast({ tone: "error", text: friendlyError(err) });
    }
  }

  function actionsFor(b: Batch): ActionItem[] {
    const canPublish = b.status === "DRAFT" || b.status === "CLOSED";
    return [
      {
        label: "View",
        icon: <Eye size={16} />,
        href: `/manager/batches/${b.id}`,
      },
      b.status === "DRAFT" || b.status === "OPEN"
        ? {
            label: "Top up stock",
            icon: <PlusCircle size={16} />,
            href: `/manager/batches/${b.id}?topup=1`,
          }
        : {
            label: "Top up stock",
            icon: <PlusCircle size={16} />,
            disabledReason: "Only for draft or open batches",
          },
      b.status === "OPEN"
        ? {
            label: "Close claiming",
            icon: <StopCircle size={16} />,
            onSelect: () => void act(b, "close"),
          }
        : {
            label: "Close claiming",
            icon: <StopCircle size={16} />,
            disabledReason: "Only for open batches",
          },
      canPublish
        ? {
            label: b.status === "CLOSED" ? "Reopen" : "Publish",
            icon: <PaperPlaneTilt size={16} />,
            onSelect: () => void act(b, "publish"),
          }
        : {
            label: "Publish",
            icon: <PaperPlaneTilt size={16} />,
            disabledReason: "Already published",
          },
      b.status === "COMPLETED"
        ? {
            label: "Delete batch",
            icon: <Trash size={16} />,
            disabledReason: "Completed batches are kept",
          }
        : {
            label: "Delete batch",
            icon: <Trash size={16} />,
            onSelect: () => setDeleting(b),
            danger: true,
          },
    ];
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display m-0 text-[32px] font-semibold leading-10 text-deep">
            Batches
          </h1>
          <p className="text-[15px] leading-[23px] text-muted">
            Every compost batch, from harvest to handover.
          </p>
        </div>
        <Button
          href="/manager/batches/new"
          size="sm"
          className="px-[18px]"
          icon={<Plus size={18} weight="bold" />}
        >
          New batch
        </Button>
      </div>

      {/* Status summary cards — also a filter. */}
      <div
        role="group"
        aria-label="Filter by status"
        className="grid grid-cols-2 gap-4 xl:grid-cols-4"
      >
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => {
              setStatus(status === s ? "ALL" : s);
              setShown(PAGE);
            }}
            className={cn(
              "flex items-center gap-3.5 rounded-[14px] bg-cream px-4 py-3.5 text-left shadow-card hover:bg-sage",
              status === s &&
                "shadow-[inset_0_0_0_2px_var(--color-leaf),0_1px_2px_rgba(47,74,36,0.06),0_8px_24px_rgba(47,74,36,0.08)]",
            )}
          >
            <span className="font-display text-[30px] font-semibold leading-[34px] text-deep">
              {load.kind === "ready" ? counts[s] : "–"}
            </span>
            <span className="flex flex-col gap-1">
              <BatchStatusBadge status={s} />
              <span className="text-xs text-muted">{HINT[s]}</span>
            </span>
          </button>
        ))}
      </div>

      <section className="flex min-w-0 flex-col gap-4 rounded-card bg-cream p-5 shadow-card">
        <div
          role="tablist"
          aria-label="Batch status"
          className="flex gap-7 overflow-x-auto shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]"
        >
          {(["ALL", ...STATUSES] as const).map((s) => {
            const selected = status === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setStatus(s);
                  setShown(PAGE);
                }}
                className={cn(
                  "inline-flex h-12 shrink-0 items-center gap-2 px-1 text-[15px]",
                  selected
                    ? "font-bold text-deep shadow-[inset_0_-3px_0_var(--color-leaf)]"
                    : "font-medium text-muted hover:text-deep",
                )}
              >
                {s === "ALL" ? "All" : BATCH_STATUS_LABEL[s]}
                <span
                  className={cn(
                    "h-5 min-w-[22px] rounded-full px-1.5 text-center text-xs font-bold leading-5",
                    selected ? "bg-leaf text-cream" : "bg-[#ECE6D8] text-muted",
                  )}
                >
                  {load.kind === "ready" ? counts[s] : "–"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Harvest date</span>
            <div className="flex items-center gap-2">
              <DateInput label="Harvest from" value={from} onChange={setFrom} />
              <span className="text-muted">–</span>
              <DateInput
                label="Harvest until"
                value={until}
                onChange={setUntil}
              />
            </div>
          </div>
          <div className="flex max-w-[360px] flex-1 flex-col gap-1.5">
            <label htmlFor="b-q" className="text-[13px] font-semibold">
              Search
            </label>
            <div className="flex h-11 items-center gap-2 rounded-control bg-white px-3 shadow-[inset_0_0_0_1px_var(--color-edge)] focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(79,122,58,0.25)]">
              <MagnifyingGlass size={16} className="text-muted" aria-hidden />
              <input
                id="b-q"
                type="search"
                placeholder="Search by reference, e.g. 2026-09-A"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE);
                }}
                className="min-w-0 flex-1 border-none bg-transparent text-small text-ink outline-none"
              />
            </div>
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setStatus("ALL");
                setQuery("");
                setFrom("");
                setUntil("");
                setShown(PAGE);
              }}
              className="inline-flex h-11 items-center text-small font-bold text-deep underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="flex justify-end">
          <StockLegend />
        </div>

        {load.kind === "loading" && <TableSkeleton />}
        {load.kind === "error" && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-control bg-danger-tint p-4"
          >
            <p className="flex items-start gap-3 text-small font-semibold text-danger-ink">
              <WarningCircle
                size={20}
                weight="bold"
                className="shrink-0"
                aria-hidden
              />
              We couldn’t load the batches. Check your connection and try again.
            </p>
            <div>
              <Button
                variant="secondary"
                size="sm"
                className="bg-cream"
                icon={<ArrowClockwise size={18} weight="bold" />}
                onClick={() => {
                  setLoad({ kind: "loading" });
                  void fetchBatches().then(setLoad);
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}
        {load.kind === "ready" && all.length === 0 && <EmptyState />}
        {load.kind === "ready" && all.length > 0 && filtered.length === 0 && (
          <p className="py-10 text-center text-body text-muted">
            No batches match these filters.
          </p>
        )}
        {load.kind === "ready" && filtered.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr>
                    {[
                      "Reference",
                      "Harvest date",
                      "Total",
                      "pH",
                      "Stock (kg)",
                      "Claim window",
                      "Status",
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-[0.04em] text-muted"
                      >
                        {h}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, shown).map((b) => (
                    <tr
                      key={b.id}
                      className="shadow-[inset_0_1px_0_rgba(107,107,94,0.14)] hover:bg-row-hover"
                    >
                      <td className="px-3 py-3.5 align-middle">
                        <Link
                          href={`/manager/batches/${b.id}`}
                          className="font-bold text-deep"
                        >
                          {b.reference}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 align-middle text-muted">
                        {formatFullDate(b.harvestDate)}
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <strong>{formatKg(b.pool.totalKg)}kg</strong>
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        {b.phReading ?? "—"}
                      </td>
                      <td className="min-w-[220px] px-3 py-3.5 align-middle">
                        <StockBar reference={b.reference} pool={b.pool} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 align-middle">
                        {claimWindow(b)}
                      </td>
                      <td className="px-3 py-3.5 align-middle">
                        <BatchStatusBadge status={b.status} />
                      </td>
                      <td className="px-3 py-3.5 text-right align-middle">
                        <ActionMenu
                          label={`Actions for ${b.reference}`}
                          items={actionsFor(b)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[13px] text-muted">
                Showing {Math.min(shown, filtered.length)} of {filtered.length}{" "}
                batches
              </span>
              {shown < filtered.length && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10 px-[18px]"
                  onClick={() => setShown((n) => n + PAGE)}
                >
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      {deleting && (
        <DeleteBatchSheet
          batch={deleting}
          onClose={() => setDeleting(null)}
          onDone={async (text) => {
            setDeleting(null);
            setToast({ tone: "success", text });
            setLoad(await fetchBatches());
          }}
        />
      )}
      {toast && (
        <Toast
          tone={toast.tone}
          onDismiss={() => setToast(null)}
          duration={toast.tone === "success" ? 4000 : 0}
        >
          {toast.text}
        </Toast>
      )}
    </div>
  );
}

function claimWindow(b: Batch): string {
  if (!b.availableFrom && !b.availableUntil) return "—";
  const a = b.availableFrom ? formatDayMonth(b.availableFrom) : "Now";
  const z = b.availableUntil ? formatDayMonth(b.availableUntil) : "open-ended";
  return `${a} – ${z}`;
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 rounded-control bg-white px-3 text-small text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(79,122,58,0.25)]"
    />
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="mb-2 flex size-40 items-center justify-center rounded-full bg-sage">
        <EmptyPot width={130} />
      </div>
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        No batches yet
      </h2>
      <p className="max-w-[360px] text-body text-muted">
        Log your first compost harvest so takers can start claiming.
      </p>
      <Button
        href="/manager/batches/new"
        className="mt-2"
        icon={<Plus size={18} weight="bold" />}
      >
        Log your first batch
      </Button>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <LoadingLabel>Loading batches…</LoadingLabel>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          aria-hidden
          className="flex items-center gap-4 py-2 shadow-[inset_0_1px_0_rgba(107,107,94,0.14)]"
        >
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
