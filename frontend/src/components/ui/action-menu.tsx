"use client";

import { DotsThree } from "@phosphor-icons/react/dist/ssr/DotsThree";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ActionItem {
  label: string;
  icon?: ReactNode;
  /** Either a link… */
  href?: string;
  /** …or an action. */
  onSelect?: () => void;
  /** Shown greyed out with this reason underneath (design: "Only for open batches"). */
  disabledReason?: string;
  danger?: boolean;
}

/**
 * "⋯" row actions menu (Batches / Takers / Claims tables). Opens below the button,
 * closes on outside click, Escape, or picking an item.
 */
export function ActionMenu({
  label,
  items,
}: {
  label: string;
  items: ActionItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-small no-underline hover:bg-sage";

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-10 items-center justify-center rounded-[10px] text-deep hover:bg-sage"
      >
        <DotsThree size={20} weight="bold" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 w-[220px] rounded-control bg-cream p-1.5 shadow-photo"
        >
          {items.map((item) =>
            item.disabledReason ? (
              <span
                key={item.label}
                role="menuitem"
                aria-disabled="true"
                className="flex min-h-11 flex-col justify-center rounded-lg px-2.5 py-1 text-small text-[#A09E90]"
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </span>
                <span
                  className={cn("text-[11px]", item.icon ? "pl-[26px]" : false)}
                >
                  {item.disabledReason}
                </span>
              </span>
            ) : item.href ? (
              <Link
                key={item.label}
                role="menuitem"
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  itemClass,
                  item.danger ? "text-error" : "text-ink",
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={cn(
                  itemClass,
                  item.danger ? "text-error" : "text-ink",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
