import { asc, eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import { contactRequests, subscriptionPlans } from "../db/schema";
import { audit } from "../audit";
import { sendEmail } from "../email";
import { rateLimit } from "../rate-limit";
import { email, optionalIndianPhone, optionalText, parse, requiredText } from "../validation";

export async function listPublicPlans(db: DbOrTx) {
  return db
    .select()
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.isActive, true), eq(subscriptionPlans.isPublic, true)))
    .orderBy(asc(subscriptionPlans.sortOrder));
}

const contactSchema = z.object({
  name: requiredText("Name", 120),
  email,
  phone: optionalIndianPhone,
  company: optionalText(160),
  city: optionalText(100),
  interest: z.enum(["general", "self_service", "managed_service", "dealer_group", "partnership"]).default("general"),
  message: requiredText("Message", 3000),
  consentToContact: z.literal(true, { errorMap: () => ({ message: "Please allow us to contact you about this enquiry" }) }),
  website: z.string().max(0, "Invalid submission").optional(), // honeypot
});

export async function submitContactRequest(db: Database, input: unknown, ip: string | null) {
  const data = parse(contactSchema, input);
  await rateLimit(db, `contact:${ip ?? "unknown"}`, 5, 3600);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(contactRequests)
      .values({
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        company: data.company ?? null,
        city: data.city ?? null,
        interest: data.interest,
        message: data.message,
        consentToContact: true,
        ip,
      })
      .returning();
    await sendEmail(tx, data.email, "We received your message", `Hello ${data.name},\n\nThanks for contacting AutoSutra. Our team will reply within two working days.\n\nYour message:\n${data.message}`);
    await audit(tx, null, { action: "contact.submitted", entityType: "contact_request", entityId: row.id, summary: `Contact request from ${data.email} (${data.interest})` });
  });
}
