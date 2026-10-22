"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { mockGateway } from "@/server/payments";
import { getPaymentForActor, handleWebhook } from "@/server/services/payments";

/**
 * Development only: simulate the gateway's webhook for a mock payment. The
 * event is signed with the webhook secret and goes through the same
 * verification and processing as a real gateway webhook.
 */
export async function simulateAction(paymentId: string, outcome: "success" | "failure") {
  if (getEnv().NODE_ENV === "production") throw new Error("Not available");
  const actor = await requireActor();
  const db = getDb();
  const p = await getPaymentForActor(db, actor, paymentId);
  const g = mockGateway();
  if (!g) throw new Error("Mock gateway is not active");
  const evt = g.simulate(
    outcome === "success"
      ? { type: "payment.captured", order_id: p.gatewayOrderId, payment_id: `mock_pay_${p.id.slice(0, 8)}`, amount: p.amount, fee: Math.round(p.amount * 0.02), tax: Math.round(p.amount * 0.02 * 0.18) }
      : { type: "payment.failed", order_id: p.gatewayOrderId, payment_id: `mock_pay_${p.id.slice(0, 8)}`, failure_reason: "Simulated decline" },
  );
  await handleWebhook(db, "mock", evt.body, new Headers({ "x-mock-signature": evt.signature }));
  redirect(`/pay/${paymentId}`);
}
