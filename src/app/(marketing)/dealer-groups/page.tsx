import type { Metadata } from "next";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/site-chrome";

export const metadata: Metadata = { title: "Dealer groups" };

export default function DealerGroupsPage() {
  return (
    <>
      <PageHero eyebrow="Dealer groups" title="Central control, local execution" intro="Run advertising for every brand and location in your group with consistent approvals and reporting." />
      <Section title="Built for multi-location groups">
        <FeatureGrid
          items={[
            { title: "Many dealerships, one organisation", body: "Group dealerships by brand and city, each with its own locations." },
            { title: "Roles for every team", body: "Owner, admin, marketing manager, branch manager, sales user, finance user and read-only analyst." },
            { title: "Location-limited access", body: "Branch managers and sales users see only the locations they are assigned to." },
            { title: "Central approvals", body: "Marketing proposes, an authorised approver signs off configuration and budget." },
            { title: "Location budget limits", body: "Set monthly budget limits per location and see planned versus reported spend." },
            { title: "Group reporting", body: "Compare locations, platforms and objectives with each figure labelled by its source." },
          ]}
        />
      </Section>
      <CtaBand />
    </>
  );
}
