/** Payment gateway abstraction, so the gateway can be replaced without touching billing or the ledger. */

export interface CreateOrderInput {
  amount: number; // paise
  currency: "INR";
  receipt: string; // our idempotency reference
  notes: Record<string, string>;
}

export interface CreatedOrder {
  orderId: string;
}

export type WebhookEventType = "payment.captured" | "payment.failed" | "refund.processed" | "refund.failed" | "ignored";

export interface ParsedWebhook {
  eventId: string;
  type: WebhookEventType;
  rawType: string;
  orderId?: string;
  paymentId?: string;
  refundId?: string;
  amount?: number; // paise
  fee?: number | null;
  tax?: number | null;
  failureReason?: string | null;
}

export interface RefundResult {
  refundId: string;
  status: "processed" | "pending" | "failed";
}

export interface PaymentGateway {
  name: "mock" | "razorpay";
  live: boolean;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  /** Verify the signature over the exact raw request body. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook;
  refund(paymentId: string, amount: number, reference: string): Promise<RefundResult>;
}
