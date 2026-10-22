import type { NextConfig } from "next";

const tileHost = (() => {
  try {
    return new URL((process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png").replace(/\{[a-z]\}/g, "a")).origin;
  } catch {
    return "https://tile.openstreetmap.org";
  }
})();

// Next.js injects inline bootstrap scripts, so script-src needs 'unsafe-inline'
// unless nonce-based CSP is adopted (see docs/SECURITY.md).
const razorpay = process.env.PAYMENT_GATEWAY === "razorpay";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}${razorpay ? " https://checkout.razorpay.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${tileHost}`,
  "font-src 'self'",
  `connect-src 'self'${razorpay ? " https://api.razorpay.com https://lumberjack.razorpay.com" : ""}`,
  `frame-src ${razorpay ? "https://api.razorpay.com https://checkout.razorpay.com" : "'none'"}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
