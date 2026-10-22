import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatINR } from "@/lib/money";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { getPaymentForActor } from "@/server/services/payments";
import { simulateAction } from "./actions";
import { RazorpayCheckout, StatusPoller } from "./client";

export const metadata: Metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const p = await getPaymentForActor(getDb(), actor, id);
  const env = getEnv();
  const back = p.purpose === "invoice" ? "/app/billing" : "/app/wallet";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4 py-12">
      <Logo className="mb-6" />
      <main id="main" className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold">{p.purpose === "invoice" ? "Pay invoice" : "Add advertising funds"}</h1>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-3xl font-bold tabular-nums">{formatINR(p.amount)}</span>
          <StatusBadge status={p.status} />
        </div>
        <p className="mt-1 text-xs text-ink-500">Order {p.gatewayOrderId} via {p.gateway}</p>
        <div className="mt-6 space-y-3">
          {p.status === "captured" && <Alert tone="ok" title="Payment confirmed">The payment gateway confirmed this payment to our server.</Alert>}
          {p.status === "failed" && <Alert tone="bad" title="Payment failed">{p.failureReason ?? "The payment did not go through."}</Alert>}
          {p.status === "pending" && (
            <>
              <StatusPoller />
              {p.gateway === "razorpay" && <RazorpayCheckout keyId={env.PAYMENT_GATEWAY_KEY} orderId={p.gatewayOrderId} amount={p.amount} name="AutoSutra" email={actor.user.email} />}
              {p.gateway === "mock" && env.NODE_ENV !== "production" && (
                <div className="rounded-lg border border-dashed border-ink-300 p-4">
                  <p className="text-sm font-semibold">Development payment simulator</p>
                  <p className="mt-1 text-xs text-ink-500">No real money moves. These buttons send a signed webhook through the same verification path a real gateway uses.</p>
                  <div className="mt-3 flex gap-2">
                    <form action={simulateAction.bind(null, p.id, "success")}><Button type="submit" size="sm">Simulate success</Button></form>
                    <form action={simulateAction.bind(null, p.id, "failure")}><Button type="submit" size="sm" variant="secondary">Simulate failure</Button></form>
                  </div>
                </div>
              )}
              <p className="text-xs text-ink-500">Your balance or invoice updates only when the payment gateway confirms the payment directly to AutoSutra. Closing this page does not cancel a completed payment.</p>
            </>
          )}
        </div>
        <Link href={back} className="mt-6 inline-block text-sm text-road-600 hover:underline">Back</Link>
      </main>
    </div>
  );
}
