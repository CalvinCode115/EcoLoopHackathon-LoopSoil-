import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { cn } from "@/lib/cn";

const STEPS = ["Submitted", "Approved", "Pickup booked", "Collected"] as const;

/**
 * Status timeline (Taker components): Submitted → Approved → Pickup booked → Collected.
 * Done steps are filled with a check, the current step has a halo, later ones are
 * outlined. `current` is the index of the step in progress (4 = all done).
 */
export function StatusTimeline({ current }: { current: number }) {
  return (
    <ol aria-label="Claim progress" className="m-0 flex list-none p-0">
      {STEPS.map((label, i) => {
        const done = i < current;
        const isCurrent = i === current;
        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
          >
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[calc(50%+14px)] right-[calc(-50%+14px)] top-[11px] h-0.5 rounded-[1px]",
                  done ? "bg-leaf" : "bg-[#D3CFC3]",
                )}
              />
            )}
            {done ? (
              <span className="flex size-6 items-center justify-center rounded-full bg-leaf text-cream">
                <Check size={14} weight="bold" aria-hidden />
              </span>
            ) : isCurrent ? (
              <span className="flex size-6 items-center justify-center rounded-full bg-cream shadow-[inset_0_0_0_3px_var(--color-leaf),0_0_0_4px_var(--color-sage)]">
                <span className="size-2 rounded-full bg-leaf" />
              </span>
            ) : (
              <span className="size-6 rounded-full bg-cream shadow-[inset_0_0_0_2px_#C9C5B8]" />
            )}
            <span
              className={cn(
                "text-xs leading-4",
                isCurrent
                  ? "font-bold text-deep"
                  : done
                    ? "font-medium text-deep"
                    : "font-medium text-muted",
              )}
            >
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
