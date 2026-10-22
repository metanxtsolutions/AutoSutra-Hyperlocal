import { expect, test, type Page } from "@playwright/test";

const email = `owner+${Date.now()}@example.test`;
const password = "a strong e2e passphrase";

/** Field by its visible label; required fields show a decorative " *". */
function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}( \\*)?$`));
}

async function fill(page: Page, label: string, value: string) {
  await field(page, label).fill(value);
}

test("dealership to approved, published campaign with real provider status", async ({ page, request }) => {
  // 1. Register and verify email (via the development outbox).
  await page.goto("/register");
  await fill(page, "Full name", "Meera Iyer");
  await fill(page, "Work email", email);
  await fill(page, "Password", password);
  await page.getByLabel(/I accept the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);
  await page.goto("/dev/outbox");
  const link = await page.locator("pre").filter({ hasText: "verify-email?token=" }).first().textContent();
  const verifyUrl = link!.match(/http\S+verify-email\?token=\S+/)![0];
  await page.goto(new URL(verifyUrl).pathname + new URL(verifyUrl).search);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();

  // 2. Organisation and business details.
  await page.goto("/app/onboarding/organisation");
  await fill(page, "Organisation name", "Iyer Motors Group");
  await field(page, "Organisation type").selectOption("dealer_group");
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);
  await page.goto("/app/settings/organisation");
  await fill(page, "Registered business name", "Iyer Motors Private Limited");
  await fill(page, "Billing email", "accounts@iyer.example");
  await fill(page, "Contact person", "Meera Iyer");
  await field(page, "Billing state / UT").selectOption("Tamil Nadu");
  await fill(page, "Billing address", "100 Anna Salai, Chennai 600002");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Business details saved")).toBeVisible();

  // 3. Dealership and location.
  await page.goto("/app/dealerships/new");
  await fill(page, "Dealership name", "Iyer Motors Anna Salai");
  await fill(page, "Brands represented", "Hyundai");
  await field(page, "Vehicle category").selectOption("passenger_cars");
  await field(page, "Dealership type").selectOption("new_vehicle");
  await fill(page, "Address", "100 Anna Salai");
  await fill(page, "City", "Chennai");
  await field(page, "State / UT").selectOption("Tamil Nadu");
  await fill(page, "PIN code", "600002");
  await fill(page, "Website", "https://iyer.example");
  await page.getByRole("button", { name: "Add dealership" }).click();
  await expect(page.getByRole("heading", { name: "Iyer Motors Anna Salai" })).toBeVisible();
  await page.getByRole("link", { name: "Add location" }).click();
  await fill(page, "Location name", "Anna Salai Showroom");
  await fill(page, "Address", "100 Anna Salai");
  await fill(page, "City", "Chennai");
  await field(page, "State / UT").selectOption("Tamil Nadu");
  await fill(page, "PIN code", "600002");
  await field(page, "Latitude").fill("13.0604");
  await field(page, "Longitude").fill("80.2496");
  await field(page, "Default radius (km)").fill("5");
  await page.getByRole("button", { name: "Add location" }).click();
  await expect(page.getByRole("cell", { name: "Anna Salai Showroom" })).toBeVisible();

  // 4. Campaign builder, step by step.
  await page.goto("/app/campaigns/new");
  await field(page, "Dealership and location").selectOption({ index: 1 });
  await field(page, "Objective").selectOption("test_drive_enquiries");
  await fill(page, "Campaign name", "Creta test drives");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/step=product/);
  await fill(page, "Model", "Creta");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/step=platforms/);
  await page.getByLabel("Use Meta Ads").check();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/step=targeting/);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/step=budget/);
  const start = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
  await fill(page, "Start date", start);
  await fill(page, "End date", end);
  await page.getByLabel(/meta Anna Salai Showroom lifetime budget/).fill("15000");
  await fill(page, "Maximum authorised spend (₹)", "15000");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/step=creative/);
  await fill(page, "Headline", "Test drive the Creta");
  await fill(page, "Primary text", "Book a Creta test drive at our Anna Salai showroom this week.");
  await page.getByRole("button", { name: "Save creative" }).click();
  await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]{36}(\?.*)?$/);
  const campaignUrl = page.url().split("?")[0];

  // 5. Review, submit and approve (sole approver in this organisation).
  await page.goto(`${campaignUrl}/review`);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Pending approval").first()).toBeVisible();
  await page.goto(`${campaignUrl}/review`);
  await page.getByLabel(/I authorise spend of up to/).check();
  // No price, finance or offer claims in this campaign, so there is nothing to confirm.
  await expect(page.getByLabel(/I confirm the prices, finance terms and offers/)).toHaveCount(0);
  await page.getByRole("button", { name: "Approve campaign" }).click();
  await expect(page.getByText("Ready to publish").first()).toBeVisible();

  // 6. Publish. The job runs in the background; trigger the cron endpoint to process it now.
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publishing has started" })).toBeVisible();
  const cron = await request.get("/api/cron/run-jobs", { headers: { Authorization: "Bearer e2e-cron-secret-e2e-cron-secret-0000" } });
  expect(cron.ok()).toBeTruthy();
  await page.reload();
  // Demo mode: clearly labelled, never "Active".
  await expect(page.getByText("Demo published").first()).toBeVisible();
  await expect(page.getByText("DEMO_NOT_SENT", { exact: true })).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toHaveCount(0);

  // 7. The approval log and audit trail record who authorised what.
  await expect(page.getByText(/Customer approved by Meera Iyer/)).toBeVisible();
  await page.goto("/app/audit");
  await expect(page.getByText(/Approved "Creta test drives"/)).toBeVisible();

  // 8. Responsive: no horizontal page scroll on a phone-sized viewport.
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["/app", "/app/campaigns", campaignUrl.replace(/^https?:\/\/[^/]+/, ""), "/"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
});

test("cron endpoint rejects requests without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/run-jobs")).status()).toBe(401);
});

test("unauthenticated users are sent to login", async ({ page }) => {
  await page.goto("/app/campaigns");
  await expect(page).toHaveURL(/\/login\?next=/);
});
