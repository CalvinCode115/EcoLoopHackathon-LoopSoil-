import Image from "next/image";
import type { ReactNode } from "react";
import {
  IconArrowRight,
  IconBag,
  IconBin,
  IconDrop,
  IconHeart,
  IconLeaf,
  IconSunrise,
  IconTrowel,
} from "@/components/brand/icons";
import {
  CompostHeap,
  FoodWaste,
  GardenBed,
  LeafSprig,
  Sprout,
} from "@/components/brand/illustrations";
import { SussLogo } from "@/components/brand/logo";
import { Footer } from "@/components/nav/footer";
import { PublicNavbar } from "@/components/nav/public-navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accent,
  SectionDivider,
  SectionHeader,
} from "@/components/ui/section-header";

/**
 * Home (public). Converted from the "Home · Desktop / Tablet / Mobile" boards: one
 * responsive page — stacked below 1024px, two-column hero and background at ≥1024px.
 * Static content: the landing page makes no API calls (the API needs a login).
 */
export default function HomePage() {
  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <PublicNavbar active="Home" />
      <main className="flex flex-1 flex-col">
        <Hero />
        <SectionDivider />
        <Background />
        <SectionDivider />
        <Gallery />
        <SectionDivider />
        <TutorialTeaser />
        <SectionDivider />
        <ThankYou />
      </main>
      <Footer />
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative pb-12 pt-10 md:pb-16 md:pt-14 lg:pb-20 lg:pt-[72px]"
    >
      <LeafSprig
        rotate={30}
        width={110}
        className="absolute -left-7 bottom-6 hidden lg:block"
      />
      <div className="page-container">
        <div className="flex flex-col gap-8 md:gap-10 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-12">
          <div className="flex max-w-[620px] flex-col gap-5 md:gap-6">
            <p className="inline-flex items-center gap-2 self-start rounded-2xl bg-leaf px-3 py-1 text-small font-semibold tracking-[0.02em] text-cream">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-sage"
              />
              <span>
                A student-initiated prototype · Eco Loop Hackathon 2026
              </span>
            </p>
            <h1
              id="hero-title"
              className="font-display m-0 text-h1-mobile font-semibold text-deep md:text-h1-tablet lg:text-h1"
            >
              Closing the loop from campus waste to{" "}
              <Accent>community soil</Accent>
            </h1>
            <p className="max-w-[540px] text-body text-ink">
              LoopSoil connects compost made from SUSS campus food waste with
              gardeners and communities who need it.
            </p>
            <div className="mt-2 grid gap-3 md:grid-cols-2 md:gap-4">
              <ValueCard icon={<IconSunrise size={22} />} title="Our Vision">
                A Singapore where food waste returns to the soil instead of the
                incinerator.
              </ValueCard>
              <ValueCard icon={<IconTrowel size={22} />} title="Our Mission">
                Make it effortless for anyone to claim, collect and use campus
                compost.
              </ValueCard>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <Button
                href="/register"
                className="w-full md:w-auto"
                iconAfter={<IconArrowRight size={20} />}
              >
                Get Started
              </Button>
              <Button
                href="#background"
                variant="secondary"
                className="w-full md:w-auto"
              >
                Learn More
              </Button>
            </div>
          </div>

          <HeroCollage />
        </div>
      </div>
    </section>
  );
}

function ValueCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card as="article" padding="none" className="flex flex-col gap-2 p-5">
      <div className="flex items-center gap-3">
        <IconDisc size="sm">{icon}</IconDisc>
        <h3 className="font-display m-0 text-h3 font-semibold text-deep">
          {title}
        </h3>
      </div>
      <p className="text-small text-muted">{children}</p>
    </Card>
  );
}

/** Two overlapping framed photos plus the sprout badge. */
function HeroCollage() {
  return (
    <div className="relative h-[408px] w-full shrink-0 md:h-[520px] lg:h-[560px]">
      <figure className="absolute right-0 top-0 m-0 h-[320px] w-[86%] overflow-hidden rounded-card shadow-photo md:h-[440px] md:w-[70%] lg:h-[480px] lg:w-[84%]">
        <Image
          src="/images/home/hero-compost.jpg"
          alt="Hands holding rich, dark compost with an earthworm, above leafy plants"
          fill
          priority
          sizes="(min-width: 1024px) 460px, (min-width: 768px) 70vw, 86vw"
          className="object-cover"
        />
        <p className="absolute right-3 top-3 rounded-control bg-cream/94 px-3 py-1.5 text-eyebrow font-semibold uppercase tracking-[0.04em] text-deep">
          From campus food waste
        </p>
      </figure>
      <figure className="absolute bottom-0 left-0 m-0 h-[150px] w-[64%] rounded-card bg-cream p-2 shadow-photo md:h-[220px] md:w-1/2 lg:h-[200px] lg:w-[58%]">
        <div className="relative size-full overflow-hidden rounded-[10px]">
          <Image
            src="/images/home/hero-gardeners.jpg"
            alt="Gardeners tending leafy greens in raised beds on a rooftop"
            fill
            sizes="(min-width: 1024px) 320px, 60vw"
            className="object-cover"
          />
        </div>
      </figure>
      <div
        aria-hidden
        className="absolute left-0 top-4 flex size-[72px] items-center justify-center rounded-full bg-sage shadow-card md:left-[8%] md:top-8 md:size-[88px] lg:size-24"
      >
        <Sprout
          width={63}
          className="h-auto w-[48px] md:w-[58px] lg:w-[63px]"
        />
      </div>
    </div>
  );
}

// ─── Background ──────────────────────────────────────────────────────────────

const PROBLEMS = [
  "Demand is unknown.",
  "Supply is invisible.",
  "There’s no simple way to claim and collect it.",
];

/** Pilot figures supplied by the team (the design had "[X]" placeholders). */
const STATS = [
  {
    icon: <IconBag size={24} />,
    value: "20 kg",
    label: "compost per fortnight",
  },
  { icon: <IconDrop size={24} />, value: "pH 6.7", label: "healthy quality" },
  {
    icon: <IconBin size={24} />,
    value: "649,000 tonnes",
    label: "food waste in Singapore yearly",
  },
];

const FLOW = [
  { step: "Step 1", label: "Food waste", art: <FoodWaste /> },
  { step: "Step 2", label: "Compost", art: <CompostHeap /> },
  { step: "Step 3", label: "Community gardens", art: <GardenBed /> },
];

function Background() {
  return (
    <section
      id="background"
      aria-labelledby="background-title"
      className="relative scroll-mt-20 py-12 md:py-16 lg:py-20"
    >
      <LeafSprig
        rotate={200}
        className="absolute -right-5 top-10 hidden lg:block"
      />
      <div className="page-container flex flex-col gap-8 md:gap-12 lg:gap-14">
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-12">
          <div className="flex flex-col gap-6">
            <SectionHeader
              eyebrow="Background"
              titleId="background-title"
              title={
                <>
                  From food waste to <Accent>fertile soil</Accent>
                </>
              }
            />
            <div className="flex flex-col gap-4 text-body text-ink">
              <p>
                SUSS runs an on-campus composter that turns food waste into
                usable compost.
              </p>
              <p>
                The problem isn’t making compost. It’s getting it to people who
                can use it:
              </p>
              <ul className="flex flex-col gap-2">
                {PROBLEMS.map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <span className="pt-[3px] text-leaf">
                      <IconLeaf size={20} />
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-1">
            {STATS.map((s) => (
              <Card
                key={s.label}
                padding="none"
                className="flex items-center gap-4 p-5 md:flex-col md:items-start md:gap-3 md:p-6 lg:flex-row lg:items-center lg:gap-4"
              >
                <IconDisc size="md">{s.icon}</IconDisc>
                <div className="flex flex-col gap-0.5">
                  <p className="font-display text-[32px] font-semibold leading-10 text-deep">
                    {s.value}
                  </p>
                  <p className="text-small text-muted">{s.label}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <Card padding="none" className="px-6 py-8 md:py-10 lg:px-12">
          <ol
            aria-label="How LoopSoil works"
            className="m-0 flex list-none flex-col items-center gap-2 p-0 md:flex-row md:gap-4"
          >
            {FLOW.map((f, i) => (
              <FlowStep key={f.label} {...f} arrow={i < FLOW.length - 1} />
            ))}
          </ol>
        </Card>

        <p className="font-display mx-auto max-w-[680px] text-center text-[22px] font-medium italic leading-[30px] text-deep">
          Our objective: turn campus compost into a resource the community can
          actually reach.
        </p>
      </div>
    </section>
  );
}

function FlowStep({
  step,
  label,
  art,
  arrow,
}: {
  step: string;
  label: string;
  art: ReactNode;
  arrow: boolean;
}) {
  return (
    <>
      <li className="flex flex-1 flex-col items-center gap-3 text-center">
        <span className="flex size-28 items-center justify-center rounded-full bg-sage">
          {art}
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-small font-semibold text-muted">{step}</span>
          <span className="font-display text-h3 font-semibold text-deep">
            {label}
          </span>
        </span>
      </li>
      {arrow && (
        <li aria-hidden className="flex">
          <span className="flex h-8 items-center justify-center text-leaf md:h-auto md:pb-14">
            <IconArrowRight
              size={32}
              strokeWidth={2.5}
              className="rotate-90 md:rotate-0"
            />
          </span>
        </li>
      )}
    </>
  );
}

// ─── Gallery ─────────────────────────────────────────────────────────────────

const PHOTOS = [
  {
    src: "/images/home/gallery-rooftop.jpg",
    alt: "Aerial view of a rooftop community garden with raised planters beside HDB blocks",
    caption: "Rooftop community gardens",
    // Big photo: full width on tablet, left 7 of 12 columns spanning both rows on desktop.
    cell: "h-60 md:col-span-2 md:h-auto lg:col-span-7 lg:row-span-2",
  },
  {
    src: "/images/home/gallery-allotment.jpg",
    alt: "Neat vegetable beds and young trees in a community garden",
    caption: "Estate allotment beds",
    cell: "h-50 md:h-auto lg:col-span-5",
  },
  {
    src: "/images/home/gallery-soil.jpg",
    alt: "Cupped hands holding dark, fine soil",
    caption: "Compost, ready to share",
    cell: "h-50 md:h-auto lg:col-span-5",
  },
];

function Gallery() {
  return (
    <section
      aria-labelledby="gallery-title"
      className="py-12 md:py-16 lg:py-20"
    >
      <div className="page-container flex flex-col gap-6 md:gap-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <SectionHeader
            eyebrow="In the field"
            titleId="gallery-title"
            title={
              <>
                Where campus compost <Accent>can grow</Accent>
              </>
            }
          />
          <p className="max-w-[420px] text-body text-ink">
            Rooftop plots, estate allotments and balcony pots. Community gardens
            across Singapore are ready for richer soil.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:grid-rows-[360px_240px] md:gap-4 lg:grid-cols-12 lg:grid-rows-[280px_280px]">
          {PHOTOS.map((p, i) => (
            <figure
              key={p.caption}
              className={`relative m-0 overflow-hidden rounded-card shadow-card ${p.cell}`}
            >
              <Image
                src={p.src}
                alt={p.alt}
                fill
                sizes={
                  i === 0
                    ? "(min-width: 1024px) 660px, 100vw"
                    : "(min-width: 1024px) 470px, (min-width: 768px) 50vw, 100vw"
                }
                className="object-cover"
              />
              <figcaption className="absolute bottom-3 left-3 flex items-center gap-2 rounded-control bg-cream/94 py-1.5 pl-1.5 pr-3 text-small font-medium text-ink shadow-[0_2px_8px_rgba(20,32,16,0.18)]">
                <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-leaf text-xs font-bold tracking-[0.04em] text-cream">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{p.caption}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Tutorial teaser ─────────────────────────────────────────────────────────

function TutorialTeaser() {
  return (
    <section
      id="tutorial"
      aria-labelledby="tutorial-title"
      className="py-12 md:py-16 lg:py-20"
    >
      <div className="page-container">
        <div className="rounded-card bg-sage px-6 py-8 md:px-8 md:py-10 lg:px-14 lg:py-12">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6 lg:gap-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6 lg:gap-8">
              <Sprout width={96} className="shrink-0" />
              <div className="flex flex-col gap-3">
                <SectionHeader
                  eyebrow="Tutorial"
                  titleId="tutorial-title"
                  title={
                    <>
                      New to <Accent>LoopSoil?</Accent>
                    </>
                  }
                />
                <p className="max-w-[520px] text-body text-ink">
                  A quick step-by-step guide for gardeners and communities on
                  browsing compost, making a claim and booking a pickup.
                </p>
              </div>
            </div>
            <Button
              href="/tutorial"
              className="w-full shrink-0 md:w-auto"
              iconAfter={<IconArrowRight size={20} />}
            >
              View Tutorial
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Thank you ───────────────────────────────────────────────────────────────

function ThankYou() {
  return (
    <section
      aria-labelledby="thanks-title"
      className="pb-16 pt-12 md:pb-20 md:pt-16 lg:pb-24 lg:pt-20"
    >
      <div className="page-container flex flex-col items-center gap-6 text-center">
        <IconDisc size="md">
          <IconHeart size={24} />
        </IconDisc>
        <h2
          id="thanks-title"
          className="font-display m-0 max-w-[720px] text-2xl font-medium leading-8 text-deep md:text-[32px] md:leading-[42px]"
        >
          LoopSoil is made possible with the support of SUSS and the Eco Loop
          Hackathon. <Accent>Thank you for helping us close the loop.</Accent>
        </h2>
        <div className="mt-2 flex items-center gap-4 md:gap-6">
          <SussLogo className="h-12 md:h-14" />
          <span aria-hidden className="text-xl text-muted">
            ·
          </span>
          <SupporterLogo label="Eco Loop Hackathon logo" />
        </div>
      </div>
    </section>
  );
}

/** Dashed placeholder slot, as in the design — no logo artwork supplied yet. */
function SupporterLogo({ label }: { label: string }) {
  return (
    <div className="flex h-12 w-[132px] items-center justify-center rounded-[10px] bg-sage px-2 text-xs font-semibold text-deep outline-[1.5px] -outline-offset-[1.5px] outline-dashed outline-deep/35 md:h-14 md:w-[180px]">
      [{label}]
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

/** Round leaf-green disc holding a cream icon (40px on cards, 48px on stats). */
function IconDisc({
  size,
  children,
}: {
  size: "sm" | "md";
  children: ReactNode;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-leaf text-cream ${
        size === "sm" ? "size-10" : "size-12"
      }`}
    >
      {children}
    </span>
  );
}
