import Link from "next/link";
import { Logo } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/solutions", label: "Automotive solutions" },
  { href: "/dealer-groups", label: "Dealer groups" },
  { href: "/managed-advertising", label: "Managed advertising" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium text-ink-700 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-ink-950">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Log in
          </ButtonLink>
          <ButtonLink href="/register" size="sm">
            Get started
          </ButtonLink>
        </div>
      </div>
      <nav aria-label="Main (mobile)" className="flex gap-4 overflow-x-auto border-t border-ink-100 px-4 py-2 text-sm text-ink-700 lg:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="whitespace-nowrap">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-ink-950 text-ink-300">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo inverted />
          <p className="mt-3 max-w-sm text-sm">
            Hyperlocal advertising management for automotive dealerships, two-wheeler dealers, EV showrooms, pre-owned outlets and service centres in India.
          </p>
          <p className="mt-4 text-xs text-ink-400">
            Meta, Facebook and Instagram are trademarks of Meta Platforms, Inc. Google Ads is a trademark of Google LLC. AutoSutra is an independent product and is not
            endorsed by or affiliated with either company.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Product</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:text-white">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Company</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
            <li><Link href="/privacy" className="hover:text-white">Privacy policy</Link></li>
            <li><Link href="/terms" className="hover:text-white">Terms of service</Link></li>
            <li><Link href="/cookies" className="hover:text-white">Cookies and tracking</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-800 py-4 text-center text-xs text-ink-400">© {new Date().getFullYear()} AutoSutra. All rights reserved.</div>
    </footer>
  );
}

export function Section({ id, eyebrow, title, intro, children, tinted }: { id?: string; eyebrow?: string; title: string; intro?: string; children: React.ReactNode; tinted?: boolean }) {
  return (
    <section id={id} className={tinted ? "bg-white" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="max-w-3xl">
          {eyebrow && <div className="text-sm font-semibold uppercase tracking-wide text-brand-700">{eyebrow}</div>}
          <h2 className="mt-1 text-3xl font-bold tracking-tight">{title}</h2>
          {intro && <p className="mt-3 text-lg text-ink-600">{intro}</p>}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

export function FeatureGrid({ items }: { items: { title: string; body: string; icon?: string }[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.title} className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
          {i.icon && <div aria-hidden className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-lg">{i.icon}</div>}
          <h3 className="font-semibold">{i.title}</h3>
          <p className="mt-1.5 text-sm text-ink-600">{i.body}</p>
        </div>
      ))}
    </div>
  );
}

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <div className="bg-ink-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="text-sm font-semibold uppercase tracking-wide text-brand-500">{eyebrow}</div>
        <h1 className="mt-2 max-w-3xl text-4xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-300">{intro}</p>
      </div>
    </div>
  );
}

export function CtaBand() {
  return (
    <section className="bg-brand-500">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6">
        <div>
          <h2 className="text-2xl font-bold text-ink-950">Plan your first showroom-catchment campaign</h2>
          <p className="mt-1 text-ink-900">Set up your dealership and locations, build a campaign draft and review it before anything is published.</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/register" variant="dark" size="lg">
            Create an account
          </ButtonLink>
          <ButtonLink href="/contact" variant="secondary" size="lg">
            Talk to us
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
