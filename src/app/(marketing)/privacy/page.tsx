import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="22 October 2026">
      <p>
        This policy explains how AutoSutra (&quot;we&quot;) processes personal data when you use the AutoSutra Hyperlocal Ads website and platform. It is written with the Digital
        Personal Data Protection Act, 2023 and the rules made under it in mind. Some obligations under the Act commence in phases; we will update this policy as they apply.
      </p>
      <h2>Two roles we play</h2>
      <ul>
        <li>For account holders and website visitors, we decide why and how your data is processed (we act as a data fiduciary).</li>
        <li>For leads and customer records that dealerships store in the platform, the dealership decides the purpose and we process data on its behalf (we act as a data processor under our customer agreement).</li>
      </ul>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: name, email, mobile number, password (stored only as a salted hash), role and organisation.</li>
        <li>Business data: organisation and dealership names, addresses, GSTIN, PAN and billing contacts.</li>
        <li>Advertising account data: identifiers of connected Meta and Google Ads accounts and encrypted access tokens.</li>
        <li>Lead data entered or imported by dealerships: names, phone numbers, email addresses, vehicle interest, consent records and follow-up notes.</li>
        <li>Technical data: IP address and browser information for security, rate limiting and audit logs.</li>
        <li>Payment data: payment status and references from our payment gateway. We do not store card numbers.</li>
      </ul>
      <h2>Why we use it</h2>
      <ul>
        <li>To provide the platform, publish campaigns you approve and show reports.</li>
        <li>To secure accounts, prevent fraud and keep audit records.</li>
        <li>To bill subscriptions and services and meet tax and accounting obligations.</li>
        <li>To respond to enquiries you send us.</li>
      </ul>
      <h2>Consent and withdrawal</h2>
      <p>
        Where we rely on consent, you can withdraw it at any time from your account settings or by writing to us. Dealerships must collect and record consent from their leads; the
        platform stores consent records with each lead and supports withdrawal and deletion requests.
      </p>
      <h2>Sharing</h2>
      <p>
        We share data with processors that help us run the service (hosting, database, email, payments and error monitoring) and with Meta and Google only as needed to publish campaigns
        you approve in your own ad accounts. A current list of subprocessors is available on request and in docs/COMPLIANCE.md for customers.
      </p>
      <h2>Retention</h2>
      <p>
        We keep account data while your account is active. Financial and audit records are retained for the periods required by Indian tax and accounting law. Lead data is retained
        according to each dealership&apos;s retention setting and can be anonymised on request.
      </p>
      <h2>Your rights</h2>
      <p>
        You can ask to access, correct or erase your personal data, to nominate another person, and to raise a grievance. Contact our grievance officer at the address published on the
        Contact page. If you are not satisfied with our response, you may approach the Data Protection Board of India once it is operational for your request.
      </p>
      <h2>Security</h2>
      <p>
        We use encryption in transit, encrypted storage of ad platform tokens, hashed passwords, role-based access control, tenant isolation and audit logs. No system is perfectly secure;
        we will notify affected people and authorities of personal data breaches as required by law.
      </p>
    </LegalPage>
  );
}
