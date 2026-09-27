"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CalendarCheck } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
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
import { whatsAppLink } from "@/components/manager/claims/claim-utils";
import {
  SLOT_STATE,
  addMonths,
  dayLabel,
  daysBetween,
  isActive,
  monthStart,
  sgInstant,
  slotState,
  weekStart,
  type SlotState,
} from "@/components/manager/pickups/calendar-utils";
import { SlotDrawer } from "@/components/manager/pickups/slot-drawer";
import {
  BulkBookSheet,
  CancelSlotSheet,
  DEFAULT_LOCATION,
  MoveBookingSheet,
  MoveSlotSheet,
  NoShowSheet,
  SlotFormSheet,
} from "@/components/manager/pickups/slot-sheets";
import {
  TimeGrid,
  type CalendarEvent,
} from "@/components/manager/pickups/time-grid";
import {
  MiniMonth,
  MonthGrid,
  NeedsBooking,
  SlotList,
  monthRange,
  type NeedsBookingItem,
} from "@/components/manager/pickups/views";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { addDays } from "@/lib/batch-form";
import { cn } from "@/lib/cn";
import { firstName, formatKg, sgDayKey } from "@/lib/format";
import type {
  Allocation,
  Batch,
  Claim,
  ManagerBooking,
  Slot,
} from "@/lib/types";

type View = "day" | "week" | "month" | "list";
type TypeFilter = "all" | "individual" | "bulk";
const ALL = "pageSize=100";

type Sheet =
  | { kind: "create"; day: string; time?: string; batchId?: string }
  | { kind: "edit"; slot: Slot }
  | { kind: "cancel"; slot: Slot }
  | { kind: "move"; slot: Slot; to: { startTime: string; endTime: string } }
  | { kind: "bulk"; allocationId?: string }
  | { kind: "moveBooking"; booking: ManagerBooking }
  | { kind: "noShow"; booking: ManagerBooking }
  | null;

interface RangeData {
  slots: Slot[];
  bookings: ManagerBooking[];
  loadedAt: number;
}

interface SideData {
  batches: Batch[];
  needs: NeedsBookingItem[] | null;
  openAllocations: Allocation[];
  week: { slots: Slot[]; bookings: ManagerBooking[] } | null;
}

function rangeFor(view: View, anchor: string): { from: string; to: string } {
  if (view === "day") return { from: anchor, to: addDays(anchor, 1) };
  if (view === "week")
    return { from: weekStart(anchor), to: addDays(weekStart(anchor), 7) };
  if (view === "month") return monthRange(anchor);
  return { from: monthStart(anchor), to: addMonths(anchor, 1) };
}

async function fetchRange(from: string, to: string): Promise<RangeData> {
  const q = `from=${encodeURIComponent(sgInstant(from, "00:00"))}&to=${encodeURIComponent(sgInstant(to, "00:00"))}&${ALL}`;
  const [slots, bookings] = await Promise.all([
    api.get<Paginated<Slot>>(`/slots?${q}`),
    api.get<Paginated<ManagerBooking>>(`/bookings?${q}`),
  ]);
  return { slots: slots.data, bookings: bookings.data, loadedAt: Date.now() };
}

async function fetchSide(today: string): Promise<SideData> {
  const opt = <T,>(p: Promise<T>) =>
    p.then(
      (v) => v,
      () => null,
    );
  const [batches, claims, allocations, week] = await Promise.all([
    opt(api.get<Paginated<Batch>>(`/batches?${ALL}`)),
    opt(api.get<Paginated<Claim>>(`/claims/needs-booking?${ALL}`)),
    opt(api.get<Paginated<Allocation>>(`/allocations?status=CONFIRMED&${ALL}`)),
    opt(fetchRange(weekStart(today), addDays(weekStart(today), 7))),
  ]);
  const openAllocations = (allocations?.data ?? []).filter(
    (a) => a.booking?.status !== "BOOKED",
  );
  const needs: NeedsBookingItem[] | null =
    claims && allocations
      ? [
          ...claims.data.map((c) => ({
            key: `c-${c.id}`,
            name: c.taker?.name ?? "Unknown",
            kg: Number(c.approvedKg ?? c.requestedKg),
            bulk: false,
            reference: c.reference,
            bookBy: c.batch?.availableUntil ?? null,
            allocationId: null,
            remindHref: whatsAppLink(
              c.taker?.phone,
              `Hi ${firstName(c.taker?.name)}, a reminder from SUSS LoopSoil: your compost claim ${c.reference} (${formatKg(Number(c.approvedKg ?? c.requestedKg))}kg) is approved. Please book a pickup time in the app.`,
            ),
          })),
          ...openAllocations.map((a) => ({
            key: `a-${a.id}`,
            name: a.taker.name,
            kg: Number(a.allocatedKg),
            bulk: true,
            reference: a.reference,
            bookBy: a.batch?.availableUntil ?? null,
            allocationId: a.id,
            remindHref: null,
          })),
        ].sort((x, y) => (x.bookBy ?? "9").localeCompare(y.bookBy ?? "9"))
      : null;
  return { batches: batches?.data ?? [], needs, openAllocations, week };
}

/**
 * Manager · Pickups (/manager/slots) — boards "Pickups · week / day / month / list /
 * drawer / drawer closed / create / create errors / create busy / edit / cancel / bulk
 * book / drag / empty / error / loading / toasts". Calendar of pickup slots with the
 * needs-booking list; `?slot=` opens a slot, `?create=1&batchId=` starts a new one.
 */
export default function ManagerPickupsPage() {
  return (
    <Suspense fallback={<PickupsSkeleton />}>
      <Pickups />
    </Suspense>
  );
}

function Pickups() {
  const params = useSearchParams();
  const [today] = useState(() => sgDayKey(new Date().toISOString()));
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(today);
  const [miniMonth, setMiniMonth] = useState(today);
  const [type, setType] = useState<TypeFilter>("all");
  const [location, setLocation] = useState("");
  const [data, setData] = useState<RangeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [side, setSide] = useState<SideData | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(() =>
    params.get("slot"),
  );
  const [sheet, setSheet] = useState<Sheet>(() =>
    params.get("create")
      ? {
          kind: "create",
          day: today,
          batchId: params.get("batchId") ?? undefined,
        }
      : null,
  );
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const range = rangeFor(view, anchor);
  const rangeKey = `${range.from}|${range.to}`;

  const load = useCallback(async () => {
    const [from, to] = rangeKey.split("|");
    try {
      setData(await fetchRange(from, to));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [rangeKey]);

  useEffect(() => {
    let cancelled = false;
    const [from, to] = rangeKey.split("|");
    fetchRange(from, to).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [rangeKey]);

  const loadSide = useCallback(
    async () => setSide(await fetchSide(today)),
    [today],
  );
  useEffect(() => {
    let cancelled = false;
    void fetchSide(today).then((s) => !cancelled && setSide(s));
    return () => {
      cancelled = true;
    };
  }, [today]);

  // `?slot=` (from Claims / Batch detail): jump to that slot's week.
  useEffect(() => {
    const id = params.get("slot");
    if (!id) return;
    api.get<Slot>(`/slots/${id}`).then(
      (s) => {
        const d = sgDayKey(s.startTime);
        setAnchor(d);
        setMiniMonth(d);
      },
      () => setDrawerId(null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadSide()]);
  }, [load, loadSide]);

  function done(text: string) {
    setSheet(null);
    setToast({ tone: "success", text });
    void refreshAll();
  }
  const fail = (text: string) => setToast({ tone: "error", text });

  const bookingsBySlot = useMemo(() => {
    const m = new Map<string, ManagerBooking[]>();
    for (const b of data?.bookings ?? []) {
      if (type === "individual" && !b.claim) continue;
      if (type === "bulk" && !b.allocation) continue;
      m.set(b.slot.id, [...(m.get(b.slot.id) ?? []), b]);
    }
    return m;
  }, [data, type]);

  const locations = useMemo(() => {
    const set = new Set<string>([DEFAULT_LOCATION]);
    for (const s of data?.slots ?? [])
      if (s.effectiveLocation) set.add(s.effectiveLocation);
    return [...set];
  }, [data]);

  const visibleSlots = useMemo(
    () =>
      (data?.slots ?? []).filter((s) => {
        if (location && (s.effectiveLocation ?? "") !== location) return false;
        if (type !== "all" && !(bookingsBySlot.get(s.id) ?? []).some(isActive))
          return false;
        return true;
      }),
    [data, location, type, bookingsBySlot],
  );

  const events = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    const add = (iso: string | null, label: string) => {
      if (!iso) return;
      const k = sgDayKey(iso);
      m.set(k, [...(m.get(k) ?? []), { label }]);
    };
    for (const b of side?.batches ?? []) {
      add(b.harvestDate, `Harvest: ${b.reference}`);
      if (b.status !== "DRAFT") add(b.availableFrom, `${b.reference} released`);
      add(b.availableUntil, `${b.reference} claiming closes`);
    }
    return m;
  }, [side]);

  const summary = useMemo(() => {
    const w = side?.week;
    if (!w) return null;
    const active = w.bookings.filter(isActive);
    return {
      today: active.filter((b) => sgDayKey(b.slot.startTime) === today).length,
      week: active.length,
      almost: w.slots.filter((s) => {
        const st = slotState(s);
        return (st === "almost" || st === "full") && s.status === "OPEN";
      }).length,
    };
  }, [side, today]);

  const drawerSlot = drawerId
    ? ((data?.slots ?? []).find((s) => s.id === drawerId) ?? null)
    : null;
  const now = data?.loadedAt ?? 0;
  const days = view === "day" ? [anchor] : daysBetween(range.from, range.to);
  const slotDays = useMemo(
    () => new Set((data?.slots ?? []).map((s) => sgDayKey(s.startTime))),
    [data],
  );

  function step(dir: 1 | -1) {
    const next =
      view === "day"
        ? addDays(anchor, dir)
        : view === "week"
          ? addDays(anchor, 7 * dir)
          : addMonths(anchor, dir);
    setAnchor(next);
    setMiniMonth(next);
  }

  function goTo(day: string, v?: View) {
    setAnchor(day);
    setMiniMonth(day);
    if (v) setView(v);
  }

  const title =
    view === "day"
      ? dayLabel(anchor, {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }).replace(",", "")
      : view === "week"
        ? `${dayLabel(range.from, { day: "numeric", month: "short" })} – ${dayLabel(addDays(range.to, -1), { day: "numeric", month: "short", year: "numeric" })}`
        : dayLabel(monthStart(anchor), { month: "long", year: "numeric" });

  const onMove = (slot: Slot, day: string, startMinutes: number) => {
    const dur =
      new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime();
    const hh = String(Math.floor(startMinutes / 60)).padStart(2, "0");
    const mm = String(startMinutes % 60).padStart(2, "0");
    const startTime = sgInstant(day, `${hh}:${mm}`);
    if (startTime === new Date(slot.startTime).toISOString()) return;
    if (new Date(startTime).getTime() < Date.now()) {
      fail("Slots can’t be moved into the past.");
      return;
    }
    setSheet({
      kind: "move",
      slot,
      to: {
        startTime,
        endTime: new Date(new Date(startTime).getTime() + dur).toISOString(),
      },
    });
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display m-0 text-[32px] font-semibold leading-10 text-deep">
            Pickups
          </h1>
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              className="px-[18px]"
              icon={<Truck size={18} />}
              onClick={() => setSheet({ kind: "bulk" })}
            >
              Book for bulk taker
            </Button>
            <Button
              size="sm"
              className="px-[18px]"
              icon={<Plus size={18} weight="bold" />}
              onClick={() =>
                setSheet({
                  kind: "create",
                  day: anchor < today ? today : anchor,
                })
              }
            >
              New slot
            </Button>
          </div>
        </div>
        <div role="group" aria-label="Summary" className="flex flex-wrap gap-3">
          <SummaryCard
            icon={<CalendarCheck size={18} weight="bold" />}
            iconClass="bg-sage text-deep"
            label="Today"
            value={summary?.today}
            unit="pickups"
            onClick={() => goTo(today, "day")}
          />
          <SummaryCard
            icon={<CalendarBlank size={18} weight="bold" />}
            iconClass="bg-[#ECE6D8] text-ink"
            label="This week"
            value={summary?.week}
            unit="pickups"
            onClick={() => goTo(today, "week")}
          />
          <SummaryCard
            icon={<WarningCircle size={18} weight="bold" />}
            iconClass="bg-amber-tint text-amber-ink"
            label="Slots almost full"
            value={summary?.almost}
            unit="slots"
            onClick={() => goTo(today, "week")}
          />
        </div>
      </div>

      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-5 rounded-card bg-cream p-[18px] shadow-card lg:w-[280px]">
          <MiniMonth
            month={miniMonth}
            onMonth={setMiniMonth}
            today={today}
            inRange={(d) =>
              d >= range.from &&
              d < range.to &&
              view !== "month" &&
              view !== "list"
            }
            hasSlots={slotDays}
            onPick={(d) =>
              goTo(d, view === "month" || view === "list" ? "day" : undefined)
            }
          />
          <NeedsBooking
            items={side ? side.needs : []}
            now={now}
            onBook={(allocationId) => setSheet({ kind: "bulk", allocationId })}
          />
        </aside>

        <section className="flex w-full min-w-0 grow flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div
                role="group"
                aria-label="Calendar view"
                className="flex rounded-control bg-[#ECE6D8] p-1"
              >
                {(["day", "week", "month", "list"] as View[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      "h-9 rounded-[9px] px-3.5 text-small font-semibold capitalize",
                      view === v
                        ? "bg-cream text-deep shadow-card"
                        : "text-muted hover:text-deep",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <IconNav label="Previous" onClick={() => step(-1)}>
                  <CaretLeft size={16} weight="bold" />
                </IconNav>
                <button
                  type="button"
                  onClick={() => goTo(today)}
                  className="h-9 rounded-full px-3.5 text-small font-bold text-deep shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage"
                >
                  Today
                </button>
                <IconNav label="Next" onClick={() => step(1)}>
                  <CaretRight size={16} weight="bold" />
                </IconNav>
              </div>
              <strong className="text-body text-deep" aria-live="polite">
                {title}
              </strong>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["all", "All"],
                  ["individual", "Individual claims"],
                  ["bulk", "Bulk allocations"],
                ] as [TypeFilter, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={type === v}
                  onClick={() => setType(v)}
                  className={cn(
                    "h-9 rounded-full px-3.5 text-[13px] font-bold",
                    type === v
                      ? "bg-deep text-cream"
                      : "bg-white text-ink shadow-[inset_0_0_0_1px_rgba(143,142,128,0.5)] hover:bg-sage",
                  )}
                >
                  {label}
                </button>
              ))}
              <div className="relative">
                <select
                  aria-label="Location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-9 cursor-pointer appearance-none rounded-full border-none bg-white pl-3.5 pr-8 text-[13px] font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(143,142,128,0.5)] outline-none"
                >
                  <option value="">All locations</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <CaretDown
                  size={14}
                  className="pointer-events-none absolute right-3 top-2.5 text-muted"
                  aria-hidden
                />
              </div>
            </div>
          </div>
          <ul
            aria-label="Slot status legend"
            className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0"
          >
            {(Object.keys(SLOT_STATE) as SlotState[]).map((k) => (
              <li
                key={k}
                className="flex items-center gap-1.5 text-xs text-ink"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-3 w-3.5 rounded-[3px]",
                    SLOT_STATE[k].swatch,
                  )}
                />
                {k === "almost" ? "Almost full (80%+)" : SLOT_STATE[k].label}
              </li>
            ))}
          </ul>

          {failed ? (
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
                We couldn’t load the pickup slots. Check your connection and try
                again.
              </p>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-cream"
                  icon={<ArrowClockwise size={18} weight="bold" />}
                  onClick={() => void load()}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : !data ? (
            <GridSkeleton />
          ) : (
            <div className="relative">
              {(view === "day" || view === "week") && (
                <TimeGrid
                  days={days}
                  slots={visibleSlots}
                  bookingsBySlot={bookingsBySlot}
                  events={events}
                  today={today}
                  now={now}
                  detailed={view === "day"}
                  onOpen={(s) => setDrawerId(s.id)}
                  onCreateAt={(day, time) =>
                    day >= today && setSheet({ kind: "create", day, time })
                  }
                  onMove={onMove}
                />
              )}
              {view === "month" && (
                <MonthGrid
                  anchor={anchor}
                  slots={visibleSlots}
                  today={today}
                  onOpen={(s) => setDrawerId(s.id)}
                  onDay={(d) => goTo(d, "day")}
                />
              )}
              {view === "list" &&
                (visibleSlots.length ? (
                  <SlotList
                    slots={visibleSlots}
                    bookingsBySlot={bookingsBySlot}
                    today={today}
                    onOpen={(s) => setDrawerId(s.id)}
                    onEdit={(s) => setSheet({ kind: "edit", slot: s })}
                  />
                ) : (
                  <p className="py-10 text-center text-body text-muted">
                    No pickup slots this month.
                  </p>
                ))}
              {(view === "day" || view === "week") &&
                visibleSlots.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-16">
                    <div className="pointer-events-auto flex max-w-[360px] flex-col items-center gap-2 rounded-card bg-cream p-6 text-center shadow-photo">
                      <h3 className="font-display m-0 text-[22px] font-semibold text-deep">
                        No pickup slots{" "}
                        {view === "day" ? "this day" : "this week"}
                      </h3>
                      <p className="text-small text-muted">
                        Create slots so approved takers can book a time.
                      </p>
                      <Button
                        size="sm"
                        className="mt-2 px-[18px]"
                        icon={<Plus size={18} weight="bold" />}
                        onClick={() =>
                          setSheet({
                            kind: "create",
                            day: anchor < today ? today : anchor,
                          })
                        }
                      >
                        New slot
                      </Button>
                    </div>
                  </div>
                )}
            </div>
          )}
          {data && data.slots.length >= 100 && (
            <p className="text-xs text-muted">
              Showing the first 100 slots in this range — switch to a shorter
              view to see them all.
            </p>
          )}
        </section>
      </div>

      {drawerSlot && (
        <SlotDrawer
          slot={drawerSlot}
          bookings={(data?.bookings ?? []).filter(
            (b) => b.slot.id === drawerSlot.id,
          )}
          now={now}
          onClose={() => setDrawerId(null)}
          onEdit={() => setSheet({ kind: "edit", slot: drawerSlot })}
          onCancelSlot={() => setSheet({ kind: "cancel", slot: drawerSlot })}
          onNoShow={(b) => setSheet({ kind: "noShow", booking: b })}
          onMoveBooking={(b) => setSheet({ kind: "moveBooking", booking: b })}
          onChanged={done}
          onError={fail}
        />
      )}

      {(sheet?.kind === "create" || sheet?.kind === "edit") && (
        <SlotFormSheet
          slot={sheet.kind === "edit" ? sheet.slot : null}
          defaults={
            sheet.kind === "create"
              ? sheet
              : { day: sgDayKey(sheet.slot.startTime) }
          }
          batches={side?.batches ?? []}
          existing={data?.slots ?? []}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}
      {sheet?.kind === "cancel" && (
        <CancelSlotSheet
          slot={sheet.slot}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}
      {sheet?.kind === "move" && (
        <MoveSlotSheet
          slot={sheet.slot}
          to={sheet.to}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}
      {sheet?.kind === "bulk" && (
        <BulkBookSheet
          allocations={side?.openAllocations ?? []}
          initialAllocationId={sheet.allocationId}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}
      {sheet?.kind === "moveBooking" && (
        <MoveBookingSheet
          booking={sheet.booking}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}
      {sheet?.kind === "noShow" && (
        <NoShowSheet
          booking={sheet.booking}
          onClose={() => setSheet(null)}
          onDone={done}
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

function SummaryCard({
  icon,
  iconClass,
  label,
  value,
  unit,
  onClick,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: number | undefined;
  unit: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-[14px] bg-cream py-2 pl-2 pr-3.5 text-left text-ink shadow-card hover:bg-sage"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-8 items-center justify-center rounded-full",
          iconClass,
        )}
      >
        {icon}
      </span>
      <span className="text-[13px] font-semibold">{label}</span>
      <strong className="font-display text-[22px] font-semibold leading-[26px] text-deep">
        {value ?? "–"}
      </strong>
      <span className="text-xs text-muted">{unit}</span>
    </button>
  );
}

function IconNav({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full text-deep hover:bg-sage"
    >
      {children}
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <LoadingLabel>Loading pickup slots…</LoadingLabel>
      <div aria-hidden className="flex gap-2 pl-12">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-10 flex-1" />
        ))}
      </div>
      <div aria-hidden className="grid h-[480px] grid-cols-7 gap-2 pl-12">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex flex-col gap-3 pt-[56px]">
            <Skeleton
              className="h-[108px] w-full"
              style={{ marginTop: (i % 3) * 40 }}
            />
            {i % 2 === 0 && <Skeleton className="h-[108px] w-full" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function PickupsSkeleton() {
  return (
    <div className="flex flex-col gap-7">
      <Skeleton className="h-10 w-40" />
      <div className="flex gap-5">
        <Skeleton className="hidden h-[520px] w-[280px] rounded-card lg:block" />
        <div className="grow rounded-card bg-cream p-5 shadow-card">
          <GridSkeleton />
        </div>
      </div>
    </div>
  );
}
