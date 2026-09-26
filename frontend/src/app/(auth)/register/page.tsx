"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { LockKey } from "@phosphor-icons/react/dist/ssr/LockKey";
import { Phone } from "@phosphor-icons/react/dist/ssr/Phone";
import { User } from "@phosphor-icons/react/dist/ssr/User";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EcoBackdrop } from "@/components/brand/eco-backdrop";
import { LoopMark } from "@/components/brand/loop-mark";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { supabase } from "@/lib/supabase";

/**
 * Registers an individual taker's LOGIN (Supabase Auth). This is not the same as
 * completing a taker profile (POST /takers/register) — that call needs a signed-in
 * session, which does not exist until the confirmation email is clicked. Bulk takers
 * (NParks etc.) are never created here; a manager creates those records directly.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, phone } },
      });
      if (error) throw new Error(error.message);

      // Best-effort local note so a later "complete your profile" step (not built yet)
      // can pre-fill what they already typed. Not critical path: if it's gone, they
      // can just type it again once they're signed in.
      try {
        window.localStorage.setItem(
          `loopsoil:pending-taker:${email.toLowerCase()}`,
          JSON.stringify({ intendedUse }),
        );
      } catch {
        // localStorage can throw in private browsing — safe to ignore.
      }

      if (data.session) {
        // This project currently requires email confirmation, so this branch is not
        // expected in practice, but handle it correctly if that setting ever changes.
        router.push("/batches");
        return;
      }
      setSubmittedEmail(email);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!submittedEmail) return;
    setResent(false);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: submittedEmail,
    });
    if (!error) setResent(true);
  }

  if (submittedEmail) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center px-6 py-16">
        <EcoBackdrop />
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-line bg-canvas-raised px-8 py-10 text-center shadow-2xl shadow-forest-900/10">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-100 text-forest-700">
            <CheckCircle size={30} weight="regular" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Check your inbox
            </h1>
            <p className="font-body text-[0.95rem] leading-relaxed text-ink-soft">
              We sent a confirmation link to{" "}
              <span className="font-medium text-ink">{submittedEmail}</span>.
              Open it to activate your account, then come back and sign in.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => void onResend()}
              className="font-body text-sm font-semibold text-forest-500 hover:text-forest-700"
            >
              Resend the email
            </button>
            {resent && (
              <p className="font-body text-sm text-ink-faint">
                Sent again. Check your inbox.
              </p>
            )}
          </div>
          <Button href="/login" variant="secondary">
            Back to sign in
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center gap-6 px-6 py-16">
      <EcoBackdrop />

      <div className="flex flex-col gap-10 rounded-2xl border border-line bg-canvas-raised px-8 py-10 shadow-2xl shadow-forest-900/10">
        <div className="flex flex-col items-center gap-4 text-center">
          <LoopMark size={40} />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Register as a taker
            </h1>
            <p className="mt-1 font-body text-[0.95rem] text-ink-soft">
              For individuals. Organisations are added by the LoopSoil manager.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field
            label="Full name"
            type="text"
            name="name"
            icon={<User size={18} weight="regular" />}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Jo Tan"
            required
          />
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
            label="Phone"
            type="tel"
            name="phone"
            icon={<Phone size={18} weight="regular" />}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="9XXX XXXX"
            helperText="Used to coordinate pickups."
            required
          />

          <div className="flex flex-col gap-2">
            <label
              htmlFor="intendedUse"
              className="font-body text-sm font-medium text-ink"
            >
              What will the compost be used for?
            </label>
            <textarea
              id="intendedUse"
              name="intendedUse"
              value={intendedUse}
              onChange={(e) => setIntendedUse(e.target.value)}
              placeholder="e.g. home garden, community plot"
              rows={2}
              required
              className="w-full resize-none rounded-xl border border-line-strong bg-canvas-raised px-4 py-3 font-body text-[0.95rem] text-ink placeholder:text-ink-faint transition-colors duration-150 focus:border-forest-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest-500"
            />
          </div>

          <Field
            label="Password"
            type="password"
            name="password"
            icon={<LockKey size={18} weight="regular" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            helperText="At least 8 characters."
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
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </div>

      <p className="text-center font-body text-sm text-ink-soft">
        Already registered?{" "}
        <Link
          href="/login"
          className="font-semibold text-forest-500 hover:text-forest-700"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
