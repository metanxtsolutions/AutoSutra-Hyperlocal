import { getEnv } from "../env";
import { MockGateway } from "./mock";
import { RazorpayGateway } from "./razorpay";
import type { PaymentGateway } from "./types";

let override: PaymentGateway | null = null;

export function setGatewayForTests(g: PaymentGateway | null) {
  override = g;
}

export function gateway(): PaymentGateway {
  if (override) return override;
  const env = getEnv();
  if (env.PAYMENT_GATEWAY === "razorpay") {
    return new RazorpayGateway(env.PAYMENT_GATEWAY_KEY, env.PAYMENT_GATEWAY_SECRET, env.PAYMENT_WEBHOOK_SECRET, env.PAYMENTS_LIVE);
  }
  if (env.NODE_ENV === "production") throw new Error("The mock payment gateway is not available in production");
  return new MockGateway(env.PAYMENT_WEBHOOK_SECRET);
}

export function mockGateway(): MockGateway | null {
  const g = gateway();
  return g instanceof MockGateway ? g : null;
}

export type { PaymentGateway } from "./types";
