"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  AuthCard,
  AuthLayout,
  FormErrorBanner,
} from "@/components/auth/auth-layout";
import { Sprout } from "@/components/brand/illustrations";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, TextAreaField } from "@/components/ui/field";
import { supabase } from "@/lib/supabase";
import { registerTakerProfile, savePendingProfile } from "@/lib/taker-signup";

/**
 * Sign Up — boards "Sign Up · Desktop / Tablet / Mobile / Validation errors / Success".
 * Individuals only; bulk organisations are added by a manager.
 *
 * Flow (email confirmation OFF in Supabase): signUp returns a session → POST
 * /takers/register creates the PENDING taker → the Success card. If Supabase still
 * requires confirmation, no session comes back: the details are saved and the taker
 * shell finishes registration on first login, and the Success card says to check email.
 */

interface Values {
  name: string;
  email: string;
  phone: string;
  intendedUse: string;
  password: string;
  confirm: string;
  agree: boolean;
}
type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = {
  name: "",
  email: "",
  phone: "",
  intendedUse: "",
  password: "",
  confirm: "",
  agree: false,
};

/** Singapore mobile numbers (WhatsApp): 8 digits starting 8 or 9 (spaces allowed). */
const SG_PHONE = /^[89]\d{7}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: Values): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "Please enter your full name.";
  if (!EMAIL.test(v.email.trim()))
    e.email = "Enter a valid email, like name@example.com.";
  if (!SG_PHONE.test(v.phone.replace(/\s+/g, "")))
    e.phone = "Enter an 8-digit Singapore mobile number starting with 8 or 9"; // (Profile design's wording)
  if (!v.intendedUse.trim())
    e.intendedUse = "Tell us what you’ll use the compost for."; // [draft copy]
  if (v.password.length < 8) e.password = "At least 8 characters.";
  if (!v.confirm || v.confirm !== v.password)
    e.confirm = "Passwords don’t match.";
  if (!v.agree) e.agree = "Please agree to the collection terms to continue.";
  return e;
}

type Result = { kind: "form" } | { kind: "done"; needsConfirmation: boolean };

export default function RegisterPage() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  // Validate live only after the first submit, so people aren't nagged while typing.
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>({ kind: "form" });

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validate(next));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    const email = values.email.trim();
    const profile = {
      name: values.name.trim(),
      phone: `+65 ${values.phone.replace(/\s+/g, "")}`,
      intendedUse: values.intendedUse.trim(),
    };
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: values.password,
        options: { data: { full_name: profile.name, phone: profile.phone } },
      });
      if (error) {
        if (/already registered/i.test(error.message)) {
          setErrors({ email: "An account with this email already exists." }); // [draft copy]
          setFormError("This email is already signed up. Log in instead.");
        } else {
          setFormError(error.message);
        }
        return;
      }

      // Kept either way: the taker shell uses it if the call below can't run or fails.
      savePendingProfile(email, profile);
      if (data.session) {
        try {
          await registerTakerProfile(profile);
        } catch {
          // Finished on first page load of the taker app instead.
        }
      }
      setResult({ kind: "done", needsConfirmation: !data.session });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Couldn’t create your account.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (result.kind === "done") {
    return (
      <AuthLayout cardWidth={480}>
        <SuccessCard needsConfirmation={result.needsConfirmation} />
      </AuthLayout>
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <AuthLayout cardWidth={480}>
      <AuthCard
        title="Join LoopSoil"
        subtitle="Sign up as a gardener to claim free compost from SUSS."
      >
        <form
          aria-label="Sign up"
          aria-busy={busy || undefined}
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-5"
        >
          {formError ? (
            <FormErrorBanner>{formError}</FormErrorBanner>
          ) : errorCount > 0 ? (
            <FormErrorBanner>
              Please fix the {errorCount} highlighted field
              {errorCount === 1 ? "" : "s"}.
            </FormErrorBanner>
          ) : null}

          <Field
            label="Full name"
            name="fullname"
            autoComplete="name"
            placeholder="e.g. Tan Wei Ling"
            required
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            errorText={errors.name}
            disabled={busy}
          />
          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            errorText={errors.email}
            disabled={busy}
          />
          <Field
            label="Phone number"
            type="tel"
            name="phone"
            prefix="+65"
            autoComplete="tel-national"
            inputMode="numeric"
            placeholder="8123 4567"
            required
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            helperText="We’ll send pickup updates via WhatsApp."
            errorText={errors.phone}
            disabled={busy}
          />
          <TextAreaField
            label="Intended use"
            name="use"
            placeholder="e.g. balcony herb garden, community plot"
            rows={3}
            required
            value={values.intendedUse}
            onChange={(e) => set("intendedUse", e.target.value)}
            helperText="Helps us approve your account."
            errorText={errors.intendedUse}
            disabled={busy}
          />
          <Field
            label="Password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            placeholder="Create a password"
            required
            value={values.password}
            onChange={(e) => set("password", e.target.value)}
            helperText="At least 8 characters."
            errorText={errors.password}
            disabled={busy}
          />
          <Field
            label="Confirm password"
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            required
            value={values.confirm}
            onChange={(e) => set("confirm", e.target.value)}
            errorText={errors.confirm}
            disabled={busy}
          />
          <Checkbox
            name="agree"
            label="I agree to collect my compost at the SUSS collection point within my booked time."
            checked={values.agree}
            onChange={(e) => set("agree", e.target.checked)}
            errorText={errors.agree}
            disabled={busy}
          />

          <div className="mt-1">
            <Button type="submit" fullWidth loading={busy}>
              {busy ? "Creating account…" : "Create Account"}
            </Button>
          </div>
        </form>

        <p className="flex flex-wrap items-center justify-center gap-1 text-small text-muted">
          <span>Already have an account?</span>
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-control px-2 font-semibold text-deep underline decoration-leaf decoration-2 underline-offset-4 hover:bg-sage"
          >
            Log in
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}

/** "You're on the list!" — the Success board. */
function SuccessCard({ needsConfirmation }: { needsConfirmation: boolean }) {
  return (
    <section
      aria-labelledby="auth-title"
      className="flex flex-col gap-6 rounded-card bg-cream p-6 shadow-photo md:p-8 lg:p-10"
    >
      <div
        role="status"
        className="flex flex-col items-center gap-5 pb-2 pt-4 text-center"
      >
        <div className="flex size-40 items-center justify-center rounded-full bg-sage">
          <Sprout width={112} />
        </div>
        <h1
          id="auth-title"
          className="font-display m-0 text-h3 font-semibold text-deep"
        >
          You’re on the list!
        </h1>
        {needsConfirmation ? (
          // Only if Supabase still has "Confirm email" switched on. [draft copy]
          <p className="max-w-[360px] text-body text-ink">
            Check your inbox and click the link to confirm your email, then log
            in. Your account will then wait for approval by the SUSS team.
          </p>
        ) : (
          <p className="max-w-[360px] text-body text-ink">
            Your account is pending approval by the SUSS team. We’ll notify you
            via WhatsApp once you can start claiming compost.
          </p>
        )}
        <div className="mt-2 w-full">
          <Button href="/" fullWidth>
            Back to Home
          </Button>
        </div>
      </div>
    </section>
  );
}
