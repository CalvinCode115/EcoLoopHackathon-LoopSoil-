"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { HandPointing } from "@phosphor-icons/react/dist/ssr/HandPointing";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ClaimDetail,
  type ClaimContext,
} from "@/components/manager/claims/claim-detail";
import {
  ClaimQueue,
  type ClaimFlag,
} from "@/components/manager/claims/claim-queue";
import {
  BulkApproveSheet,
  type BulkPreview,
} from "@/components/manager/claims/claim-sheets";
import { isOverdue } from "@/components/manager/claims/claim-utils";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { cn } from "@/lib/cn";
import { sgDayKey } from "@/lib/format";
import type { Batch, Claim, ClaimStatusValue, Handover } from "@/lib/types";

type Tab = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "COLLECTED";
const TABS: { key: Tab; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "COLLECTED", label: "Collected" },
];
const ALL = "pageSize=100";

interface Data {
  claims: Claim[];
  counts: Record<Tab, number>;
  overdue: number;
  /** Batch id → batch (filter options + live pools). */
  batches: Map<string, Batch>;
  /** Taker id → no-shows so far (queue flags). */
  noShows: Map<string, number>;
  loadedAt: number;
}

type Load =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data };

async function fetchQueue(tab: Tab, batchId: string): Promise<Load> {
  const b = batchId ? `&batchId=${batchId}` : "";
  const page = (path: string) => api.get<Paginated<Claim>>(path);
  try {
    const [list, approved, cancelled, batches, ...totals] = await Promise.all([
      page(`/claims?status=${tab}${b}&${ALL}`),
      page(`/claims?status=APPROVED${b}&${ALL}`),
      page(`/claims?status=CANCELLED&${ALL}`),
      api.get<Paginated<Batch>>(`/batches?${ALL}`),
      ...TABS.map((t) => page(`/claims?status=${t.key}${b}&pageSize=1`)),
    ]);
    const loadedAt = Date.now();
    const noShows = new Map<string, number>();
    for (const c of cancelled.data) {
      if (c.booking?.status === "NO_SHOW" && c.taker)
        noShows.set(c.taker.id, (noShows.get(c.taker.id) ?? 0) + 1);
    }
    return {
      kind: "ready",
      data: {
        claims: list.data,
        counts: Object.fromEntries(
          TABS.map((t, i) => [t.key, totals[i].meta.total]),
        ) as Record<Tab, number>,
        overdue: approved.data.filter((c) => isOverdue(c, loadedAt)).length,
        batches: new Map(batches.data.map((x) => [x.id, x])),
        noShows,
        loadedAt,
      },
    };
  } catch {
    return { kind: "error" };
  }
}

/**
 * Manager · Claims review (/manager/claims) — boards "Claims · pending / approved /
 * overdue / collected / rejected / cancelled / reject / bulk / bulk confirm / busy / error /
 * success / stock / unapproved taker / none selected / empty / loading". Split view: queue
 * on the left, the selected claim on the right. `?batchId=` pre-filters, `?claim=` opens one.
 */
export default function ManagerClaimsPage() {
  return (
    <Suspense fallback={<ClaimsSkeleton />}>
      <Keyed />
    </Suspense>
  );
}

function ClaimsReview() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [batchId, setBatchId] = useState(() => params.get("batchId") ?? "");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    params.get("claim"),
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkPreview[] | null>(null);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
    retry?: () => void;
  } | null>(null);
  const [context, setContext] = useState<{
    id: string;
    value: ClaimContext;
  } | null>(null);

  // `?claim=` from Batch detail: open that claim's tab.
  useEffect(() => {
    const id = params.get("claim");
    if (!id) return;
    api
      .get<Claim>(`/claims/${id}`)
      .then((c) => {
        const status = c.status as ClaimStatusValue;
        setTab(status === "PENDING" ? "PENDING" : (status as Tab));
        setSort(status === "PENDING" ? "oldest" : "newest");
      })
      .catch(() => setSelectedId(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(
    async () => setLoad(await fetchQueue(tab, batchId)),
    [tab, batchId],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchQueue(tab, batchId).then((next) => !cancelled && setLoad(next));
    return () => {
      cancelled = true;
    };
  }, [tab, batchId]);

  const data = load.kind === "ready" ? load.data : null;
  const now = data?.loadedAt ?? 0;

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const rows = data.claims.filter((c) => {
      if (overdueOnly && !isOverdue(c, now)) return false;
      if (
        q &&
        !c.reference.toLowerCase().includes(q) &&
        !(c.taker?.name ?? "").toLowerCase().includes(q)
      )
        return false;
      const day = sgDayKey(c.submittedAt);
      if (from && day < from) return false;
      if (until && day > until) return false;
      return true;
    });
    return rows.sort((a, b) =>
      sort === "oldest"
        ? a.submittedAt.localeCompare(b.submittedAt)
        : b.submittedAt.localeCompare(a.submittedAt),
    );
  }, [data, query, from, until, sort, overdueOnly, now]);

  const flags = useMemo(() => {
    const map = new Map<string, ClaimFlag[]>();
    if (!data) return map;
    for (const c of data.claims) {
      const f: ClaimFlag[] = [];
      const pool = data.batches.get(c.batchId)?.pool;
      if (c.status === "PENDING" && pool && pool.kgRemaining < 0)
        f.push({ label: "Exceeds remaining stock", tone: "red" });
      if (c.status === "PENDING" && c.taker && c.taker.status !== "APPROVED")
        f.push({ label: "Taker not yet approved", tone: "red" });
      const ns = c.taker ? (data.noShows.get(c.taker.id) ?? 0) : 0;
      if (ns > 0)
        f.push({
          label: `Has ${ns} previous no-show${ns === 1 ? "" : "s"}`,
          tone: "amber",
        });
      map.set(c.id, f);
    }
    return map;
  }, [data]);

  const selected = visible.find((c) => c.id === selectedId) ?? null;

  // Load the selected claim's context: taker history, batch pool, handover (collected).
  useEffect(() => {
    if (!selected || !selected.taker) return;
    let cancelled = false;
    const takerId = selected.taker.id;
    Promise.all([
      api.get<Paginated<Claim>>(`/claims?takerId=${takerId}&${ALL}`).then(
        (p) => p.data,
        () => null,
      ),
      selected.status === "COLLECTED"
        ? api
            .get<Paginated<Handover>>(
              `/handovers?takerId=${takerId}&batchId=${selected.batchId}&${ALL}`,
            )
            .then(
              (p) =>
                p.data.find(
                  (h) =>
                    h.sourceReference === selected.reference && !h.undoneAt,
                ) ?? null,
              () => null,
            )
        : Promise.resolve(null),
    ]).then(([history, handover]) => {
      if (!cancelled)
        setContext({
          id: selected.id,
          value: { pool: null, history, handover },
        });
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  function switchTab(next: Tab, opts?: { overdue?: boolean }) {
    setTab(next);
    setOverdueOnly(!!opts?.overdue);
    setSort(next === "PENDING" ? "oldest" : "newest");
    setChecked(new Set());
    setSelectedId(null);
    if (next !== tab) setLoad({ kind: "loading" });
  }

  async function afterAction(message: string, opts?: { advance?: boolean }) {
    // Move to the next claim in the queue (or the previous one at the end).
    if (opts?.advance && selected) {
      const i = visible.findIndex((c) => c.id === selected.id);
      setSelectedId((visible[i + 1] ?? visible[i - 1])?.id ?? null);
    }
    setToast({ tone: "success", text: message });
    await refresh();
  }

  const selectedContext: ClaimContext = {
    pool: selected ? (data?.batches.get(selected.batchId)?.pool ?? null) : null,
    history:
      context && selected && context.id === selected.id
        ? context.value.history
        : null,
    handover:
      context && selected && context.id === selected.id
        ? context.value.handover
        : null,
  };

  const checkedClaims = visible.filter((c) => checked.has(c.id));
  const summary =
    tab === "PENDING"
      ? `${visible.length} pending · ${sort === "oldest" ? "oldest" : "newest"} first`
      : overdueOnly
        ? `${visible.length} overdue · past deadline`
        : `${visible.length} ${TABS.find((t) => t.key === tab)!.label.toLowerCase()} · ${sort === "oldest" ? "oldest" : "newest"} first`;

  const filtersActive = !!(batchId || from || until || query);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display m-0 text-[32px] font-semibold leading-10 text-deep">
            Claims
          </h1>
          {data && data.counts.PENDING > 0 && (
            <span className="h-7 min-w-7 rounded-full bg-amber-tint px-2.5 text-center text-small font-bold leading-7 text-amber-ink">
              {data.counts.PENDING} pending
            </span>
          )}
        </div>
        <div
          role="group"
          aria-label="Quick filters"
          className="flex flex-wrap gap-3"
        >
          <QuickFilter
            label="Pending"
            hint="Waiting for review"
            count={data?.counts.PENDING}
            icon={<Clock size={18} weight="bold" />}
            iconClass="bg-amber-tint text-amber-ink"
            pressed={tab === "PENDING"}
            onClick={() => switchTab("PENDING")}
          />
          <QuickFilter
            label="Approved"
            hint="Awaiting collection"
            count={data?.counts.APPROVED}
            icon={<CheckCircle size={18} weight="bold" />}
            iconClass="bg-sage text-deep"
            pressed={tab === "APPROVED" && !overdueOnly}
            onClick={() => switchTab("APPROVED")}
          />
          <QuickFilter
            label="Overdue"
            hint="Past collection deadline"
            count={data?.overdue}
            icon={<WarningCircle size={18} weight="bold" />}
            iconClass="bg-danger-tint text-danger-ink"
            countClass={
              data && data.overdue > 0 ? "text-danger-ink" : undefined
            }
            pressed={overdueOnly}
            onClick={() => switchTab("APPROVED", { overdue: true })}
          />
        </div>
      </div>

      <section className="flex min-w-0 flex-col gap-4 rounded-card bg-cream p-5 shadow-card">
        <div
          role="tablist"
          aria-label="Claim status"
          className="flex gap-7 overflow-x-auto shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]"
        >
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => switchTab(t.key)}
                className={cn(
                  "inline-flex h-12 shrink-0 items-center gap-2 px-1 text-[15px]",
                  on
                    ? "font-bold text-deep shadow-[inset_0_-3px_0_var(--color-leaf)]"
                    : "font-medium text-muted hover:text-deep",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "h-5 min-w-[22px] rounded-full px-1.5 text-center text-xs font-bold leading-5",
                    on ? "bg-leaf text-cream" : "bg-track text-muted",
                  )}
                >
                  {data ? data.counts[t.key] : "–"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Batch"
            value={batchId}
            onChange={setBatchId}
            width="w-[180px]"
          >
            <option value="">All batches</option>
            {data &&
              [...data.batches.values()]
                .filter((b) => b.status !== "DRAFT")
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.reference}
                  </option>
                ))}
          </FilterSelect>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Submitted</span>
            <div className="flex items-center gap-2">
              <DateBox label="Submitted from" value={from} onChange={setFrom} />
              <span className="text-muted">–</span>
              <DateBox
                label="Submitted until"
                value={until}
                onChange={setUntil}
              />
            </div>
          </div>
          <div className="flex min-w-[220px] grow flex-col gap-1.5">
            <label htmlFor="c-q" className="text-[13px] font-semibold">
              Search
            </label>
            <div className="flex h-11 items-center gap-2 rounded-control bg-surface px-3 shadow-[inset_0_0_0_1px_var(--color-edge)] focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(var(--rgb-leaf),0.25)]">
              <MagnifyingGlass size={16} className="text-muted" aria-hidden />
              <input
                id="c-q"
                type="search"
                placeholder="Reference or taker name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 border-none bg-transparent text-small text-ink outline-none"
              />
            </div>
          </div>
          <FilterSelect
            label="Sort"
            value={sort}
            onChange={(v) => setSort(v as "oldest" | "newest")}
            width="w-[150px]"
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </FilterSelect>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setBatchId("");
                setFrom("");
                setUntil("");
                setQuery("");
              }}
              className="inline-flex h-11 items-center text-small font-bold text-deep underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {load.kind === "loading" && <QueueSkeleton />}
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
            We couldn’t load the claims. Check your connection and try again.
          </p>
          <div>
            <Button
              variant="secondary"
              size="sm"
              className="bg-cream"
              icon={<ArrowClockwise size={18} weight="bold" />}
              onClick={() => {
                setLoad({ kind: "loading" });
                void refresh();
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
      {data && visible.length === 0 && (
        <EmptyQueue
          tab={tab}
          overdueOnly={overdueOnly}
          filtered={filtersActive && data.claims.length > 0}
          onViewApproved={() => switchTab("APPROVED")}
        />
      )}
      {data && visible.length > 0 && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
          <ClaimQueue
            claims={visible}
            summary={summary}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            selectable={tab === "PENDING"}
            checked={checked}
            onToggle={(id) =>
              setChecked((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={() =>
              setChecked((prev) =>
                prev.size > 0 ? new Set() : new Set(visible.map((c) => c.id)),
              )
            }
            flags={flags}
            now={now}
            bulkBar={
              tab === "PENDING"
                ? {
                    count: checkedClaims.length,
                    kg: checkedClaims.reduce(
                      (s, c) => s + Number(c.requestedKg),
                      0,
                    ),
                    onApprove: () =>
                      setBulk(
                        checkedClaims.map((c) => ({
                          claim: c,
                          skipReason:
                            c.taker?.status !== "APPROVED"
                              ? "taker not yet approved."
                              : (data.batches.get(c.batchId)?.pool
                                    .kgRemaining ?? 0) < 0
                                ? `not enough left in ${c.batch?.reference}.`
                                : null,
                        })),
                      ),
                    onClear: () => setChecked(new Set()),
                  }
                : null
            }
          />
          {selected ? (
            <ClaimDetail
              key={selected.id}
              claim={selected}
              context={selectedContext}
              flags={flags.get(selected.id) ?? []}
              now={now}
              onDone={(msg, opts) => void afterAction(msg, opts)}
            />
          ) : (
            <section
              aria-label="Claim detail"
              className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-card bg-cream p-10 text-center shadow-card"
            >
              <HandPointing size={40} className="text-leaf" aria-hidden />
              <h2 className="font-display m-0 text-[22px] font-semibold text-deep">
                Select a claim to review
              </h2>
              <p className="max-w-[340px] text-small text-muted">
                Pick a claim from the queue on the left. Tip: use ↑ ↓ to move
                and Enter to open.
              </p>
            </section>
          )}
        </div>
      )}

      {bulk && (
        <BulkApproveSheet
          items={bulk}
          onClose={() => setBulk(null)}
          onDone={({ approved, skipped }) => {
            setBulk(null);
            setChecked(new Set(skipped.map((s) => s.claimId)));
            setToast({
              tone: skipped.length ? "error" : "success",
              text: skipped.length
                ? `${approved} approved, ${skipped.length} skipped: ${skipped[0].reason}`
                : `${approved} claim${approved === 1 ? "" : "s"} approved.`,
            });
            void refresh();
          }}
        />
      )}

      {toast && (
        <Toast
          tone={toast.tone}
          onDismiss={() => setToast(null)}
          duration={toast.tone === "success" ? 5000 : 0}
        >
          {toast.text}
        </Toast>
      )}
    </div>
  );
}

function QuickFilter({
  label,
  hint,
  count,
  icon,
  iconClass,
  countClass,
  pressed,
  onClick,
}: {
  label: string;
  hint: string;
  count: number | undefined;
  icon: ReactNode;
  iconClass: string;
  countClass?: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-[14px] bg-cream py-2.5 pl-3 pr-4 text-left text-ink shadow-card hover:bg-sage",
        pressed &&
          "shadow-[inset_0_0_0_2px_var(--color-leaf),0_1px_2px_rgba(var(--rgb-shade),0.06),0_8px_24px_rgba(var(--rgb-shade),0.08)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-9 items-center justify-center rounded-full",
          iconClass,
        )}
      >
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[13px] font-bold">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </span>
      <span
        className={cn(
          "font-display ml-2 text-[26px] font-semibold leading-[30px] text-deep",
          countClass,
        )}
      >
        {count ?? "–"}
      </span>
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  width,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  width: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold" aria-hidden>
        {label}
      </span>
      <div className={cn("relative", width)}>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full cursor-pointer appearance-none rounded-control border-none bg-surface pl-3 pr-9 text-small text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(var(--rgb-leaf),0.25)]"
        >
          {children}
        </select>
        <CaretDown
          size={16}
          className="pointer-events-none absolute right-2.5 top-3.5 text-muted"
          aria-hidden
        />
      </div>
    </div>
  );
}

function DateBox({
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
      className="h-11 rounded-control bg-surface px-3 text-small text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(var(--rgb-leaf),0.25)]"
    />
  );
}

function EmptyQueue({
  tab,
  overdueOnly,
  filtered,
  onViewApproved,
}: {
  tab: Tab;
  overdueOnly: boolean;
  filtered: boolean;
  onViewApproved: () => void;
}) {
  if (filtered) {
    return (
      <div className="rounded-card bg-cream p-10 text-center text-body text-muted shadow-card">
        No claims match these filters.
      </div>
    );
  }
  const pending = tab === "PENDING";
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-12 text-center shadow-card">
      <span className="flex size-[88px] items-center justify-center rounded-full bg-sage text-leaf">
        <CheckCircle size={44} weight="fill" aria-hidden />
      </span>
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        {pending
          ? "All caught up"
          : overdueOnly
            ? "Nothing overdue"
            : `No ${tab.toLowerCase()} claims`}
      </h2>
      <p className="text-body text-muted">
        {pending
          ? "No claims waiting for review."
          : overdueOnly
            ? "Every approved claim is still inside its collection window."
            : "Claims will show here as they move through review."}
      </p>
      {pending && (
        <div className="mt-2 flex flex-wrap justify-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            className="px-[18px]"
            onClick={onViewApproved}
          >
            View approved claims
          </Button>
          <Button
            href="/manager"
            variant="secondary"
            size="sm"
            className="px-[18px]"
          >
            Go to dashboard
          </Button>
        </div>
      )}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
      <LoadingLabel>Loading claims…</LoadingLabel>
      <div
        aria-hidden
        className="flex flex-col rounded-card bg-cream shadow-card"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2 px-4 py-3.5 shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]"
          >
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-3 w-40" />
            <div className="flex justify-between">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className="flex min-h-[480px] flex-col gap-4 rounded-card bg-cream p-6 shadow-card"
      >
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-2/3" />
        ))}
        <Skeleton className="mt-auto h-24 w-full" />
      </div>
    </div>
  );
}

function ClaimsSkeleton() {
  return (
    <div className="flex flex-col gap-7">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-36 w-full rounded-card" />
      <QueueSkeleton />
    </div>
  );
}

/** Remount when ?claim= changes, so opening another one from the sidebar search selects it. */
function Keyed() {
  const params = useSearchParams();
  return <ClaimsReview key={params.get("claim") ?? ""} />;
}
