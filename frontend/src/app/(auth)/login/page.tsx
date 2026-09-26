"use client";

import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { LockKey } from "@phosphor-icons/react/dist/ssr/LockKey";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { EcoBackdrop } from "@/components/brand/eco-backdrop";
import { LoopMark } from "@/components/brand/loop-mark";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useAuth } from "@/lib/auth-provider";

export default function LoginPage() {
  const { signIn, signOut, session, error: sessionError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await signIn(email, password);
      // Success: AuthProvider loads /auth/me and RouteGuard redirects by role.
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center gap-6 px-6 py-16">
      <EcoBackdrop />

      {/* Raised card: the backdrop behind this page now has visible texture, so the
          form needs a clear foreground layer rather than sitting flush against it. */}
      <div className="flex flex-col gap-10 rounded-2xl border border-line bg-canvas-raised px-8 py-10 shadow-2xl shadow-forest-900/10">
        <div className="flex flex-col items-center gap-4 text-center">
          <LoopMark size={40} />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Welcome back
            </h1>
            <p className="mt-1 font-body text-[0.95rem] text-ink-soft">
              Sign in to LoopSoil.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field
            label="Email"
            type="email"
            name="email"
            icon={<EnvelopeSimple size={18} weight="regular" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
          <Field
            label="Password"
            type="password"
            name="password"
            icon={<LockKey size={18} weight="regular" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700"
            >
              <WarningCircle
                size={18}
                weight="regular"
                className="mt-0.5 shrink-0"
              />
              <span>{formError}</span>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            className="mt-1 w-full"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {session && sessionError && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700"
          >
            <p>
              Signed in, but the LoopSoil API rejected the session:{" "}
              {sessionError}
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="self-start font-body text-sm font-semibold underline underline-offset-2"
            >
              Sign out and try again
            </button>
          </div>
        )}
      </div>

      <p className="text-center font-body text-sm text-ink-soft">
        New here?{" "}
        <Link
          href="/register"
          className="font-semibold text-forest-500 hover:text-forest-700"
        >
          Register as a taker
        </Link>
      </p>
    </main>
  );
}
