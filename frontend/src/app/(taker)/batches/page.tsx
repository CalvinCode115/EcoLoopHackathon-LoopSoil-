"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { Basket } from "@phosphor-icons/react/dist/ssr/Basket";
import { CalendarCheck } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { IconArrowRight } from "@/components/brand/icons";
import { EmptyPot } from "@/components/brand/illustrations";
import { useTakerAccount } from "@/components/nav/taker-shell";
import { BatchCard } from "@/components/taker/batch-card";
import { Button } from "@/components/ui/button";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { firstName, formatKg } from "@/lib/format";
import { BIN_CENTRE_MAP_URL } from "@/lib/site-config";
import type { Batch } from "@/lib/types";

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; batches: Batch[]; loadedAt: number };

/**
 * Taker · Browse (/batches) — boards "Browse · Mobile / Desktop / Account pending /
 * Suspended / Loading / Empty / Error". Data: GET /batches (takers only ever get OPEN
 * batches, newest first), each with its live pool and this taker's allowance.
 */
export default function BrowsePage() {
  const { user } = useAuth();
  const { taker, loading: accountLoading } = useTakerAccount();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  const fetchBatches = useCallback(async () => {
    try {
      const page = await api.get<Paginated<Batch>>("/batches?pageSize=100");
      return {
        kind: "ready",
        batches: page.data,
        loadedAt: Date.now(),
      } as const;
    } catch {
      return { kind: "error" } as const;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchBatches().then((next) => !cancelled && setLoad(next));
    return () => {
      cancelled = true;
    };
  }, [fetchBatches]);

  async function retry() {
    setLoad({ kind: "loading" });
    setLoad(await fetchBatches());
  }

  const lockReason = accountLoading
    ? undefined
    : claimLockReason(taker?.status);
  const name = firstName(user?.name);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pb-8 pt-5 md:gap-8 md:px-8 md:pb-12 md:pt-8 lg:px-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display m-0 text-[28px] font-semibold leading-9 text-deep md:text-[40px] md:leading-[48px]">
          {name ? `Hi ${name}` : "Hi there"}
        </h1>
        <p className="text-body text-muted">
          Here’s what’s ready to collect at SUSS.
        </p>
      </header>

      {load.kind === "loading" && <LoadingState />}

      {load.kind === "error" && (
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
              We couldn’t load the latest batches. Check your connection and try
              again.
            </span>
          </div>
          <div>
            <Button
              variant="secondary"
              size="sm"
              className="bg-cream"
              icon={<ArrowClockwise size={18} weight="bold" />}
              onClick={() => void retry()}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {load.kind === "ready" &&
        (load.batches.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {!lockReason && (
              <UpdatedLine
                loadedAt={load.loadedAt}
                onRefresh={() => void retry()}
              />
            )}
            <AvailabilityHero batches={load.batches} />
            <HowItWorks />
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display m-0 text-h3 font-semibold text-deep">
                Open batches
              </h2>
              <span className="text-small text-muted">Newest first</span>
            </div>
            <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {load.batches.map((b) => (
                <BatchCard key={b.id} batch={b} lockReason={lockReason} />
              ))}
            </div>
          </>
        ))}
    </div>
  );
}

/** Why the claim buttons are locked, from the taker's account status; undefined = can claim. */
function claimLockReason(status: string | undefined): string | undefined {
  switch (status) {
    case "APPROVED":
      return undefined;
    case "SUSPENDED":
      return "Claiming is paused while your account is suspended.";
    case "REJECTED":
      return "Claiming isn’t available for this account."; // [draft copy]
    default:
      // PENDING, or no taker record yet.
      return "Claiming unlocks once your account is approved.";
  }
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/**
 * Design: "Updated just now · Pull down to refresh" (mobile). Browsers already
 * pull-to-refresh the whole page; this adds an explicit refresh for the data.
 */
function UpdatedLine({
  loadedAt,
  onRefresh,
}: {
  loadedAt: number;
  onRefresh: () => void;
}) {
  // Clock that ticks once a minute; starts at the load time so the first render is pure.
  const [now, setNow] = useState(loadedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.max(0, Math.floor((now - loadedAt) / 60_000));
  const ago =
    mins < 1 ? "just now" : mins === 1 ? "1 min ago" : `${mins} min ago`;
  return (
    <p className="flex items-center justify-center gap-1.5 text-[13px] leading-[18px] text-muted md:hidden">
      <ArrowClockwise size={14} aria-hidden /> Updated {ago} ·{" "}
      <button
        type="button"
        onClick={onRefresh}
        className="min-h-11 font-semibold text-deep underline decoration-leaf underline-offset-2"
      >
        Refresh
      </button>
    </p>
  );
}

/** Green "Available now" panel: total kg across open batches, pickup place, two photos. */
function AvailabilityHero({ batches }: { batches: Batch[] }) {
  const total = batches.reduce(
    (sum, b) => sum + Math.max(0, b.pool.kgRemaining),
    0,
  );
  const open = batches.length;
  return (
    <section
      aria-label="Compost available now"
      className="relative flex flex-col gap-3 overflow-hidden rounded-card bg-leaf p-6 text-cream shadow-card md:p-8"
    >
      <p className="text-[13px] font-bold uppercase leading-4 tracking-[0.06em] text-sage">
        Available now
      </p>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[52px] font-semibold leading-none text-cream md:text-[64px]">
          {formatKg(total)}
        </span>
        <span className="text-xl font-semibold">kg</span>
      </div>
      <p className="text-body leading-6">
        across {open} open batch{open === 1 ? "" : "es"}
      </p>
      <div className="mt-1 flex items-center gap-2.5 self-start rounded-control bg-cream/14 px-3 py-2.5">
        <MapPin size={20} weight="bold" aria-hidden />
        <div className="flex flex-col">
          <span className="text-small font-bold">
            Pickup at SUSS bin centre
          </span>
          {BIN_CENTRE_MAP_URL && (
            <a
              href={BIN_CENTRE_MAP_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] leading-[18px] text-cream underline underline-offset-[3px] hover:text-white"
            >
              View on map
            </a>
          )}
        </div>
      </div>

      {/* Photos: a 2-up grid under the text below 1024px, floated right on desktop. */}
      <div className="mt-2 grid grid-cols-2 gap-3 px-1 pb-1 md:max-w-[560px] lg:absolute lg:right-10 lg:top-1/2 lg:mt-0 lg:flex lg:max-w-none lg:-translate-y-1/2 lg:items-center lg:gap-5 lg:p-0">
        <HeroPhoto
          src="/images/taker/hero-compost-scraps.jpg"
          alt="Hands holding compost beside vegetable scraps and eggshells"
          className="-rotate-2 lg:-rotate-3"
          imgClass="h-[104px] md:h-[150px] lg:h-[180px] lg:w-[314px]"
        />
        <HeroPhoto
          src="/images/taker/hero-trowel.jpg"
          alt="A garden trowel lifting fresh compost over flowers"
          className="rotate-2 lg:mt-6 lg:rotate-3"
          imgClass="h-[104px] md:h-[150px] lg:h-[193px] lg:w-[245px]"
        />
      </div>
    </section>
  );
}

function HeroPhoto({
  src,
  alt,
  className,
  imgClass,
}: {
  src: string;
  alt: string;
  className: string;
  imgClass: string;
}) {
  return (
    <figure
      className={`m-0 rounded-control bg-cream p-[5px] shadow-[0_10px_24px_rgba(20,32,16,0.28)] lg:p-1.5 ${className}`}
    >
      <div className={`relative w-full overflow-hidden rounded-lg ${imgClass}`}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 768px) 320px, 45vw"
          className="object-cover"
        />
      </div>
    </figure>
  );
}

function HowItWorks() {
  const steps: { label: string; icon: ReactNode }[] = [
    { label: "Claim", icon: <Basket size={16} weight="bold" /> },
    { label: "Book", icon: <CalendarCheck size={16} weight="bold" /> },
    { label: "Collect", icon: <Package size={16} weight="bold" /> },
  ];
  return (
    <div className="flex flex-col items-start gap-3 rounded-card bg-cream p-4 shadow-card md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
        <p className="text-[13px] font-bold uppercase leading-4 tracking-[0.06em] text-muted">
          How it works
        </p>
        <ol className="m-0 flex list-none items-center gap-2 p-0">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-sage text-deep">
                {s.icon}
              </span>
              <span className="text-small font-semibold">{s.label}</span>
              {i < steps.length - 1 && (
                <CaretRight
                  size={16}
                  aria-hidden
                  className="ml-0.5 text-muted"
                />
              )}
            </li>
          ))}
        </ol>
      </div>
      <Button
        href="/tutorial"
        variant="link"
        size="sm"
        iconAfter={<IconArrowRight size={16} />}
      >
        See the tutorial
      </Button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-5 md:gap-8">
      <LoadingLabel>Loading batches…</LoadingLabel>
      <Skeleton className="h-[200px] rounded-card" />
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        Open batches
      </h2>
      <div
        aria-hidden
        className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card ${i === 2 ? "hidden lg:flex" : ""}`}
          >
            <Skeleton className="h-6 w-[55%]" />
            <Skeleton className="h-4 w-[70%]" />
            <Skeleton className="h-10 w-[35%]" />
            <Skeleton className="h-2 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-[110px]" />
              <Skeleton className="h-7 w-[90px]" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-10 text-center shadow-card">
      <div className="mb-2 flex size-40 items-center justify-center rounded-full bg-sage">
        <EmptyPot width={130} />
      </div>
      <h2 className="font-display m-0 text-h3 font-semibold text-deep">
        No compost ready right now
      </h2>
      <p className="max-w-[360px] text-body text-muted">
        New batches are usually added every couple of weeks. We’ll keep this
        page up to date.
      </p>
      <div className="mt-2 flex w-full flex-col items-center gap-2 md:w-auto">
        <Button href="/my-claims" fullWidth>
          View my claims
        </Button>
        <Button href="/tutorial" variant="link" size="sm">
          How LoopSoil works
        </Button>
      </div>
    </div>
  );
}
