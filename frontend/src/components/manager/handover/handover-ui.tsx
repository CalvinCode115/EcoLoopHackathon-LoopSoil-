import { Minus } from "@phosphor-icons/react/dist/ssr/Minus";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

/**
 * Handover kit (boards "Manager · Handover"): built for one hand at the bin — 56px buttons,
 * 48px steppers, big type. Shared by the pickup list, scanner sheets and record screen.
 */
export function BigButton({
  variant = "primary",
  icon,
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  icon?: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[14px] px-[18px] text-[17px] font-bold disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-leaf text-cream hover:bg-deep",
        variant === "secondary" &&
          "bg-white text-deep shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage",
        variant === "danger" && "bg-error text-cream hover:bg-danger-ink",
        className,
      )}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function TypeTag({ bulk }: { bulk: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-[10px] px-[7px] text-[11px] font-bold",
        bulk ? "bg-[#EAD9C6] text-[#7A5A3C]" : "bg-sage text-deep",
      )}
    >
      {bulk ? "Bulk" : "Individual"}
    </span>
  );
}

/** − value + stepper for bag counts. */
export function CountStepper({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const btn =
    "flex size-12 items-center justify-center rounded-control shadow-[inset_0_0_0_1px_var(--color-edge)] disabled:bg-disabled disabled:text-[#A09E90]";
  return (
    <div className="flex min-h-14 items-center justify-between gap-2.5">
      <span id={id} className="text-[15px] font-semibold">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={id}
        className="flex items-center gap-2"
      >
        <button
          type="button"
          aria-label="Fewer"
          disabled={value <= 0}
          onClick={() => onChange(value - 1)}
          className={cn(btn, "bg-white text-deep hover:bg-sage")}
        >
          <Minus size={20} weight="bold" />
        </button>
        <output
          aria-live="polite"
          className="font-display w-9 text-center text-2xl font-semibold text-deep"
        >
          {value}
        </output>
        <button
          type="button"
          aria-label="More"
          disabled={value >= 99}
          onClick={() => onChange(value + 1)}
          className={cn(btn, "bg-white text-deep hover:bg-sage")}
        >
          <Plus size={20} weight="bold" />
        </button>
      </div>
    </div>
  );
}

/** Numbered step card (Step 1 … 4). Done steps show a filled number. */
export function StepCard({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`step-${n}`}
      className="flex flex-col gap-3.5 rounded-[18px] bg-cream p-[18px] shadow-card"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded-full text-small font-bold",
            done
              ? "bg-leaf text-cream"
              : "bg-white text-deep shadow-[inset_0_0_0_1.5px_var(--color-leaf)]",
          )}
        >
          {n}
        </span>
        <h2 id={`step-${n}`} className="m-0 text-[17px] font-bold">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
