"use client";

import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";
import { supabase } from "./supabase";

export type UserRole = "MANAGER" | "TAKER";

/** GET /auth/me — the backend's User row. Role and status live here, not in Supabase. */
export interface CurrentUser {
  id: string;
  authId: string;
  email: string;
  phone: string | null;
  name: string;
  role: UserRole;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  updatedAt: string;
}

interface AuthContextValue {
  /** Supabase session (authentication). */
  session: Session | null;
  /** Backend user (authorization). Null until /auth/me has answered, or if it rejected the session. */
  user: CurrentUser | null;
  /** True while the session is being restored or /auth/me is in flight. */
  loading: boolean;
  /** Why `user` is null despite a session — suspended account, API unreachable, etc. */
  error: string | null;
  /** `remember: false` ends the session when the browser is closed ("Remember me" unticked). */
  signIn(
    email: string,
    password: string,
    options?: { remember?: boolean },
  ): Promise<void>;
  signOut(): Promise<void>;
  /** Re-fetch /auth/me (e.g. after the taker completes registration). */
  refreshUser(): void;
}

/** The /auth/me answer, tagged with the token it was fetched for so stale answers are ignored. */
interface LoadedUser {
  token: string;
  user: CurrentUser | null;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// "Remember me": Supabase always persists the session in localStorage. When the user
// opts out, we flag it in localStorage and mark the live tab in sessionStorage (which the
// browser clears on close). A fresh browser session that finds the flag but no mark
// signs out before restoring anything. Storage can throw (private mode) — then we just
// behave as "remember".
const SESSION_ONLY_KEY = "loopsoil:session-only";
const ALIVE_KEY = "loopsoil:session-alive";

function rememberChoice(remember: boolean): void {
  try {
    if (remember) {
      localStorage.removeItem(SESSION_ONLY_KEY);
    } else {
      localStorage.setItem(SESSION_ONLY_KEY, "1");
      sessionStorage.setItem(ALIVE_KEY, "1");
    }
  } catch {
    // storage unavailable — fall back to remembering
  }
}

/** True when the last login opted out of "remember me" and the browser has since restarted. */
function sessionShouldExpire(): boolean {
  try {
    return (
      localStorage.getItem(SESSION_ONLY_KEY) === "1" &&
      sessionStorage.getItem(ALIVE_KEY) !== "1"
    );
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [loaded, setLoaded] = useState<LoadedUser | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // 1. Restore the Supabase session and follow every later change (login, refresh, logout).
  useEffect(() => {
    void (async () => {
      if (sessionShouldExpire()) {
        await supabase.auth.signOut();
        rememberChoice(true);
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setSessionLoaded(true);
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  // 2. Whenever the token changes, ask the backend who this is (it lazy-upserts the User row).
  const accessToken = session?.access_token ?? null;
  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken;
    let cancelled = false;
    api
      .get<CurrentUser>("/auth/me")
      .then((user) => {
        if (!cancelled) setLoaded({ token, user, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoaded({
          token,
          user: null,
          error:
            err instanceof ApiError
              ? err.message
              : "Could not reach the LoopSoil API",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshTick]);

  // Everything below is derived — no state is written outside async callbacks.
  const current = accessToken && loaded?.token === accessToken ? loaded : null;
  const user = current?.user ?? null;
  const error = current?.error ?? null;
  const loading = !sessionLoaded || (accessToken !== null && current === null);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      loading,
      error,
      async signIn(email, password, options) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw new Error(signInError.message);
        rememberChoice(options?.remember ?? true);
        // onAuthStateChange delivers the session → /auth/me loads → RouteGuard redirects.
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      refreshUser() {
        setRefreshTick((n) => n + 1);
      },
    }),
    [session, user, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
