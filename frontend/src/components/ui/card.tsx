import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Cream surface, 16px radius, soft shadow, no hard border. `padding` follows the 8px grid. */
export function Card({
  padding = "md",
  as: Tag = "div",
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "section" | "article" | "li";
}) {
  const pad = { none: "", sm: "p-4", md: "p-6", lg: "p-6 md:p-8 lg:p-10" }[
    padding
  ];
  return (
    <Tag
      className={cn("rounded-card bg-cream shadow-card", pad, className)}
      {...rest}
    />
  );
}
