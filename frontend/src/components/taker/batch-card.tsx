import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Drop } from "@phosphor-icons/react/dist/ssr/Drop";
import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import { Lock } from "@phosphor-icons/react/dist/ssr/Lock";
import { User } from "@phosphor-icons/react/dist/ssr/User";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useId } from "react";
import { IconArrowRight } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { MAX_CLAIM_KG } from "@/lib/constants";
import { formatDayMonth, formatKg } from "@/lib/format";
import type { Batch } from "@/lib/types";

/** Under this share of the public pool left, a batch gets the amber "Almost gone" tag. */
const LOW_STOCK_SHARE = 0.2;

/** pH band treated as "Healthy" for garden compost. [draft rule — confirm with SUSS] */
const HEALTHY_PH = { min: 6, max: 7.5 };

/**
 * Batch card (Taker components → Batch card): big kg-left number, a bar of what's left
 * of the public pool, quality chip, the taker's AllowanceMeter, then one of:
 * "Claim compost" · locked (account not approved) · "limit reached" note · "Fully claimed".
 */
export function BatchCard({
  batch,
  lockReason,
}: {
  batch: Batch;
  /** Set when the account can't claim (pending/suspended); disables the button. */
  lockReason?: string;
}) {
  const { pool } = batch;
  const left = Math.max(0, pool.kgRemaining);
  const of = pool.publicPoolKg;
  const share = of > 0 ? left / of : 0;
  const soldOut = left <= 0;
  const low = !soldOut && share < LOW_STOCK_SHARE;
  // Unapproved takers get null from the API; show the full allowance they'll have.
  const allowance = batch.allowanceLeftKg ?? MAX_CLAIM_KG;
  const limitReached = !soldOut && allowance <= 0;

  return (
    <article
      className={cn(
        "flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card",
        soldOut && "opacity-60",
      )}
    >
      <h3 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
        Batch {batch.reference}
      </h3>
      <div className="flex flex-wrap gap-4 text-small text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarBlank size={16} aria-hidden /> Harvested{" "}
          {formatDayMonth(batch.harvestDate)}
        </span>
        {batch.availableUntil && (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={16} aria-hidden /> Claim by{" "}
            {formatDayMonth(batch.availableUntil)}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-display text-[40px] font-semibold leading-[44px]",
            soldOut ? "text-grey-ink" : "text-deep",
          )}
        >
          {formatKg(left)}
        </span>
        <span className="text-body font-semibold text-ink">kg left</span>
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

      <div className="flex flex-wrap gap-2">
        {batch.phReading !== null && <QualityChip ph={batch.phReading} />}
        {low && (
          <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-tint px-2.5 text-[13px] font-bold text-amber-ink">
            <WarningCircle size={14} weight="bold" aria-hidden /> Almost gone
          </span>
        )}
        {soldOut && (
          <span className="inline-flex h-[26px] items-center rounded-full bg-grey-tint px-2.5 text-[13px] font-bold text-grey-ink">
            Fully claimed
          </span>
        )}
      </div>

      {!soldOut && <AllowanceMeter leftKg={allowance} />}

      {soldOut ? (
        <Button variant="secondary" fullWidth disabled>
          Fully claimed
        </Button>
      ) : limitReached ? (
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
      ) : lockReason ? (
        <LockedClaimButton reason={lockReason} />
      ) : (
        <Button
          href={`/claim?batch=${batch.id}`}
          fullWidth
          iconAfter={<IconArrowRight size={18} />}
        >
          Claim compost
        </Button>
      )}
    </article>
  );
}

export function QualityChip({ ph }: { ph: number }) {
  const healthy = ph >= HEALTHY_PH.min && ph <= HEALTHY_PH.max;
  return (
    <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-sage px-2.5 text-[13px] font-semibold text-deep">
      <Drop size={14} weight="bold" aria-hidden />
      <span>
        pH {ph}
        {healthy && " · Healthy"}
      </span>
    </span>
  );
}

/**
 * AllowanceMeter: each taker gets 1kg per batch, counted across their pending + approved
 * claims. Greyed out once used up.
 */
export function AllowanceMeter({ leftKg }: { leftKg: number }) {
  const left = Math.max(0, leftKg);
  const empty = left <= 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-control bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
      <p
        className={cn(
          "flex items-center gap-2 text-small",
          empty ? "text-muted" : "text-deep",
        )}
      >
        <span className={cn("flex", empty ? "text-muted" : "text-leaf")}>
          <User size={16} weight="bold" aria-hidden />
        </span>
        <span>
          <strong className="text-ink">{formatKg(left)}kg</strong> of your{" "}
          {MAX_CLAIM_KG}kg left for this batch
        </span>
      </p>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={MAX_CLAIM_KG}
        aria-valuenow={left}
        aria-label={`Your allowance left for this batch: ${formatKg(left)} of ${MAX_CLAIM_KG} kg`}
        className="h-1.5 overflow-hidden rounded-[3px] bg-[#E3DDCF]"
      >
        <div
          className="h-full rounded-[3px] bg-leaf"
          style={{ width: `${(left / MAX_CLAIM_KG) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Disabled "Claim compost" with a lock icon; the reason shows as a tooltip on hover. */
function LockedClaimButton({ reason }: { reason: string }) {
  const tipId = useId();
  return (
    <div className="group relative w-full">
      <Button
        fullWidth
        disabled
        aria-describedby={tipId}
        icon={<Lock size={18} weight="bold" />}
      >
        Claim compost
      </Button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-[calc(100%+10px)] left-1/2 z-[5] w-60 -translate-x-1/2 rounded-[10px] bg-ink px-3 py-2.5 text-center text-[13px] leading-[18px] text-cream opacity-0 shadow-card transition-opacity group-hover:visible group-hover:opacity-100"
      >
        {reason}
      </span>
    </div>
  );
}
