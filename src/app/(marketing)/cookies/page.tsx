import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal";

export const metadata: Metadata = { title: "Cookies and tracking" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookies and tracking" updated="22 October 2026">
      <p>The AutoSutra website and platform currently use only cookies that are strictly necessary to provide the service. We do not use advertising or analytics cookies.</p>
      <h2>Cookies we set</h2>
      <ul>
        <li><strong>as_session</strong>: keeps you signed in. HTTP-only, expires after 12 hours or when you sign out.</li>
      </ul>
      <h2>Third-party tracking</h2>
      <p>
        We do not load third-party tracking scripts. Map tiles are loaded from the configured map tile provider when you view a map inside the platform, which means that provider
        receives your IP address.
      </p>
      <h2>Changes</h2>
      <p>If we add analytics or marketing cookies, we will ask for your consent first and provide a preferences control on this page.</p>
    </LegalPage>
  );
}
