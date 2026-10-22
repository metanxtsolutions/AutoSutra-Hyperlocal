"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";

/** Refreshes the page while waiting for the gateway's server-side confirmation. */
export function StatusPoller() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void };
  }
}

/** Razorpay Standard Checkout. The success callback does not credit anything; only the webhook does. */
export function RazorpayCheckout({ keyId, orderId, amount, name, email }: { keyId: string; orderId: string; amount: number; name: string; email: string }) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (window.Razorpay) return setReady(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => setReady(true);
    s.onerror = () => setMessage("Could not load the payment window. Check your connection and try again.");
    document.body.appendChild(s);
  }, []);
  return (
    <div>
      <button
        type="button"
        disabled={!ready}
        className={buttonClass("primary", "md", "w-full")}
        onClick={() => {
          const rz = new window.Razorpay!({
            key: keyId,
            order_id: orderId,
            amount,
            currency: "INR",
            name,
            prefill: { email },
            handler: () => setMessage("Payment submitted. Waiting for confirmation from the gateway…"),
            modal: { ondismiss: () => setMessage("Payment window closed.") },
          });
          rz.open();
        }}
      >
        Pay securely
      </button>
      {message && <p className="mt-2 text-sm text-ink-600">{message}</p>}
    </div>
  );
}
