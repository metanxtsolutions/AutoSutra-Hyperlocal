import type { Handler } from "./queue";
import { executePublish, scheduleSyncAll, syncPlatform } from "../services/publishing";
import { runBillingCycle } from "../services/billing";
import { runReconciliation } from "../services/reconciliation";
import { expireStaleDeposits } from "../services/wallet";
import { runAutomationScan } from "../services/automation";
import { syncMetaLeads } from "../services/lead-sync";
import { deliverEmail } from "../email";

/** Every background job type and the function that runs it. */
export const handlers: Record<string, Handler> = {
  publish_platform: async (db, job) => {
    const p = job.payload as { platformId: string; approvalId: string };
    await executePublish(db, p.platformId, p.approvalId, job.attempts, job.maxAttempts);
  },
  sync_platform: async (db, job) => {
    await syncPlatform(db, (job.payload as { platformId: string }).platformId);
  },
  schedule_sync: async (db) => {
    await scheduleSyncAll(db);
  },
  reconcile: async (db) => {
    await expireStaleDeposits(db);
    await runReconciliation(db, { system: "daily-reconciliation" });
  },
  billing_cycle: async (db) => {
    await runBillingCycle(db);
  },
  automation_scan: async (db) => {
    await runAutomationScan(db);
  },
  meta_lead_sync: async (db) => {
    await syncMetaLeads(db);
  },
  send_email: async (db, job) => {
    await deliverEmail(db, (job.payload as { emailId: string }).emailId, { finalAttempt: job.attempts >= job.maxAttempts });
  },
};

export function registerHandler(type: string, handler: Handler) {
  handlers[type] = handler;
}
