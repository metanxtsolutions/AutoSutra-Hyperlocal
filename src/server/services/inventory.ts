import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import { dealerships, inventoryItems } from "../db/schema";
import { audit } from "../audit";
import { requireOrg, type Actor } from "../auth/context";
import { parseOptionalRupees } from "@/lib/money";
import { ValidationError } from "../errors";
import { optionalHttpsUrl, optionalText, parse, requiredText } from "../validation";

/**
 * Vehicle inventory. This release supports manual entry; feed and CRM imports
 * and dynamic inventory ads are planned (see docs/KNOWN_LIMITATIONS.md).
 * Prices are only ever entered by the dealership, never generated.
 */
const itemSchema = z.object({
  dealershipId: z.string().uuid(),
  stockId: requiredText("Stock ID", 60),
  brand: requiredText("Brand", 60),
  model: requiredText("Model", 80),
  variant: optionalText(80),
  year: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1990).max(2100).optional()),
  price: z.string().optional(),
  availability: z.enum(["in_stock", "in_transit", "booked", "sold"]),
  detailUrl: optionalHttpsUrl,
});

export async function listInventory(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "dealership.view");
  return db.select().from(inventoryItems).where(eq(inventoryItems.organisationId, organisationId)).orderBy(asc(inventoryItems.brand), asc(inventoryItems.model));
}

export async function upsertInventoryItem(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requireOrg(actor, organisationId, "inventory.manage");
  const data = parse(itemSchema, input);
  const d = await db.query.dealerships.findFirst({ where: and(eq(dealerships.id, data.dealershipId), eq(dealerships.organisationId, organisationId)) });
  if (!d) throw new ValidationError("Dealership not found");
  const price = parseOptionalRupees(data.price);
  await db.transaction(async (tx) => {
    await tx
      .insert(inventoryItems)
      .values({ organisationId, dealershipId: d.id, stockId: data.stockId, brand: data.brand, model: data.model, variant: data.variant ?? null, year: data.year ?? null, price, availability: data.availability, detailUrl: data.detailUrl ?? null, source: "manual", lastSyncedAt: new Date() })
      .onConflictDoUpdate({ target: [inventoryItems.dealershipId, inventoryItems.stockId], set: { brand: data.brand, model: data.model, variant: data.variant ?? null, year: data.year ?? null, price, availability: data.availability, detailUrl: data.detailUrl ?? null, lastSyncedAt: new Date() } });
    await audit(tx, actor, { action: "inventory.saved", entityType: "inventory_item", organisationId, summary: `Saved stock ${data.stockId}: ${data.brand} ${data.model}` });
  });
}
