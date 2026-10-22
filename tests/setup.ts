import { afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { resetEnvCache } from "@/server/env";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../drizzle");
const SEED_MIGRATIONS = readdirSync(MIGRATIONS)
  .filter((f) => /_(default_plans|creative_templates)\.sql$/.test(f))
  .map((f) => readFileSync(path.join(MIGRATIONS, f), "utf8"));

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://autosutra:autosutra@localhost:5432/autosutra_test";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.ADS_META_MODE = "demo";
process.env.ADS_GOOGLE_MODE = "demo";
resetEnvCache();

// Append-only tables refuse DELETE, so tests wipe everything with TRUNCATE (which bypasses row triggers).
beforeEach(async () => {
  const db = getDb();
  const tables = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
  // Restore reference data that migrations seed (plans, system templates).
  for (const file of SEED_MIGRATIONS) await db.execute(sql.raw(file));
});

afterAll(async () => {
  await closeDb();
});
