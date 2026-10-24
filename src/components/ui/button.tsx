import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-road-600 text-white shadow-sm hover:bg-road-700",
  dark: "bg-ink-900 text-white shadow-sm hover:bg-ink-800",
  secondary: "bg-white text-ink-900 border border-ink-200 shadow-sm hover:bg-ink-50 hover:border-ink-300",
  ghost: "text-ink-700 hover:bg-ink-100 hover:text-ink-950",
  danger: "bg-bad-700 text-white shadow-sm hover:bg-red-800",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5",
  md: "h-9 px-3.5 text-sm [&_svg]:h-4 [&_svg]:w-4",
  lg: "h-11 px-5 text-[15px] [&_svg]:h-4 [&_svg]:w-4",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
