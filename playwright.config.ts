import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const DB = process.env.E2E_DATABASE_URL ?? "postgres://autosutra:autosutra@localhost:5432/autosutra_e2e";

/**
 * End-to-end tests drive the real UI against a dev server and a dedicated
 * database, with providers and payments in demo / mock mode.
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { NEXT_DIST_DIR: ".next-e2e", DATABASE_URL: DB, APP_URL: `http://localhost:${PORT}`, CRON_SECRET: "e2e-cron-secret-e2e-cron-secret-0000", ADS_META_MODE: "demo", ADS_GOOGLE_MODE: "demo", PAYMENT_GATEWAY: "mock" },
  },
});
