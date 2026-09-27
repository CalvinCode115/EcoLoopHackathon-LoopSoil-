import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import { Prohibit } from "@phosphor-icons/react/dist/ssr/Prohibit";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "amber" | "red" | "sage";

const tones: Record<Tone, { box: string; icon: ReactNode }> = {
  amber: {
    box: "bg-amber-tint text-amber-ink",
    icon: <Info size={20} weight="bold" aria-hidden />,
  },
  red: {
    box: "bg-danger-tint text-danger-ink",
    icon: <Prohibit size={20} weight="bold" aria-hidden />,
  },
  sage: {
    box: "bg-sage text-deep",
    icon: <Info size={20} weight="bold" aria-hidden />,
  },
};

/**
 * Full-width strip directly under the top bar (the account-gate banners). Pending = amber,
 * suspended/rejected = red. `title` is bold, `children` continues the sentence.
 */
export function Banner({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: ReactNode;
  children?: ReactNode;
}) {
  const t = tones[tone];
  return (
    <div role="status" className={t.box}>
      <div className="mx-auto flex max-w-content items-start gap-3 px-4 py-3 text-small">
        <span className="shrink-0">{t.icon}</span>
        <p>
          <strong>{title}</strong> {children}
        </p>
      </div>
    </div>
  );
}

/** Inline message inside a page or card: errors with "Try again", or notes. */
export function InlineAlert({
  tone = "red",
  children,
  action,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-control px-4 py-3 text-small",
        tones[tone].box,
        className,
      )}
    >
      <WarningCircle size={20} weight="bold" className="shrink-0" aria-hidden />
      <div className="flex flex-1 flex-col gap-2">
        <div>{children}</div>
        {action}
      </div>
    </div>
  );
}
