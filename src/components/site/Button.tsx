import Link from "next/link";
import { ReactNode } from "react";

type Variant = "solid" | "onDark" | "outlineOnDark" | "text";

const variants: Record<Variant, string> = {
  solid:
    "bg-equixity-deep text-white hover:bg-equixity-deepDark",
  onDark:
    "bg-white text-equixity-deep hover:bg-equixity-mist",
  outlineOnDark:
    "border border-white/50 text-white hover:border-white hover:bg-white/10",
  text: "text-equixity-deep hover:text-equixity-deepDark underline-offset-4 hover:underline",
};

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
  const base =
    variant === "text"
      ? "inline-flex items-center gap-1.5 text-[0.95rem] font-medium transition-colors"
      : "inline-flex items-center justify-center rounded-full px-6 py-3 text-[0.95rem] font-medium transition-colors";

  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
