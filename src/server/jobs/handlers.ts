import type { Handler } from "./queue";
import { executePublish, scheduleSyncAll, syncPlatform } from "../services/publishing";

/**
 * Job types. Later phases register reconciliation, automation and lead sync
 * handlers here too (see registerHandler).
 */
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
};

export function registerHandler(type: string, handler: Handler) {
  handlers[type] = handler;
}
