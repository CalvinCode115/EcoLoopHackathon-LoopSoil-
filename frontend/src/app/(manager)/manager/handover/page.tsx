"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Leaf } from "@phosphor-icons/react/dist/ssr/Leaf";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { QrCode } from "@phosphor-icons/react/dist/ssr/QrCode";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { EmptyPot, Sprout } from "@/components/brand/illustrations";
import { BigButton } from "@/components/manager/handover/handover-ui";
import { PickupList } from "@/components/manager/handover/pickup-list";
import { QrScanner } from "@/components/manager/handover/qr-scanner";
import {
  RecordHandover,
  type RecordedHandover,
} from "@/components/manager/handover/record-form";
import {
  SuccessView,
  UndoToast,
} from "@/components/manager/handover/success-view";
import {
  bookingParty,
  sgInstant,
} from "@/components/manager/pickups/calendar-utils";
import { NoShowSheet } from "@/components/manager/pickups/slot-sheets";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api";
import { addDays } from "@/lib/batch-form";
import { cn } from "@/lib/cn";
import { formatKg, sgDayKey } from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type {
  Claim,
  Handover,
  HandoverLookup,
  ManagerBooking,
  Slot,
} from "@/lib/types";

interface Day {
  slots: Slot[];
  bookings: ManagerBooking[];
  /** kg handed over today (live handovers only). */
  todayKg: number;
  loadedAt: number;
}

type Mode =
  | { kind: "list" }
  | { kind: "record"; lookup: HandoverLookup; at: number }
  | { kind: "success"; recorded: RecordedHandover; lookup: HandoverLookup };

type ScanSheet =
  { kind: "notfound" } | { kind: "collected"; lookup: HandoverLookup } | null;

async function fetchDay(today: string): Promise<Day> {
  const from = encodeURIComponent(sgInstant(today, "00:00"));
  const to = encodeURIComponent(sgInstant(addDays(today, 1), "00:00"));
  const range = `from=${from}&to=${to}&pageSize=100`;
  const [slots, bookings, handovers] = await Promise.all([
    api.get<Paginated<Slot>>(`/slots?${range}`),
    api.get<Paginated<ManagerBooking>>(`/bookings?${range}`),
    api.get<Paginated<Handover>>(`/handovers?from=${from}&pageSize=100`),
  ]);
  return {
    slots: slots.data,
    bookings: bookings.data,
    todayKg: handovers.data.reduce((s, h) => s + h.actualKg, 0),
    loadedAt: Date.now(),
  };
}

const lookupCode = (code: string) =>
  api.get<HandoverLookup>(
    `/handovers/lookup?code=${encodeURIComponent(code.trim())}`,
  );

/** navigator.onLine as React state (the "offline" board). */
function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Manager · Handover (/manager/handover) — boards "Handover · home / scanner / record /
 * success / summary / edge cases / empty / all done / loading / no-show / swipe / offline /
 * tablet / desktop". Phone-first: today's pickups, scan a pass or type a reference, record
 * the weigh-in with a photo, undo within 10s. Wide screens show the list and the record
 * side by side. Deep links: `?claim=`, `?booking=`, `?code=`.
 */
export default function ManagerHandoverPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Handover />
    </Suspense>
  );
}

function Handover() {
  const params = useSearchParams();
  const online = useOnline();
  const [today] = useState(() => sgDayKey(new Date().toISOString()));
  const [day, setDay] = useState<Day | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [opening, setOpening] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanSheet, setScanSheet] = useState<ScanSheet>(null);
  const [noShow, setNoShow] = useState<ManagerBooking | null>(null);
  const [undo, setUndo] = useState<{
    id: string;
    startedAt: number;
    busy: boolean;
  } | null>(null);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setDay(await fetchDay(today));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    fetchDay(today).then(
      (d) => !cancelled && setDay(d),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [today]);

  const open = useCallback(async (code: string, key = code) => {
    setOpening(key);
    try {
      const lookup = await lookupCode(code);
      setMode({ kind: "record", lookup, at: Date.now() });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setToast({
        tone: "error",
        text:
          err instanceof ApiError && err.status === 404
            ? `No pickup found for “${code.trim()}”.`
            : friendlyError(err),
      });
    } finally {
      setOpening(null);
    }
  }, []);

  // Deep links from Claims (?claim=), Pickups (?booking=) or a pasted code (?code=).
  useEffect(() => {
    const claimId = params.get("claim");
    const bookingId = params.get("booking");
    const code = params.get("code");
    let cancelled = false;
    const go = (ref: string | undefined) => ref && !cancelled && void open(ref);
    if (code) go(code);
    else if (claimId)
      api.get<Claim>(`/claims/${claimId}`).then(
        (c) => go(c.reference),
        () => undefined,
      );
    else if (bookingId)
      api.get<ManagerBooking>(`/bookings/${bookingId}`).then(
        (b) => go(bookingParty(b).reference),
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onScan(text: string) {
    setScanSheet(null);
    try {
      const lookup = await lookupCode(text);
      if (lookup.issues.some((i) => i.code === "ALREADY_COLLECTED")) {
        setScanSheet({ kind: "collected", lookup });
        return;
      }
      setScanning(false);
      setMode({ kind: "record", lookup, at: Date.now() });
    } catch {
      setScanSheet({ kind: "notfound" });
    }
  }

  function recorded(r: RecordedHandover) {
    if (mode.kind !== "record") return;
    setMode({ kind: "success", recorded: r, lookup: mode.lookup });
    setUndo({ id: r.id, startedAt: Date.now(), busy: false });
    void reload();
  }

  async function doUndo() {
    if (!undo || mode.kind !== "success") return;
    setUndo({ ...undo, busy: true });
    try {
      await api.post(`/handovers/${undo.id}/undo`);
      setUndo(null);
      setToast({
        tone: "success",
        text: "Handover undone. Nothing was recorded.",
      });
      const lookup = await lookupCode(mode.lookup.reference);
      setMode({ kind: "record", lookup, at: Date.now() });
      void reload();
    } catch (err) {
      setUndo(null);
      setToast({
        tone: "error",
        text: friendlyError(
          err,
          "Couldn’t undo. Edit the handover from the batch instead.",
        ),
      });
    }
  }

  const expireUndo = useCallback(() => setUndo(null), []);

  const stats = useMemo(() => {
    const active = (day?.bookings ?? []).filter(
      (b) => b.status === "BOOKED" || b.status === "COLLECTED",
    );
    return {
      collected: active.filter((b) => b.status === "COLLECTED").length,
      total: active.length,
    };
  }, [day]);

  // The next person still waiting, current slots first.
  const next = useMemo(() => {
    const now = day?.loadedAt ?? 0;
    return (day?.bookings ?? [])
      .filter(
        (b) =>
          b.status === "BOOKED" && new Date(b.slot.endTime).getTime() >= now,
      )
      .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime))[0];
  }, [day]);

  const now = day?.loadedAt ?? 0;
  const dateLabel = new Date(`${today}T12:00:00+08:00`)
    .toLocaleDateString("en-SG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Singapore",
    })
    .replace(",", "");
  const selectedBookingId =
    mode.kind === "record" ? (mode.lookup.booking?.id ?? null) : null;
  const detailOpen = mode.kind !== "list";

  const list = (
    <div className="flex flex-col">
      <div className="sticky top-[72px] z-[15] -mx-4 flex flex-col gap-2.5 bg-beige px-4 py-3 shadow-[0_1px_0_rgba(var(--rgb-hair),0.14)] md:-mx-0 md:px-0">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) void open(query.trim());
          }}
        >
          <label htmlFor="h-q" className="sr-only">
            Find a pickup
          </label>
          <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] bg-surface px-3.5 shadow-[inset_0_0_0_1px_var(--color-edge)] focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(var(--rgb-leaf),0.25)]">
            <MagnifyingGlass size={20} className="text-muted" aria-hidden />
            <input
              ref={searchRef}
              id="h-q"
              type="search"
              enterKeyHint="search"
              placeholder="Enter reference or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 grow border-none bg-transparent text-body text-ink outline-none"
            />
          </div>
        </form>
        <BigButton
          icon={<QrCode size={22} />}
          onClick={() => setScanning(true)}
        >
          Scan pickup pass
        </BigButton>
      </div>
      <div className="flex flex-col gap-2.5 pb-6 pt-2">
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
              We couldn’t load today’s pickups.
            </p>
            <div>
              <Button
                variant="secondary"
                size="sm"
                className="bg-cream"
                icon={<ArrowClockwise size={18} weight="bold" />}
                onClick={() => void reload()}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : !day ? (
          <ListRowsSkeleton />
        ) : stats.total === 0 && !query ? (
          <EmptyDay title="No pickups scheduled today" dateLabel={dateLabel} />
        ) : stats.collected === stats.total && !query ? (
          <AllDone todayKg={day.todayKg} />
        ) : (
          <PickupList
            slots={day.slots}
            bookings={day.bookings}
            now={now}
            query={query}
            selectedId={selectedBookingId}
            onOpen={(b) => void open(bookingParty(b).reference, b.id)}
            onNoShow={setNoShow}
          />
        )}
        {opening && <LoadingLabel>Opening pickup…</LoadingLabel>}
      </div>
    </div>
  );

  const detail =
    mode.kind === "record" ? (
      <RecordHandover
        key={mode.lookup.id + mode.lookup.status}
        lookup={mode.lookup}
        now={mode.at}
        online={online}
        onBack={() => setMode({ kind: "list" })}
        onRecorded={recorded}
      />
    ) : mode.kind === "success" ? (
      <SuccessView
        recorded={mode.recorded}
        todayKg={day?.todayKg ?? null}
        nextName={next ? bookingParty(next).name : null}
        onNext={() => next && void open(bookingParty(next).reference, next.id)}
        onBack={() => setMode({ kind: "list" })}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "flex items-center gap-2",
          detailOpen && "hidden lg:flex",
        )}
      >
        <div className="flex grow flex-col">
          <h1 className="font-display m-0 text-[26px] font-semibold leading-8 text-deep">
            Handover
          </h1>
          <span className="text-[13px] text-muted">
            {dateLabel}
            {day?.slots[0]?.effectiveLocation
              ? ` · ${day.slots[0].effectiveLocation}`
              : ""}
          </span>
        </div>
        {stats.total > 0 && (
          <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-sage px-3 text-[13px] font-bold text-deep">
            <Check size={14} weight="bold" aria-hidden />
            {stats.collected} of {stats.total} collected
          </span>
        )}
      </div>

      {detailOpen && mode.kind === "record" && (
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            aria-label="Back"
            onClick={() => setMode({ kind: "list" })}
            className="flex size-12 shrink-0 items-center justify-center rounded-[14px] text-deep hover:bg-sage"
          >
            <CaretLeft size={24} />
          </button>
          <div className="flex min-w-0 flex-col">
            <strong className="font-display text-xl font-semibold leading-[26px] text-deep">
              Record handover
            </strong>
            <span className="truncate text-xs text-muted">
              {mode.lookup.reference} · {mode.lookup.taker.name}
            </span>
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className={cn(detailOpen && "hidden lg:block")}>{list}</div>
        <div className={cn(!detailOpen && "hidden lg:block")}>
          {detail ?? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-card bg-cream p-10 text-center shadow-card">
              <span className="flex size-[120px] items-center justify-center rounded-full bg-sage">
                <Sprout width={84} />
              </span>
              <h2 className="font-display m-0 text-[22px] font-semibold text-deep">
                Ready for the next pickup
              </h2>
              <p className="max-w-[340px] text-small text-muted">
                Scan the taker’s pickup pass, type their reference, or pick them
                from today’s list.
              </p>
            </div>
          )}
        </div>
      </div>

      {scanning && (
        <QrScanner
          paused={!!scanSheet}
          onResult={(t) => void onScan(t)}
          onManual={() => {
            setScanning(false);
            setScanSheet(null);
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
          onClose={() => {
            setScanning(false);
            setScanSheet(null);
          }}
          sheet={
            scanSheet?.kind === "notfound" ? (
              <>
                <SheetHead tone="red" title="No pickup found for this code">
                  The pass might be from another day or already cancelled.
                </SheetHead>
                <BigButton
                  icon={<ArrowClockwise size={20} />}
                  onClick={() => setScanSheet(null)}
                >
                  Try again
                </BigButton>
                <BigButton
                  variant="secondary"
                  icon={<MagnifyingGlass size={20} />}
                  onClick={() => {
                    setScanning(false);
                    setScanSheet(null);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }}
                >
                  Search manually
                </BigButton>
              </>
            ) : scanSheet?.kind === "collected" ? (
              <>
                <SheetHead tone="sage" title="Already collected">
                  <strong className="block text-ink">
                    {scanSheet.lookup.reference} · {scanSheet.lookup.taker.name}{" "}
                    · {formatKg(scanSheet.lookup.kg)}kg
                  </strong>
                  {scanSheet.lookup.handover &&
                    `Collected ${sgDayKey(scanSheet.lookup.handover.handedOverAt) === today ? "today" : ""} at ${new Date(scanSheet.lookup.handover.handedOverAt).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" })} by ${scanSheet.lookup.handover.handedOverBy}.`}
                </SheetHead>
                <Link
                  href={`/manager/batches/${scanSheet.lookup.batch.id}`}
                  className="flex min-h-14 items-center justify-center gap-2.5 rounded-[14px] bg-leaf text-[17px] font-bold text-cream no-underline hover:bg-deep"
                >
                  <ClipboardText size={20} aria-hidden />
                  View record
                </Link>
                <BigButton
                  variant="secondary"
                  icon={<ArrowClockwise size={20} />}
                  onClick={() => setScanSheet(null)}
                >
                  Scan another
                </BigButton>
              </>
            ) : undefined
          }
        />
      )}

      {noShow && (
        <NoShowSheet
          booking={noShow}
          onClose={() => setNoShow(null)}
          onDone={(text) => {
            setNoShow(null);
            setToast({ tone: "success", text });
            void reload();
          }}
        />
      )}

      {undo && (
        <UndoToast
          startedAt={undo.startedAt}
          busy={undo.busy}
          onUndo={() => void doUndo()}
          onExpire={expireUndo}
        />
      )}
      {toast && !undo && (
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

function SheetHead({
  tone,
  title,
  children,
}: {
  tone: "red" | "sage";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          tone === "red"
            ? "bg-danger-tint text-danger-ink"
            : "bg-sage text-deep",
        )}
      >
        {tone === "red" ? (
          <WarningCircle size={22} />
        ) : (
          <Check size={22} weight="bold" />
        )}
      </span>
      <div>
        <h2 className="font-display m-0 text-xl font-semibold leading-[30px] text-deep">
          {title}
        </h2>
        <p className="text-small leading-5 text-muted">{children}</p>
      </div>
    </div>
  );
}

function EmptyDay({ title, dateLabel }: { title: string; dateLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex size-[140px] items-center justify-center rounded-full bg-sage">
        <EmptyPot width={110} />
      </span>
      <h2 className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep">
        {title}
      </h2>
      <p className="text-[15px] text-muted">
        Nothing is booked at the bin centre for {dateLabel}.
      </p>
      <Link
        href="/manager/slots"
        className="inline-flex min-h-11 items-center text-body font-bold text-deep"
      >
        View pickup calendar →
      </Link>
    </div>
  );
}

function AllDone({ todayKg }: { todayKg: number }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex size-[140px] items-center justify-center rounded-full bg-sage">
        <Sprout width={96} />
      </span>
      <h2 className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep">
        All of today’s pickups are done
      </h2>
      <div className="flex items-center gap-2.5 rounded-card bg-cream px-[18px] py-3.5 shadow-card">
        <Leaf size={22} className="text-leaf" aria-hidden />
        <span className="text-body">
          <strong className="font-display text-2xl font-semibold text-deep">
            {formatKg(todayKg)}kg
          </strong>{" "}
          diverted today
        </span>
      </div>
      <Link
        href="/manager/slots"
        className="inline-flex min-h-11 items-center text-body font-bold text-deep"
      >
        See tomorrow’s pickups →
      </Link>
    </div>
  );
}

function ListRowsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-[18px]">
      <LoadingLabel>Loading pickups…</LoadingLabel>
      {[1, 3, 1].map((n, i) => (
        <div key={i} aria-hidden className="flex flex-col gap-2">
          <Skeleton className="h-5 w-[70%]" />
          <Skeleton className="h-3.5 w-[45%]" />
          {Array.from({ length: n }, (_, j) => (
            <div
              key={j}
              className="flex items-center gap-3 rounded-[14px] bg-surface p-3.5 shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.25)]"
            >
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-4 w-[60%]" />
                <Skeleton className="h-3 w-[40%]" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Skeleton className="h-6 w-[50px]" />
                <Skeleton className="h-[22px] w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-[52px] w-full rounded-[14px]" />
      <Skeleton className="h-14 w-full rounded-[14px]" />
      <ListRowsSkeleton />
    </div>
  );
}
