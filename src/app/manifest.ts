import type { MetadataRoute } from "next";

/** Lets phones install AutoSutra as an app (home-screen icon, full screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "AutoSutra Hyperlocal Ads",
    short_name: "AutoSutra",
    description: "Hyperlocal Meta and Google advertising for automotive dealerships.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#0f1b31",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
