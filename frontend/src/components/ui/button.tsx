import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3 " +
  "font-body text-[0.95rem] font-semibold tracking-tight transition-transform duration-150 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-forest-500 active:scale-[0.98] disabled:cursor-not-allowed " +
  "disabled:opacity-50 disabled:active:scale-100";

const variants: Record<Variant, string> = {
  // Solid forest green, off-white text: passes contrast, is the one locked accent color.
  primary: "bg-forest-500 text-canvas hover:bg-forest-700",
  // Green outline on canvas: reads as the "secondary" action, same one-hue family.
  // forest-500 (not forest-700) here deliberately — it's the one value already
  // verified 4.5:1+ against canvas in BOTH light and dark mode.
  secondary:
    "border border-forest-500 text-forest-500 hover:bg-forest-500 hover:text-canvas",
  ghost: "text-ink-soft hover:text-ink",
};

interface CommonProps {
  variant?: Variant;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** One button primitive so every CTA on the shared pages shares shape, size and states. */
export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonAsButton | ButtonAsLink) {
  const classes = `${base} ${variants[variant]} ${className}`;

  if ("href" in props && props.href !== undefined) {
    const { href, ...rest } =
      props as AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
      };
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}
