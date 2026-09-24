import Link from "next/link";
import { ReactNode } from "react";

type Variant = "solid" | "onDark" | "outlineOnDark" | "text" | "footerLink";

const variants: Record<Variant, string> = {
  solid:
    "bg-equixity-deep text-white hover:bg-equixity-deepDark",
  onDark:
    "bg-white text-equixity-deep hover:bg-equixity-mist",
  outlineOnDark:
    "border border-white/50 text-white hover:border-white hover:bg-white/10",
  text: "text-equixity-deep hover:text-equixity-deepDark underline-offset-4 hover:underline",
  // The footer's link style, so a footer entry that has to run code first
  // ("Customer") looks identical to the footer entries that are plain links.
  footerLink: "text-slate transition-colors hover:text-equixity-deep",
};

/**
 * The button classes on their own, so a control that cannot be a <Link> (one
 * that has to run code first, like the customer sign-in) is still visually the
 * same control. Single source of truth: the variant strings live here and
 * nowhere else, so a call-to-action cannot drift from the rest of the site.
 */
export function buttonClassName(
  variant: Variant = "solid",
  className = "",
): string {
  const base =
    variant === "footerLink"
      ? "text-sm"
      : variant === "text"
        ? "inline-flex items-center gap-1.5 text-[0.95rem] font-medium transition-colors"
        : "inline-flex items-center justify-center rounded-full px-6 py-3 text-[0.95rem] font-medium transition-colors";
  return `${base} ${variants[variant]} ${className}`;
}

export default function Button({
  href,
  children,
  variant = "solid",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link href={href} className={buttonClassName(variant, className)}>
      {children}
    </Link>
  );
}
