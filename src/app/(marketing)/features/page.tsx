import type { Metadata } from "next";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/site-chrome";

export const metadata: Metadata = { title: "Features" };

export default function FeaturesPage() {
  return (
    <>
      <PageHero eyebrow="Features" title="Purpose-built for automotive retail advertising" intro="AutoSutra is organised around dealerships, showroom catchments, vehicle promotions and the path from enquiry to sale." />
      <Section title="Dealerships and locations">
        <FeatureGrid
          items={[
            { title: "Multi-dealership organisations", body: "Independent dealers, dealer groups and agencies, each with their own dealerships, brands and locations." },
            { title: "Location catchments", body: "Address pin, default radius, permitted and excluded PIN codes, supported campaign types and budget limits per location." },
            { title: "Territory overlap checks", body: "Warnings when catchments overlap, with admin override and an audit record." },
          ]}
        />
      </Section>
      <Section tinted title="Campaigns">
        <FeatureGrid
          items={[
            { title: "Guided campaign builder", body: "Location, objective, vehicle or service, platforms, targeting, audience, budget, creative and review, in order." },
            { title: "Provider capability mapping", body: "Each automotive objective is mapped to the campaign types Meta and Google actually support. Unsupported combinations are explained, not hidden." },
            { title: "Claims and disclaimers", body: "Prices, EMI and offer claims carry their own approval status and disclaimer before they can be published." },
            { title: "Approval with configuration lock", body: "Approval records the exact configuration and budget. Any later change needs a fresh approval." },
            { title: "Publishing with retries", body: "Publishing runs in the background with idempotency, so a timeout never creates duplicate campaigns." },
            { title: "Per-platform status", body: "Status comes only from the ad platform. Demo mode is clearly labelled and never shown as live." },
          ]}
        />
      </Section>
      <Section title="Money, leads and reporting">
        <FeatureGrid
          items={[
            { title: "Budget controls", body: "Planned, approved, reported and remaining budget per platform and location, with spend alerts." },
            { title: "Ledger-based funding (when enabled)", body: "An append-only double-entry ledger separates customer advertising funds from AutoSutra revenue. Off by default until the operating model is approved." },
            { title: "Lead centre", body: "Assignment, duplicates, consent records, follow-ups, test drives, bookings, sales and CSV export with permissions." },
            { title: "Source-labelled reports", body: "Platform metrics stay traceable to Meta or Google, with last-sync times and freshness warnings." },
            { title: "Audit trail", body: "Approvals, budget changes, publications, payments and admin actions are recorded and cannot be edited." },
            { title: "Roles and location access", body: "Ten roles across customers and AutoSutra staff, enforced on the server, with location-level limits." },
          ]}
        />
      </Section>
      <CtaBand />
    </>
  );
}
