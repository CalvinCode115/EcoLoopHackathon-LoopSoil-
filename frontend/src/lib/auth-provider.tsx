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
  signIn(email: string, password: string): Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [loaded, setLoaded] = useState<LoadedUser | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // 1. Restore the Supabase session and follow every later change (login, refresh, logout).
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
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
      async signIn(email, password) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw new Error(signInError.message);
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
