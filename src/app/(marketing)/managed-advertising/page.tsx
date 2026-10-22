import type { Metadata } from "next";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/site-chrome";

export const metadata: Metadata = { title: "Managed advertising" };

export default function ManagedPage() {
  return (
    <>
      <PageHero eyebrow="Managed advertising" title="Our campaign team, your approval" intro="AutoSutra's operations team can build, launch and optimise campaigns for you, inside the same platform you use." />
      <Section title="How the managed service works">
        <FeatureGrid
          items={[
            { title: "You request, we build", body: "Tell us the location, goal and budget. Our team prepares targeting and creative in your account." },
            { title: "You approve every launch", body: "Nothing goes live without your approval of the exact configuration and maximum spend." },
            { title: "No silent budget increases", body: "Our operators cannot raise your approved spending limit. Any increase needs your fresh approval." },
            { title: "Optimisation log", body: "Every optimisation action is recorded with who made it and why." },
            { title: "Your accounts, your data", body: "Campaigns run in ad accounts you own, so you keep the history if you move on." },
            { title: "Regular reports", body: "Location and platform reports with clear sources and sync times." },
          ]}
        />
        <p className="mt-6 text-sm text-ink-500">Management fees are invoiced separately from software subscriptions and from advertising spend. Service levels are agreed in your contract.</p>
      </Section>
      <CtaBand />
    </>
  );
}
