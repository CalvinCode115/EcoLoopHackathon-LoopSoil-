import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentProps,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

/**
 * Button/Primary, Button/Secondary, Button/Link from the design system, plus the
 * destructive variant used in the taker/manager kits. 48px tall, 12px radius; `sm` is
 * the 44px size used in the navbar and dense rows, `lg` the 52px hero-CTA size. One primary action per view.
 */
export type ButtonVariant =
  "primary" | "secondary" | "link" | "danger" | "ghost";
export type ButtonSize = "lg" | "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control " +
  "font-sans text-body font-semibold leading-6 no-underline transition-colors " +
  "disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-leaf text-cream shadow-button hover:bg-deep",
  secondary:
    "bg-transparent text-deep shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage",
  // Deep-green text with a leaf-green underline — AA contrast on beige.
  link: "bg-transparent px-2! text-deep underline decoration-leaf decoration-2 underline-offset-4 hover:bg-sage",
  danger: "bg-error text-cream hover:bg-danger-ink",
  ghost: "bg-transparent text-deep hover:bg-sage",
};

const sizes: Record<ButtonSize, string> = {
  lg: "h-13 px-6",
  md: "h-12 px-6",
  sm: "h-11 px-5",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button (e.g. "Approving…"). */
  loading?: boolean;
  /** Icon before the label. */
  icon?: ReactNode;
  /** Icon after the label (e.g. a forward arrow on "Get Started"). */
  iconAfter?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}

type AsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AsLink = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Button(props: AsButton | AsLink) {
  const {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    iconAfter,
    fullWidth,
    className,
    children,
    ...rest
  } = props;
  const classes = cn(
    base,
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className,
  );
  const content = (
    <>
      {loading ? <Spinner size={18} /> : icon}
      <span>{children}</span>
      {!loading && iconAfter}
    </>
  );

  if (rest.href !== undefined) {
    const { href, ...anchor } =
      rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
      };
    return (
      <Link href={href} className={classes} {...anchor}>
        {content}
      </Link>
    );
  }

  const {
    disabled,
    type = "button",
    ...button
  } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...button}
    >
      {content}
    </button>
  );
}

/** Square 44px icon-only button (menus, close, account). Always pass `label`. Accepts `ref`. */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: ComponentProps<"button"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-full text-deep transition-colors hover:bg-sage",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
