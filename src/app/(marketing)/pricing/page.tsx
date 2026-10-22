import type { Metadata } from "next";
import { PricingTable } from "@/components/marketing/pricing-table";
import { CtaBand, PageHero, Section } from "@/components/marketing/site-chrome";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Pricing" title="Plans for single showrooms to dealer groups" intro="Subscription prices exclude GST. Advertising spend is separate and is paid to the ad platforms." />
      <Section title="Subscription plans">
        <PricingTable />
      </Section>
      <Section tinted title="What is billed separately">
        <ul className="list-disc space-y-2 pl-5 text-ink-700">
          <li>Advertising spend, billed by Meta and Google to your ad accounts.</li>
          <li>Optional managed campaign service fees, invoiced separately.</li>
          <li>One-time setup or onboarding fees, if agreed in your contract.</li>
          <li>GST at the applicable rate on AutoSutra fees.</li>
        </ul>
      </Section>
      <CtaBand />
    </>
  );
}
