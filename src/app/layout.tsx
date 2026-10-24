import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/toast";
import { ServiceWorker } from "@/components/service-worker";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AutoSutra Hyperlocal Ads", template: "%s · AutoSutra" },
  description:
    "Plan, fund and measure hyperlocal Meta and Google advertising for automotive dealerships across India, by showroom catchment.",
  applicationName: "AutoSutra",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "AutoSutra", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1b31" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <PreviewBanner />
        {children}
        <ServiceWorker />
        <Suspense>
          <Toaster />
        </Suspense>
      </body>
    </html>
  );
}

/** Shown on hosted previews so nobody mistakes demo data for live advertising. */
function PreviewBanner() {
  // Read directly (not via getEnv) so static pages can be built without production secrets.
  if (process.env.APP_STAGE !== "preview") return null;
  return (
    <div className="bg-ink-900 px-4 py-1.5 text-center text-xs font-medium text-ink-100">
      Preview: demo data only. No real ads are published and no real payments are taken.
    </div>
  );
}
