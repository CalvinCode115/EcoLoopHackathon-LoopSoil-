import { LoopMark } from "@/components/brand/loop-mark";
import { Button } from "@/components/ui/button";

/** Next.js renders this for any unmatched route. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <LoopMark size={44} className="opacity-70" />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          This page isn&apos;t part of the loop
        </h1>
        <p className="font-body text-[0.95rem] leading-relaxed text-ink-soft">
          The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t
          have access to it.
        </p>
      </div>
      <Button href="/" variant="primary">
        Back to LoopSoil
      </Button>
    </main>
  );
}
