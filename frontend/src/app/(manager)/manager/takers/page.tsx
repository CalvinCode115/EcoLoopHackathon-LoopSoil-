"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Prohibit } from "@phosphor-icons/react/dist/ssr/Prohibit";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { UserCheck } from "@phosphor-icons/react/dist/ssr/UserCheck";
import { UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";
import { Users } from "@phosphor-icons/react/dist/ssr/Users";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { EmptyPot, Sprout } from "@/components/brand/illustrations";
import { formatElapsed } from "@/components/manager/claims/claim-utils";
import {
  DataTable,
  ProgressBar,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import {
  TAKER_STATUS,
  TakerDrawer,
} from "@/components/manager/takers/taker-drawer";
import {
  BulkTakerSheet,
  DeclineSheet,
  SuspendSheet,
} from "@/components/manager/takers/taker-sheets";
import { ActionMenu } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { api, type Paginated } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatClock,
  formatDayMonth,
  formatFullDate,
  formatKg,
  sgDayKey,
} from "@/lib/format";
import { TAKER_CATEGORY_LABEL, friendlyError } from "@/lib/labels";
import type { TakerRecord } from "@/lib/types";
import { useLoad } from "@/lib/use-load";

type Tab = "awaiting" | "individuals" | "bulk" | "suspended";
const TABS: { key: Tab; label: string; query: string }[] = [
  {
    key: "awaiting",
    label: "Awaiting approval",
    query: "type=INDIVIDUAL&status=PENDING",
  },
  { key: "individuals", label: "Individuals", query: "type=INDIVIDUAL" },
  { key: "bulk", label: "Bulk", query: "type=BULK" },
  { key: "suspended", label: "Suspended", query: "status=SUSPENDED" },
];
const PAGE = 25;

type SheetState =
  | { kind: "decline"; taker: TakerRecord }
  | { kind: "suspend"; taker: TakerRecord }
  | { kind: "bulk"; taker?: TakerRecord }
  | null;

/**
 * Manager · Takers (/manager/takers) — boards "Takers · awaiting / approving / decline /
 * individuals / menu / bulk / bulk menu / add bulk / errors / drawer (individual,
 * handovers, bulk) / suspend / suspended / empty / no results / loading / toasts".
 * Vetting queue, individuals and bulk partners with their stats, suspensions. `?taker=`
 * opens someone's drawer (links from Claims and Handover).
 */
export default function ManagerTakersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Takers />
    </Suspense>
  );
}

function Takers() {
  const params = useSearchParams();
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("awaiting");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");
  const [noShowsOnly, setNoShowsOnly] = useState(false);
  const [category, setCategory] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [drawerId, setDrawerId] = useState<string | null>(() =>
    params.get("taker"),
  );
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
    action?: ReactNode;
  } | null>(null);

  // Success toasts clear themselves after 5 seconds; errors stay until dismissed.
  useEffect(() => {
    if (toast?.tone !== "success") return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  // Debounce the search box into the query.
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const counts = useLoad(`counts-${refresh}`, async () => {
    const totals = await Promise.all(
      TABS.map((t) =>
        api.get<Paginated<TakerRecord>>(`/takers?${t.query}&pageSize=1`),
      ),
    );
    return Object.fromEntries(
      TABS.map((t, i) => [t.key, totals[i].meta.total]),
    ) as Record<Tab, number>;
  });
  const tabDef = TABS.find((t) => t.key === tab)!;
  const list = useLoad(`list-${tab}-${q}-${refresh}`, () =>
    api.get<Paginated<TakerRecord>>(
      `/takers?${tabDef.query}&pageSize=100${q ? `&search=${encodeURIComponent(q)}` : ""}`,
    ),
  );
  const drawer = useLoad(`drawer-${drawerId ?? "none"}-${refresh}`, () =>
    drawerId
      ? api.get<TakerRecord>(`/takers/${drawerId}`)
      : Promise.resolve(null),
  );

  const done = (text: string, action?: ReactNode) => {
    setSheet(null);
    setSelected(new Set());
    setToast({ tone: "success", text, action });
    setRefresh((n) => n + 1);
  };
  const fail = (err: unknown) =>
    setToast({
      tone: "error",
      text: friendlyError(err, "Couldn’t update this taker. Please try again."),
    });

  async function approve(ids: string[], names: string[]) {
    setBusy(ids.length === 1 ? ids[0] : "bulk");
    try {
      for (const id of ids) await api.post(`/takers/${id}/approve`, {});
      done(
        ids.length === 1
          ? `${names[0]} approved`
          : `${ids.length} takers approved`,
      );
    } catch (err) {
      fail(err);
      setRefresh((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  async function reinstate(t: TakerRecord) {
    setBusy(t.id);
    try {
      await api.post(`/takers/${t.id}/reinstate`, {});
      done(`${t.name} reinstated`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  const rows = (list.status === "ready" ? list.data.data : []).filter((t) => {
    if (tab === "individuals") {
      if (status && t.status !== status) return false;
      if (noShowsOnly && !(t.stats && t.stats.noShows > 0)) return false;
      const day = t.createdAt ? sgDayKey(t.createdAt) : "";
      if (joinedFrom && day < joinedFrom) return false;
      if (joinedTo && day > joinedTo) return false;
    }
    if (tab === "bulk" && category && t.category !== category) return false;
    return true;
  });
  const ordered =
    tab === "awaiting"
      ? [...rows].sort((a, b) =>
          (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
        )
      : tab === "individuals"
        ? [...rows].sort(
            (a, b) => (b.stats?.collectedKg ?? 0) - (a.stats?.collectedKg ?? 0),
          )
        : rows;
  const monthLabel = new Date(now).toLocaleDateString("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

  const summary: { key: Tab; label: string; icon: ReactNode; tone: string }[] =
    [
      {
        key: "awaiting",
        label: "Awaiting approval",
        icon: <UserPlus size={18} weight="bold" />,
        tone: "bg-amber-tint text-amber-ink",
      },
      {
        key: "individuals",
        label: "Individuals",
        icon: <Users size={18} weight="bold" />,
        tone: "bg-sage text-deep",
      },
      {
        key: "bulk",
        label: "Bulk partners",
        icon: <Truck size={18} weight="bold" />,
        tone: "bg-[#EAD9C6] text-[#7A5A3C]",
      },
      {
        key: "suspended",
        label: "Suspended",
        icon: <Prohibit size={18} weight="bold" />,
        tone: "bg-danger-tint text-danger-ink",
      },
    ];

  function switchTab(t: Tab) {
    setTab(t);
    setShown(PAGE);
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display m-0 text-[32px] font-semibold leading-10 text-deep">
          Takers
        </h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-11 w-[300px] max-w-full items-center gap-2 rounded-control bg-white px-3 shadow-[inset_0_0_0_1px_var(--color-edge)] focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(79,122,58,0.25)]">
            <MagnifyingGlass size={16} className="text-muted" aria-hidden />
            <input
              type="search"
              aria-label="Search takers"
              placeholder="Search name, email or phone"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(PAGE);
              }}
              className="min-w-0 grow border-none bg-transparent text-small outline-none"
            />
          </div>
          <Button
            size="sm"
            className="px-[18px]"
            icon={<Plus size={18} weight="bold" />}
            onClick={() => setSheet({ kind: "bulk" })}
          >
            Add bulk taker
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {summary.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={tab === s.key}
            onClick={() => switchTab(s.key)}
            className={cn(
              "flex items-center gap-3 rounded-[14px] bg-cream py-2.5 pl-2.5 pr-4 text-left shadow-card hover:bg-sage",
              tab === s.key &&
                "shadow-[inset_0_0_0_2px_var(--color-leaf),0_1px_2px_rgba(47,74,36,0.06),0_8px_24px_rgba(47,74,36,0.08)]",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                s.tone,
              )}
            >
              {s.icon}
            </span>
            <span className="grow text-small font-bold">{s.label}</span>
            <span className="font-display text-2xl font-semibold text-deep">
              {counts.status === "ready" ? counts.data[s.key] : "–"}
            </span>
          </button>
        ))}
      </div>

      <section className="flex min-w-0 flex-col gap-4 rounded-card bg-cream p-5 shadow-card">
        <div
          role="tablist"
          aria-label="Taker groups"
          className="flex gap-7 overflow-x-auto shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => switchTab(t.key)}
              className={cn(
                "inline-flex h-12 shrink-0 items-center gap-2 px-1 text-[15px]",
                tab === t.key
                  ? "font-bold text-deep shadow-[inset_0_-3px_0_var(--color-leaf)]"
                  : "font-medium text-muted hover:text-deep",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "h-5 min-w-[22px] rounded-full px-1.5 text-center text-xs font-bold leading-5",
                  tab === t.key
                    ? "bg-leaf text-cream"
                    : "bg-[#ECE6D8] text-muted",
                )}
              >
                {counts.status === "ready" ? counts.data[t.key] : "–"}
              </span>
            </button>
          ))}
        </div>

        {tab === "individuals" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-11 rounded-control bg-white px-3 text-small shadow-[inset_0_0_0_1px_var(--color-edge)]"
              >
                <option value="">All statuses</option>
                {Object.entries(TAKER_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Joined
              <span className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Joined from"
                  value={joinedFrom}
                  onChange={(e) => setJoinedFrom(e.target.value)}
                  className="h-11 rounded-control bg-white px-3 text-small shadow-[inset_0_0_0_1px_var(--color-edge)]"
                />
                <span className="text-muted">–</span>
                <input
                  type="date"
                  aria-label="Joined until"
                  value={joinedTo}
                  onChange={(e) => setJoinedTo(e.target.value)}
                  className="h-11 rounded-control bg-white px-3 text-small shadow-[inset_0_0_0_1px_var(--color-edge)]"
                />
              </span>
            </div>
            <label className="inline-flex h-11 items-center gap-2 text-small font-semibold">
              <input
                type="checkbox"
                checked={noShowsOnly}
                onChange={(e) => setNoShowsOnly(e.target.checked)}
                className="size-4 accent-[var(--color-leaf)]"
              />
              Has no-shows
            </label>
          </div>
        )}
        {tab === "bulk" && (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-11 rounded-control bg-white px-3 text-small shadow-[inset_0_0_0_1px_var(--color-edge)]"
              >
                <option value="">All categories</option>
                {Object.entries(TAKER_CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {list.status === "ready" && (
              <span className="text-small text-muted">
                {ordered.length} bulk partner{ordered.length === 1 ? "" : "s"} ·{" "}
                {monthLabel}
              </span>
            )}
          </div>
        )}

        {list.status === "loading" && <TableSkeleton />}
        {list.status === "error" && (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 py-8 text-center"
          >
            <p className="font-semibold text-danger-ink">
              Couldn’t load takers.
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowClockwise size={16} weight="bold" />}
              onClick={list.reload}
            >
              Retry
            </Button>
          </div>
        )}
        {list.status === "ready" && ordered.length === 0 && (
          <Empty
            tab={tab}
            query={q}
            onClear={() => {
              setSearch("");
              setQ("");
            }}
            onAdd={() => setSheet({ kind: "bulk" })}
          />
        )}

        {list.status === "ready" &&
          ordered.length > 0 &&
          tab === "awaiting" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-small font-semibold">
                  <input
                    type="checkbox"
                    checked={
                      selected.size > 0 && selected.size === ordered.length
                    }
                    onChange={() =>
                      setSelected((s) =>
                        s.size === ordered.length
                          ? new Set()
                          : new Set(ordered.map((t) => t.id)),
                      )
                    }
                    className="size-4 accent-[var(--color-leaf)]"
                  />
                  Select all
                </label>
                <span className="text-[13px] text-muted">Oldest first</span>
                {selected.size > 0 && (
                  <Button
                    size="sm"
                    className="ml-auto px-4"
                    icon={<UserCheck size={18} />}
                    loading={busy === "bulk"}
                    onClick={() => {
                      const pick = ordered.filter((t) => selected.has(t.id));
                      void approve(
                        pick.map((t) => t.id),
                        pick.map((t) => t.name),
                      );
                    }}
                  >
                    Approve {selected.size}
                  </Button>
                )}
              </div>
              <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
                {ordered.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-3 rounded-control bg-white p-4 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${t.name}`}
                        checked={selected.has(t.id)}
                        onChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (n.has(t.id)) n.delete(t.id);
                            else n.add(t.id);
                            return n;
                          })
                        }
                        className="mt-1.5 size-4 accent-[var(--color-leaf)]"
                      />
                      <div className="flex min-w-0 grow flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDrawerId(t.id)}
                            className="text-left text-body font-bold text-deep hover:underline"
                          >
                            {t.name}
                          </button>
                          {t.createdAt && (
                            <Badge tone="amber" size="sm">
                              Waiting {formatElapsed(t.createdAt, now)}
                            </Badge>
                          )}
                        </div>
                        {t.createdAt && (
                          <span className="text-xs text-muted">
                            Registered {formatFullDate(t.createdAt)},{" "}
                            {formatClock(t.createdAt)}
                          </span>
                        )}
                        <span className="text-[13px] text-muted">
                          {[t.email, t.phone].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </div>
                    {t.intendedUse && (
                      <div className="rounded-control bg-[#F4EFE4] p-3 text-small">
                        <span className="text-xs font-bold text-muted">
                          Intended use
                        </span>
                        <p className="mt-0.5 italic">“{t.intendedUse}”</p>
                      </div>
                    )}
                    <div className="flex gap-2.5 pl-7">
                      <Button
                        size="sm"
                        className="px-4"
                        icon={<Check size={16} weight="bold" />}
                        loading={busy === t.id}
                        disabled={!!busy}
                        onClick={() => void approve([t.id], [t.name])}
                      >
                        {busy === t.id ? "Approving…" : "Approve"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="px-4"
                        disabled={!!busy}
                        onClick={() => setSheet({ kind: "decline", taker: t })}
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

        {list.status === "ready" &&
          ordered.length > 0 &&
          tab === "individuals" && (
            <>
              <span className="text-[13px] text-muted">
                Showing {Math.min(shown, ordered.length)} of {ordered.length}
              </span>
              <DataTable
                head={[
                  "Name",
                  "Phone",
                  "Status",
                  "Total collected",
                  "Claims",
                  "No-shows",
                  "Last active",
                  <span key="a" className="sr-only">
                    Actions
                  </span>,
                ]}
              >
                {ordered.slice(0, shown).map((t) => {
                  const st = TAKER_STATUS[t.status] ?? TAKER_STATUS.PENDING;
                  return (
                    <tr key={t.id} className={rowClass}>
                      <td className={tdClass}>
                        <button
                          type="button"
                          onClick={() => setDrawerId(t.id)}
                          className="text-left"
                        >
                          <strong className="block text-deep hover:underline">
                            {t.name}
                          </strong>
                          <span className="text-xs text-muted">{t.email}</span>
                        </button>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {t.phone ?? "—"}
                      </td>
                      <td className={tdClass}>
                        <Badge tone={st.tone} size="sm">
                          {st.label}
                        </Badge>
                      </td>
                      <td className={tdClass}>
                        {formatKg(t.stats?.collectedKg ?? 0)}kg
                      </td>
                      <td className={tdClass}>{t.stats?.claims ?? 0}</td>
                      <td
                        className={cn(
                          tdClass,
                          (t.stats?.noShows ?? 0) >= 2 &&
                            "font-bold text-error",
                        )}
                      >
                        {t.stats?.noShows ?? 0}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-muted`}>
                        {lastActive(t, now)}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <ActionMenu
                          label={`Actions for ${t.name}`}
                          items={[
                            {
                              label: "View",
                              icon: <Eye size={16} />,
                              onSelect: () => setDrawerId(t.id),
                            },
                            t.status === "SUSPENDED"
                              ? {
                                  label: "Reinstate",
                                  icon: <UserCheck size={16} />,
                                  onSelect: () => void reinstate(t),
                                }
                              : t.status === "APPROVED"
                                ? {
                                    label: "Suspend",
                                    icon: <Prohibit size={16} />,
                                    danger: true,
                                    onSelect: () =>
                                      setSheet({ kind: "suspend", taker: t }),
                                  }
                                : {
                                    label: "Suspend",
                                    icon: <Prohibit size={16} />,
                                    disabledReason: "Only approved takers",
                                  },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
              {shown < ordered.length && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-center px-5"
                  onClick={() => setShown((n) => n + PAGE)}
                >
                  Load more
                </Button>
              )}
            </>
          )}

        {list.status === "ready" && ordered.length > 0 && tab === "bulk" && (
          <DataTable
            head={[
              "Organisation",
              "Category",
              "Contact",
              "Monthly target",
              "This month",
              "Status",
              <span key="a" className="sr-only">
                Actions
              </span>,
            ]}
          >
            {ordered.map((t) => {
              const st = TAKER_STATUS[t.status] ?? TAKER_STATUS.PENDING;
              const target = t.monthlyKgTarget ?? 0;
              return (
                <tr key={t.id} className={rowClass}>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => setDrawerId(t.id)}
                      className="text-left font-bold text-deep hover:underline"
                    >
                      {t.name}
                    </button>
                  </td>
                  <td className={tdClass}>
                    {t.category ? (
                      <Badge tone="soil" size="sm">
                        {TAKER_CATEGORY_LABEL[t.category]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${tdClass} text-xs`}>
                    <span className="block">{t.email}</span>
                    <span className="text-muted">{t.phone ?? ""}</span>
                  </td>
                  <td className={tdClass}>
                    {t.monthlyKgTarget != null
                      ? `${formatKg(t.monthlyKgTarget)}kg`
                      : "—"}
                  </td>
                  <td className={tdClass}>
                    <div className="flex min-w-[170px] flex-col gap-1 text-xs">
                      <span className="flex justify-between">
                        <span className="text-muted">Allocated</span>
                        <strong>
                          {formatKg(t.stats?.monthAllocatedKg ?? 0)}
                          {target ? ` / ${formatKg(target)}` : ""}kg
                        </strong>
                      </span>
                      {target > 0 && (
                        <ProgressBar
                          value={Math.min(
                            target,
                            t.stats?.monthAllocatedKg ?? 0,
                          )}
                          max={target}
                          label={`${formatKg(t.stats?.monthAllocatedKg ?? 0)} of ${formatKg(target)} kg allocated this month`}
                        />
                      )}
                      <span className="flex justify-between">
                        <span className="text-muted">Collected</span>
                        <strong>
                          {formatKg(t.stats?.monthCollectedKg ?? 0)}kg
                        </strong>
                      </span>
                    </div>
                  </td>
                  <td className={tdClass}>
                    <Badge tone={st.tone} size="sm">
                      {st.label}
                    </Badge>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <ActionMenu
                      label={`Actions for ${t.name}`}
                      items={[
                        {
                          label: "View",
                          icon: <Eye size={16} />,
                          onSelect: () => setDrawerId(t.id),
                        },
                        {
                          label: "Edit",
                          icon: <PencilSimple size={16} />,
                          onSelect: () => setSheet({ kind: "bulk", taker: t }),
                        },
                        t.status === "APPROVED"
                          ? {
                              label: "Create allocation",
                              icon: <Plus size={16} />,
                              href: "/manager/batches",
                            }
                          : {
                              label: "Create allocation",
                              icon: <Plus size={16} />,
                              disabledReason: "Only approved partners",
                            },
                        t.status === "SUSPENDED"
                          ? {
                              label: "Reinstate",
                              icon: <UserCheck size={16} />,
                              onSelect: () => void reinstate(t),
                            }
                          : {
                              label: "Suspend",
                              icon: <Prohibit size={16} />,
                              danger: true,
                              onSelect: () =>
                                setSheet({ kind: "suspend", taker: t }),
                            },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}

        {list.status === "ready" &&
          ordered.length > 0 &&
          tab === "suspended" && (
            <DataTable
              head={[
                "Name",
                "Type",
                "Suspended",
                "Reason",
                "By",
                <span key="a" className="sr-only">
                  Actions
                </span>,
              ]}
            >
              {ordered.map((t) => (
                <tr key={t.id} className={rowClass}>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => setDrawerId(t.id)}
                      className="text-left font-bold text-deep hover:underline"
                    >
                      {t.name}
                    </button>
                  </td>
                  <td className={tdClass}>
                    {t.type === "BULK" ? "Bulk" : "Individual"}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {t.statusChangedAt
                      ? formatFullDate(t.statusChangedAt)
                      : "—"}
                  </td>
                  <td className={tdClass}>{t.statusReason ?? "—"}</td>
                  <td className={`${tdClass} text-muted`}>
                    {t.statusChangedBy?.name ?? "—"}
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="px-4"
                      loading={busy === t.id}
                      onClick={() => void reinstate(t)}
                    >
                      Reinstate
                    </Button>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
      </section>

      {drawerId && drawer.status === "ready" && drawer.data && (
        <TakerDrawer
          key={drawer.data.id}
          taker={drawer.data}
          onClose={() => setDrawerId(null)}
          onSuspend={() => setSheet({ kind: "suspend", taker: drawer.data! })}
          onReinstate={() => void reinstate(drawer.data!)}
          onEdit={() => setSheet({ kind: "bulk", taker: drawer.data! })}
        />
      )}
      {sheet?.kind === "decline" && (
        <DeclineSheet
          taker={sheet.taker}
          onClose={() => setSheet(null)}
          onDone={(m) => done(m)}
        />
      )}
      {sheet?.kind === "suspend" && (
        <SuspendSheet
          taker={sheet.taker}
          onClose={() => setSheet(null)}
          onDone={(m) => done(m)}
        />
      )}
      {sheet?.kind === "bulk" && (
        <BulkTakerSheet
          taker={sheet.taker}
          onClose={() => setSheet(null)}
          onDone={(m, created) =>
            done(
              m,
              created ? (
                <Link
                  href="/manager/batches"
                  className="ml-2 whitespace-nowrap font-bold text-cream underline"
                >
                  Create first allocation →
                </Link>
              ) : undefined,
            )
          }
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-4 top-[76px] z-[60] flex justify-center md:top-[88px]">
          <div
            role={toast.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-[560px] items-center gap-3 rounded-[14px] px-4 py-3 text-small font-semibold text-cream shadow-photo",
              toast.tone === "success" ? "bg-deep" : "bg-danger-ink",
            )}
          >
            <span className="grow">{toast.text}</span>
            {toast.action}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToast(null)}
              className="text-cream/80 hover:text-cream"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function lastActive(t: TakerRecord, now: number): string {
  const at = t.stats?.lastActiveAt;
  if (!at) return "—";
  return sgDayKey(at) === sgDayKey(new Date(now).toISOString())
    ? "Today"
    : formatDayMonth(at);
}

function Empty({
  tab,
  query,
  onClear,
  onAdd,
}: {
  tab: Tab;
  query: string;
  onClear: () => void;
  onAdd: () => void;
}) {
  if (query) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <h2 className="font-display m-0 text-xl font-semibold text-deep">
          No takers match ‘{query}’
        </h2>
        <p className="text-small text-muted">
          Try a name, email or phone number.
        </p>
        <Button variant="secondary" size="sm" onClick={onClear}>
          Clear search
        </Button>
      </div>
    );
  }
  const copy: Record<Tab, [string, string]> = {
    awaiting: [
      "No one waiting for approval",
      "New sign-ups will appear here for you to review.",
    ],
    individuals: [
      "No individual takers yet",
      "People who sign up on LoopSoil appear here once approved.",
    ],
    bulk: [
      "No bulk partners yet",
      "Add NParks, schools, town councils or community gardens you allocate compost to.",
    ],
    suspended: [
      "No suspended takers",
      "Takers you suspend appear here with the reason, so you can reinstate them later.",
    ],
  };
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex size-[120px] items-center justify-center rounded-full bg-sage">
        {tab === "awaiting" ? <Sprout width={84} /> : <EmptyPot width={90} />}
      </span>
      <h2 className="font-display m-0 text-[22px] font-semibold text-deep">
        {copy[tab][0]}
      </h2>
      <p className="max-w-[380px] text-body text-muted">{copy[tab][1]}</p>
      {tab === "bulk" && (
        <Button icon={<Plus size={18} weight="bold" />} onClick={onAdd}>
          Add bulk taker
        </Button>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <LoadingLabel>Loading takers…</LoadingLabel>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          aria-hidden
          className="flex items-center gap-4 py-2 shadow-[inset_0_1px_0_rgba(107,107,94,0.14)]"
        >
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-10" />
        </div>
      ))}
    </div>
  );
}
