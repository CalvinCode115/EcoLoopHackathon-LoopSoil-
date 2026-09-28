"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyPot } from "@/components/brand/illustrations";
import { AllocationsTab } from "@/components/manager/batch-detail/allocations-tab";
import { BatchHeader } from "@/components/manager/batch-detail/batch-header";
import {
  CloseClaimingSheet,
  DeleteBatchSheet,
  CompleteSheet,
  TopUpSheet,
} from "@/components/manager/batch-detail/batch-sheets";
import {
  OverviewTab,
  deriveActivity,
} from "@/components/manager/batch-detail/overview-tab";
import {
  ClaimsTab,
  HandoversTab,
  PickupsTab,
} from "@/components/manager/batch-detail/record-tabs";
import {
  KgWaterfall,
  batchWaterfallSteps,
} from "@/components/manager/kg-waterfall";
import { Panel } from "@/components/manager/panel";
import { useManagerCrumbs } from "@/components/nav/manager-shell";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatFullDate, formatKg, sgDayKey } from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type {
  Allocation,
  Batch,
  BatchDetail,
  Claim,
  Handover,
  Slot,
} from "@/lib/types";

type TabKey = "overview" | "allocations" | "claims" | "pickups" | "handovers";

interface Related {
  claims: Claim[] | null;
  allocations: Allocation[] | null;
  /** Every allocation (all batches) — for "allocated this month" per bulk taker. */
  allAllocations: Allocation[] | null;
  slots: Slot[] | null;
  handovers: Handover[] | null;
}

type Load =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; batch: BatchDetail; related: Related; loadedAt: number };

type Flash = { tone: "success" | "error"; text: string } | "published" | null;

/** Pilot scale: one page of 100 holds a batch's claims/slots/handovers. */
const ALL = "pageSize=100";

async function fetchDetail(id: string): Promise<Load> {
  let batch: BatchDetail;
  try {
    batch = await api.get<BatchDetail>(`/batches/${id}`);
  } catch (err) {
    // 400 = not a UUID (ParseUUIDPipe), 404 = no such batch — both are "not found" here.
    if (err instanceof ApiError && (err.status === 404 || err.status === 400))
      return { kind: "notfound" };
    return { kind: "error" };
  }
  const list = <T,>(path: string) =>
    api.get<Paginated<T>>(path).then(
      (p) => p.data,
      () => null,
    );
  const [claims, allocations, allAllocations, slots, handovers] =
    await Promise.all([
      list<Claim>(`/claims?batchId=${id}&${ALL}`),
      list<Allocation>(`/allocations?batchId=${id}&${ALL}`),
      list<Allocation>(`/allocations?${ALL}`),
      list<Slot>(`/slots?batchId=${id}&${ALL}`),
      list<Handover>(`/handovers?batchId=${id}&${ALL}`),
    ]);
  return {
    kind: "ready",
    batch,
    related: {
      claims,
      allocations,
      allAllocations,
      slots,
      // An undone handover (10-second undo) is kept for audit but didn't happen.
      handovers: handovers?.filter((h) => !h.undoneAt) ?? null,
    },
    loadedAt: Date.now(),
  };
}

/**
 * Manager · Batch detail (/manager/batches/[id]) — boards "Batch detail" (Open), "· draft",
 * "· published", "· top up", "· close", "· allocations / add / error", "· claims",
 * "· pickups", "· handovers", "· empties", "· loading", "· not found", "Header actions by
 * status". Data: GET /batches/:id (+ topUps, createdBy for managers) and the batch-filtered
 * lists of claims, allocations, slots and handovers.
 */
export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [tab, setTab] = useState<TabKey>("overview");
  // One-off messages from the page that sent us here (Log new batch / Batches list menu).
  const [flash, setFlash] = useState<Flash>(() =>
    params.get("published")
      ? "published"
      : params.get("saved")
        ? { tone: "success", text: "Batch saved as a draft." }
        : params.get("publishFailed")
          ? {
              tone: "error",
              text: "Batch saved as a draft, but publishing failed. Try Publish again.",
            }
          : null,
  );
  const [sheet, setSheet] = useState<
    "topup" | "close" | "complete" | "delete" | null
  >(() => (params.get("topup") ? "topup" : null));
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    // Drop the one-off query flags so a refresh doesn't replay them.
    if (params.toString()) router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchDetail(id).then((next) => !cancelled && setLoad(next));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const reload = useCallback(async () => setLoad(await fetchDetail(id)), [id]);
  const done = useCallback(
    (text: string) => {
      setSheet(null);
      setFlash({ tone: "success", text });
      void reload();
    },
    [reload],
  );

  const ready = load.kind === "ready" ? load : null;
  useManagerCrumbs([
    { label: "Batches", href: "/manager/batches" },
    { label: ready?.batch.reference ?? "Batch" },
  ]);

  const derived = useMemo(() => {
    if (!ready) return null;
    const { batch, related, loadedAt } = ready;
    const month = sgDayKey(new Date(loadedAt).toISOString()).slice(0, 7);
    const monthlyByTaker = new Map<string, number>();
    for (const a of related.allAllocations ?? []) {
      if (
        a.status === "CANCELLED" ||
        sgDayKey(a.createdAt).slice(0, 7) !== month
      )
        continue;
      monthlyByTaker.set(
        a.takerId,
        (monthlyByTaker.get(a.takerId) ?? 0) + Number(a.allocatedKg),
      );
    }
    const liveAllocations = (related.allocations ?? []).filter(
      (a) => a.status !== "CANCELLED",
    );
    const topUpKg = (batch.topUps ?? []).reduce((s, t) => s + t.kg, 0);
    return {
      monthlyByTaker,
      activity: deriveActivity({
        batch,
        claims: related.claims,
        allocations: related.allocations,
        handovers: related.handovers,
      }),
      steps: batchWaterfallSteps({
        pool: batch.pool,
        totalDetail: `Weighed on ${formatFullDate(batch.harvestDate)}${topUpKg > 0 ? ` · incl. ${formatKg(topUpKg)}kg top-up` : ""}`,
        bulkDetail: liveAllocations.length
          ? `${liveAllocations.length} bulk taker${liveAllocations.length === 1 ? "" : "s"} · ${liveAllocations
              .map(
                (a) => `${a.taker.name} ${formatKg(Number(a.allocatedKg))}kg`,
              )
              .join(", ")}`
          : "No bulk allocations yet",
      }),
      pendingClaims:
        related.claims?.filter((c) => c.status === "PENDING").length ?? null,
      approvedClaims:
        related.claims?.filter((c) => c.status === "APPROVED").length ?? 0,
      openAllocations: (related.allocations ?? []).filter(
        (a) => a.status === "PLANNED" || a.status === "CONFIRMED",
      ).length,
      upcomingSlots:
        related.slots?.filter(
          (s) =>
            s.status !== "CANCELLED" &&
            new Date(s.endTime).getTime() > loadedAt,
        ).length ?? null,
    };
  }, [ready]);

  async function publish(batch: Batch) {
    setPublishing(true);
    try {
      const updated = await api.post<Batch>(`/batches/${batch.id}/publish`);
      setFlash({
        tone: "success",
        text: `Batch ${batch.reference} published · takers can now claim ${formatKg(Math.max(0, updated.pool.kgRemaining))}kg`,
      });
      await reload();
    } catch (err) {
      setFlash({ tone: "error", text: friendlyError(err) });
    } finally {
      setPublishing(false);
    }
  }

  if (load.kind === "loading") return <DetailSkeleton />;
  if (load.kind === "notfound") return <NotFound />;
  if (load.kind === "error" || !ready || !derived) {
    return (
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
          We couldn’t load this batch. Check your connection and try again.
        </p>
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
    );
  }

  const { batch, related, loadedAt } = ready;
  const tabs: { key: TabKey; label: string; count?: number | null }[] = [
    { key: "overview", label: "Overview" },
    {
      key: "allocations",
      label: "Allocations",
      count: related.allocations?.length ?? null,
    },
    { key: "claims", label: "Claims", count: related.claims?.length ?? null },
    { key: "pickups", label: "Pickups", count: related.slots?.length ?? null },
    {
      key: "handovers",
      label: "Handovers",
      count: related.handovers?.length ?? null,
    },
  ];
  const listFailed = <T,>(
    rows: T[] | null,
    what: string,
    render: (rows: T[]) => React.ReactNode,
  ) =>
    rows ? (
      render(rows)
    ) : (
      <TabError what={what} onRetry={() => void reload()} />
    );

  const flashToast =
    flash === "published"
      ? {
          tone: "success" as const,
          text: `Batch ${batch.reference} published · takers can now claim ${formatKg(Math.max(0, batch.pool.kgRemaining))}kg`,
        }
      : flash;

  return (
    <div className="flex flex-col gap-7">
      <BatchHeader
        batch={batch}
        publishing={publishing}
        onEdit={() => {
          setTab("overview");
          requestAnimationFrame(() =>
            document.getElementById("e-harvest")?.focus(),
          );
        }}
        onPublish={() => void publish(batch)}
        onTopUp={() => setSheet("topup")}
        onClose={() => setSheet("close")}
        onComplete={() => setSheet("complete")}
        onDelete={() => setSheet("delete")}
        deleteBlockedReason={deleteBlockedReason(batch, related)}
      />

      <Panel
        title="Where the kg goes"
        description="Total → public pool → remaining · hover a step for details"
      >
        <KgWaterfall steps={derived.steps} />
      </Panel>

      <section aria-label="Batch sections" className="flex flex-col gap-5">
        <div
          role="tablist"
          aria-label="Batch sections"
          className="flex gap-7 overflow-x-auto shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]"
        >
          {tabs.map((t) => {
            const selected = tab === t.key;
            return (
              <button
                key={t.key}
                id={`tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="batch-tabpanel"
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex h-12 shrink-0 items-center gap-2 px-1 text-[15px]",
                  selected
                    ? "font-bold text-deep shadow-[inset_0_-3px_0_var(--color-leaf)]"
                    : "font-medium text-muted hover:text-deep",
                )}
              >
                {t.label}
                {t.key !== "overview" && (
                  <span
                    className={cn(
                      "h-5 min-w-[22px] rounded-full px-1.5 text-center text-xs font-bold leading-5",
                      selected ? "bg-leaf text-cream" : "bg-track text-muted",
                    )}
                  >
                    {t.count ?? "–"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div id="batch-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "overview" && (
            <OverviewTab
              batch={batch}
              activity={derived.activity}
              now={loadedAt}
              onSaved={done}
            />
          )}
          {tab === "allocations" &&
            listFailed(related.allocations, "allocations", (rows) => (
              <AllocationsTab
                batch={batch}
                allocations={rows}
                monthlyByTaker={derived.monthlyByTaker}
                onChanged={done}
                onError={(text) => setFlash({ tone: "error", text })}
              />
            ))}
          {tab === "claims" &&
            listFailed(related.claims, "claims", (rows) => (
              <ClaimsTab batch={batch} claims={rows} now={loadedAt} />
            ))}
          {tab === "pickups" &&
            listFailed(related.slots, "pickup slots", (rows) => (
              <PickupsTab batch={batch} slots={rows} now={loadedAt} />
            ))}
          {tab === "handovers" &&
            listFailed(related.handovers, "handovers", (rows) => (
              <HandoversTab
                batch={batch}
                handovers={rows}
                approvedClaims={derived.approvedClaims}
                openAllocations={derived.openAllocations}
              />
            ))}
        </div>
      </section>

      {sheet === "topup" && (
        <TopUpSheet
          batch={batch}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}
      {sheet === "close" && (
        <CloseClaimingSheet
          batch={batch}
          pendingClaims={derived.pendingClaims}
          upcomingSlots={derived.upcomingSlots}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}
      {sheet === "delete" && (
        <DeleteBatchSheet
          batch={batch}
          onClose={() => setSheet(null)}
          onDone={() =>
            router.push(
              `/manager/batches?deleted=${encodeURIComponent(batch.reference)}`,
            )
          }
        />
      )}
      {sheet === "complete" && (
        <CompleteSheet
          batch={batch}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}

      {flashToast && (
        <Toast
          tone={flashToast.tone}
          onDismiss={() => setFlash(null)}
          duration={flashToast.tone === "success" ? 5000 : 0}
        >
          {flashToast.text}
        </Toast>
      )}
    </div>
  );
}

/** Mirrors the backend rule so the menu can say why before you try; the backend still decides. */
function deleteBlockedReason(batch: Batch, related: Related): string | null {
  if (batch.status === "COMPLETED")
    return "Completed batches are kept for the records";
  const parts = [
    related.claims?.length &&
      `${related.claims.length} claim${related.claims.length === 1 ? "" : "s"}`,
    related.allocations?.length &&
      `${related.allocations.length} allocation${related.allocations.length === 1 ? "" : "s"}`,
    related.slots?.length &&
      `${related.slots.length} pickup slot${related.slots.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? `Has ${parts.join(", ")}` : null;
}

function TabError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
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
        We couldn’t load the {what} for this batch.
      </p>
      <div>
        <Button
          variant="secondary"
          size="sm"
          className="bg-cream"
          icon={<ArrowClockwise size={18} weight="bold" />}
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-12 text-center shadow-card">
      <EmptyPot width={160} />
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        Batch not found
      </h2>
      <p className="max-w-[420px] text-body text-muted">
        We couldn’t find this batch. It may have been deleted, or the link is
        wrong.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2.5">
        <Button href="/manager/batches" size="sm" className="px-[18px]">
          Back to batches
        </Button>
        <Button
          href="/manager/batches#b-q"
          variant="secondary"
          size="sm"
          className="px-[18px]"
          icon={<MagnifyingGlass size={18} />}
        >
          Search batches
        </Button>
      </div>
    </div>
  );
}

/** Board "Batch detail · loading". */
function DetailSkeleton() {
  const card = "flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card";
  return (
    <div aria-busy="true" className="flex flex-col gap-7">
      <LoadingLabel>Loading batch…</LoadingLabel>
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-[18px] w-full max-w-[520px]" />
      </div>
      <div aria-hidden className={cn(card, "min-h-[330px]")}>
        <Skeleton className="h-[22px] w-1/5" />
        <Skeleton className="h-3.5 w-2/5" />
        <div className="flex h-60 shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.18)]">
          {[220, 60, 50, 150, 50, 110].map((h, i) => (
            <div key={i} className="flex flex-1 items-end justify-center">
              <Skeleton
                className="w-[min(72px,70%)] rounded-md"
                style={{ height: h }}
              />
            </div>
          ))}
        </div>
      </div>
      <div
        aria-hidden
        className="flex gap-7 pb-3.5 shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[18px] w-[90px]" />
        ))}
      </div>
      <div
        aria-hidden
        className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]"
      >
        <div className={cn(card, "min-h-[360px]")}>
          <Skeleton className="h-[22px] w-1/4" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex gap-10">
              <Skeleton className="h-4 w-[140px]" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          ))}
        </div>
        <div className={cn(card, "min-h-[360px]")}>
          <Skeleton className="h-[22px] w-[35%]" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[34px] w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
