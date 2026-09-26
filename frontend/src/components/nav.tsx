"use client";

import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import { LoopMark } from "./brand/loop-mark";

const TAKER_LINKS = [
  ["/batches", "Browse batches"],
  ["/claim", "Claim"],
  ["/my-claims", "My claims"],
  ["/book-pickup", "Book pickup"],
] as const;

const MANAGER_LINKS = [
  ["/manager", "Dashboard"],
  ["/manager/batches", "Batches"],
  ["/manager/claims", "Claims"],
  ["/manager/slots", "Pickup slots"],
  ["/manager/handover", "Handover"],
] as const;

/**
 * Shared top bar. This is intentionally light-touch styling (tokens, spacing, one icon) —
 * the full authenticated-app nav is its own design pass, out of scope for the shared pages.
 */
export function Nav() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  // On the public landing page itself, the mark is already the hero centerpiece —
  // keep the bar minimal there rather than doubling up.
  if (pathname === "/" && !user) return null;

  const links = user
    ? user.role === "MANAGER"
      ? MANAGER_LINKS
      : TAKER_LINKS
    : [];

  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
        <Link
          href={user ? "/" : "/"}
          className="flex items-center gap-2.5 shrink-0"
        >
          <LoopMark size={28} />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            LoopSoil
          </span>
        </Link>

        {links.length > 0 && (
          <ul className="hidden md:flex items-center gap-1 overflow-x-auto">
            {links.map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`rounded-full px-3.5 py-2 font-body text-sm font-medium transition-colors ${
                    pathname === href
                      ? "bg-forest-100 text-forest-900"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3 shrink-0">
          {!user && (
            <Link
              href="/login"
              className="font-body text-sm font-medium text-ink-soft hover:text-ink"
            >
              Sign in
            </Link>
          )}
          {user && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 font-body text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              <SignOut size={16} weight="regular" />
              Sign out
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
