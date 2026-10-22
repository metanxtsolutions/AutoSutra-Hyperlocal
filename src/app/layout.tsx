import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AutoSutra Hyperlocal Ads", template: "%s · AutoSutra" },
  description:
    "Plan, fund and measure hyperlocal Meta and Google advertising for automotive dealerships across India, by showroom catchment.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1b31" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        {children}
        <Suspense>
          <Toaster />
        </Suspense>
      </body>
    </html>
  );
}
