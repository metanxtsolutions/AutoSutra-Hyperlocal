import { randomUUID } from "node:crypto";
import { hmacSha256Hex, safeEqualHex } from "../crypto";
import type { CreateOrderInput, ParsedWebhook, PaymentGateway, RefundResult } from "./types";

/**
 * Development gateway. Orders are local; payment outcomes are simulated from
 * /pay/[id] by sending a webhook signed with PAYMENT_WEBHOOK_SECRET through the
 * same verification path a real gateway webhook uses. It cannot move money and
 * is refused in production.
 */
export class MockGateway implements PaymentGateway {
  readonly name = "mock" as const;
  readonly live = false;
  constructor(private webhookSecret: string) {}

  async createOrder(input: CreateOrderInput) {
    return { orderId: `mock_order_${input.receipt.slice(0, 20)}_${randomUUID().slice(0, 8)}` };
  }

  sign(rawBody: string): string {
    return hmacSha256Hex(this.webhookSecret, rawBody);
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const sig = headers.get("x-mock-signature") ?? "";
    return !!sig && safeEqualHex(sig, this.sign(rawBody));
  }

  parseWebhook(rawBody: string): ParsedWebhook {
    const b = JSON.parse(rawBody) as Record<string, unknown>;
    const type = String(b.type);
    return {
      eventId: String(b.id),
      rawType: type,
      type: ["payment.captured", "payment.failed", "refund.processed", "refund.failed"].includes(type) ? (type as ParsedWebhook["type"]) : "ignored",
      orderId: b.order_id ? String(b.order_id) : undefined,
      paymentId: b.payment_id ? String(b.payment_id) : undefined,
      refundId: b.refund_id ? String(b.refund_id) : undefined,
      amount: b.amount !== undefined ? Number(b.amount) : undefined,
      fee: b.fee !== undefined ? Number(b.fee) : null,
      tax: b.tax !== undefined ? Number(b.tax) : null,
      failureReason: b.failure_reason ? String(b.failure_reason) : null,
    };
  }

  async refund(_paymentId: string, _amount: number, reference: string): Promise<RefundResult> {
    return { refundId: `mock_refund_${reference.slice(0, 24)}`, status: "processed" };
  }

  /** Build a signed webhook body for simulations and tests. */
  simulate(event: Record<string, unknown>) {
    const body = JSON.stringify({ id: `evt_${randomUUID()}`, ...event });
    return { body, signature: this.sign(body) };
  }
}
