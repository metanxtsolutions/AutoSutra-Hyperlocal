import type { Metadata } from "next";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/site-chrome";

export const metadata: Metadata = { title: "Automotive solutions" };

export default function SolutionsPage() {
  return (
    <>
      <PageHero eyebrow="Automotive solutions" title="Campaigns for every part of the automotive business" intro="Objectives and templates written for how dealerships, workshops and pre-owned outlets actually sell." />
      <Section title="Who it is for">
        <FeatureGrid
          items={[
            { title: "Car dealerships", body: "Launch campaigns, test-drive enquiries, exchange offers and festive promotions around each showroom." },
            { title: "Two-wheeler dealerships", body: "High-volume local promotions with catchments sized for two-wheeler buyers." },
            { title: "EV showrooms", body: "EV awareness and test-drive campaigns, with charging and subsidy claims routed through claim approval." },
            { title: "Pre-owned outlets", body: "Stock-led enquiries today, with the data model ready for inventory feeds." },
            { title: "Service centres and workshops", body: "Service camps, periodic maintenance and accessories campaigns for nearby vehicle owners." },
            { title: "Agencies", body: "Manage several dealer clients, each as its own organisation with separate data and billing." },
          ]}
        />
      </Section>
      <Section tinted title="Supported campaign objectives">
        <div className="flex flex-wrap gap-2">
          {[
            "New vehicle launch", "Test-drive enquiries", "New car promotion", "New two-wheeler promotion", "Pre-owned enquiries", "EV promotion",
            "Exchange offer", "Finance or EMI promotion", "Service camp", "Periodic maintenance", "Accessories", "Dealership event", "Open house",
            "Local brand awareness", "Website traffic", "Phone calls", "WhatsApp enquiries",
          ].map((t) => (
            <span key={t} className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 text-sm">{t}</span>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-500">Not every objective is available on every platform. The campaign builder shows what each platform supports for your choice.</p>
      </Section>
      <CtaBand />
    </>
  );
}
