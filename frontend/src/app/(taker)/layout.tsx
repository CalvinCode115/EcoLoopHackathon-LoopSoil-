import { TakerShell } from "@/components/nav/taker-shell";

/** Top bar + bottom tab bar + account banners around every taker page. */
export default function TakerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TakerShell>{children}</TakerShell>;
}
