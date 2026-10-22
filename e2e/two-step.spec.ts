import { expect, test, type Page } from "@playwright/test";
import { timeStep, totpAt } from "../src/server/totp";

const email = `twostep+${Date.now()}@example.test`;
const password = "another strong passphrase";

function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}( \\*)?$`));
}

async function signIn(page: Page) {
  await page.goto("/login");
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("turn on two-step verification, then sign in with a code and with a recovery code", async ({ page, context }) => {
  await page.goto("/register");
  await field(page, "Full name").fill("Kiran Shah");
  await field(page, "Work email").fill(email);
  await field(page, "Password").fill(password);
  await page.getByLabel(/I accept the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);

  // Set up: scan (read the manual key), confirm with a code, save recovery codes.
  await page.goto("/app/account/security");
  await page.getByRole("button", { name: "Set up two-step verification" }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const secret = (await page.locator("span.font-mono").first().textContent())!.replace(/\s/g, "");
  await field(page, "Code from the app").fill(totpAt(secret, timeStep()));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Save these recovery codes now")).toBeVisible();
  const codes = await page.getByRole("status").locator("li").allTextContents();
  expect(codes).toHaveLength(10);
  await page.getByRole("button", { name: "I have saved them" }).click();
  await expect(page.getByText(/On since/)).toBeVisible();

  // Sign in again: the password alone is not enough.
  await context.clearCookies();
  await signIn(page);
  await expect(page).toHaveURL(/\/login\/two-step/);
  await field(page, "Code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("did not match");
  await field(page, "Code").fill(totpAt(secret, timeStep() + 1));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/app(\/onboarding)?$/);

  // A recovery code works once and the user is told how many are left.
  await context.clearCookies();
  await signIn(page);
  await expect(page).toHaveURL(/\/login\/two-step/);
  await field(page, "Code").fill(codes[0]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/app\/account\/security/);
  await expect(page.getByText(/9 left/)).toBeVisible();
});

test("installable app manifest, offline page and Android asset links are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "AutoSutra", display: "standalone", start_url: "/app" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect((await request.get("/icons/icon-512.png")).headers()["content-type"]).toContain("image/png");
  expect(await (await request.get("/offline.html")).text()).toContain("You are offline");
  expect(await (await request.get("/.well-known/assetlinks.json")).json()).toEqual([]);
});
