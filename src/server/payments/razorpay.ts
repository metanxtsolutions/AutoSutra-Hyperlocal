import { hmacSha256Hex, safeEqualHex } from "../crypto";
import type { CreateOrderInput, ParsedWebhook, PaymentGateway, RefundResult } from "./types";

/**
 * Razorpay gateway (Orders API, Standard Checkout, webhooks, refunds).
 * Not exercised against Razorpay in this repository; test in Razorpay test
 * mode with test keys before enabling PAYMENTS_LIVE. Recurring billing
 * (Subscriptions / e-mandate) is not implemented; invoices are paid one at a time.
 */
export class RazorpayGateway implements PaymentGateway {
  readonly name = "razorpay" as const;

  constructor(
    private keyId: string,
    private keySecret: string,
    private webhookSecret: string,
    readonly live: boolean,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private auth() {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`;
  }

  async createOrder(input: CreateOrderInput) {
    const res = await this.fetchFn("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: input.amount, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json()) as { id?: string; error?: { description?: string } };
    if (!res.ok || !body.id) throw new Error(`Razorpay order creation failed: ${body.error?.description ?? res.status}`);
    return { orderId: body.id };
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const sig = headers.get("x-razorpay-signature") ?? "";
    return !!sig && safeEqualHex(sig, hmacSha256Hex(this.webhookSecret, rawBody));
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook {
    const b = JSON.parse(rawBody) as { event: string; payload?: Record<string, { entity?: Record<string, unknown> }> };
    const payment = b.payload?.payment?.entity ?? {};
    const refund = b.payload?.refund?.entity ?? {};
    const map: Record<string, ParsedWebhook["type"]> = {
      "payment.captured": "payment.captured",
      "payment.failed": "payment.failed",
      "refund.processed": "refund.processed",
      "refund.failed": "refund.failed",
    };
    return {
      eventId: headers.get("x-razorpay-event-id") ?? `${b.event}:${String(payment.id ?? refund.id ?? "")}`,
      rawType: b.event,
      type: map[b.event] ?? "ignored",
      orderId: payment.order_id ? String(payment.order_id) : undefined,
      paymentId: payment.id ? String(payment.id) : refund.payment_id ? String(refund.payment_id) : undefined,
      refundId: refund.id ? String(refund.id) : undefined,
      amount: payment.amount !== undefined ? Number(payment.amount) : refund.amount !== undefined ? Number(refund.amount) : undefined,
      fee: payment.fee !== undefined ? Number(payment.fee) : null,
      tax: payment.tax !== undefined ? Number(payment.tax) : null,
      failureReason: payment.error_description ? String(payment.error_description) : null,
    };
  }

  async refund(paymentId: string, amount: number, reference: string): Promise<RefundResult> {
    const res = await this.fetchFn(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount, speed: "normal", receipt: reference.slice(0, 40) }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json()) as { id?: string; status?: string; error?: { description?: string } };
    if (!res.ok || !body.id) return { refundId: "", status: "failed" };
    return { refundId: body.id, status: body.status === "processed" ? "processed" : "pending" };
  }
}
