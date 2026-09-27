import type { ReactNode } from "react";
import { Sprout } from "@/components/brand/illustrations";
import { cn } from "@/lib/cn";

/**
 * Manager building blocks (Manager components): the cream card with an 18px Fraunces
 * heading, table cells, the thin progress bar, soft chips and the per-panel empty state.
 */
export function Panel({
  title,
  titleId,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  titleId?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-card bg-cream p-5 shadow-card",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <h2
            id={titleId}
            className="font-display m-0 text-lg font-semibold leading-[26px] text-deep"
          >
            {title}
          </h2>
          {description && (
            <p className="text-[13px] leading-[21px] text-muted">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export const thClass =
  "whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-[0.04em] text-muted";
export const tdClass = "px-3 py-3.5 align-middle";
export const rowClass =
  "shadow-[inset_0_1px_0_rgba(107,107,94,0.14)] hover:bg-row-hover";

/** Table shell: horizontal scroll on narrow screens, 14px body text. */
export function DataTable({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-small">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className={thClass}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** 8px sage track with a leaf fill. */
export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className="h-2 overflow-hidden rounded bg-sage"
    >
      <div className="h-full rounded bg-leaf" style={{ width: `${pct}%` }} />
    </div>
  );
}

const chipTones = {
  sage: "bg-sage text-deep",
  soil: "bg-[#EAD9C6] text-[#7A5A3C]",
  grey: "bg-grey-tint text-grey-ink",
} as const;

/** 28px pill: summary facts ("4kg allocated"), categories, "Locked after publishing". */
export function Chip({
  tone = "sage",
  icon,
  children,
}: {
  tone?: keyof typeof chipTones;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-bold",
        chipTones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** "Per-tab empty states": sprout in a sage circle, heading, one line, optional action. */
export function EmptyPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-10 text-center shadow-card">
      <div className="mb-2 flex size-[120px] items-center justify-center rounded-full bg-sage">
        <Sprout width={84} />
      </div>
      <h2 className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep">
        {title}
      </h2>
      <p className="max-w-[360px] text-body text-muted">{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
