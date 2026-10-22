import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { CatchmentMap, DashboardPreview } from "@/components/marketing/illustrations";
import { CtaBand, FeatureGrid, Section } from "@/components/marketing/site-chrome";
import { PricingTable } from "@/components/marketing/pricing-table";

export const dynamic = "force-dynamic";

const FAQ = [
  {
    q: "Do I need my own Meta and Google Ads accounts?",
    a: "Yes, in the standard setup your dealership connects its own Meta ad account and Google Ads account, and the ad platforms bill you directly. AutoSutra plans, publishes and reports on campaigns through official APIs with the permissions you grant.",
  },
  {
    q: "Can AutoSutra collect our advertising budget and allocate it to campaigns?",
    a: "This is something we plan to offer. Centralised budget collection is switched off until the funding structure has been reviewed with legal, tax, payment-provider and ad-platform requirements. Until then the platform tracks your planned budgets and the spend your ad accounts report.",
  },
  {
    q: "Does a 5 km radius mean every person reached is within 5 km?",
    a: "No. Radius targeting tells the ad platform where to focus delivery. Platforms infer location from signals such as device location and stated home city, so delivery is approximate. We show this on every targeting screen.",
  },
  {
    q: "Where do the numbers on the dashboard come from?",
    a: "Spend, impressions and clicks come from the ad platforms, labelled with their source and last sync time. Leads, test drives, bookings and sales come from your own lead records. We do not estimate or fill in missing numbers.",
  },
  {
    q: "Can a dealer group give branch managers access to only their showroom?",
    a: "Yes. Roles control what each person can do, and location access can be limited so a branch manager or sales user only sees their own locations and leads.",
  },
  {
    q: "Is campaign spend stopped exactly at the budget?",
    a: "Ad platforms report spend with a delay, so no tool can guarantee spend stops at an exact rupee amount. AutoSutra sets the budget on the platform, syncs spend frequently, alerts you at your chosen threshold and lets authorised users pause campaigns.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* 1. Hero */}
      <section className="bg-ink-900 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">Automotive advertising, by showroom catchment</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              One platform to run local Meta and Google ads for every dealership location.
            </h1>
            <p className="mt-5 text-lg text-ink-300">
              Allocate budgets by showroom, target the catchment around each location, track enquiries through to test drives and sales, and see every rupee with its source.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/register" size="lg">
                Get started
              </ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary" size="lg">
                See how it works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-ink-400">Built for car, two-wheeler, EV, pre-owned and service businesses in India.</p>
          </div>
          <CatchmentMap className="w-full drop-shadow-xl" />
        </div>
      </section>

      {/* 2. Product preview */}
      <Section eyebrow="The workspace" title="Everything for local automotive advertising in one place" intro="Dealerships, locations, campaigns, budgets and leads share one data model, so reporting follows a lead from the ad that produced it to the sale.">
        <DashboardPreview className="mx-auto w-full max-w-4xl" />
      </Section>

      {/* 3. How hyperlocal works */}
      <Section tinted eyebrow="How it works" title="Hyperlocal advertising in five steps">
        <ol className="grid gap-5 md:grid-cols-5">
          {[
            ["Add your locations", "Pin each showroom, service centre or pre-owned outlet and set its catchment radius."],
            ["Pick a campaign goal", "Test drives, a new launch, a service camp, exchange offers and more."],
            ["Set targeting and budget", "Choose platforms, radius and PIN codes, and split the budget by platform and location."],
            ["Review and approve", "An authorised person approves the exact configuration and budget before anything goes live."],
            ["Publish and measure", "Campaigns publish to your ad accounts; spend and leads flow back with their source."],
          ].map(([t, b], i) => (
            <li key={t} className="rounded-xl border border-ink-200 bg-ink-50 p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-ink-950">{i + 1}</div>
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-ink-600">{b}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 4. Meta and Google */}
      <Section eyebrow="Meta Ads and Google Ads" title="Each platform, configured the way it actually works" intro="A test-drive campaign is not set up the same way on Meta and on Google. AutoSutra maps each automotive goal to the campaign types each platform supports, and shows you what will be created before you publish.">
        <FeatureGrid
          items={[
            { icon: "ⓜ", title: "Meta Ads", body: "Traffic, awareness and instant-form lead campaigns with radius targeting around your locations, published to your own ad account." },
            { icon: "Ⓖ", title: "Google Ads", body: "Search campaigns with proximity targeting and keyword themes for local intent, published to your own Google Ads account." },
            { icon: "⇄", title: "Independent status per platform", body: "A campaign running on both platforms shows each platform's status separately. Active means the platform confirmed it." },
          ]}
        />
      </Section>

      {/* 5. Location management */}
      <Section tinted eyebrow="Locations" title="Built around dealership locations" intro="Each location has its own address pin, default radius, permitted and excluded PIN codes, budget limit and lead routing.">
        <FeatureGrid
          items={[
            { icon: "📍", title: "Map view", body: "See every location and its proposed target area on one map." },
            { icon: "⚠", title: "Territory overlap warnings", body: "Overlapping catchments are flagged before you save. Admins can override with a recorded reason." },
            { icon: "↳", title: "Lead routing", body: "Leads for a location go to the person responsible for it." },
          ]}
        />
      </Section>

      {/* 6. Templates */}
      <Section eyebrow="Campaign templates" title="Start from automotive templates" intro="Templates for launches, test drives, exchange offers, festive promotions, pre-owned stock, service camps, accessories, EVs and events. They contain placeholders, never invented prices or offers.">
        <div className="flex flex-wrap gap-2">
          {["New vehicle launch", "Test drive", "Exchange offer", "Festive promotion", "Pre-owned inventory", "Service camp", "Accessories", "EV campaign", "Dealership event"].map((t) => (
            <span key={t} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium">
              {t}
            </span>
          ))}
        </div>
      </Section>

      {/* 7. Budget visibility */}
      <Section tinted eyebrow="Budgets" title="Centralised budget visibility" intro="Planned budget, approved budget, provider-reported spend and remaining budget are shown separately, per platform and per location, so nobody confuses a plan with money spent.">
        <FeatureGrid
          items={[
            { title: "Approved spending limits", body: "Every campaign carries a maximum authorised spend set by the customer. Operators cannot raise it." },
            { title: "Threshold alerts", body: "Get alerted when reported spend approaches the threshold you set." },
            { title: "Separate money categories", body: "Software fees, management fees and advertising budgets are never mixed." },
          ]}
        />
      </Section>

      {/* 8. Leads and analytics */}
      <Section eyebrow="Leads and analytics" title="From enquiry to test drive to sale" intro="Capture leads from ad forms, your website and manual uploads. Track follow-ups, test drives, bookings and sales, and see cost per lead and per test drive by location.">
        <FeatureGrid
          items={[
            { title: "Lead centre", body: "Assignment, duplicate detection, follow-up notes, status history and response times." },
            { title: "Source-labelled reporting", body: "Platform-reported conversions are kept separate from leads you captured and sales you confirmed." },
            { title: "Data freshness", body: "Every report shows when each source last synced." },
          ]}
        />
      </Section>

      {/* 9. Dealer groups */}
      <Section tinted eyebrow="Dealer groups" title="Multi-location groups and agencies" intro="Manage several dealerships and brands under one organisation, with roles for owners, marketing, branch managers, sales, finance and analysts.">
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/dealer-groups" variant="secondary">
            Dealer group features
          </ButtonLink>
        </div>
      </Section>

      {/* 10. Pricing */}
      <Section eyebrow="Subscription plans" title="Simple monthly plans" intro="Prices exclude GST. Advertising spend is paid separately and is never part of the subscription.">
        <PricingTable />
      </Section>

      {/* 11. Managed service */}
      <Section tinted eyebrow="Managed advertising" title="Prefer us to run it?" intro="AutoSutra's campaign team can build, launch and optimise campaigns for you. You still approve every campaign and budget before it goes live.">
        <ButtonLink href="/managed-advertising" variant="secondary">
          About managed advertising
        </ButtonLink>
      </Section>

      {/* 12. FAQ */}
      <Section eyebrow="FAQ" title="Frequently asked questions">
        <div className="divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="mr-2 inline-block text-brand-600 transition-transform group-open:rotate-90">›</span>
                {f.q}
              </summary>
              <p className="mt-2 pl-5 text-sm text-ink-600">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-500">
          More questions? <Link href="/contact" className="font-medium text-road-600 underline">Contact us</Link>.
        </p>
      </Section>

      {/* 13. Final CTA */}
      <CtaBand />
    </>
  );
}
