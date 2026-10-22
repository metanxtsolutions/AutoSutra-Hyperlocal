import type { Metadata } from "next";
import { CtaBand, PageHero, Section } from "@/components/marketing/site-chrome";
import { CatchmentMap } from "@/components/marketing/illustrations";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  ["Create your organisation", "Register, verify your email and add your business details, including GSTIN where applicable."],
  ["Add dealerships and locations", "Pin each location on the map and set a default catchment radius such as 3, 5 or 10 km."],
  ["Connect ad accounts", "Connect your own Meta ad account and Google Ads account using their official sign-in, or ask AutoSutra to manage campaigns."],
  ["Build a campaign", "Pick a location and objective, describe the vehicle or service, choose platforms, targeting, budget and creative."],
  ["Approve", "An authorised person reviews the full summary and approves the configuration and maximum spend."],
  ["Publish", "AutoSutra creates the campaign through the platforms' APIs and shows each platform's real status."],
  ["Measure", "Spend and delivery sync from the platforms; leads, test drives and sales come from your lead centre."],
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero eyebrow="How it works" title="From showroom pin to measured enquiries" intro="Hyperlocal advertising focuses your budget on the people most likely to visit a specific location." />
      <Section title="The workflow">
        <div className="grid gap-10 lg:grid-cols-2">
          <ol className="space-y-5">
            {STEPS.map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-white">{i + 1}</div>
                <div>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="text-sm text-ink-600">{b}</p>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <CatchmentMap className="w-full" />
            <p className="mt-3 text-sm text-ink-500">
              Radius targeting focuses delivery around a location. Ad platforms estimate location from device and profile signals, so some people reached may be outside the radius.
            </p>
          </div>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
