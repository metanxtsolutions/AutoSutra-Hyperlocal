import { ButtonLink } from "@/components/ui/button";
import { getDb } from "@/server/db/client";
import { listPublicPlans } from "@/server/services/public";
import { formatINR } from "@/lib/money";

export async function PricingTable() {
  let plans: Awaited<ReturnType<typeof listPublicPlans>> = [];
  try {
    plans = await listPublicPlans(getDb());
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "pricing_unavailable", error: String(e) }));
  }
  if (!plans.length) {
    return <p className="text-ink-600">Pricing is available on request. <a className="font-medium text-road-600 underline" href="/contact">Contact us</a>.</p>;
  }
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {plans.map((p, i) => (
        <div key={p.id} className={`flex flex-col rounded-xl border bg-white p-6 shadow-sm ${i === 1 ? "border-brand-500 ring-2 ring-brand-100" : "border-ink-200"}`}>
          <h3 className="text-lg font-semibold">{p.name}</h3>
          <p className="mt-1 text-sm text-ink-600">{p.description}</p>
          <div className="mt-4">
            <span className="text-3xl font-bold tabular-nums">{formatINR(p.price, { decimals: false })}</span>
            <span className="text-sm text-ink-500">{p.maxLocations === null ? "+" : ""} / {p.interval} + GST</span>
          </div>
          <ul className="mt-4 flex-1 space-y-2 text-sm">
            {p.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden className="text-ok-700">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-500">{p.trialDays > 0 ? `${p.trialDays}-day trial. ` : ""}Ad spend is billed separately by the ad platforms.</p>
          <ButtonLink href={p.maxLocations === null ? "/contact" : "/register"} variant={i === 1 ? "primary" : "secondary"} className="mt-4">
            {p.maxLocations === null ? "Talk to us" : "Start trial"}
          </ButtonLink>
        </div>
      ))}
    </div>
  );
}
