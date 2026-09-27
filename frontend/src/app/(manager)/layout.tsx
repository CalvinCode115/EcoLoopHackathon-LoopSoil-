import { ManagerShell } from "@/components/nav/manager-shell";

/** Sidebar around every manager page. */
export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ManagerShell>{children}</ManagerShell>;
}
