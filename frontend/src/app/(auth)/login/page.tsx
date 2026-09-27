"use client";

import { useState, type FormEvent } from "react";
import {
  AuthCard,
  AuthDivider,
  AuthLayout,
  FormErrorBanner,
} from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Checkbox, Field } from "@/components/ui/field";
import { useAuth } from "@/lib/auth-provider";

/** Supabase's message for a wrong email/password pair. */
const BAD_CREDENTIALS = "Invalid login credentials";

/**
 * Log In — boards "Log In · Desktop / Tablet / Mobile / Error / Loading".
 *   default → form
 *   loading → fields disabled, button "Logging in…" with spinner (until RouteGuard
 *             redirects to the role home)
 *   error   → red banner at the top of the form; wrong credentials also ring both fields
 */
export default function LoginPage() {
  const { signIn, signOut, session, error: sessionError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [badCredentials, setBadCredentials] = useState(false);

  // Signed in with Supabase, but the LoopSoil API refused the session (suspended user,
  // API down). Stop the spinner and say so.
  const apiRejected = Boolean(session && sessionError);
  const busy = submitting && !apiRejected;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setBadCredentials(false);
    try {
      await signIn(email, password, { remember });
      // Success: stay in the loading state — AuthProvider loads /auth/me and RouteGuard
      // redirects by role, unmounting this page.
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === BAD_CREDENTIALS) {
        setBadCredentials(true);
        setFormError("Incorrect email or password. Please try again.");
      } else if (/email not confirmed/i.test(message)) {
        // [draft copy] — not in the design.
        setFormError(
          "Please confirm your email first. Check your inbox for the link we sent.",
        );
      } else {
        setFormError(message || "Couldn’t log in. Please try again.");
      }
      setSubmitting(false);
    }
  }

  async function onRetryAfterApiError() {
    await signOut();
    setSubmitting(false);
  }

  return (
    <AuthLayout cardWidth={420}>
      <AuthCard
        title="Welcome back"
        subtitle="Log in to claim and track your compost."
      >
        <form
          aria-label="Log in"
          aria-busy={busy || undefined}
          onSubmit={onSubmit}
          className="flex flex-col gap-5"
        >
          {formError && <FormErrorBanner>{formError}</FormErrorBanner>}
          {apiRejected && (
            <FormErrorBanner>
              <span className="flex flex-col gap-1">
                <span>
                  You’re signed in, but LoopSoil couldn’t load your account:{" "}
                  {sessionError}
                </span>
                <button
                  type="button"
                  onClick={() => void onRetryAfterApiError()}
                  className="self-start underline underline-offset-2"
                >
                  Log out and try again
                </button>
              </span>
            </FormErrorBanner>
          )}

          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            invalid={badCredentials}
          />
          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            invalid={badCredentials}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox
              label="Remember me"
              name="remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={busy}
            />
            {/* PLACEHOLDER: no password-reset screen exists in the design or the routes
                yet, so this link is shown but inert. */}
            <Button
              variant="link"
              size="sm"
              type="button"
              aria-disabled="true"
              title="Password reset isn’t available yet"
              onClick={(e) => e.preventDefault()}
            >
              Forgot password?
            </Button>
          </div>

          <div className="mt-1">
            <Button type="submit" fullWidth loading={busy}>
              {busy ? "Logging in…" : "Log In"}
            </Button>
          </div>
        </form>

        <AuthDivider>New to LoopSoil?</AuthDivider>
        <Button href="/register" variant="secondary" fullWidth>
          Sign Up
        </Button>
      </AuthCard>
    </AuthLayout>
  );
}
