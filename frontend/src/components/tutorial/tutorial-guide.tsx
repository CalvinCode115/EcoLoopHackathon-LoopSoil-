"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { Buildings } from "@phosphor-icons/react/dist/ssr/Buildings";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CalendarCheck } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { Phone } from "@phosphor-icons/react/dist/ssr/Phone";
import { Plant } from "@phosphor-icons/react/dist/ssr/Plant";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { IconArrowRight } from "@/components/brand/icons";
import { EmptyPot } from "@/components/brand/illustrations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL_TEXT, SUSS_CONTACT_EMAIL } from "@/lib/site-config";
import { Lightbox, MarkerDot, PhoneMockup } from "./phone";
import { ALL_SHOTS, ORG_STEPS, STEPS, type Step } from "./tutorial-content";

type Who = "gardener" | "org";

/**
 * Everything interactive on /tutorial: the "Who is this for?" tabs, the gardener guide
 * (progress rail + 7 steps + completion) and the organisation card, plus the lightbox.
 */
export function TutorialGuide() {
  const [who, setWho] = useState<Who>("gardener");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openShot = useCallback((id: string) => {
    setLightboxIndex(ALL_SHOTS.findIndex((s) => s.shot.id === id));
  }, []);
  const lightbox = lightboxIndex !== null ? ALL_SHOTS[lightboxIndex] : null;

  return (
    <section aria-label="Guide" className="flex flex-col">
      <WhoTabs who={who} onChange={setWho} />

      {who === "gardener" ? (
        <div
          id="guide-panel"
          role="tabpanel"
          aria-labelledby="tab-gardener"
          className="mt-7"
        >
          <GardenerGuide onOpenShot={openShot} />
        </div>
      ) : (
        <div
          id="org-panel"
          role="tabpanel"
          aria-labelledby="tab-org"
          className="mt-6"
        >
          <OrganisationCard />
        </div>
      )}

      {lightbox && lightboxIndex !== null && (
        <Lightbox
          shot={lightbox.shot}
          step={lightbox.step}
          onClose={() => setLightboxIndex(null)}
          onPrev={
            lightboxIndex > 0
              ? () => setLightboxIndex(lightboxIndex - 1)
              : undefined
          }
          onNext={
            lightboxIndex < ALL_SHOTS.length - 1
              ? () => setLightboxIndex(lightboxIndex + 1)
              : undefined
          }
        />
      )}
    </section>
  );
}

// ─── Who is this for? ────────────────────────────────────────────────────────

const TABS: { id: Who; title: string; sub: string; icon: ReactNode }[] = [
  {
    id: "gardener",
    title: "I’m a gardener",
    sub: "Individuals · the 7-step guide",
    icon: <Plant size={20} />,
  },
  {
    id: "org",
    title: "I’m an organisation",
    sub: "NParks, schools, town councils…",
    icon: <Buildings size={20} />,
  },
];

function WhoTabs({ who, onChange }: { who: Who; onChange: (w: Who) => void }) {
  const refs = useRef<Record<Who, HTMLButtonElement | null>>({
    gardener: null,
    org: null,
  });

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onKeyDown(e: KeyboardEvent) {
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown"
    )
      return;
    e.preventDefault();
    const next: Who = who === "gardener" ? "org" : "gardener";
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="font-display m-0 text-[26px] font-semibold leading-tight text-deep md:text-[30px]">
        Who is this for?
      </h2>
      <div
        role="tablist"
        aria-label="Who is this for"
        onKeyDown={onKeyDown}
        className="flex max-w-[720px] flex-col gap-1.5 rounded-[18px] bg-cream p-1.5 shadow-card md:flex-row"
      >
        {TABS.map((t) => {
          const selected = who === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={t.id === "gardener" ? "guide-panel" : "org-panel"}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-[14px] px-4 py-3 text-left md:py-3.5",
                selected ? "bg-leaf text-cream" : "text-ink hover:bg-sage",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  selected ? "bg-cream/20 text-cream" : "bg-sage text-deep",
                )}
              >
                {t.icon}
              </span>
              <span className="flex flex-col">
                <strong className="text-body">{t.title}</strong>
                <span className="text-[13px] opacity-85">{t.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Gardener guide ──────────────────────────────────────────────────────────

function GardenerGuide({ onOpenShot }: { onOpenShot: (id: string) => void }) {
  const current = useCurrentStep();

  return (
    <>
      <MobileProgress current={current} />
      <div className="flex items-start gap-12">
        <ProgressRail current={current} />
        <div className="min-w-0 flex-1">
          {STEPS.map((step) => (
            <StepSection key={step.n} step={step} onOpenShot={onOpenShot} />
          ))}
          <Completion />
        </div>
      </div>
    </>
  );
}

/** The step whose section is nearest the upper-middle of the viewport. */
function useCurrentStep(): number {
  const [current, setCurrent] = useState(1);
  useEffect(() => {
    const sections = STEPS.map((s) =>
      document.getElementById(`step-${s.n}`),
    ).filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setCurrent(Number(entry.target.id.replace("step-", "")));
          }
        }
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return current;
}

/** Desktop: sticky card listing all steps — done ✓, current highlighted, upcoming outlined. */
function ProgressRail({ current }: { current: number }) {
  return (
    <nav
      aria-label="Tutorial steps"
      className="sticky top-[104px] hidden w-[260px] shrink-0 flex-col gap-3 self-start rounded-[18px] bg-cream p-[18px] shadow-card lg:flex"
    >
      <div className="flex items-center justify-between">
        <strong className="text-small text-deep">Your progress</strong>
        <span className="text-[13px] text-muted">Step {current} of 7</span>
      </div>
      <ProgressBar current={current} />
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {STEPS.map((s) => {
          const done = s.n < current;
          const isCurrent = s.n === current;
          return (
            <li key={s.n}>
              <a
                href={`#step-${s.n}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-control px-2.5 py-1.5 text-[15px] no-underline",
                  isCurrent
                    ? "bg-sage font-bold text-deep"
                    : "font-medium text-ink hover:bg-sage",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                    done || isCurrent
                      ? "bg-leaf text-cream"
                      : "bg-cream text-muted shadow-[inset_0_0_0_2px_#C9C5B8]",
                  )}
                >
                  {done ? (
                    <Check size={14} weight="bold" aria-label="Done" />
                  ) : (
                    s.n
                  )}
                </span>
                <span>{s.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Below 1024px the rail becomes a thin sticky bar under the navbar. */
function MobileProgress({ current }: { current: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={7}
      aria-valuenow={current}
      aria-label="Tutorial progress"
      className="sticky top-[72px] z-[15] -mx-6 flex flex-col gap-1.5 bg-beige/97 px-6 py-2.5 shadow-[0_1px_0_rgba(79,122,58,0.2)] md:-mx-8 md:px-8 lg:hidden"
    >
      <div className="flex justify-between text-[13px]">
        <strong className="text-deep">Step {current} of 7</strong>
        <span className="text-muted">{STEPS[current - 1].title}</span>
      </div>
      <ProgressBar current={current} />
    </div>
  );
}

function ProgressBar({ current }: { current: number }) {
  return (
    <div className="h-1.5 rounded-[3px] bg-[#E3DDCF]">
      <div
        className="h-full rounded-[3px] bg-leaf transition-[width]"
        style={{ width: `${(current / STEPS.length) * 100}%` }}
      />
    </div>
  );
}

function StepSection({
  step,
  onOpenShot,
}: {
  step: Step;
  onOpenShot: (id: string) => void;
}) {
  // One highlight shared by the action list and the screenshot markers.
  const [active, setActive] = useState<number | null>(null);
  const [main, secondary] = step.shots;
  // Even steps put the phones on the left (design alternates), odd on the right.
  const phonesFirst = step.n % 2 === 0;
  const pad = String(step.n).padStart(2, "0");

  const phones = (
    <div className="flex items-end justify-center gap-[18px]">
      <PhoneMockup
        shot={main}
        activeMarker={active}
        onMarkerHover={setActive}
        onOpen={() => onOpenShot(main.id)}
      />
      {secondary && (
        <div className="mb-10 hidden md:block">
          <PhoneMockup
            shot={secondary}
            activeMarker={active}
            onMarkerHover={setActive}
            onOpen={() => onOpenShot(secondary.id)}
          />
        </div>
      )}
    </div>
  );

  return (
    <section
      id={`step-${step.n}`}
      aria-labelledby={`step-${step.n}-t`}
      className="scroll-mt-[140px] py-7 shadow-[inset_0_-1px_0_rgba(79,122,58,0.2)] md:py-10 lg:scroll-mt-[100px]"
    >
      <div
        className={cn(
          "flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10",
          phonesFirst && "md:flex-row-reverse",
        )}
      >
        <div className="flex max-w-[440px] flex-col gap-4">
          <div className="flex items-center gap-3.5">
            <span className="font-display text-[44px] font-semibold leading-none text-leaf md:text-[56px]">
              {pad}
            </span>
            <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
              Step {step.n} of 7
            </span>
          </div>
          <h3
            id={`step-${step.n}-t`}
            className="font-display m-0 text-[26px] font-semibold leading-[34px] text-deep md:text-[30px] md:leading-[38px]"
          >
            {step.title}
          </h3>
          <p className="text-body text-ink">{step.intro}</p>
          <ol
            aria-label="What to do"
            className="m-0 flex list-none flex-col gap-0.5 p-0"
          >
            {step.actions.map((text, i) => {
              const n = i + 1;
              return (
                <li
                  key={n}
                  onMouseEnter={() => setActive(n)}
                  onMouseLeave={() => setActive(null)}
                  className={cn(
                    "-mx-2.5 flex items-start gap-3 rounded-control px-2.5 py-2 text-body leading-6 transition-colors",
                    active === n && "bg-danger-tint",
                  )}
                >
                  <MarkerDot n={n} />
                  <span>{text}</span>
                </li>
              );
            })}
          </ol>
          {step.tip && <Tip>{step.tip}</Tip>}
          <div className="flex flex-wrap gap-2.5">
            {step.n > 1 && (
              <Button
                href={`#step-${step.n - 1}`}
                variant="secondary"
                size="sm"
                className="px-4"
                icon={<ArrowLeft size={18} />}
              >
                Previous step
              </Button>
            )}
            <Button
              href={step.n < STEPS.length ? `#step-${step.n + 1}` : "#done"}
              size="sm"
              className="px-[18px]"
              iconAfter={<IconArrowRight size={18} />}
            >
              {step.n < STEPS.length ? "Next step" : "I’m ready"}
            </Button>
          </div>
        </div>
        {phones}
      </div>
    </section>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] bg-sage px-3.5 py-3 text-[15px] leading-[22px] text-deep">
      <Lightbulb size={20} className="mt-px shrink-0" aria-hidden />
      <span>
        <strong>Tip:</strong> {children}
      </span>
    </div>
  );
}

function Completion() {
  return (
    <section
      id="done"
      aria-labelledby="done-t"
      className="mt-8 flex scroll-mt-[140px] flex-col items-center gap-7 rounded-3xl bg-sage p-6 text-center md:flex-row md:p-10 md:text-left lg:scroll-mt-[100px]"
    >
      <div className="flex size-[170px] shrink-0 items-center justify-center rounded-full bg-cream/70">
        <EmptyPot width={130} />
      </div>
      <div className="flex flex-col gap-3.5">
        <h3
          id="done-t"
          className="font-display m-0 text-[32px] font-semibold leading-tight text-deep"
        >
          You’re ready to close the loop!
        </h3>
        <p className="text-[17px] leading-[25px] text-deep">
          Sign up in a few minutes and claim your first batch of free compost.
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
          <Button href="/register" size="lg" className="px-7">
            Sign up now
          </Button>
          <Button
            href="/login"
            variant="secondary"
            size="lg"
            className="bg-cream px-7"
          >
            Log in
          </Button>
        </div>
      </div>
    </section>
  );
}

// ─── Organisation tab ────────────────────────────────────────────────────────

const ORG_ICONS = [
  <Phone key="1" size={24} />,
  <CalendarBlank key="2" size={24} />,
  <CalendarCheck key="3" size={24} />,
  <Package key="4" size={24} />,
];

function OrganisationCard() {
  return (
    <section
      aria-label="For organisations"
      className="flex flex-col gap-[22px] rounded-3xl bg-cream p-6 shadow-card md:p-9"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-sage text-deep">
          <Buildings size={30} />
        </span>
        <div className="flex flex-col gap-2">
          <h3 className="font-display m-0 text-[28px] font-semibold leading-tight text-deep">
            Getting compost for an organisation
          </h3>
          <p className="max-w-[720px] text-[17px] leading-[27px]">
            Organisations like NParks, town councils, schools and community
            gardens receive larger amounts directly from the SUSS team.{" "}
            <strong>You don’t need to sign up.</strong>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <strong className="text-small uppercase tracking-[0.06em] text-muted">
          What happens
        </strong>
        <ol className="m-0 grid list-none grid-cols-2 gap-4 rounded-[18px] bg-white p-5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)] md:flex">
          {ORG_STEPS.map((label, i) => (
            <li
              key={label}
              className="flex flex-1 flex-col items-center gap-2.5 text-center"
            >
              <span className="relative flex size-[52px] shrink-0 items-center justify-center rounded-full bg-sage text-deep">
                {ORG_ICONS[i]}
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 inline-flex size-[22px] items-center justify-center rounded-full bg-leaf text-xs font-bold text-white shadow-[0_0_0_2px_#fff]"
                >
                  {i + 1}
                </span>
              </span>
              <strong className="text-[15px]">{label}</strong>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        {SUSS_CONTACT_EMAIL ? (
          <Button
            href={`mailto:${SUSS_CONTACT_EMAIL}`}
            size="lg"
            icon={<EnvelopeSimple size={18} />}
          >
            Contact the SUSS team
          </Button>
        ) : (
          // PLACEHOLDER: no contact email supplied yet (lib/site-config.ts).
          <Button
            size="lg"
            disabled
            title="The SUSS contact email hasn’t been set yet"
            icon={<EnvelopeSimple size={18} />}
          >
            Contact the SUSS team
          </Button>
        )}
        <span className="text-[15px] text-muted">
          or email <strong className="text-ink">{CONTACT_EMAIL_TEXT}</strong>
        </span>
      </div>
    </section>
  );
}
