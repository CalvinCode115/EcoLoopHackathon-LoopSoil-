"use client";

import { CalendarCheck } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
import { CalendarPlus } from "@phosphor-icons/react/dist/ssr/CalendarPlus";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useState } from "react";
import {
  BatchStatusSummary,
  NextRelease,
  RunningLow,
  StockByBatch,
  StockRemaining,
} from "@/components/manager/dashboard/widgets-batches";
import {
  ByGroup,
  PendingClaimsPreview,
  TodayAgenda,
  WeekStrip,
  WeeklyTrend,
} from "@/components/manager/dashboard/widgets-ops";
import {
  ActionCard,
  Delta,
  FirstRun,
  KpiCard,
  KpiSkeleton,
  RangePicker,
  WidgetState,
} from "@/components/manager/dashboard/widgets-top";
import { formatElapsed } from "@/components/manager/claims/claim-utils";
import {
  sgInstant,
  weekStart as weekStartOf,
} from "@/components/manager/pickups/calendar-utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { addDays } from "@/lib/batch-form";
import { firstName, formatClock, formatKg, sgDayKey } from "@/lib/format";
import type {
  AnalyticsReport,
  Batch,
  Claim,
  ManagerBooking,
  ManagerDashboard,
  Slot,
  TakerRecord,
} from "@/lib/types";
import {
  RANGE_COMPARE_LABEL,
  rangeBounds,
  useLoad,
  type RangePreset,
} from "@/lib/use-load";
import { WEEKLY_TARGET_KG } from "@/lib/site-config";

const ALL = "pageSize=100";
const TREND_WEEKS = 9;

const RANGE_PERIOD_LABEL: Record<RangePreset, string> = {
  week: "this week",
  month: "this month",
  "3months": "in the last 3 months",
  year: "this year",
  all: "all time",
  custom: "in this period",
};

/**
 * Manager · Dashboard (/manager) — boards "Manager · dashboard 1440 / 1280 / 1024", "first
 * run", "loading", "widget error", "top-up". What needs attention, key figures vs the
 * previous period, batch stock, this week's pickups and the trends. Every widget loads and
 * fails on its own. Data: GET /manager/dashboard, GET /reporting/analytics (range + a fixed
 * 9-week trend), and the batch / claim / taker / slot / booking lists.
 */
export default function ManagerDashboardPage() {
  const { user } = useAuth();
  const [now] = useState(() => Date.now());
  const [range, setRange] = useState<RangePreset>("month");
  const [custom, setCustom] = useState(() => {
    const today = sgDayKey(new Date().toISOString());
    return { from: addDays(today, -29), to: today };
  });
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const today = sgDayKey(new Date(now).toISOString());
  const monday = weekStartOf(today);
  const bounds = rangeBounds(range, now, custom);
  const trendFrom = sgInstant(addDays(monday, -7 * (TREND_WEEKS - 1)), "00:00");
  const weekQ = `from=${encodeURIComponent(sgInstant(monday, "00:00"))}&to=${encodeURIComponent(sgInstant(addDays(monday, 7), "00:00"))}&${ALL}`;

  const dash = useLoad(`dash-${refresh}`, () =>
    api.get<ManagerDashboard>("/manager/dashboard"),
  );
  const analytics = useLoad(
    `an-${bounds.from}-${range === "custom" ? bounds.to : range}-${refresh}`,
    () =>
      api.get<AnalyticsReport>(
        `/reporting/analytics?${bounds.from ? `from=${encodeURIComponent(bounds.from)}&` : ""}to=${encodeURIComponent(bounds.to)}`,
      ),
  );
  const trend = useLoad(`trend-${refresh}`, () =>
    api.get<AnalyticsReport>(
      `/reporting/analytics?from=${encodeURIComponent(trendFrom)}&to=${encodeURIComponent(new Date(now).toISOString())}`,
    ),
  );
  const batches = useLoad(`batches-${refresh}`, () =>
    api.get<Paginated<Batch>>(`/batches?${ALL}`).then((p) => p.data),
  );
  const pending = useLoad(`pending-${refresh}`, () =>
    api.get<Paginated<Claim>>(`/claims?status=PENDING&${ALL}`),
  );
  const vetting = useLoad(`vetting-${refresh}`, () =>
    api
      .get<Paginated<TakerRecord>>(
        `/takers?type=INDIVIDUAL&status=PENDING&${ALL}`,
      )
      .then((p) => p.data),
  );
  const week = useLoad(`week-${refresh}`, async () => {
    const [slots, bookings] = await Promise.all([
      api.get<Paginated<Slot>>(`/slots?${weekQ}`),
      api.get<Paginated<ManagerBooking>>(`/bookings?${weekQ}`),
    ]);
    return { slots: slots.data, bookings: bookings.data };
  });
  const firstRun = batches.status === "ready" && batches.data.length === 0;
  const setup = useLoad(
    firstRun ? `setup-${refresh}` : "setup-skip",
    async () => {
      if (!firstRun) return null;
      const [slots, bulk] = await Promise.all([
        api.get<Paginated<Slot>>("/slots?pageSize=1"),
        api.get<Paginated<TakerRecord>>("/takers?type=BULK&pageSize=1"),
      ]);
      return { slots: slots.meta.total, bulk: bulk.meta.total };
    },
  );

  const reload = () => setRefresh((n) => n + 1);
  const changed = (text: string, tone: "success" | "error" = "success") => {
    setToast({ tone, text });
    if (tone === "success") reload();
  };

  const hour = Number(
    new Date(now).toLocaleString("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Singapore",
    }),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateText = new Date(now).toLocaleDateString("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

  // ── Needs attention ──
  const pipeline = dash.status === "ready" ? dash.data.pipeline : null;
  const oldestPending =
    pending.status === "ready" && pending.data.data.length
      ? [...pending.data.data].sort((a, b) =>
          a.submittedAt.localeCompare(b.submittedAt),
        )[0]
      : null;
  const signedUpThisWeek =
    vetting.status === "ready"
      ? vetting.data.filter(
          (t) => t.createdAt && t.createdAt >= sgInstant(monday, "00:00"),
        ).length
      : 0;
  const todays =
    week.status === "ready"
      ? week.data.bookings.filter(
          (b) =>
            (b.status === "BOOKED" || b.status === "COLLECTED") &&
            sgDayKey(b.slot.startTime) === today,
        )
      : [];
  const nextToday = todays
    .filter(
      (b) => b.status === "BOOKED" && new Date(b.slot.endTime).getTime() >= now,
    )
    .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime))[0];

  const compare = RANGE_COMPARE_LABEL[range];
  const openBatches =
    batches.status === "ready"
      ? batches.data.filter((b) => b.status === "OPEN")
      : [];
  const kgAvailable = openBatches.reduce(
    (s, b) => s + Math.max(0, b.pool.kgRemaining),
    0,
  );
  const spark = (key: keyof AnalyticsReport["sparklines"]) =>
    analytics.status === "ready"
      ? analytics.data.sparklines[key].map((p, i) => ({
          label: `W${i + 1}`,
          value: p.value,
        }))
      : undefined;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display m-0 text-[32px] font-semibold leading-10 text-deep">
            {greeting}
            {user?.name ? `, ${firstName(user.name)}` : ""}
          </h1>
          <p className="text-[15px] leading-[23px] text-muted">{dateText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <RangePicker
            value={range}
            onChange={setRange}
            custom={custom}
            onCustom={setCustom}
          />
          <Button
            href="/manager/slots?create=1"
            variant="secondary"
            size="sm"
            className="px-[18px]"
            icon={<CalendarPlus size={18} />}
          >
            Create pickup slot
          </Button>
          <Button
            href="/manager/batches/new"
            size="sm"
            className="px-[18px]"
            icon={<Plus size={18} weight="bold" />}
          >
            Log new batch
          </Button>
        </div>
      </div>

      <section
        aria-labelledby="attention-title"
        className="flex flex-col gap-3"
      >
        <h2
          id="attention-title"
          className="font-display m-0 text-xl font-semibold leading-7 text-deep"
        >
          Needs attention
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            title="Pending claims"
            count={pipeline?.claims.pending ?? null}
            detail={
              oldestPending
                ? `Oldest waiting ${formatElapsed(oldestPending.submittedAt, now)}`
                : "Waiting for review"
            }
            cta="Review claims"
            href="/manager/claims"
            icon={<ClipboardText size={18} weight="bold" />}
          />
          <ActionCard
            title="Takers awaiting approval"
            count={pipeline?.takers.pendingVetting ?? null}
            detail={
              signedUpThisWeek
                ? `${signedUpThisWeek} signed up this week`
                : "Waiting for vetting"
            }
            cta="Review takers"
            href="/manager/takers"
            icon={<UserPlus size={18} weight="bold" />}
          />
          <ActionCard
            title="Pickups today"
            count={week.status === "ready" ? todays.length : null}
            detail={
              nextToday
                ? `Next at ${formatClock(nextToday.slot.startTime)}`
                : "All collected"
            }
            cta="Open handover"
            href="/manager/handover"
            tone="sage"
            icon={<CalendarCheck size={18} weight="bold" />}
          />
          <ActionCard
            title="Overdue collections"
            count={pipeline?.bookings.overdue ?? null}
            detail="Past collection deadline"
            cta="View claims"
            href="/manager/claims"
            urgent
            icon={<WarningCircle size={18} weight="bold" />}
          />
        </div>
      </section>

      {firstRun ? (
        <FirstRun
          steps={[
            {
              title: "Log your first batch",
              body: "Record the harvest date and kg so takers can start claiming.",
              done: false,
              href: "/manager/batches/new",
              cta: "Log new batch",
            },
            {
              title: "Create pickup slots",
              body: "Add the times takers can collect from the bin centre.",
              done:
                setup.status === "ready" &&
                !!setup.data &&
                setup.data.slots > 0,
              href: "/manager/slots?create=1",
              cta: "Create pickup slot",
            },
            {
              title: "Add a bulk taker",
              body: "Set up NParks, schools or town councils for bulk allocations.",
              done:
                setup.status === "ready" && !!setup.data && setup.data.bulk > 0,
              href: "/manager/takers",
              cta: "Add bulk taker",
            },
          ]}
        />
      ) : (
        <>
          <section
            aria-label="Key figures"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          >
            {analytics.status === "loading" ? (
              [0, 1, 2, 3, 4].map((i) => <KpiSkeleton key={i} />)
            ) : analytics.status === "error" ? (
              <div className="col-span-full rounded-card bg-cream p-2 shadow-card">
                <WidgetState
                  status="error"
                  onRetry={analytics.reload}
                  skeleton={null}
                >
                  {() => null}
                </WidgetState>
              </div>
            ) : (
              <>
                <KpiCard
                  label="Total kg diverted"
                  value={formatKg(analytics.data.kpis.kgDiverted.value ?? 0)}
                  unit="kg"
                  spark={spark("kgDiverted")}
                  delta={
                    <Delta
                      mode="percent"
                      label={compare}
                      {...analytics.data.kpis.kgDiverted}
                    />
                  }
                />
                <KpiCard
                  label="kg available now"
                  value={
                    batches.status === "ready" ? formatKg(kgAvailable) : "–"
                  }
                  unit="kg"
                  sub={`across ${openBatches.length} open batch${openBatches.length === 1 ? "" : "es"}`}
                />
                <KpiCard
                  label="Active takers"
                  value={String(analytics.data.kpis.activeTakers.value ?? 0)}
                  spark={spark("activeTakers")}
                  delta={
                    <Delta
                      mode="percent"
                      label={compare}
                      {...analytics.data.kpis.activeTakers}
                    />
                  }
                />
                <KpiCard
                  label="Collection rate"
                  value={
                    analytics.data.kpis.collectionRate.value == null
                      ? "—"
                      : String(analytics.data.kpis.collectionRate.value)
                  }
                  unit={
                    analytics.data.kpis.collectionRate.value == null
                      ? undefined
                      : "%"
                  }
                  spark={spark("collectionRate")}
                  delta={
                    <Delta
                      mode="points"
                      label={compare}
                      {...analytics.data.kpis.collectionRate}
                    />
                  }
                />
                <KpiCard
                  label="Batches completed"
                  value={String(
                    analytics.data.kpis.batchesCompleted.value ?? 0,
                  )}
                  spark={spark("batchesCompleted")}
                  delta={
                    <Delta
                      mode="count"
                      label={compare}
                      {...analytics.data.kpis.batchesCompleted}
                    />
                  }
                />
              </>
            )}
          </section>

          <section
            aria-labelledby="batch-overview"
            className="flex flex-col gap-3"
          >
            <h2
              id="batch-overview"
              className="font-display m-0 text-xl font-semibold leading-7 text-deep"
            >
              Batch overview
            </h2>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
              <Box state={batches}>{(b) => <StockByBatch batches={b} />}</Box>
              <div className="flex flex-col gap-4">
                <Box state={batches}>
                  {(b) => <StockRemaining batches={b} />}
                </Box>
                <Box state={batches}>
                  {(b) => <BatchStatusSummary batches={b} />}
                </Box>
              </div>
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Box state={batches}>
                {(b) => <NextRelease batches={b} now={now} />}
              </Box>
              {batches.status === "ready" && (
                <RunningLow batches={batches.data} now={now} />
              )}
            </div>
          </section>

          <section
            aria-labelledby="pickups-claims"
            className="flex flex-col gap-3"
          >
            <h2
              id="pickups-claims"
              className="font-display m-0 text-xl font-semibold leading-7 text-deep"
            >
              Pickups &amp; claims
            </h2>
            <Box state={week}>
              {(w) => (
                <WeekStrip
                  weekStart={monday}
                  today={today}
                  slots={w.slots}
                  bookings={w.bookings}
                />
              )}
            </Box>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Box state={week}>
                {(w) => (
                  <TodayAgenda today={today} bookings={w.bookings} now={now} />
                )}
              </Box>
              <Box state={pending}>
                {(p) => (
                  <PendingClaimsPreview
                    claims={p.data}
                    total={p.meta.total}
                    now={now}
                    onChanged={changed}
                  />
                )}
              </Box>
            </div>
          </section>

          <section aria-labelledby="trends" className="flex flex-col gap-3">
            <h2
              id="trends"
              className="font-display m-0 text-xl font-semibold leading-7 text-deep"
            >
              Trends
            </h2>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <Box state={trend}>
                {(t) => (
                  <WeeklyTrend
                    weekly={t.weekly.slice(-TREND_WEEKS)}
                    targetKg={WEEKLY_TARGET_KG}
                  />
                )}
              </Box>
              <Box state={analytics}>
                {(a) => (
                  <ByGroup
                    byGroup={a.byGroup}
                    periodLabel={RANGE_PERIOD_LABEL[range]}
                  />
                )}
              </Box>
            </div>
          </section>
        </>
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

/** Card-shaped loading / error placeholder around one widget. */
function Box<T>({
  state,
  children,
}: {
  state: {
    status: "loading" | "error" | "ready";
    data?: T;
    reload: () => void;
  };
  children: (data: T) => React.ReactNode;
}) {
  if (state.status === "ready") return <>{children(state.data as T)}</>;
  return (
    <div className="rounded-card bg-cream p-5 shadow-card">
      <WidgetState
        status={state.status}
        onRetry={state.reload}
        skeleton={
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-56" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        }
      >
        {() => null}
      </WidgetState>
    </div>
  );
}
