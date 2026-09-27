import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/** Shimmering placeholder block. Size it with className (e.g. "h-6 w-40"), or `style` for data-driven sizes. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden className={cn("skeleton", className)} style={style} />
  );
}

/** Screen-reader announcement to pair with a group of skeletons. */
export function LoadingLabel({ children = "Loading…" }: { children?: string }) {
  return (
    <span role="status" className="sr-only">
      {children}
    </span>
  );
}
