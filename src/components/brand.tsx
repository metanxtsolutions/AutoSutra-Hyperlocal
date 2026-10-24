import Link from "next/link";
import { cn } from "@/lib/cn";

/** AutoSutra wordmark: a location pin formed from a road curve. */
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)} aria-label="AutoSutra home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <path d="M16 2c-6.1 0-11 4.8-11 10.8C5 21 16 30 16 30s11-9 11-17.2C27 6.8 22.1 2 16 2z" fill="#f59e0b" />
        <path d="M11 20c2-3 3-5 5-8s3-4 5-4" stroke={inverted ? "#0f1b31" : "#0f1b31"} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M13.5 16.5l1.2.6M16 12.6l1.2.6" stroke="#fffbeb" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className={cn("text-lg", inverted ? "text-white" : "text-ink-950")}>
        AutoSutra <span className={cn("font-medium", inverted ? "text-ink-300" : "text-ink-500")}>Hyperlocal Ads</span>
      </span>
    </Link>
  );
}

/** The AutoSutra pin on its own, for compact places such as the app bar. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden>
      <path d="M16 2c-6.1 0-11 4.8-11 10.8C5 21 16 30 16 30s11-9 11-17.2C27 6.8 22.1 2 16 2z" fill="#f59e0b" />
      <path d="M11 20c2-3 3-5 5-8s3-4 5-4" stroke="#0f1b31" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M13.5 16.5l1.2.6M16 12.6l1.2.6" stroke="#fffbeb" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
