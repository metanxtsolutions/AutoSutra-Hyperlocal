import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

export default async function setup() {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL ?? "postgres://autosutra:autosutra@localhost:5432/autosutra_e2e" });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}
