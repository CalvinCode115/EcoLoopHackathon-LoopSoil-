import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * Brand artwork (replaces the design's dashed "[LoopSoil logo]" / "[SUSS logo]" slots).
 * Both files are transparent PNGs in public/images/brand. Height is set by `className`;
 * width follows the aspect ratio.
 */

/**
 * The LoopSoil logo (mark + wordmark + "Campus waste to community soil", 1600×435).
 * "Loop" is deep green, so on a dark or green background (`onDark` footer, `onNav` manager
 * sidebar) it sits on a fixed cream chip — the same in light and dark mode.
 */
export function LoopSoilLogo({
  className,
  onDark,
  onNav,
}: {
  className?: string;
  onDark?: boolean;
  onNav?: boolean;
}) {
  const chip = onDark || onNav;
  const img = (
    <Image
      src="/images/brand/loopsoil-logo.png"
      alt="LoopSoil — campus waste to community soil"
      width={1600}
      height={435}
      priority
      className={cn("w-auto shrink-0", className ?? (chip ? "h-7" : "h-10"))}
    />
  );
  if (!chip) return img;
  return (
    <span className="inline-flex shrink-0 items-center rounded-[10px] bg-[#FBF8F1] px-2.5 py-1.5">
      {img}
    </span>
  );
}

/** The circular mark alone (seedling in the loop, 256×256) — for tight spots like phone headers. */
export function LoopSoilMark({ className }: { className?: string }) {
  return (
    <Image
      src="/images/brand/loopsoil-mark.png"
      alt="LoopSoil"
      width={256}
      height={256}
      priority
      className={cn("shrink-0", className ?? "size-10")}
    />
  );
}

/**
 * The SUSS logo (navy + red on transparent, 1200×641). Needs a light background — the
 * navy disappears on the dark-green footer or dark mode.
 */
export function SussLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/images/brand/suss-logo.png"
      alt="SUSS — Singapore University of Social Sciences"
      width={1200}
      height={641}
      className={cn("w-auto shrink-0", className ?? "h-10")}
    />
  );
}

/** "LoopSoil × SUSS". `compact` = the mobile lockup. */
export function LogoLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LoopSoilLogo className={compact ? "h-7" : "h-10"} />
      <span aria-hidden className="text-lg font-medium text-muted">
        ×
      </span>
      <SussLogo className={compact ? "h-8" : "h-10"} />
    </span>
  );
}
