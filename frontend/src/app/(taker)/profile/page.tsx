"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { Lock } from "@phosphor-icons/react/dist/ssr/Lock";
import { Prohibit } from "@phosphor-icons/react/dist/ssr/Prohibit";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { IconArrowRight } from "@/components/brand/icons";
import { EmptyPot } from "@/components/brand/illustrations";
import {
  useTakerAccount,
  type TakerAccount,
} from "@/components/nav/taker-shell";
import { Badge, ClaimStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import { CONTACT_EMAIL_TEXT, SUSS_CONTACT_EMAIL } from "@/lib/site-config";

/**
 * Taker · Profile (/profile) — boards "Profile / Approved / Pending / Suspended · Edited
 * (Save enabled) · Saving · Saved toast · Save error · Field validation · Loading · Page
 * error · Desktop". Data: GET /takers/me (via the taker shell), PATCH /takers/me,
 * GET /handovers (own) for "My impact" — weighed kg, the same figure SUSS reports.
 */
export default function ProfilePage() {
  const { taker, loading, refresh } = useTakerAccount();

  if (loading) return <LoadingState />;
  if (!taker) {
    return (
      <Page>
        <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-10 text-center shadow-card">
          <div className="mb-2 flex size-40 items-center justify-center rounded-full bg-sage">
            <EmptyPot width={130} />
          </div>
          <h2 className="font-display m-0 text-h3 font-semibold text-deep">
            We couldn’t load your profile
          </h2>
          <p className="max-w-[360px] text-body text-muted">
            Please check your connection and try again.
          </p>
          <div className="mt-2 w-full md:max-w-[320px]">
            <Button
              fullWidth
              icon={<ArrowClockwise size={18} weight="bold" />}
              onClick={() => void refresh()}
            >
              Try again
            </Button>
          </div>
        </div>
      </Page>
    );
  }
  return <ProfileScreen taker={taker} onSaved={refresh} />;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

interface Values {
  name: string;
  phone: string;
  intendedUse: string;
}
type Errors = Partial<Record<keyof Values, string>>;

/** Stored as "+65 81234567"; the field shows just the local number. */
function localPhone(phone: string | null): string {
  return (phone ?? "").replace(/^\+65\s?/, "");
}

function validate(v: Values): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "Please enter your name";
  if (!/^[89]\d{7}$/.test(v.phone.replace(/\s+/g, "")))
    e.phone = "Enter an 8-digit Singapore mobile number starting with 8 or 9";
  if (!v.intendedUse.trim())
    e.intendedUse = "Tell us briefly how you’ll use the compost";
  return e;
}

function ProfileScreen({
  taker,
  onSaved,
}: {
  taker: TakerAccount;
  onSaved: () => Promise<void>;
}) {
  const { user, signOut, refreshUser } = useAuth();
  const initial: Values = {
    name: taker.name,
    phone: localPhone(taker.phone),
    intendedUse: taker.intendedUse ?? "",
  };
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const suspended = taker.status === "SUSPENDED" || taker.status === "REJECTED";
  const dirty =
    values.name !== initial.name ||
    values.phone !== initial.phone ||
    values.intendedUse !== initial.intendedUse;

  function set<K extends keyof Values>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setToast(null);
    try {
      await api.patch("/takers/me", {
        name: values.name.trim(),
        phone: `+65 ${values.phone.replace(/\s+/g, "")}`,
        intendedUse: values.intendedUse.trim(),
      });
      await onSaved();
      refreshUser(); // name/phone are mirrored onto the User record
      setToast({
        tone: "success",
        text: "Changes saved. Your contact details are up to date.",
      });
    } catch {
      // Inputs are kept so nothing typed is lost.
      setToast({
        tone: "error",
        text: "Couldn’t save your changes. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const dismiss = useCallback(() => setToast(null), []);

  return (
    <Page>
      <h1 className="font-display m-0 text-[28px] font-semibold leading-9 text-deep md:text-[40px] md:leading-[48px]">
        Profile
      </h1>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <div className="flex flex-col gap-5">
          <AccountStatus taker={taker} />

          <form
            onSubmit={(e) => void save(e)}
            noValidate
            aria-label="Contact details"
            className="flex flex-col gap-[18px] rounded-card bg-cream p-5 shadow-card lg:p-7"
          >
            <h2 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
              Contact details
            </h2>
            {suspended && (
              <p className="flex items-center gap-2 text-small text-muted">
                <Lock size={16} aria-hidden /> Read-only while your account is
                suspended.
              </p>
            )}
            <Field
              label="Full name"
              autoComplete="name"
              required
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              errorText={errors.name}
              disabled={suspended || busy}
            />
            <Field
              label="Phone number"
              type="tel"
              prefix="+65"
              inputMode="numeric"
              autoComplete="tel-national"
              required
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
              helperText="Used for WhatsApp pickup updates."
              errorText={errors.phone}
              disabled={suspended || busy}
            />
            <TextAreaField
              label="Intended use"
              rows={3}
              required
              value={values.intendedUse}
              onChange={(e) => set("intendedUse", e.target.value)}
              helperText={
                taker.status === "PENDING"
                  ? "Keeping your intended use clear helps us approve you faster."
                  : undefined
              }
              errorText={errors.intendedUse}
              disabled={suspended || busy}
            />
            <div className="flex flex-col gap-2">
              <label htmlFor="p-email" className="text-small font-semibold">
                Email
              </label>
              <div className="flex h-12 items-center gap-2.5 rounded-control bg-disabled px-4 text-muted">
                <input
                  id="p-email"
                  type="email"
                  value={user?.email ?? ""}
                  readOnly
                  aria-describedby="p-email-help"
                  className="min-w-0 flex-1 border-none bg-transparent text-body text-ink outline-none"
                />
                <Lock size={18} aria-hidden />
              </div>
              <p id="p-email-help" className="text-small text-muted">
                Your email is your login, so it can’t be changed here.
              </p>
            </div>
            {!suspended && (
              <Button type="submit" fullWidth disabled={!dirty} loading={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            )}
          </form>
        </div>

        <div className="flex flex-col gap-5">
          <MyImpact status={taker.status} />

          <section className="flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card lg:p-7">
            <h2 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
              Security
            </h2>
            <div className="flex flex-col gap-1.5">
              {/* PLACEHOLDER: needs the password-reset page, which isn't designed/built. */}
              <Button
                variant="secondary"
                fullWidth
                disabled
                title="Password reset isn’t available yet"
                icon={<Lock size={18} weight="bold" />}
              >
                Change password
              </Button>
              <p className="text-[13px] leading-[21px] text-muted">
                We’ll email you a secure reset link.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex h-11 items-center self-start rounded-control px-1 font-semibold text-error underline underline-offset-4 hover:bg-danger-tint"
            >
              Log out
            </button>
          </section>
        </div>
      </div>

      {toast && (
        <Toast
          tone={toast.tone}
          onDismiss={dismiss}
          duration={toast.tone === "success" ? 4000 : 0}
        >
          {toast.text}
        </Toast>
      )}
    </Page>
  );
}

// ─── Account status ──────────────────────────────────────────────────────────

function AccountStatus({ taker }: { taker: TakerAccount }) {
  const card =
    "flex flex-col gap-3 rounded-card bg-cream p-5 shadow-card lg:p-7";
  const heading = (
    <h2 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
      Account status
    </h2>
  );

  if (taker.status === "APPROVED") {
    return (
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          {heading}
          <ClaimStatusBadge status="APPROVED" />
        </div>
        <p className="text-[15px] leading-[23px]">
          You’re approved. You can claim compost and book pickups.
        </p>
      </section>
    );
  }

  if (taker.status === "PENDING") {
    return (
      <section className={card}>
        <div className="flex flex-col items-start gap-2">
          {heading}
          <Badge
            tone="amber"
            icon={<Clock size={14} weight="bold" aria-hidden />}
          >
            Pending approval
          </Badge>
        </div>
        <p className="text-[15px] leading-[23px]">
          Your account is being reviewed by the SUSS team. This usually takes
          [1–2] working days.
        </p>
        <p className="text-small text-muted">
          You can browse available compost now. Claiming unlocks once you’re
          approved.
        </p>
        <div className="pt-1.5">
          <ApprovalStepper />
        </div>
      </section>
    );
  }

  // SUSPENDED (designed) and REJECTED (same treatment, draft copy).
  const rejected = taker.status === "REJECTED";
  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-3">
        {heading}
        <Badge
          tone="red"
          icon={<Prohibit size={14} weight="bold" aria-hidden />}
        >
          {rejected ? "Not approved" : "Suspended"}
        </Badge>
      </div>
      <p className="text-[15px] leading-[23px]">
        {rejected
          ? "Your registration wasn’t approved, so you can’t make claims or bookings."
          : "Your account has been suspended, so you can’t make new claims or bookings."}
      </p>
      {taker.statusReason && (
        <p className="rounded-control bg-white px-3.5 py-3 text-[15px] italic leading-[22px] shadow-[inset_0_0_0_1px_rgba(143,142,128,0.35)]">
          “{taker.statusReason}”
        </p>
      )}
      {SUSS_CONTACT_EMAIL ? (
        <Button
          href={`mailto:${SUSS_CONTACT_EMAIL}`}
          variant="secondary"
          fullWidth
          icon={<EnvelopeSimple size={18} weight="bold" />}
        >
          Contact the SUSS team
        </Button>
      ) : (
        <Button
          variant="secondary"
          fullWidth
          disabled
          title={`Contact email not set yet — ${CONTACT_EMAIL_TEXT}`}
          icon={<EnvelopeSimple size={18} weight="bold" />}
        >
          Contact the SUSS team
        </Button>
      )}
    </section>
  );
}

/** Signed up → Under review (amber, current) → Approved. */
function ApprovalStepper() {
  const steps = ["Signed up", "Under review", "Approved"];
  return (
    <ol
      aria-label="Account approval progress"
      className="m-0 flex list-none p-0"
    >
      {steps.map((label, i) => (
        <li
          key={label}
          aria-current={i === 1 ? "step" : undefined}
          className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
        >
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute left-[calc(50%+14px)] right-[calc(-50%+14px)] top-[11px] h-0.5 rounded-[1px]",
                i === 0 ? "bg-leaf" : "bg-[#D3CFC3]",
              )}
            />
          )}
          {i === 0 ? (
            <span className="flex size-6 items-center justify-center rounded-full bg-leaf text-cream">
              <Check size={14} weight="bold" aria-hidden />
            </span>
          ) : i === 1 ? (
            <span className="flex size-6 items-center justify-center rounded-full bg-cream shadow-[inset_0_0_0_3px_#C98217,0_0_0_4px_var(--color-amber-tint)]">
              <span className="size-2 rounded-full bg-[#C98217]" />
            </span>
          ) : (
            <span className="size-6 rounded-full bg-cream shadow-[inset_0_0_0_2px_#C9C5B8]" />
          )}
          <span
            className={cn(
              "text-xs leading-4",
              i === 1
                ? "font-bold text-deep"
                : i === 0
                  ? "font-medium text-deep"
                  : "font-medium text-muted",
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ─── My impact ───────────────────────────────────────────────────────────────

interface HandoverSummary {
  actualKg: number;
}

/** Weighed kg and number of pickups from the taker's own handovers. */
function MyImpact({ status }: { status: string }) {
  const [impact, setImpact] = useState<{ kg: number; pickups: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get<Paginated<HandoverSummary>>("/handovers?pageSize=100")
      .then((p) => {
        if (cancelled) return;
        setImpact({
          kg: p.data.reduce((sum, h) => sum + Number(h.actualKg), 0),
          pickups: p.meta.total,
        });
      })
      .catch(() => !cancelled && setImpact({ kg: 0, pickups: 0 }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="flex flex-col gap-3.5 rounded-card bg-cream p-5 shadow-card lg:p-7">
      <h2 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
        My impact
      </h2>
      {impact === null ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[86px] rounded-[14px]" />
          <Skeleton className="h-[86px] rounded-[14px]" />
        </div>
      ) : impact.pickups === 0 ? (
        <p className="rounded-[14px] bg-sage p-3.5 text-[15px] leading-[22px] text-deep">
          Your impact will show here after your first pickup.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Stat value={`${formatKg(impact.kg)}kg`} label="compost collected" />
          <Stat
            value={String(impact.pickups)}
            label={impact.pickups === 1 ? "pickup" : "pickups"}
          />
        </div>
      )}
      {(status === "SUSPENDED" || status === "REJECTED") &&
        impact &&
        impact.pickups > 0 && (
          <p className="text-[13px] leading-[21px] text-muted">
            Your past pickups are kept.
          </p>
        )}
      <Button
        href="/#background"
        variant="link"
        size="sm"
        className="self-start"
        iconAfter={<IconArrowRight size={16} />}
      >
        Read our impact story
      </Button>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] bg-sage p-3.5">
      <span className="font-display text-[32px] font-semibold leading-10 text-deep">
        {value}
      </span>
      <span className="text-small text-deep">{label}</span>
    </div>
  );
}

// ─── Layout / loading ────────────────────────────────────────────────────────

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pb-8 pt-5 md:gap-8 md:px-8 md:pb-16 md:pt-10 lg:px-10">
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <Page>
      <LoadingLabel>Loading your profile…</LoadingLabel>
      <h1 className="font-display m-0 text-[28px] font-semibold leading-9 text-deep md:text-[40px] md:leading-[48px]">
        Profile
      </h1>
      <div
        aria-hidden
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-card bg-cream p-5 shadow-card">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-5 w-3/4" />
          </div>
          <div className="flex flex-col gap-4 rounded-card bg-cream p-5 shadow-card">
            <Skeleton className="h-7 w-44" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-card bg-cream p-5 shadow-card">
          <Skeleton className="h-7 w-32" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-[86px] rounded-[14px]" />
            <Skeleton className="h-[86px] rounded-[14px]" />
          </div>
        </div>
      </div>
    </Page>
  );
}
