import { CheckCircle2, Inbox, MapPin, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand";

const POINTS = [
  { icon: MapPin, title: "Hyperlocal by design", text: "Target buyers within a few kilometres of each showroom on Meta and Google." },
  { icon: Inbox, title: "Every enquiry in one place", text: "Leads from both platforms land in one lead centre with test drive and booking tracking." },
  { icon: ShieldCheck, title: "Approvals before spend", text: "Nothing is published until an approver signs off. Budgets stay in your control." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <p className="text-xs text-ink-400">© AutoSutra. Made for Indian automotive dealers.</p>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,0.45),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(245,158,11,0.25),transparent_40%)]" />
        <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative flex h-full flex-col justify-center px-12 py-16 xl:px-20">
          <p className="text-sm font-semibold text-brand-500">AutoSutra Hyperlocal Ads</p>
          <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">More test drives from the neighbourhoods around your showrooms.</h2>
          <ul className="mt-10 max-w-md space-y-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15"><p.icon aria-hidden className="h-5 w-5" /></span>
                <span>
                  <span className="block font-semibold text-white">{p.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink-300">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex items-center gap-2 text-sm text-ink-300">
            <CheckCircle2 aria-hidden className="h-4 w-4 text-ok-500" />
            Two-step verification and a full audit log built in
          </div>
        </div>
      </aside>
    </div>
  );
}
