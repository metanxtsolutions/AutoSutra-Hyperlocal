import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { campaignCreatives, campaignPlatforms, campaigns, dealerships, leads } from "../db/schema";
import { metaFetchLeads } from "../providers/meta";
import { getConnection, metaClientFor } from "../providers/registry";
import { ProviderError } from "../providers/types";
import { captureLead } from "./leads";

/**
 * Pull Meta instant-form leads for live campaigns that use a lead form.
 * Consent is the consent the person gave on the advertiser's Meta form; the
 * form id is recorded so the exact notice can be checked in Meta.
 */
export async function syncMetaLeads(db: Database) {
  const rows = await db
    .select({ platform: campaignPlatforms, campaign: campaigns, formId: campaignCreatives.metaLeadFormId, dealershipName: dealerships.name })
    .from(campaignPlatforms)
    .innerJoin(campaigns, eq(campaigns.id, campaignPlatforms.campaignId))
    .innerJoin(campaignCreatives, eq(campaignCreatives.campaignId, campaigns.id))
    .innerJoin(dealerships, eq(dealerships.id, campaigns.dealershipId))
    .where(and(eq(campaignPlatforms.provider, "meta"), eq(campaignPlatforms.mode, "live"), isNotNull(campaignPlatforms.publishedAt), isNotNull(campaignCreatives.metaLeadFormId), sql`${campaigns.status} IN ('active','paused','partially_published','completed')`));
  let imported = 0;
  for (const r of rows) {
    const conn = await getConnection(db, r.campaign.organisationId, "meta");
    if (!conn?.accessTokenEnc || conn.status !== "connected") continue;
    const [last] = await db
      .select({ at: leads.createdAt })
      .from(leads)
      .where(and(eq(leads.campaignId, r.campaign.id), eq(leads.source, "meta_instant_form")))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    const since = Math.floor((last?.at ?? r.platform.publishedAt!).getTime() / 1000) - 60;
    try {
      const found = await metaFetchLeads(metaClientFor(conn), r.formId!, since);
      for (const l of found) {
        await db.transaction(async (tx) => {
          const out = await captureLead(tx, { system: "meta-lead-sync" }, {
            organisationId: r.campaign.organisationId,
            dealershipId: r.campaign.dealershipId,
            locationId: r.campaign.primaryLocationId,
            campaignId: r.campaign.id,
            provider: "meta",
            source: "meta_instant_form",
            externalId: l.id,
            name: l.fields.full_name ?? l.fields.first_name ?? null,
            phone: l.fields.phone_number ?? null,
            email: l.fields.email ?? null,
            vehicleBrand: r.campaign.brand,
            vehicleModel: r.campaign.model,
            consent: {
              granted: true,
              noticeText: `Submitted through Meta instant form ${r.formId} for ${r.dealershipName}; consent as shown on that form's privacy notice and custom disclaimer.`,
              noticeVersion: `meta_form:${r.formId}`,
              source: "meta_instant_form",
            },
            createdAt: new Date(l.createdTime),
          });
          if (out.created) imported++;
        });
      }
    } catch (e) {
      if (!(e instanceof ProviderError) || e.retryable) throw e;
      console.error(JSON.stringify({ level: "warn", msg: "meta_lead_sync_failed", campaignId: r.campaign.id, error: e.message }));
    }
  }
  return imported;
}
