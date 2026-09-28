"use client";

import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { User } from "@phosphor-icons/react/dist/ssr/User";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  BatchStatusBadge,
  ClaimStatusBadge,
  type BadgeTone,
} from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import {
  ALLOCATION_STATUS_LABEL,
  type BatchStatus,
  type ClaimStatus,
} from "@/lib/labels";

interface SearchResults {
  query: string;
  claims: {
    id: string;
    reference: string;
    status: string;
    kg: number;
    takerName: string;
    batchReference: string;
  }[];
  allocations: {
    id: string;
    reference: string;
    status: string;
    kg: number;
    takerName: string;
    batchId: string;
    batchReference: string;
  }[];
  takers: {
    id: string;
    name: string;
    type: string;
    status: string;
    claims: number;
    allocations: number;
  }[];
  batches: {
    id: string;
    reference: string;
    status: string;
    kgRemaining: number;
  }[];
}

interface Row {
  key: string;
  href: string;
  icon: ReactNode;
  title: string;
  sub: string;
  badge: ReactNode;
}

const TAKER_TONE: Record<string, [string, BadgeTone]> = {
  APPROVED: ["Approved", "leaf"],
  PENDING: ["Pending", "amber"],
  REJECTED: ["Declined", "red"],
  SUSPENDED: ["Suspended", "red"],
};
const ALLOC_TONE: Record<string, BadgeTone> = {
  PLANNED: "amber",
  CONFIRMED: "leaf",
  COLLECTED: "deep",
  CANCELLED: "grey",
};

function groups(r: SearchResults): { label: string; rows: Row[] }[] {
  const tile = (icon: ReactNode) => (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sage text-deep"
    >
      {icon}
    </span>
  );
  return [
    {
      label: "Claims",
      rows: r.claims.map((c) => ({
        key: `c-${c.id}`,
        href: `/manager/claims?claim=${c.id}`,
        icon: tile(<ClipboardText size={16} />),
        title: c.reference,
        sub: `${c.takerName} · ${formatKg(c.kg)}kg · Batch ${c.batchReference}`,
        badge: <ClaimStatusBadge status={c.status as ClaimStatus} />,
      })),
    },
    {
      label: "Allocations",
      rows: r.allocations.map((a) => ({
        key: `a-${a.id}`,
        href: `/manager/batches/${a.batchId}`,
        icon: tile(<Truck size={16} />),
        title: a.reference,
        sub: `${a.takerName} · ${formatKg(a.kg)}kg · Batch ${a.batchReference}`,
        badge: (
          <Badge tone={ALLOC_TONE[a.status] ?? "grey"} size="sm">
            {ALLOCATION_STATUS_LABEL[
              a.status as keyof typeof ALLOCATION_STATUS_LABEL
            ] ?? a.status}
          </Badge>
        ),
      })),
    },
    {
      label: "Takers",
      rows: r.takers.map((t) => {
        const [label, tone] = TAKER_TONE[t.status] ?? ["—", "grey"];
        const n = t.type === "BULK" ? t.allocations : t.claims;
        return {
          key: `t-${t.id}`,
          href: `/manager/takers?taker=${t.id}`,
          icon: tile(<User size={16} />),
          title: t.name,
          sub: `${t.type === "BULK" ? "Bulk" : "Individual"} · ${n} ${t.type === "BULK" ? "allocation" : "claim"}${n === 1 ? "" : "s"}`,
          badge: (
            <Badge tone={tone} size="sm">
              {label}
            </Badge>
          ),
        };
      }),
    },
    {
      label: "Batches",
      rows: r.batches.map((b) => ({
        key: `b-${b.id}`,
        href: `/manager/batches/${b.id}`,
        icon: tile(<Package size={16} />),
        title: `Batch ${b.reference}`,
        sub: `${formatKg(b.kgRemaining)}kg left`,
        badge: <BatchStatusBadge status={b.status as BatchStatus} />,
      })),
    },
  ].filter((g) => g.rows.length > 0);
}

/**
 * Sidebar search (boards "Manager shell · search / search empty"): claims, allocations,
 * takers and batches as you type, grouped. ⌘K / Ctrl+K focuses it from anywhere; ↑↓ move,
 * Enter opens, Esc closes. GET /manager/search?q=.
 */
export function SidebarSearch({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{
    q: string;
    data: SearchResults | null;
    error?: boolean;
  } | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Debounced fetch.
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const id = setTimeout(() => {
      api
        .get<SearchResults>(`/manager/search?q=${encodeURIComponent(term)}`)
        .then(
          (data) => {
            if (cancelled) return;
            setResult({ q: term, data });
            setActive(0);
          },
          () => !cancelled && setResult({ q: term, data: null, error: true }),
        );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [term]);

  const current = result && result.q === term ? result : null;
  const grouped = current?.data ? groups(current.data) : [];
  const flat = grouped.flatMap((g) => g.rows);
  const show = open && term.length >= 2;

  function go(row: Row) {
    setOpen(false);
    setQ("");
    onNavigate?.();
    router.push(row.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[Math.min(active, flat.length - 1)]);
    }
  }

  let index = -1;
  return (
    <div ref={boxRef} className="relative flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <label
          htmlFor="mg-search"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(243,240,230,0.72)]"
        >
          Search
        </label>
        <kbd
          title="Press ⌘K (Ctrl+K on Windows) to search from anywhere"
          className="rounded-md bg-[rgba(243,240,230,0.12)] px-1.5 py-px font-sans text-[11px] font-bold text-[rgba(243,240,230,0.72)]"
        >
          ⌘K
        </kbd>
      </div>
      {/* On the green sidebar: a white field in light mode, a translucent well in dark. */}
      <div className="flex h-11 items-center gap-2 rounded-control bg-white px-3 focus-within:shadow-[inset_0_0_0_2px_#78AE58,0_0_0_4px_rgba(120,174,88,0.3)] dark:bg-[rgba(243,240,230,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(243,240,230,0.16)]">
        <MagnifyingGlass
          size={18}
          className="text-[#6B6B5E] dark:text-[rgba(243,240,230,0.72)]"
          aria-hidden
        />
        <input
          ref={inputRef}
          id="mg-search"
          type="search"
          role="combobox"
          aria-expanded={show}
          aria-controls="mg-search-results"
          aria-activedescendant={
            show && flat[active] ? `mg-opt-${flat[active].key}` : undefined
          }
          autoComplete="off"
          placeholder="Search claims, takers, batches…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 grow border-none bg-transparent text-[13px] text-[#2B2B24] outline-none placeholder:text-[#6B6B5E] dark:text-[#F3F0E6] dark:placeholder:text-[rgba(243,240,230,0.55)]"
        />
      </div>

      {show && (
        <div
          id="mg-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 top-[76px] z-[70] flex w-[min(380px,calc(100vw-32px))] flex-col gap-1.5 rounded-card bg-cream p-2 shadow-photo"
        >
          {!current ? (
            <p className="px-2.5 py-3 text-[13px] text-muted" role="status">
              Searching…
            </p>
          ) : current.error ? (
            <p className="px-2.5 py-3 text-[13px] text-danger-ink" role="alert">
              Couldn’t search right now. Try again.
            </p>
          ) : grouped.length === 0 ? (
            <div className="px-2.5 py-3" role="status">
              <p className="text-small font-bold text-deep">
                No results for ‘{term}’
              </p>
              <p className="text-xs text-muted">
                Try a claim reference (CLM-…), a taker’s name or a batch (Batch
                2026-09-A).
              </p>
            </div>
          ) : (
            grouped.map((g) => (
              <div
                key={g.label}
                role="group"
                aria-label={g.label}
                className="flex flex-col gap-0.5"
              >
                <p className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  {g.label}
                </p>
                {g.rows.map((row) => {
                  index += 1;
                  const i = index;
                  return (
                    <div
                      key={row.key}
                      id={`mg-opt-${row.key}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(row)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-ink",
                        i === active ? "bg-sage" : "hover:bg-row-hover",
                      )}
                    >
                      {row.icon}
                      <span className="flex min-w-0 grow flex-col">
                        <strong className="truncate text-small leading-5">
                          {row.title}
                        </strong>
                        <span className="truncate text-xs text-muted">
                          {row.sub}
                        </span>
                      </span>
                      {row.badge}
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <p className="px-2.5 pb-1 pt-2 text-xs text-muted shadow-[inset_0_1px_0_rgba(var(--rgb-hair),0.15)]">
            ↑↓ to move · Enter to open · Esc to close
          </p>
        </div>
      )}
    </div>
  );
}
