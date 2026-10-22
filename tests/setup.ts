import { afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { resetEnvCache } from "@/server/env";

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
});

afterAll(async () => {
  await closeDb();
});
