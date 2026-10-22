import { eq, sql } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import type { Database, DbOrTx } from "./db/client";
import { outboundEmails } from "./db/schema";
import { getEnv, type Env } from "./env";
import { enqueue, PermanentJobError } from "./jobs/queue";
import { processQueueSoon } from "./jobs/kick";

/**
 * Email delivery.
 *
 * - "outbox" records messages in the database, where developers read them at
 *   /dev/outbox. Nothing is delivered.
 * - "smtp" records the message and queues a send_email job, so delivery is
 *   retried when the provider is briefly unavailable and an email is only
 *   sent if the transaction that created it commits. Any transactional
 *   provider with SMTP works (Amazon SES, Postmark, Resend, SendGrid, Zoho).
 *
 * Messages contain one-time links, so the body is removed once the message
 * has been delivered or has permanently failed.
 */
export async function sendEmail(db: DbOrTx, to: string, subject: string, body: string): Promise<void> {
  const env = getEnv();
  if (env.EMAIL_DRIVER === "outbox") {
    await db.insert(outboundEmails).values({
      to,
      subject,
      body,
      driver: "outbox",
      status: env.NODE_ENV === "production" ? "not_delivered_no_provider" : "stored_for_development",
    });
    return;
  }
  const [row] = await db.insert(outboundEmails).values({ to, subject, body, driver: "smtp", status: "queued" }).returning({ id: outboundEmails.id });
  await enqueue(db, "send_email", { emailId: row.id }, { idempotencyKey: `email:${row.id}`, maxAttempts: 8 });
  processQueueSoon();
}

const REMOVED = "(Content removed after delivery.)";

function transport(env: Env): Transporter {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_TLS === "implicit",
    requireTLS: env.SMTP_TLS === "starttls",
    ignoreTLS: env.SMTP_TLS === "none",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** SMTP 5xx replies mean the server refused the message for good; 4xx and network errors are worth retrying. */
function isPermanent(e: unknown): boolean {
  const code = (e as { responseCode?: number }).responseCode;
  return typeof code === "number" && code >= 500 && code < 600;
}

/** The send_email job. */
export async function deliverEmail(db: Database, emailId: string, opts: { finalAttempt: boolean }): Promise<void> {
  const row = await db.query.outboundEmails.findFirst({ where: eq(outboundEmails.id, emailId) });
  if (!row || row.status !== "queued") return;
  const env = getEnv();
  try {
    const info = await transport(env).sendMail({ from: env.EMAIL_FROM, to: row.to, subject: row.subject, text: row.body });
    await db
      .update(outboundEmails)
      .set({ status: "sent", sentAt: new Date(), providerMessageId: info.messageId ?? null, lastError: null, body: REMOVED, attempts: sql`${outboundEmails.attempts} + 1` })
      .where(eq(outboundEmails.id, row.id));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const permanent = isPermanent(e);
    const giveUp = permanent || opts.finalAttempt;
    await db
      .update(outboundEmails)
      .set({ status: giveUp ? "failed" : "queued", lastError: message.slice(0, 1000), attempts: sql`${outboundEmails.attempts} + 1`, ...(giveUp ? { body: REMOVED } : {}) })
      .where(eq(outboundEmails.id, row.id));
    throw permanent ? new PermanentJobError(`Email rejected: ${message}`) : e;
  }
}
