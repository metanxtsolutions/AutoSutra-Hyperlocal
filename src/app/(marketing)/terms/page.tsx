import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="22 October 2026">
      <h2>1. The service</h2>
      <p>AutoSutra provides software to plan, approve, publish and measure advertising campaigns for automotive businesses, and optional managed campaign services.</p>
      <h2>2. Your ad accounts and platform policies</h2>
      <p>
        Campaigns are published to advertising accounts you own or are authorised to use. You are responsible for complying with Meta and Google advertising policies and with
        laws that apply to your advertising, including those on pricing, finance and offer claims. AutoSutra does not guarantee that any platform will approve or deliver an ad.
      </p>
      <h2>3. Approvals and spending</h2>
      <p>
        Campaigns are published only after an authorised user in your organisation approves the configuration and maximum spend. Ad platforms report spend with delays, so actual spend
        can briefly exceed a threshold before a pause takes effect.
      </p>
      <h2>4. Fees</h2>
      <p>
        Subscription and service fees are billed by AutoSutra plus applicable GST. Advertising spend is billed by the ad platforms unless a separate written funding arrangement with
        AutoSutra is in force. Any such arrangement is subject to separate terms.
      </p>
      <h2>5. Results</h2>
      <p>Advertising results vary. AutoSutra does not promise any number of leads, test drives or sales, or that ads reach only people inside a selected radius.</p>
      <h2>6. Data</h2>
      <p>You own your data. For lead and customer data you upload, you are the data fiduciary and AutoSutra processes it on your instructions under our data processing terms.</p>
      <h2>7. Acceptable use</h2>
      <p>Do not use the platform for unlawful, misleading or discriminatory advertising, to target people using sensitive personal data, or to circumvent ad platform controls.</p>
      <h2>8. Suspension and termination</h2>
      <p>We may suspend accounts for non-payment, security risks or breach of these terms, with a recorded reason. You may cancel your subscription at the end of a billing period.</p>
      <h2>9. Liability</h2>
      <p>To the extent permitted by law, our total liability is limited to the fees you paid us in the twelve months before the claim.</p>
      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of India. Courts at the place of AutoSutra&apos;s registered office have jurisdiction, subject to any arbitration clause in your order form.</p>
    </LegalPage>
  );
}
