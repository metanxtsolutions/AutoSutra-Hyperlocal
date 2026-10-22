"use client";

import { useEffect } from "react";

/** Registers the offline-page service worker in production builds. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not critical: the site works without it.
    });
  }, []);
  return null;
}
