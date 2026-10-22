import type { DbOrTx } from "./db/client";
import { outboundEmails } from "./db/schema";
import { getEnv } from "./env";

/**
 * Email delivery. The "outbox" driver records messages in the database, where
 * developers can read them at /dev/outbox. Production needs a transactional
 * email provider driver (see docs/DEPLOYMENT.md); until one is configured,
 * messages are stored but not delivered, and the status says so.
 */
export async function sendEmail(db: DbOrTx, to: string, subject: string, body: string): Promise<void> {
  const env = getEnv();
  await db.insert(outboundEmails).values({
    to,
    subject,
    body,
    driver: env.EMAIL_DRIVER,
    status: env.NODE_ENV === "production" ? "not_delivered_no_provider" : "stored_for_development",
  });
}
