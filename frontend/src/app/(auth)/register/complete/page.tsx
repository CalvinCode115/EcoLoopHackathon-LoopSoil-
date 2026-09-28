"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Accent } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-provider";

/**
 * Sign Up Complete (/register/complete) — boards "Sign Up Complete · Desktop / Tablet /
 * Mobile". Where the email-confirmation link lands (Sign Up passes it as Supabase's
 * `emailRedirectTo`), so it only shows if "Confirm email" is switched on in Supabase. The
 * email comes from the session the link creates, or `?email=`.
 */
export default function SignUpCompletePage() {
  return (
    <AuthLayout cardWidth={480}>
      <Suspense fallback={null}>
        <Complete />
      </Suspense>
    </AuthLayout>
  );
}

function Complete() {
  const params = useSearchParams();
  const { session } = useAuth();
  const email = session?.user.email ?? params.get("email");

  return (
    <section
      aria-labelledby="auth-title"
      className="flex flex-col gap-6 rounded-card bg-cream p-6 shadow-photo md:p-10"
    >
      <div
        role="status"
        className="flex flex-col items-center gap-4 text-center"
      >
        <div
          aria-hidden
          className="mb-2 mt-2.5 flex size-[72px] items-center justify-center rounded-full bg-leaf text-cream shadow-[0_0_0_10px_var(--color-sage)]"
        >
          <Check size={36} weight="bold" />
        </div>
        <p className="inline-flex items-center gap-2 rounded-full bg-leaf px-3 py-1 text-small font-semibold tracking-[0.02em] text-cream">
          <span aria-hidden className="size-2 rounded-full bg-sage" />
          Sign up complete
        </p>
        <h1
          id="auth-title"
          className="font-display m-0 text-[28px] font-semibold leading-9 text-deep md:text-[32px] md:leading-10"
        >
          Account <Accent>created!</Accent>
        </h1>
        <p className="max-w-[380px] text-body text-ink">
          Welcome to LoopSoil. Log in with the email and password you just
          signed up with to start claiming compost.
        </p>
        {email && (
          <div className="flex w-full items-center gap-3 rounded-control bg-sage px-4 py-3 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cream text-deep">
              <EnvelopeSimple size={20} aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-small text-deep">Signed up as</span>
              <span className="break-all text-body font-bold text-ink">
                {email}
              </span>
            </div>
          </div>
        )}
        <div className="mt-2 flex w-full flex-col items-center gap-2">
          <Button href="/login" fullWidth iconAfter={<ArrowRight size={20} />}>
            Go to Log In
          </Button>
          <Button href="/" variant="link">
            Back to Home
          </Button>
        </div>
      </div>
    </section>
  );
}
