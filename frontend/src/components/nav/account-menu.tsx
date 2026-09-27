"use client";

import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { User as UserIcon } from "@phosphor-icons/react/dist/ssr/User";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/cn";

export function initials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

export function Avatar({ name, size = 36 }: { name?: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-deep text-[13px] font-bold text-cream"
    >
      {initials(name)}
    </span>
  );
}

/**
 * Avatar button → menu with name, email, optional Profile link and Log out.
 * Closes on outside click and Escape.
 */
export function AccountMenu({
  profileHref,
  align = "right",
  variant = "manager",
}: {
  /** Omit when there is no profile page to link to. */
  profileHref?: string;
  align?: "left" | "right";
  /** taker: leaf-green circle with a person icon + chevron (taker kit). manager: initials. */
  variant?: "taker" | "manager";
}) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 items-center justify-center rounded-full text-deep hover:bg-sage",
          variant === "taker" ? "gap-1 pl-0.5 pr-1.5" : "w-11",
        )}
      >
        {variant === "taker" ? (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-leaf text-cream">
              <UserIcon size={20} weight="bold" aria-hidden />
            </span>
            <CaretDown
              size={18}
              weight="bold"
              aria-hidden
              className={cn("transition-transform", open && "rotate-180")}
            />
          </>
        ) : (
          <Avatar name={user?.name} />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-50 mt-2 w-64 overflow-hidden rounded-card bg-cream py-2 shadow-card",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="px-4 py-2">
            <p className="truncate font-semibold text-ink">{user?.name}</p>
            <p className="truncate text-small text-muted">{user?.email}</p>
          </div>
          <div className="my-1 h-px bg-edge/30" />
          {profileHref && (
            <Link
              role="menuitem"
              href={profileHref}
              className="flex h-11 items-center gap-3 px-4 text-ink no-underline hover:bg-sage"
            >
              <UserIcon size={18} aria-hidden /> Profile
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => void signOut()}
            className="flex h-11 w-full items-center gap-3 px-4 text-left text-ink hover:bg-sage"
          >
            <SignOut size={18} aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
