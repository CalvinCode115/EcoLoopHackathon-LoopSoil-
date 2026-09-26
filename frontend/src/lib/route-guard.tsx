"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth, type UserRole } from "./auth-provider";

/**
 * The ONE place route protection lives (mounted once in the root layout).
 *
 *   /                      → public landing page when signed out; instant redirect
 *                            to the role home when signed in ("near-invisible" for
 *                            returning users, a real page for new visitors)
 *   /login                 → public; logged-in users are sent to their role home
 *   /register              → always reachable (sign-up happens before a session exists)
 *   /manager, /manager/**  → MANAGER only
 *   everything else        → TAKER only
 *
 * This is UX, not security: the backend re-checks the JWT and role on every request.
 *
 * PUBLIC_ENTRY pages ("/", "/login", "/register") never show a loading gate: they are
 * correct to render before the session check resolves, since "not signed in yet" is
 * their default state, not a special case. "/" and "/login" still redirect away the
 * moment we learn the visitor IS signed in — usually within a tick, since a cached
 * session resolves from local storage with no network round trip.
 */
const HOME = "/";
const LOGIN = "/login";
const PUBLIC_ENTRY = new Set([HOME, LOGIN, "/register"]);

/** The taker routes from the routing skeleton — kept as an allowlist, not a blacklist. */
const TAKER_PATHS = new Set([
  "/batches",
  "/claim",
  "/my-claims",
  "/book-pickup",
]);

export function homeFor(role: UserRole): string {
  return role === "MANAGER" ? "/manager" : "/batches";
}

export function isManagerPath(pathname: string): boolean {
  return pathname === "/manager" || pathname.startsWith("/manager/");
}

/**
 * Is this a route we actually built and protect? An allowlist rather than "not public =
 * protected", so an unrecognised URL (almost always Next's not-found page) renders
 * immediately and stays visible regardless of auth state — there's nothing behind an
 * unknown URL to protect, and it must not get swallowed by the login redirect below.
 */
function isKnownProtectedPath(pathname: string): boolean {
  return TAKER_PATHS.has(pathname) || isManagerPath(pathname);
}

export type GuardDecision =
  { kind: "loading" } | { kind: "render" } | { kind: "redirect"; to: string };

/** Pure decision function — no hooks, so it can be reasoned about (and tested) in isolation. */
export function decide(
  pathname: string,
  state: { loading: boolean; authenticated: boolean; role: UserRole | null },
): GuardDecision {
  const isSignedIn = state.authenticated && !!state.role;

  if (PUBLIC_ENTRY.has(pathname)) {
    // Render immediately, whether or not the session check has resolved yet.
    // /register stays reachable even when signed in; "/" and "/login" hand a
    // signed-in visitor off to their role home as soon as we know.
    if (!state.loading && isSignedIn && pathname !== "/register") {
      return { kind: "redirect", to: homeFor(state.role as UserRole) };
    }
    return { kind: "render" };
  }

  if (!isKnownProtectedPath(pathname)) return { kind: "render" };

  // Known app routes genuinely need to know the role before they can render anything
  // meaningful, so they do wait for the check.
  if (state.loading) return { kind: "loading" };

  // No session, or one the backend would not accept (suspended, API down): bounce to login.
  if (!isSignedIn) return { kind: "redirect", to: LOGIN };

  const home = homeFor(state.role as UserRole);
  const wantsManager = isManagerPath(pathname);
  if (wantsManager && state.role !== "MANAGER")
    return { kind: "redirect", to: home };
  if (!wantsManager && state.role === "MANAGER")
    return { kind: "redirect", to: home };
  return { kind: "render" };
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const { session, user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const decision = decide(pathname, {
    loading,
    authenticated: session !== null,
    role: user?.role ?? null,
  });
  const redirectTo = decision.kind === "redirect" ? decision.to : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (decision.kind === "loading") return <main>Loading…</main>;
  if (decision.kind === "redirect") return null;
  return <>{children}</>;
}
