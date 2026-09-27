import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { Basket } from "@phosphor-icons/react/dist/ssr/Basket";
import { CalendarCheck } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr/ChatCircleDots";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Gift } from "@phosphor-icons/react/dist/ssr/Gift";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { Ruler } from "@phosphor-icons/react/dist/ssr/Ruler";
import { Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";
import type { Metadata } from "next";
import Image from "next/image";
import { Fragment } from "react";
import { IconArrowRight } from "@/components/brand/icons";
import { LeafSprig } from "@/components/brand/illustrations";
import { Footer } from "@/components/nav/footer";
import { PublicNavbar } from "@/components/nav/public-navbar";
import { FAQ, OVERVIEW, RULES } from "@/components/tutorial/tutorial-content";
import { TutorialGuide } from "@/components/tutorial/tutorial-guide";
import { Button } from "@/components/ui/button";
import {
  Accent,
  SectionDivider,
  SectionHeader,
} from "@/components/ui/section-header";
import { CONTACT_EMAIL_TEXT } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "How it works · LoopSoil",
  description: "From sign-up to pickup in 7 simple steps.",
};

/**
 * Tutorial — boards "Tutorial / Desktop (1–2)", "Mobile (1–3)", "Organisation tab",
 * "Lightbox". Public: readable signed in or out. Static except the guide, which is a
 * client component (tabs, progress tracking, marker highlights, lightbox).
 */
export default function TutorialPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicNavbar active="Tutorial" />
      <main className="flex-1">
        <Hero />
        <SectionDivider />
        <div className="page-container pt-10">
          <TutorialGuide />
        </div>
        <div className="page-container flex flex-col gap-12 py-12 md:gap-[72px] md:py-[72px]">
          <GoodToKnow />
          <Faq />
          <StillNeedHelp />
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

const OVERVIEW_ICONS = [
  <UserPlus key="0" size={22} />,
  <Basket key="1" size={22} />,
  <CalendarCheck key="2" size={22} />,
  <Package key="3" size={22} />,
];

function Hero() {
  return (
    <section
      aria-labelledby="hero-t"
      className="page-container pb-12 pt-10 md:pb-16 md:pt-14 lg:pb-[72px] lg:pt-16"
    >
      <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <div className="flex max-w-[600px] flex-col gap-6">
          <p className="inline-flex items-center gap-2 self-start rounded-2xl bg-leaf px-3 py-1 text-small font-semibold tracking-[0.02em] text-cream">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-sage"
            />
            <span>Tutorial</span>
          </p>
          <h1
            id="hero-t"
            className="font-display m-0 text-[36px] font-semibold leading-[44px] text-deep md:text-[44px] md:leading-[52px] lg:text-[56px] lg:leading-[64px]"
          >
            How to get <Accent>free compost</Accent> with LoopSoil
          </h1>
          <p className="text-[19px] leading-[30px]">
            From sign-up to pickup in 7 simple steps. It takes about 3 minutes
            to get started.
          </p>

          <ol
            aria-label="Overview"
            className="m-0 flex list-none items-start justify-between gap-1 rounded-[18px] bg-cream px-2.5 py-3.5 shadow-card md:px-[18px]"
          >
            {OVERVIEW.map((label, i) => (
              <Fragment key={label}>
                <li className="flex min-w-0 flex-1 flex-col items-center gap-1.5 md:min-w-[88px] md:flex-none">
                  <span className="flex size-11 items-center justify-center rounded-full bg-sage text-deep md:size-[52px]">
                    {OVERVIEW_ICONS[i]}
                  </span>
                  <span className="text-center text-[13px] font-bold text-deep md:text-small">
                    {label}
                  </span>
                </li>
                {i < OVERVIEW.length - 1 && (
                  <li aria-hidden className="hidden pt-4 text-leaf md:flex">
                    <IconArrowRight size={18} />
                  </li>
                )}
              </Fragment>
            ))}
          </ol>

          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
            <Button
              href="#step-1"
              size="lg"
              iconAfter={<IconArrowRight size={18} />}
            >
              Start the guide
            </Button>
            <Button href="/register" variant="secondary" size="lg">
              Sign up now
            </Button>
          </div>
        </div>

        {/* Arched photo with a leaf sprig over the top and a "3 minutes" badge. */}
        <div className="relative h-[315px] w-[300px] shrink-0 self-center md:h-[483px] md:w-[460px]">
          <div className="absolute inset-0 overflow-hidden rounded-[150px_150px_32px_32px] shadow-[0_0_0_10px_var(--color-cream),0_1px_2px_rgba(47,74,36,0.06),0_8px_24px_rgba(47,74,36,0.08)] md:rounded-[230px_230px_32px_32px]">
            <Image
              src="/images/home/gallery-soil.jpg"
              alt="Cupped hands holding dark, fine soil"
              fill
              priority
              sizes="(min-width: 768px) 460px, 300px"
              className="object-cover"
            />
          </div>
          <LeafSprig
            rotate={-8}
            className="absolute left-1/2 top-[66px] h-auto w-[102px] -translate-x-1/2 drop-shadow-[0_6px_10px_rgba(0,0,0,0.25)] md:top-[101px] md:w-[120px]"
          />
          <span className="absolute -left-2.5 bottom-[22px] inline-flex items-center gap-2 rounded-[20px] bg-cream px-3.5 py-2 text-small font-bold text-deep shadow-card">
            <Clock size={16} weight="bold" aria-hidden /> About 3 minutes
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── Good to know ────────────────────────────────────────────────────────────

const RULE_ICONS = [
  <Scales key="0" size={24} />,
  <Ruler key="1" size={24} />,
  <Clock key="2" size={24} />,
  <Gift key="3" size={24} />,
];

function GoodToKnow() {
  return (
    <section aria-labelledby="gtk" className="flex flex-col gap-6">
      <SectionHeader eyebrow="Quick rules" titleId="gtk" title="Good to know" />
      <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-4">
        {RULES.map((r, i) => (
          <li
            key={r.title}
            className="flex flex-col gap-3 rounded-[18px] bg-cream p-[22px] shadow-card"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-sage text-deep">
              {RULE_ICONS[i]}
            </span>
            <h3 className="font-display m-0 text-[21px] font-semibold leading-7 text-deep">
              {r.title}
            </h3>
            <p className="text-[15px] leading-[23px]">{r.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function Faq() {
  return (
    <section aria-labelledby="faq-t" className="flex flex-col gap-6">
      <SectionHeader
        eyebrow="FAQ"
        titleId="faq-t"
        title="Questions gardeners ask"
      />
      <div className="flex flex-col gap-2.5">
        {/* Native <details> sharing name="faq": opening one closes the others. */}
        {FAQ.map((item, i) => (
          <details
            key={item.q}
            name="faq"
            open={i === 0}
            className="group overflow-hidden rounded-card bg-cream shadow-card"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 text-[17px] font-bold text-deep hover:bg-[#F1ECE0] [&::-webkit-details-marker]:hidden">
              {item.q}
              <CaretDown
                size={22}
                aria-hidden
                className="shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="max-w-[760px] px-5 pb-[18px] text-body leading-[25px]">
              {item.a.replace("[contact email]", CONTACT_EMAIL_TEXT)}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ─── Still need help ─────────────────────────────────────────────────────────

function StillNeedHelp() {
  return (
    <section
      aria-labelledby="help-t"
      className="flex flex-col gap-4 rounded-[20px] bg-cream px-6 py-6 shadow-[inset_0_0_0_1.5px_rgba(79,122,58,0.35)] md:flex-row md:items-center md:justify-between md:px-8 md:py-7"
    >
      <div className="flex items-center gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sage text-deep">
          <ChatCircleDots size={22} />
        </span>
        <div>
          <h2
            id="help-t"
            className="font-display m-0 text-h3 font-semibold text-deep"
          >
            Still need help?
          </h2>
          <p>
            Questions? Contact the SUSS team at{" "}
            <strong>{CONTACT_EMAIL_TEXT}</strong>.
          </p>
        </div>
      </div>
      <Button href="/" variant="secondary" icon={<ArrowLeft size={18} />}>
        Back to Home
      </Button>
    </section>
  );
}
