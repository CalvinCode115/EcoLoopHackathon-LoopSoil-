"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Handbag } from "@phosphor-icons/react/dist/ssr/Handbag";
import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import { Leaf } from "@phosphor-icons/react/dist/ssr/Leaf";
import { Lock } from "@phosphor-icons/react/dist/ssr/Lock";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconArrowRight } from "@/components/brand/icons";
import { EmptyPot } from "@/components/brand/illustrations";
import { useTakerAccount } from "@/components/nav/taker-shell";
import {
  AmountPicker,
  resolvePick,
  type PickValue,
} from "@/components/taker/amount-picker";
import { AllowanceMeter, QualityChip } from "@/components/taker/batch-card";
import { StatusTimeline } from "@/components/taker/status-timeline";
import { ClaimStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, type Paginated } from "@/lib/api";
import { cn } from "@/lib/cn";
import { MAX_CLAIM_KG } from "@/lib/constants";
import { formatDayMonth, formatKg } from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { Batch, Claim } from "@/lib/types";

/** How often the batch's live stock is re-checked while the form is open. */
const POLL_MS = 30_000;

/**
 * Taker · Claim (/claim?batch=<id>) — boards "Claim · Mobile / Desktop / Custom amount /
 * 0.7kg allowance left / Above your limit / Stock changed / Account pending / 1kg limit
 * reached / Submitted", "Batch · Fully claimed / Claiming closed / Not found".
 * Data: GET /batches/:id (live pool + this taker's allowance), POST /claims.
 */
export default function ClaimPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ClaimScreen />
    </Suspense>
  );
}

type Load =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "error" }
  | { kind: "ready"; batch: Batch; loadedAt: number };

function ClaimScreen() {
  const batchId = useSearchParams().get("batch");
  const {
    taker,
    loading: accountLoading,
    refresh: refreshAccount,
  } = useTakerAccount();
  const [load, setLoad] = useState<Load>(
    batchId ? { kind: "loading" } : { kind: "notfound" },
  );
  const [pick, setPick] = useState<PickValue>({ mode: "half", custom: "" });
  const [stockChanged, setStockChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    claim: Claim;
    batch: Batch;
  } | null>(null);
  const lastRemaining = useRef<number | null>(null);

  const fetchBatch = useCallback(async (): Promise<Load> => {
    if (!batchId) return { kind: "notfound" };
    try {
      const batch = await api.get<Batch>(`/batches/${batchId}`);
      return { kind: "ready", batch, loadedAt: Date.now() };
    } catch (err) {
      // 404, or a malformed id (400 from the UUID check) — both mean "no such batch".
      if (
        err instanceof ApiError &&
        (err.status === 404 || err.status === 400)
      ) {
        return { kind: "notfound" };
      }
      return { kind: "error" };
    }
  }, [batchId]);

  /** Apply fresh data; flag "stock changed" when the kg left dropped since last look. */
  const apply = useCallback((next: Load) => {
    if (next.kind === "ready") {
      const prev = lastRemaining.current;
      if (prev !== null && next.batch.pool.kgRemaining < prev)
        setStockChanged(true);
      lastRemaining.current = next.batch.pool.kgRemaining;
    }
    setLoad(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchBatch().then((next) => !cancelled && apply(next));
    const id = setInterval(() => {
      void fetchBatch().then(
        (next) => !cancelled && next.kind === "ready" && apply(next),
      );
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchBatch, apply]);

  async function reload() {
    apply(await fetchBatch());
  }

  if (submitted) {
    return (
      <Page narrow>
        <SuccessCard claim={submitted.claim} batch={submitted.batch} />
      </Page>
    );
  }

  if (load.kind === "loading") return <LoadingState />;
  if (load.kind === "notfound") {
    return (
      <Page>
        <PageHeader />
        <NotFoundCard />
      </Page>
    );
  }
  if (load.kind === "error") {
    return (
      <Page>
        <PageHeader />
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-card bg-danger-tint p-4"
        >
          <div className="flex items-start gap-3 text-small font-semibold text-danger-ink">
            <WarningCircle
              size={20}
              weight="bold"
              className="shrink-0"
              aria-hidden
            />
            <span>
              We couldn’t load this batch. Check your connection and try again.
            </span>
          </div>
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
      </Page>
    );
  }

  // ── Ready: work out which state the right-hand panel shows ──────────────────
  const { batch } = load;
  const left = Math.max(0, batch.pool.kgRemaining);
  const now = load.loadedAt;
  const closed =
    batch.status !== "OPEN" ||
    (batch.availableUntil !== null &&
      new Date(batch.availableUntil).getTime() < now);
  const notYetOpen =
    batch.availableFrom !== null &&
    new Date(batch.availableFrom).getTime() > now;
  const soldOut = !closed && left <= 0;
  const lockReason = accountLoading
    ? undefined
    : claimLockReason(taker?.status);
  const allowance = batch.allowanceLeftKg ?? MAX_CLAIM_KG;
  const limitReached = !lockReason && allowance <= 0;
  const max = Math.min(allowance, left);
  const { amount, error } = resolvePick(pick, max);
  // A quick pick above the new max after stock dropped also counts as "over".
  const over = amount > max + 1e-9;
  const canSubmit = !lockReason && amount > 0 && !error && !over && !busy;

  async function submit() {
    setBusy(true);
    setSubmitError(null);
    try {
      const claim = await api.post<Claim>("/claims", {
        batchId: batch.id,
        requestedKg: amount,
      });
      setSubmitted({
        claim,
        batch: { ...batch, allowanceLeftKg: allowance - amount },
      });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "INSUFFICIENT_POOL") {
        // Keep their amount in the custom field so they can adjust it.
        setPick({ mode: "custom", custom: formatKg(amount) });
        setStockChanged(true);
        await reload();
      } else if (
        code === "CLAIM_ALLOWANCE_EXCEEDED" ||
        code.startsWith("BATCH_")
      ) {
        await reload();
        setSubmitError(friendlyError(err));
      } else if (code.startsWith("TAKER_")) {
        await refreshAccount();
        setSubmitError(friendlyError(err));
      } else {
        setSubmitError(
          friendlyError(err, "Couldn’t submit your claim. Please try again."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  let panel: ReactNode;
  if (closed || notYetOpen) {
    panel = (
      <UnavailablePanel
        batch={batch}
        title={
          notYetOpen && !closed
            ? "Claiming hasn’t opened yet"
            : "Claiming for this batch has closed"
        }
        body={
          notYetOpen && !closed
            ? `Claims for this batch open on ${formatDayMonth(batch.availableFrom!)}.` // [draft copy]
            : batch.availableUntil
              ? `Claims for this batch ended on ${formatDayMonth(batch.availableUntil)}.`
              : "Claims for this batch have ended."
        }
      />
    );
  } else if (soldOut) {
    panel = (
      <UnavailablePanel
        batch={batch}
        title="This batch has all been claimed"
        body="Good news — every bit of it is going to a garden. New batches are added regularly."
        showMyClaims
      />
    );
  } else if (limitReached) {
    panel = (
      <FormCard>
        <h2 className="font-display m-0 text-h3 font-semibold text-deep">
          How much would you like?
        </h2>
        <AllowanceMeter leftKg={0} />
        <div className="flex flex-col gap-3">
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-control bg-sage px-3.5 py-3 text-[15px] font-semibold leading-[22px] text-deep"
          >
            <Info
              size={18}
              weight="bold"
              className="mt-px shrink-0"
              aria-hidden
            />
            <span>You’ve reached your 1kg limit for this batch</span>
          </p>
          <Button href="/my-claims" fullWidth>
            View my claims
          </Button>
        </div>
        <p className="text-small text-muted">
          Your active claims on this batch already add up to 1kg. You can claim
          again from a new batch.
        </p>
      </FormCard>
    );
  } else {
    const showStockAlert = stockChanged && (over || !!error);
    panel = (
      <FormCard
        as="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        <h2 className="font-display m-0 text-h3 font-semibold text-deep">
          How much would you like?
        </h2>
        <AllowanceMeter leftKg={allowance} />
        {showStockAlert && (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-control bg-danger-tint px-4 py-3 text-danger-ink"
          >
            <p className="flex items-center gap-2.5 text-[15px] font-bold leading-[22px]">
              <WarningCircle size={20} weight="bold" aria-hidden />
              Only {formatKg(left)}kg left now. Adjust your amount?
            </p>
            <p className="pl-[30px] text-small">
              Someone else claimed some while you were choosing. We kept your
              amount so you can adjust it.
            </p>
          </div>
        )}
        <AmountPicker
          value={pick}
          onChange={(v) => {
            setPick(v);
            setSubmitError(null);
          }}
          max={max}
          allowanceLeft={allowance}
          disabled={!!lockReason}
        />
        <div
          aria-live="polite"
          className="flex items-baseline justify-between gap-2 px-1 pt-1"
        >
          <span className="text-body font-semibold">You’re requesting</span>
          <span className="font-display text-[28px] font-semibold leading-9 text-deep">
            {lockReason ? "0kg" : error || over ? "—" : `${formatKg(amount)}kg`}
          </span>
        </div>
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-sage p-4">
          <p className="text-[13px] font-bold uppercase leading-4 tracking-[0.06em] text-deep">
            Summary
          </p>
          <div className="flex justify-between text-[15px] leading-[22px]">
            <span>Amount</span>
            <strong>
              {lockReason || error || over ? "—" : `${formatKg(amount)}kg`}
            </strong>
          </div>
          <div className="flex justify-between gap-3 text-[15px] leading-[22px]">
            <span>Pickup</span>
            <strong className="text-right">SUSS bin centre</strong>
          </div>
          <p className="flex items-start gap-2 pt-2 text-small text-deep shadow-[inset_0_1px_0_rgba(47,74,36,0.15)]">
            <Package size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Your compost will be packed in ½kg/1kg bags or scooped to your
              exact amount at pickup.
            </span>
          </p>
          <p className="flex items-start gap-2 text-small text-deep">
            <CalendarBlank size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong>Next:</strong> once approved, you’ll book a pickup slot.
            </span>
          </p>
        </div>
        {submitError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control bg-danger-tint px-4 py-3 text-small font-semibold text-danger-ink"
          >
            <WarningCircle
              size={18}
              weight="bold"
              className="shrink-0"
              aria-hidden
            />
            <span>{submitError}</span>
          </p>
        )}
        <div className={cn("mt-1", lockReason && "pt-14")}>
          {lockReason ? (
            <div className="relative w-full">
              <Button
                fullWidth
                disabled
                icon={<Lock size={18} weight="bold" />}
                aria-describedby="claim-lock-tip"
              >
                Submit claim
              </Button>
              {/* Pinned open here (unlike the browse cards): it's the only thing to do. */}
              <span
                id="claim-lock-tip"
                role="tooltip"
                className="absolute bottom-[calc(100%+10px)] left-1/2 z-[5] w-60 -translate-x-1/2 rounded-[10px] bg-ink px-3 py-2.5 text-center text-[13px] leading-[18px] text-cream shadow-card"
              >
                {lockReason}
              </span>
            </div>
          ) : (
            <Button
              type="submit"
              fullWidth
              disabled={!canSubmit}
              loading={busy}
            >
              {busy ? "Submitting…" : "Submit claim"}
            </Button>
          )}
        </div>
      </FormCard>
    );
  }

  return (
    <Page>
      <PageHeader />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8">
        <BatchInfoPanel
          batch={batch}
          loadedAt={load.loadedAt}
          stockChanged={stockChanged && (over || !!error)}
          statusChip={
            closed ? "Claiming closed" : soldOut ? "Fully claimed" : undefined
          }
        />
        {panel}
      </div>
    </Page>
  );
}

function claimLockReason(status: string | undefined): string | undefined {
  switch (status) {
    case "APPROVED":
      return undefined;
    case "SUSPENDED":
      return "Claiming is paused while your account is suspended.";
    case "REJECTED":
      return "Claiming isn’t available for this account."; // [draft copy]
    default:
      return "Claiming unlocks once your account is approved.";
  }
}

// ─── Layout pieces ───────────────────────────────────────────────────────────

function Page({
  children,
  narrow = false,
}: {
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pb-8 pt-5 md:gap-8 md:px-8 md:pb-16 md:pt-10 lg:px-10">
      {narrow ? (
        <div className="mx-auto w-full max-w-[520px]">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-1.5">
      <Link
        href="/batches"
        className="-ml-1 inline-flex h-11 items-center gap-1 self-start rounded-control pr-2 text-small font-semibold text-deep no-underline hover:bg-sage"
      >
        <CaretLeft size={18} weight="bold" aria-hidden /> All batches
      </Link>
      <h1 className="font-display m-0 text-[28px] font-semibold leading-9 text-deep md:text-[32px] md:leading-10">
        Claim compost
      </h1>
    </div>
  );
}

function FormCard({
  as: Tag = "section",
  children,
  onSubmit,
}: {
  as?: "section" | "form";
  children: ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Tag
      {...(Tag === "form" ? { onSubmit, "aria-label": "Claim form" } : {})}
      className="flex flex-col gap-4 rounded-card bg-cream p-5 shadow-card lg:p-7"
    >
      {children}
    </Tag>
  );
}

/** Left column: batch reference, quality, live stock, dates and location. */
function BatchInfoPanel({
  batch,
  loadedAt,
  stockChanged,
  statusChip,
}: {
  batch: Batch;
  loadedAt: number;
  stockChanged: boolean;
  statusChip?: string;
}) {
  const left = Math.max(0, batch.pool.kgRemaining);
  const of = batch.pool.publicPoolKg;
  const share = of > 0 ? left / of : 0;
  const low = left > 0 && share < 0.2;
  return (
    <section className="flex flex-col gap-[18px] rounded-card bg-cream p-5 shadow-card lg:p-7">
      <div className="flex flex-col gap-2">
        <h2 className="font-display m-0 text-2xl font-semibold leading-8 text-deep">
          Batch {batch.reference}
        </h2>
        <div className="flex flex-wrap gap-2">
          {batch.phReading !== null && <QualityChip ph={batch.phReading} />}
          {statusChip && (
            <span className="inline-flex h-[26px] items-center rounded-full bg-grey-tint px-2.5 text-[13px] font-bold text-grey-ink">
              {statusChip}
            </span>
          )}
          {!statusChip && low && (
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-amber-tint px-2.5 text-[13px] font-bold text-amber-ink">
              <WarningCircle size={14} weight="bold" aria-hidden /> Almost gone
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[14px] bg-white p-4 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "font-display text-[40px] font-semibold leading-[44px]",
              left <= 0 ? "text-grey-ink" : "text-deep",
            )}
          >
            {formatKg(left)}
          </span>
          <span className="font-semibold">kg left</span>
          <span className="ml-auto text-small text-muted">
            of {formatKg(of)}kg
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={of}
          aria-valuenow={left}
          aria-label={`${formatKg(left)} of ${formatKg(of)} kg remaining`}
          className="h-2 overflow-hidden rounded-full bg-sage"
        >
          <div
            className={cn(
              "h-full rounded-full",
              low ? "bg-[#C98217]" : "bg-leaf",
            )}
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </div>
        {stockChanged ? (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-amber-ink">
            <WarningCircle size={14} weight="bold" aria-hidden /> Just updated:
            stock changed while you were choosing
          </p>
        ) : (
          <UpdatedAgo loadedAt={loadedAt} />
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        <InfoRow
          icon={<CalendarBlank size={18} />}
          label="Harvested"
          value={formatDayMonth(batch.harvestDate)}
        />
        <InfoRow
          icon={<MapPin size={18} />}
          label="Pickup location"
          value={
            batch.pickupLocation
              ? `SUSS bin centre · ${batch.pickupLocation}`
              : "SUSS bin centre"
          }
        />
        <InfoRow
          icon={<Clock size={18} />}
          label="Claim window"
          value={
            batch.availableUntil
              ? `Open until ${formatDayMonth(batch.availableUntil)}`
              : "Open"
          }
        />
      </div>
      <p className="flex items-start gap-2.5 pt-1 text-small text-deep">
        <Leaf size={18} className="mt-px shrink-0 text-leaf" aria-hidden />
        <span>
          Made from SUSS campus food waste, cured and quality-checked.
        </span>
      </p>
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sage text-deep">
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-[13px] leading-[18px] text-muted">{label}</span>
        <span className="text-body font-semibold leading-6">{value}</span>
      </div>
    </div>
  );
}

/** "Updated just now" → "Updated 3 min ago"; ticks once a minute. */
function UpdatedAgo({ loadedAt }: { loadedAt: number }) {
  const [now, setNow] = useState(loadedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.max(0, Math.floor((now - loadedAt) / 60_000));
  return (
    <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
      <ArrowClockwise size={14} aria-hidden /> Updated{" "}
      {mins < 1 ? "just now" : `${mins} min ago`}
    </p>
  );
}

// ─── Unavailable (fully claimed / closed) ────────────────────────────────────

/**
 * Replaces the form when the batch can't be claimed: explanation, the taker's own claims
 * on it (fully-claimed case), and other open batches to try instead.
 */
function UnavailablePanel({
  batch,
  title,
  body,
  showMyClaims = false,
}: {
  batch: Batch;
  title: string;
  body: string;
  showMyClaims?: boolean;
}) {
  const [mine, setMine] = useState<Claim[]>([]);
  const [others, setOthers] = useState<Batch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<Paginated<Batch>>("/batches?pageSize=100")
      .then((p) => {
        if (!cancelled)
          setOthers(
            p.data.filter((b) => b.id !== batch.id && b.pool.kgRemaining > 0),
          );
      })
      .catch(() => !cancelled && setOthers([]));
    if (showMyClaims) {
      void api
        .get<Paginated<Claim>>(`/claims?batchId=${batch.id}&pageSize=100`)
        .then((p) => !cancelled && setMine(p.data))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [batch.id, showMyClaims]);

  return (
    <section className="flex flex-col gap-5 rounded-card bg-cream p-5 text-center shadow-card lg:p-7">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-32 items-center justify-center rounded-full bg-sage">
          <EmptyPot width={104} />
        </div>
        <h3 className="font-display m-0 text-h3 font-semibold text-deep">
          {title}
        </h3>
        <p className="text-[15px] leading-[23px] text-muted">{body}</p>
      </div>

      {mine.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-white px-4 py-3.5 text-left shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]">
          <span className="text-[13px] font-bold uppercase leading-4 tracking-[0.06em] text-muted">
            Your claims on this batch
          </span>
          {mine.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="text-[15px] leading-[22px]">
                <strong>{c.reference}</strong> ·{" "}
                {formatKg(Number(c.approvedKg ?? c.requestedKg))}kg
              </span>
              <ClaimStatusBadge status={c.status} />
            </div>
          ))}
          <Button
            href="/my-claims"
            variant="link"
            size="sm"
            className="self-start"
            iconAfter={<IconArrowRight size={16} />}
          >
            View in My Claims
          </Button>
        </div>
      )}

      {others === null ? (
        <Skeleton className="h-24 rounded-[14px]" />
      ) : others.length > 0 ? (
        <div className="flex flex-col gap-2.5 text-left">
          <h3 className="font-display m-0 text-lg font-semibold leading-[26px] text-deep">
            Other compost available
          </h3>
          {others.slice(0, 3).map((b) => (
            <article
              key={b.id}
              className="flex flex-col gap-2.5 rounded-[14px] bg-white px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">Batch {b.reference}</span>
                <span className="whitespace-nowrap text-small text-muted">
                  <strong className="text-xl text-deep">
                    {formatKg(b.pool.kgRemaining)}kg
                  </strong>{" "}
                  left
                </span>
              </div>
              {b.availableUntil && (
                <span className="text-[13px] leading-[18px] text-muted">
                  Claim by {formatDayMonth(b.availableUntil)}
                </span>
              )}
              <Button href={`/claim?batch=${b.id}`} size="sm" fullWidth>
                Claim compost
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2.5 rounded-[14px] bg-sage p-4">
          <p className="text-[15px] font-semibold leading-[23px] text-deep">
            No other batches right now — check back soon.
          </p>
          <Button
            href="/batches"
            variant="secondary"
            fullWidth
            className="bg-cream"
          >
            Back to compost
          </Button>
        </div>
      )}
    </section>
  );
}

// ─── Success / not found / loading ───────────────────────────────────────────

function SuccessCard({ claim, batch }: { claim: Claim; batch: Batch }) {
  return (
    <section className="flex flex-col gap-5 rounded-card bg-cream p-6 shadow-card md:p-10">
      <div
        role="status"
        className="flex flex-col items-center gap-3.5 text-center"
      >
        <div
          aria-hidden
          className="mb-2 mt-3 flex size-[72px] items-center justify-center rounded-full bg-leaf text-cream shadow-[0_0_0_10px_var(--color-sage)]"
        >
          <Check size={36} weight="bold" />
        </div>
        <p className="inline-flex items-center gap-2 rounded-2xl bg-leaf px-3 py-1 text-small font-semibold tracking-[0.02em] text-cream">
          <span aria-hidden className="size-2 rounded-full bg-sage" /> Claim
          submitted
        </p>
        <h1 className="font-display m-0 text-[28px] font-semibold leading-9 text-deep">
          Claim <span className="text-leaf">{claim.reference}</span> submitted
        </h1>
        <p className="max-w-[340px] text-body">
          We’ll notify you on WhatsApp once it’s reviewed.
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]">
        <InfoRow
          icon={<Handbag size={18} />}
          label="Requested"
          value={`${formatKg(Number(claim.requestedKg))}kg · Batch ${batch.reference}`}
        />
        <InfoRow
          icon={<MapPin size={18} />}
          label="Pickup location"
          value="SUSS bin centre"
        />
      </div>
      <AllowanceMeter leftKg={batch.allowanceLeftKg ?? 0} />
      <StatusTimeline current={1} />
      <div className="flex flex-col gap-2">
        <Button href="/my-claims" fullWidth>
          View my claims
        </Button>
        <Button href="/batches" variant="secondary" fullWidth>
          Back to compost
        </Button>
      </div>
    </section>
  );
}

function NotFoundCard() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-10 text-center shadow-card">
      <div className="mb-2 flex size-40 items-center justify-center rounded-full bg-sage">
        <EmptyPot width={130} />
      </div>
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        We couldn’t find this batch
      </h2>
      <p className="max-w-[360px] text-body text-muted">
        It may have been removed or the link is incorrect.
      </p>
      <div className="mt-2 w-full md:w-auto">
        <Button href="/batches" fullWidth>
          Browse available compost
        </Button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <Page>
      <LoadingLabel>Loading batch…</LoadingLabel>
      <PageHeader />
      <div
        aria-hidden
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8"
      >
        <div className="flex flex-col gap-4 rounded-card bg-cream p-5 shadow-card lg:p-7">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-28 w-full rounded-[14px]" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-3/5" />
        </div>
        <div className="flex flex-col gap-4 rounded-card bg-cream p-5 shadow-card lg:p-7">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-[52px] w-full" />
          <Skeleton className="h-32 w-full rounded-[14px]" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </Page>
  );
}
