import { Basket } from "@phosphor-icons/react/dist/ssr/Basket";
import { CameraPlus } from "@phosphor-icons/react/dist/ssr/CameraPlus";
import { HandHeart } from "@phosphor-icons/react/dist/ssr/HandHeart";
import { EcoBackdrop } from "@/components/brand/eco-backdrop";
import { LoopHeroAnimation } from "@/components/brand/loop-hero-animation";
import { Button } from "@/components/ui/button";
import { StaggerGroup, StaggerItem } from "@/components/ui/stagger-reveal";

const STEPS = [
  {
    icon: Basket,
    title: "Harvest",
    body: "SUSS composts campus food waste into roughly 20kg of usable compost every fortnight.",
  },
  {
    icon: HandHeart,
    title: "Claim",
    body: "Gardeners, schools and community groups claim what's left after the campus keeps its share.",
  },
  {
    icon: CameraPlus,
    title: "Collect",
    body: "Every handover is weighed and photographed, so the kilograms diverted are real and checkable.",
  },
] as const;

/**
 * Public landing page. Signed-in visitors never see this: RouteGuard redirects them
 * straight to their role home before this renders.
 */
export default function HomePage() {
  return (
    <main>
      <EcoBackdrop />
      <section className="mx-auto grid max-w-7xl gap-16 px-6 pt-16 pb-24 md:grid-cols-2 md:items-center md:pt-20">
        <StaggerGroup className="flex flex-col gap-6">
          <StaggerItem>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink md:text-6xl">
              Close the loop on campus food waste.
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="max-w-[46ch] font-body text-lg leading-relaxed text-ink-soft">
              SUSS turns food waste into compost every fortnight. LoopSoil
              connects what&apos;s left to gardeners, schools, and community
              groups nearby.
            </p>
          </StaggerItem>
          <StaggerItem className="flex flex-wrap items-center gap-4 pt-2">
            <Button href="/register" variant="primary">
              Get started
            </Button>
            <Button href="/login" variant="secondary">
              Sign in
            </Button>
          </StaggerItem>
        </StaggerGroup>

        <div className="relative mx-auto w-full max-w-md md:max-w-none">
          <LoopHeroAnimation className="w-full" />
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <StaggerGroup
            onScroll
            className="relative flex flex-col gap-10 md:flex-row md:gap-0"
          >
            {/* The connecting line reuses the loop's language: this is one continuous cycle. */}
            <div
              aria-hidden="true"
              className="absolute left-6 top-6 bottom-6 w-px bg-line-strong md:left-0 md:right-0 md:top-6 md:bottom-auto md:h-px md:w-auto"
            />
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <StaggerItem
                key={title}
                className={`relative flex flex-1 gap-4 pl-10 md:flex-col md:gap-4 md:pl-0 md:pr-8 ${
                  i === 0 ? "md:max-w-[38%]" : ""
                }`}
              >
                <span className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-canvas-raised bg-forest-500 text-canvas md:static md:h-12 md:w-12">
                  <Icon
                    size={i === 0 ? 14 : 22}
                    weight="regular"
                    className="md:hidden"
                  />
                  <Icon
                    size={22}
                    weight="regular"
                    className="hidden md:block"
                  />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h2 className="font-display text-xl font-semibold text-ink">
                    {title}
                  </h2>
                  <p className="max-w-[32ch] font-body text-[0.95rem] leading-relaxed text-ink-soft">
                    {body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-8 font-body text-sm text-ink-faint md:flex-row md:items-center md:justify-between">
          <p>LoopSoil &middot; SG Eco Loop Hackathon</p>
          <p className="font-mono text-xs">
            Singapore University of Social Sciences
          </p>
        </div>
      </footer>
    </main>
  );
}
