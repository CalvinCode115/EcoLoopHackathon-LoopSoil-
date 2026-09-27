import type { ReactNode } from "react";
import { IconLeaf } from "@/components/brand/icons";
import { cn } from "@/lib/cn";

/**
 * Leaf-green eyebrow pill + H2. Put the one key phrase in <Accent> for leaf-green italic:
 *   <SectionHeader eyebrow="Background" title={<>From food waste to <Accent>fertile soil</Accent></>} />
 */
export function SectionHeader({
  eyebrow,
  title,
  titleId,
  align = "left",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  /** For the section's aria-labelledby. */
  titleId?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center"
          ? "items-center text-center"
          : "items-start text-left",
        className,
      )}
    >
      <p className="inline-flex items-center gap-2 rounded-2xl bg-leaf px-3 py-1 text-small font-semibold tracking-[0.02em] text-cream">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-sage" />
        <span>{eyebrow}</span>
      </p>
      <h2
        id={titleId}
        className="font-display m-0 text-h2-mobile font-semibold text-deep md:text-h2-tablet lg:text-h2"
      >
        {title}
      </h2>
    </div>
  );
}

export function Accent({ children }: { children: ReactNode }) {
  return <em className="font-medium text-leaf italic">{children}</em>;
}

/** Small uppercase label used above groups ("PENDING · AMBER", table headers, etc.). */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-eyebrow font-bold uppercase tracking-[0.06em] text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Hairline with a leaf mark — sits between every Home section. */
export function SectionDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("page-container flex items-center gap-4", className)}
    >
      <span className="h-px flex-1 bg-leaf/35" />
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-leaf text-cream">
        <IconLeaf size={18} />
      </span>
      <span className="h-px flex-1 bg-leaf/35" />
    </div>
  );
}
