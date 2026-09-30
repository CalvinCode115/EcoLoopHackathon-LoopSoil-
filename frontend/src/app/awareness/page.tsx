import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ChartPieSlice } from "@phosphor-icons/react/dist/ssr/ChartPieSlice";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Coins } from "@phosphor-icons/react/dist/ssr/Coins";
import { CookingPot } from "@phosphor-icons/react/dist/ssr/CookingPot";
import { Drop } from "@phosphor-icons/react/dist/ssr/Drop";
import { ForkKnife } from "@phosphor-icons/react/dist/ssr/ForkKnife";
import { GasPump } from "@phosphor-icons/react/dist/ssr/GasPump";
import { Globe } from "@phosphor-icons/react/dist/ssr/Globe";
import { GraduationCap } from "@phosphor-icons/react/dist/ssr/GraduationCap";
import { HandHeart } from "@phosphor-icons/react/dist/ssr/HandHeart";
import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import { Leaf } from "@phosphor-icons/react/dist/ssr/Leaf";
import { ListChecks } from "@phosphor-icons/react/dist/ssr/ListChecks";
import { Mountains } from "@phosphor-icons/react/dist/ssr/Mountains";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { Recycle } from "@phosphor-icons/react/dist/ssr/Recycle";
import { ShoppingCart } from "@phosphor-icons/react/dist/ssr/ShoppingCart";
import { Snowflake } from "@phosphor-icons/react/dist/ssr/Snowflake";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { Tractor } from "@phosphor-icons/react/dist/ssr/Tractor";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { XCircle } from "@phosphor-icons/react/dist/ssr/XCircle";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CountUp, GrowBar } from "@/components/awareness/motion";
import { LeafSprig, Sprout } from "@/components/brand/illustrations";
import { Footer } from "@/components/nav/footer";
import { PublicNavbar } from "@/components/nav/public-navbar";
import { Button } from "@/components/ui/button";
import {
  Accent,
  SectionDivider,
  SectionHeader,
} from "@/components/ui/section-header";
import { cn } from "@/lib/cn";
import { CAMPUS_AUDIT } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Food waste awareness · LoopSoil",
  description:
    "How much food Singapore throws away, why it matters, and the small habits that stop it.",
};

/**
 * Awareness — boards "Awareness · Desktop / Mobile / Mobile 2". Public and static: the
 * bigger story behind LoopSoil. Compost deals with food that's already wasted; this page
 * is about wasting less in the first place. Numbered [n] links jump to the Sources list.
 */
export default function AwarenessPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicNavbar active="Awareness" />
      <main className="flex-1 overflow-x-clip">
        <Hero />
        <SectionDivider />
        <Situation />
        <SectionDivider />
        <Impact />
        <SectionDivider />
        <Action />
        <Closing />
        <Sources />
      </main>
      <Footer />
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

/** Superscript "[n]" jumping to the source list. */
function Src({ n, onDark = false }: { n: number; onDark?: boolean }) {
  return (
    <a
      href={`#source-${n}`}
      aria-label={`Source ${n}`}
      className={cn(
        "ml-0.5 align-super text-xs font-bold no-underline",
        onDark ? "text-sage hover:text-white" : "text-leaf hover:text-deep",
      )}
    >
      [{n}]
    </a>
  );
}

const card = "rounded-card bg-cream shadow-card";

function IconDot({
  children,
  tone = "leaf",
  size = "md",
}: {
  children: ReactNode;
  tone?: "leaf" | "soil" | "deep" | "sage";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "sm" ? "size-10" : size === "md" ? "size-11" : "size-12",
        tone === "leaf" && "bg-leaf text-cream",
        tone === "soil" && "bg-soil text-cream",
        tone === "deep" && "bg-deep text-cream",
        tone === "sage" && "bg-sage text-deep",
      )}
    >
      {children}
    </span>
  );
}

function Tick({ onDark = false }: { onDark?: boolean }) {
  return (
    <Check
      size={16}
      weight="bold"
      aria-hidden
      className={cn("mt-0.5 shrink-0", onDark ? "text-sage" : "text-leaf")}
    />
  );
}

/** Section wrapper: anchor offset below the sticky navbar, and the page gutters. */
function Section({
  id,
  labelledBy,
  children,
  decor,
}: {
  id?: string;
  labelledBy: string;
  children: ReactNode;
  decor?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className="relative scroll-mt-20 py-14 md:py-20"
    >
      {decor}
      <div className="page-container flex flex-col gap-8 md:gap-10">
        {children}
      </div>
    </section>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return <p className="-mt-4 max-w-[560px] text-body md:-mt-6">{children}</p>;
}

// ─── Hero ────────────────────────────────────────────────────────────────────

const JUMPS = [
  { href: "#situation", n: "01", label: "The situation" },
  { href: "#impact", n: "02", label: "Why it matters" },
  { href: "#action", n: "03", label: "What you can do" },
];

function Hero() {
  return (
    <section
      aria-labelledby="aw-title"
      className="relative pb-14 pt-10 md:pb-20 md:pt-16 lg:pt-[72px]"
    >
      <LeafSprig
        rotate={20}
        className="absolute -left-7 bottom-6 hidden opacity-90 lg:block"
      />
      <div className="page-container grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <div className="flex max-w-[600px] flex-col gap-6">
          <p className="inline-flex items-center gap-2 self-start rounded-2xl bg-leaf px-3 py-1 text-small font-semibold tracking-[0.02em] text-cream">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-sage"
            />
            Awareness · Food waste in Singapore
          </p>
          <h1
            id="aw-title"
            className="font-display m-0 text-h1-mobile font-semibold text-deep md:text-h1-tablet lg:text-h1"
          >
            Compost is the last step. <br className="hidden sm:block" />
            Wasting less is <Accent>the first.</Accent>
          </h1>
          <p className="text-body">
            LoopSoil turns campus food waste into compost for gardeners. But
            composting only deals with food that’s already been wasted. This
            page is the bigger story: how much food Singapore throws away, why
            it matters, and the small habits that stop it.
          </p>
          <div
            role="note"
            className="flex items-start gap-3 rounded-[14px] bg-sage px-4 py-3.5 text-deep"
          >
            <Info size={20} aria-hidden className="mt-px shrink-0" />
            <span className="text-[15px] leading-[22px]">
              <strong>We know LoopSoil alone isn’t enough.</strong> The best
              food waste is the food that never gets wasted.
            </span>
          </div>
          <nav aria-label="On this page" className="flex flex-wrap gap-2">
            {JUMPS.map((j) => (
              <a
                key={j.href}
                href={j.href}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-cream px-3.5 text-small font-semibold text-deep no-underline shadow-[inset_0_0_0_1px_rgba(79,122,58,0.35)] transition-colors hover:bg-sage"
              >
                <span className="text-xs font-bold text-leaf">{j.n}</span>
                {j.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Collage: photo top-right, the daily-tonnes card overlapping bottom-left. */}
        <div className="relative lg:h-[540px]">
          <figure className="relative m-0 h-[260px] overflow-hidden rounded-card shadow-photo sm:h-[360px] lg:absolute lg:right-0 lg:top-0 lg:h-[440px] lg:w-[86%]">
            <Image
              src="/images/awareness/hero-leftover-plate.jpg"
              alt="A half-eaten plate of char siew rice with leftover rice and meat beside an empty glass at a hawker centre"
              fill
              priority
              sizes="(min-width: 1024px) 520px, 100vw"
              className="object-cover"
            />
            <p className="absolute right-3 top-3 rounded-xl bg-cream/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-deep">
              A familiar sight
            </p>
          </figure>
          <div className="relative -mt-12 ml-4 flex w-[min(300px,85%)] flex-col gap-1 rounded-card bg-deep p-[22px] text-cream shadow-photo lg:absolute lg:bottom-0 lg:left-0 lg:m-0 lg:w-[300px]">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-sage">
              Every single day
            </span>
            {/* 649,000 t a year (source 1) ÷ 365 — kept in step with the figure below. */}
            <span className="font-display text-[36px] font-semibold leading-[42px] text-cream lg:text-[44px] lg:leading-[50px]">
              ~1,800 tonnes
            </span>
            <span className="text-[15px] leading-[22px] text-cream/90">
              of food thrown away in Singapore
              <Src n={1} onDark />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 01 · The situation ──────────────────────────────────────────────────────

const STATS = [
  {
    icon: <Trash size={22} />,
    tone: "leaf" as const,
    value: <CountUp value={649000} suffix=" t" />,
    label: "food waste disposed in 2025",
    src: 1,
    note: "Up from 646,000 tonnes in 2024.",
  },
  {
    icon: <ChartPieSlice size={22} />,
    tone: "soil" as const,
    value: <CountUp value={11} prefix="~" suffix="%" />,
    label: "of all waste in Singapore",
    src: 1,
    note: "Food is one of the biggest waste streams we have.",
  },
  {
    icon: <Globe size={22} />,
    tone: "deep" as const,
    value: <CountUp value={90} suffix="%+" />,
    label: "of our food is imported",
    src: 3,
    note: "Yet we throw so much of it away. That’s the food-security irony.",
  },
];

function Situation() {
  return (
    <Section id="situation" labelledBy="situation-title">
      <SectionHeader
        eyebrow="01 · The situation"
        titleId="situation-title"
        title={
          <>
            How much food we <Accent>throw away</Accent>
          </>
        }
      />
      <Lede>
        Food is one of Singapore’s biggest waste streams, and most of it is
        burned, not recycled.
      </Lede>

      <div className="grid gap-4 md:grid-cols-3">
        {STATS.map((s) => (
          <div
            key={s.label}
            className={cn(card, "flex flex-col gap-3 p-[22px]")}
          >
            <IconDot tone={s.tone}>{s.icon}</IconDot>
            <p className="font-display text-[36px] font-semibold leading-[42px] text-deep">
              {s.value}
            </p>
            <p className="text-body font-bold leading-[22px]">
              {s.label}
              <Src n={s.src} />
            </p>
            <p className="text-small text-muted">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={cn(card, "flex flex-col gap-3 p-6")}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
              Only a small share is recycled
            </h3>
            <span className="text-small text-muted">
              Food waste, 2025
              <Src n={2} />
            </span>
          </div>
          <div
            role="img"
            aria-label="18% of food waste recycled, 82% not recycled"
            className="flex h-10 gap-0.5 overflow-hidden rounded-[10px] bg-[repeating-linear-gradient(135deg,#E6DFCF_0_8px,#EDE7D9_8px_16px)]"
          >
            <GrowBar
              className="flex shrink-0 items-center overflow-hidden whitespace-nowrap bg-leaf pl-3 text-[15px] font-bold text-cream"
              style={{ width: "18%" }}
            >
              18%
            </GrowBar>
            <div className="flex flex-1 items-center justify-end pr-3 text-[15px] font-bold">
              82%
            </div>
          </div>
          <div className="flex flex-wrap gap-5 text-small">
            <span className="inline-flex items-center gap-2">
              <span className="size-3 rounded-[3px] bg-leaf" />
              Recycled
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="size-3 rounded-[3px] bg-[#E6DFCF] shadow-[inset_0_0_0_1px_#CFC7B4]" />
              Burned, ash to landfill
            </span>
          </div>
        </div>

        <div className={cn(card, "flex flex-col gap-3 p-6")}>
          <h3 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
            At home, too
          </h3>
          <p className="text-body">
            The average household throws out about <strong>1.5kg</strong> of
            waste a day, and about <strong>half of it is food</strong>.
            <Src n={3} />
          </p>
          <div className="flex items-start gap-3 rounded-control bg-amber-tint p-3.5 text-[15px] leading-[22px] text-amber-ink">
            <Warning size={20} aria-hidden className="mt-px shrink-0" />
            <span>
              <strong>
                About half of that food waste could have been avoided.
              </strong>{" "}
              Mostly rice, noodles and bread.
            </span>
          </div>
        </div>
      </div>

      <OnCampus />
    </Section>
  );
}

function OnCampus() {
  return (
    <div className="grid items-center gap-8 rounded-[20px] bg-sage p-6 md:p-10 lg:grid-cols-2 lg:gap-12">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cream text-deep"
          >
            <GraduationCap size={22} />
          </span>
          <h3 className="font-display m-0 text-[26px] font-semibold leading-[34px] text-deep">
            On campus
          </h3>
        </div>
        <p className="text-body">
          Canteens waste food at <strong>two points</strong>: while preparing
          it, and in the leftovers people don’t finish. A study of an NUS
          canteen found most of its waste was food, from both.
          <Src n={4} />
        </p>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          <CampusItem>
            <strong>NUS</strong> has sent dining food waste to Ulu Pandan since
            2016, where it’s digested to recover energy.
            <Src n={4} />
          </CampusItem>
          <CampusItem>
            <strong>NTU</strong> students run FoodBank@NTU, with donation boxes
            for excess non-perishable food.
            <Src n={5} />
          </CampusItem>
          <CampusItem>
            <strong>SUSS</strong> composts its canteen waste on campus, and
            LoopSoil gets that compost to gardeners.
          </CampusItem>
        </ul>
        {/* The design's own "[X] kg … [canteen], [date]" line; shown once filled in. */}
        {CAMPUS_AUDIT && (
          <div className="flex items-start gap-3 rounded-[14px] bg-cream px-4 py-3.5 shadow-[inset_0_0_0_1.5px_rgba(79,122,58,0.35)]">
            <ClipboardText
              size={20}
              aria-hidden
              className="mt-0.5 shrink-0 text-leaf"
            />
            <span className="text-[15px] leading-[22px]">
              <strong>Our own canteen check:</strong> {CAMPUS_AUDIT}
            </span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <figure className="relative col-span-2 m-0 h-[220px] overflow-hidden rounded-card shadow-card md:h-[300px]">
          <Image
            src="/images/awareness/canteen-unfinished-plates.jpg"
            alt="A server carrying a stack of plates with unfinished spaghetti, vegetables and rice"
            fill
            sizes="(min-width: 1024px) 540px, 100vw"
            className="object-cover"
          />
        </figure>
        <figure className="relative m-0 h-[160px] overflow-hidden rounded-card shadow-card md:h-[200px]">
          <Image
            src="/images/awareness/bin-food-scraps.jpg"
            alt="A bin liner full of crumpled paper, pizza slices and salad scraps"
            fill
            sizes="(min-width: 1024px) 270px, 50vw"
            className="object-cover"
          />
        </figure>
        <div className="flex flex-col justify-end gap-1.5 rounded-card bg-deep p-[18px] text-cream">
          <span className="font-display text-[30px] font-semibold leading-[1.1] text-cream">
            2 points
          </span>
          <span className="text-small opacity-90">
            where canteen food gets wasted: prep and plates
          </span>
        </div>
      </div>
    </div>
  );
}

function CampusItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[15px] leading-[23px]">
      <CheckCircle
        size={20}
        weight="fill"
        aria-hidden
        className="mt-0.5 shrink-0 text-leaf"
      />
      <span>{children}</span>
    </li>
  );
}

// ─── 02 · Why it matters ─────────────────────────────────────────────────────

const TIMELINE = [
  { at: "0%", year: "1999", label: "Opened", dot: "bg-leaf" },
  { at: "75%", year: "2026", label: "Today", dot: "bg-amber-ink" },
  { at: "100%", year: "~2035", label: "Full", dot: "bg-danger-ink" },
];

const RESOURCES = [
  { icon: <Drop size={14} />, label: "Water" },
  { icon: <Tractor size={14} />, label: "Farmland" },
  { icon: <GasPump size={14} />, label: "Fuel" },
  { icon: <Package size={14} />, label: "Packaging" },
];

function Impact() {
  return (
    <Section
      id="impact"
      labelledBy="impact-title"
      decor={
        <LeafSprig
          rotate={-30}
          light
          className="absolute -left-8 top-16 hidden lg:block"
        />
      }
    >
      <SectionHeader
        eyebrow="02 · Impact"
        titleId="impact-title"
        title={
          <>
            Why it <Accent>matters</Accent>
          </>
        }
      />
      <Lede>
        Wasted food doesn’t just disappear. It uses up land, money and
        everything it took to grow it.
      </Lede>

      <div className="grid gap-4 lg:grid-cols-12">
        <div
          className={cn(card, "flex flex-col gap-3 p-6 md:p-7 lg:col-span-7")}
        >
          <div className="flex items-center gap-3.5">
            <IconDot tone="soil" size="lg">
              <Mountains size={24} />
            </IconDot>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-soil">
                Landfill running out
              </span>
              <h3 className="font-display m-0 text-2xl font-semibold leading-8 text-deep">
                Semakau is our only landfill
              </h3>
            </div>
          </div>
          <p className="text-body">
            Opened in 1999, it will be <strong>full by around 2035</strong> at
            today’s rate. Burning doesn’t make waste disappear: the ash still
            goes to Semakau, and incineration plants are too costly to keep
            building.
            <Src n={6} />
          </p>
          <div
            role="img"
            aria-label="Semakau Landfill timeline: opened 1999, expected full around 2035. We are about 75% of the way there."
            className="relative mx-6 mt-2 h-[70px]"
          >
            <div className="absolute inset-x-0 top-[5px] h-1 rounded-sm bg-[#E6DFCF]" />
            <GrowBar
              className="absolute left-0 top-[5px] h-1 rounded-sm bg-[linear-gradient(90deg,#4F7A3A,#C98217)]"
              style={{ width: "75%" }}
              durationMs={1600}
            />
            {TIMELINE.map((t) => (
              <div
                key={t.year}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1.5"
                style={{ left: t.at }}
              >
                <span
                  className={cn(
                    "size-3.5 rounded-full shadow-[0_0_0_3px_var(--color-cream)]",
                    t.dot,
                  )}
                />
                <span className="whitespace-nowrap text-[13px] font-bold">
                  {t.year}
                </span>
                <span className="whitespace-nowrap text-xs text-muted">
                  {t.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <figure className="relative m-0 min-h-[260px] overflow-hidden rounded-card shadow-card lg:col-span-5 lg:min-h-[300px]">
          <Image
            src="/images/awareness/discarded-produce.jpg"
            alt="A huge heap of discarded fruit and vegetables, many still whole, including apples, bananas, pumpkins and broccoli"
            fill
            sizes="(min-width: 1024px) 460px, 100vw"
            className="object-cover"
          />
          <figcaption className="absolute bottom-3 left-3 right-3 w-fit rounded-xl bg-cream/95 px-3 py-1.5 text-small font-medium shadow-[0_2px_8px_rgba(20,32,16,0.18)]">
            Much of what’s thrown away was still good to eat
          </figcaption>
        </figure>

        <div className={cn(card, "flex flex-col gap-3 p-6 lg:col-span-6")}>
          <div className="flex items-center gap-3.5">
            <IconDot>
              <Leaf size={22} />
            </IconDot>
            <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-leaf">
              Environment
            </span>
          </div>
          <h3 className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep">
            A third of the world’s food is wasted
          </h3>
          <p className="text-[15px] leading-[23px]">
            That waste causes <strong>8–10%</strong> of global greenhouse gas
            emissions.
            <Src n={7} />
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {RESOURCES.map((r) => (
              <li
                key={r.label}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-sage px-2.5 text-[13px] font-semibold text-deep"
              >
                <span aria-hidden className="flex">
                  {r.icon}
                </span>
                {r.label}
              </li>
            ))}
          </ul>
          <p className="text-small text-muted">All of it is wasted too.</p>
        </div>

        <div className={cn(card, "flex flex-col gap-3 p-6 lg:col-span-6")}>
          <div className="flex items-center gap-3.5">
            <IconDot tone="soil">
              <Coins size={22} />
            </IconDot>
            <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-soil">
              Money &amp; food security
            </span>
          </div>
          <h3 className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep">
            It costs us, and our supply
          </h3>
          <p className="font-display text-[34px] font-semibold leading-10 text-deep">
            <CountUp value={342} prefix="$" suffix=" million" />
          </p>
          <p className="text-[15px] leading-[23px]">
            Estimated food thrown away by Singapore households in 2020.
            <Src n={8} />
          </p>
          <p className="text-small text-muted">
            With 90%+ of food imported, wasting less makes Singapore more
            resilient to supply shocks.
            <Src n={9} />
          </p>
        </div>
      </div>
    </Section>
  );
}

// ─── 03 · What you can do ────────────────────────────────────────────────────

const JOURNEY = [
  "Plan",
  "Shop",
  "Store",
  "Cook",
  "Eat",
  "Check",
  "Share",
  "Recycle",
];

interface Step {
  icon: ReactNode;
  verb: string;
  rest: string;
  motto: string;
  tips?: string[];
}

const STEPS: Step[] = [
  {
    icon: <ListChecks size={24} />,
    verb: "Plan",
    rest: "before you buy",
    motto: "Know what you need",
    tips: [
      "Plan your meals for the week",
      "Check your fridge and cupboard first",
      "Snap a quick “fridge photo” before you go out",
    ],
  },
  {
    icon: <ShoppingCart size={24} />,
    verb: "Shop",
    rest: "smart",
    motto: "Buy what you’ll eat",
    tips: [
      "Bring a list and stick to it",
      "Don’t shop hungry",
      "Skip “buy 1 get 1” if you won’t finish it",
      "Pick “ugly” fruit and veg. They taste the same",
    ],
  },
  {
    icon: <Snowflake size={24} />,
    verb: "Store",
    rest: "it right",
    motto: "Keep food fresh for longer",
    tips: [
      "First in, first out: older food to the front",
      "Keep leftovers in clear containers",
      "Freeze bread, meat and cooked rice you won’t eat soon",
    ],
  },
  {
    icon: <CookingPot size={24} />,
    verb: "Cook",
    rest: "just enough",
    motto: "Cook the right amount",
    tips: [
      "Measure rice and noodles per person",
      "Turn leftovers into fried rice, soups or wraps",
      "Cook what expires soonest first",
    ],
  },
  {
    icon: <ForkKnife size={24} />,
    verb: "Eat",
    rest: "mindfully",
    motto: "Take only what you can finish",
    tips: [
      "Ask for “less rice” when ordering",
      "Share dishes when eating out",
      "Pack home leftovers. “Da bao” it!",
    ],
  },
  {
    icon: <Tag size={24} />,
    verb: "Check",
    rest: "the label",
    motto: "Best before ≠ Use by",
  },
  {
    icon: <HandHeart size={24} />,
    verb: "Share",
    rest: "the extra",
    motto: "Too much? Pass it on",
    tips: [
      "Donate unopened food to food banks",
      "Share surplus with neighbours or on sharing apps",
      "Use community fridges: take what you need, give what you can",
    ],
  },
];

const stepCard =
  "flex flex-col gap-3 rounded-card p-[22px] shadow-card transition-[transform,box-shadow] duration-150 hover:-translate-y-[3px] hover:shadow-[0_2px_4px_rgba(47,74,36,0.08),0_16px_32px_rgba(47,74,36,0.14)]";

function Action() {
  return (
    <Section id="action" labelledBy="action-title">
      <SectionHeader
        eyebrow="03 · What you can do"
        titleId="action-title"
        title={
          <>
            Small habits, <Accent>big difference</Accent>
          </>
        }
      />
      <Lede>
        Follow your food from plan to plate. Each step has a few easy things to
        try this week.
      </Lede>

      <div className="flex flex-col gap-4 rounded-card bg-sage px-6 py-6 md:flex-row md:items-center md:justify-between md:gap-6 md:px-9 md:py-7">
        <p className="font-display text-[26px] font-semibold leading-[1.2] text-deep md:text-[32px]">
          Plan it. Buy it. <Accent>Finish it.</Accent>
        </p>
        <ol
          aria-label="The food journey"
          className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-[13px] font-bold text-deep"
        >
          {JOURNEY.map((j, i) => (
            <Fragment key={j}>
              {i > 0 && (
                <li aria-hidden className="text-leaf">
                  ›
                </li>
              )}
              <li>{j}</li>
            </Fragment>
          ))}
        </ol>
      </div>

      <ol
        aria-label="Eight steps to waste less food"
        className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4"
      >
        {STEPS.map((s, i) => (
          <li key={s.verb} className={cn(stepCard, "bg-cream")}>
            <div className="flex items-center justify-between">
              <IconDot tone="sage" size="lg">
                {s.icon}
              </IconDot>
              <span className="text-[13px] font-bold tracking-[0.06em] text-leaf">
                STEP {i + 1}
              </span>
            </div>
            <h3 className="font-display m-0 text-2xl font-semibold leading-[30px] text-deep">
              {s.verb} <Accent>{s.rest}</Accent>
            </h3>
            <p className="text-[15px] font-bold leading-[22px]">“{s.motto}”</p>
            {s.tips ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {s.tips.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-small">
                    <Tick />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <LabelDates />
            )}
          </li>
        ))}

        {/* Step 8 is the dark card: recycling is the last resort — and where LoopSoil fits. */}
        <li className={cn(stepCard, "bg-deep text-cream")}>
          <div className="flex items-center justify-between">
            <IconDot tone="leaf" size="lg">
              <Recycle size={24} />
            </IconDot>
            <span className="text-[13px] font-bold tracking-[0.06em] text-sage">
              STEP 8
            </span>
          </div>
          <h3 className="font-display m-0 text-2xl font-semibold leading-[30px] text-cream">
            Recycle <em className="font-medium italic text-sage">the rest</em>
          </h3>
          <p className="text-[15px] font-bold leading-[22px]">
            “Last resort, not first choice”
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {[
              "Compost fruit and vegetable scraps",
              "Join community composting efforts",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-small">
                <Tick onDark />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/#background"
            className="mt-auto inline-flex min-h-11 items-center gap-2 text-[15px] font-bold text-sage underline underline-offset-4 hover:text-white"
          >
            This is where LoopSoil helps
            <ArrowRight size={16} aria-hidden />
          </Link>
        </li>
      </ol>
    </Section>
  );
}

/** Step 6's body: the two date labels explained. */
function LabelDates() {
  return (
    <>
      <div className="flex items-start gap-2.5 rounded-control bg-leaf-tint px-3 py-2.5">
        <CheckCircle
          size={18}
          weight="fill"
          aria-hidden
          className="mt-px shrink-0 text-leaf"
        />
        <span className="text-small">
          <strong>Best before:</strong> Usually still safe after this date, just
          maybe less fresh.
        </span>
      </div>
      <div className="flex items-start gap-2.5 rounded-control bg-danger-tint px-3 py-2.5">
        <XCircle
          size={18}
          weight="fill"
          aria-hidden
          className="mt-px shrink-0 text-danger-ink"
        />
        <span className="text-small">
          <strong>Use by:</strong> Don’t eat it after this date.
        </span>
      </div>
      <p className="text-small text-muted">
        Look, smell and taste before you throw food away.
      </p>
    </>
  );
}

// ─── Closing + sources ───────────────────────────────────────────────────────

function Closing() {
  return (
    <section aria-label="Get involved" className="pb-16 pt-2">
      <div className="page-container">
        <div className="flex flex-col gap-8 rounded-card bg-sage p-6 md:p-12 lg:flex-row lg:items-center lg:justify-between lg:px-14">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-7">
            <Sprout width={96} className="shrink-0" />
            <div className="flex flex-col gap-2.5">
              <h2 className="font-display m-0 text-h2-mobile font-semibold text-deep md:text-h2-tablet lg:text-h2">
                Waste less. <Accent>Compost the rest.</Accent>
              </h2>
              <p className="max-w-[540px] text-body">
                Start with the habits above. For the scraps you can’t avoid,
                LoopSoil turns campus food waste into free compost for
                gardeners.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Button href="/register" iconAfter={<ArrowRight size={20} />}>
              Get Started
            </Button>
            <Button
              href="/#background"
              variant="secondary"
              className="bg-cream! hover:bg-beige!"
            >
              How LoopSoil works
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

const SOURCES = [
  {
    href: "https://vegconomist.com/organisations-and-brands/national-environment-agency-nea/",
    name: "NEA via Vegconomist",
    what: "Food waste disposed in Singapore, 2024–2025",
  },
  {
    href: "https://www.nea.gov.sg/our-services/waste-management/waste-statistics-and-overall-recycling",
    name: "National Environment Agency",
    what: "Waste statistics and overall recycling",
  },
  {
    href: "https://www.sg101.gov.sg/resources/connexionsg/challengeaccepted-combating-food-wastage/",
    name: "SG101",
    what: "#ChallengeAccepted: combating food wastage",
  },
  {
    href: "https://sustainability.nus.edu.sg/2021/04/30/recycling-of-campus-food-waste",
    name: "NUS Sustainability",
    what: "Recycling of campus food waste (2021)",
  },
  {
    href: "https://www.ntuwscgo.com/go-green",
    name: "NTU WSC GO!",
    what: "Go Green: FoodBank@NTU",
  },
  {
    href: "https://www.mse.gov.sg/policies/waste-management/",
    name: "Ministry of Sustainability and the Environment",
    what: "Waste management: Semakau Landfill",
  },
  {
    href: "https://eastasiaforum.org/2024/07/10/urban-composting-creates-climate-action-opportunities-for-singapore/",
    name: "East Asia Forum",
    what: "Urban composting and climate action in Singapore (2024)",
  },
  {
    href: "https://www.bestinsingapore.co/food-wastage-statistics-singapore/",
    name: "Best in Singapore",
    what: "Food wastage statistics (estimate, secondary source)",
  },
  {
    href: "https://www.dbs.com/sustainability/zero-food-waste",
    name: "DBS",
    what: "Towards zero food waste",
  },
];

function Sources() {
  return (
    <section aria-label="Sources" className="pb-16">
      <div className="page-container">
        <details open className="border-t border-leaf/25 pt-6">
          <summary className="font-display flex min-h-11 cursor-pointer items-center text-xl font-semibold leading-7 text-deep">
            Sources
          </summary>
          <ol className="m-0 mt-3 grid list-none gap-x-8 gap-y-2 p-0 md:grid-cols-2">
            {SOURCES.map((s, i) => (
              <li
                key={s.href}
                id={`source-${i + 1}`}
                className="flex scroll-mt-24 items-baseline gap-2.5 text-[13px] leading-5 text-muted target:rounded-md target:bg-sage/60"
              >
                <span className="min-w-6 font-bold text-leaf">[{i + 1}]</span>
                <span>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-ink underline decoration-leaf/40 underline-offset-[3px] hover:text-deep hover:decoration-leaf"
                  >
                    {s.name}
                  </a>{" "}
                  · {s.what}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3.5 text-[13px] leading-5 text-muted">
            Figures come from the sources above. The $342 million figure is an
            older, secondary estimate.
          </p>
        </details>
      </div>
    </section>
  );
}
