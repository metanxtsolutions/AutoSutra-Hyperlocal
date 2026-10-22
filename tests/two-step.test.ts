import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { mfaChallenges, sessions } from "@/server/db/schema";
import { requireOrg, TwoStepRequiredError } from "@/server/auth/context";
import { base32Decode, base32Encode, hotp, timeStep, totpAt, verifyTotp } from "@/server/totp";
import * as auth from "@/server/services/auth";
import * as mfa from "@/server/services/mfa";
import * as admin from "@/server/services/admin";
import { actorFor, makeTenant, makeUser, TEST_PASSWORD } from "./helpers";

/** Signs in with the password, returning the session, for a user without two-step verification. */
async function passwordSession(email: string) {
  const r = await auth.login(getDb(), email, TEST_PASSWORD, "127.0.0.1", "vitest");
  if (r.kind !== "session") throw new Error("expected a session");
  return (await auth.sessionFromToken(getDb(), r.token))!;
}

/** Turns on two-step verification and returns the secret and recovery codes. */
async function enrol(user: { id: string; email: string }) {
  const db = getDb();
  const session = await passwordSession(user.email);
  const actor = await actorFor(user.id, null, { mfaVerified: false });
  await mfa.startEnrolment(db, actor);
  const details = await mfa.enrolmentDetails(db, actor);
  const secret = details!.secret.replace(/\s/g, "");
  const codes = await mfa.confirmEnrolment(db, actor, session.id, totpAt(secret, timeStep()));
  return { secret, codes, session };
}

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vectors (6 digits)", () => {
    const seed = Buffer.from("12345678901234567890");
    const cases: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
    ];
    for (const [t, code] of cases) expect(hotp(seed, Math.floor(t / 30))).toBe(code);
  });

  it("round-trips base32 and accepts one step of clock drift but not replays", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    const now = new Date(1_800_000_000_000);
    const step = timeStep(now);
    expect(verifyTotp(secret, totpAt(secret, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step + 2), { now })).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step), { now, lastStep: step })).toBeNull();
    expect(verifyTotp(secret, "12345", { now })).toBeNull();
  });
});

describe("two-step verification", () => {
  it("enrols with a QR code, confirms with a code and marks the current session verified", async () => {
    const db = getDb();
    const user = await makeUser();
    const session = await passwordSession(user.email);
    const actor = await actorFor(user.id, null, { mfaVerified: false });
    await mfa.startEnrolment(db, actor);
    const details = await mfa.enrolmentDetails(db, actor);
    expect(details!.qrSvg).toContain("<svg");
    const secret = details!.secret.replace(/\s/g, "");
    await expect(mfa.confirmEnrolment(db, actor, session.id, "000000")).rejects.toThrow(/did not match/);
    const codes = await mfa.confirmEnrolment(db, actor, session.id, totpAt(secret, timeStep()));
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const status = await mfa.twoStepStatus(db, user.id);
    expect(status).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
    const [s] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(s.mfaVerifiedAt).not.toBeNull();
  });

  it("asks for a code after the password and refuses the same code twice", async () => {
    const db = getDb();
    const user = await makeUser();
    const { secret } = await enrol(user);

    const first = await auth.login(db, user.email, TEST_PASSWORD, "127.0.0.1", "vitest");
    expect(first.kind).toBe("two_step");
    if (first.kind !== "two_step") return;
    await expect(auth.completeTwoStepLogin(db, first.challengeToken, "000000", null, null)).rejects.toThrow(/did not match/);

    const code = totpAt(secret, timeStep() + 1);
    const done = await auth.completeTwoStepLogin(db, first.challengeToken, code, null, null);
    const s = await auth.sessionFromToken(db, done.token);
    expect(s?.mfaVerifiedAt).not.toBeNull();
    // The challenge is single use.
    await expect(auth.completeTwoStepLogin(db, first.challengeToken, code, null, null)).rejects.toThrow(/expired/);

    // A captured code cannot be replayed on a new sign-in.
    const second = await auth.login(db, user.email, TEST_PASSWORD, "127.0.0.1", "vitest");
    if (second.kind !== "two_step") throw new Error("expected two_step");
    await expect(auth.completeTwoStepLogin(db, second.challengeToken, code, null, null)).rejects.toThrow(/did not match/);
  });

  it("accepts each recovery code once", async () => {
    const db = getDb();
    const user = await makeUser();
    const { codes } = await enrol(user);
    const a = await auth.login(db, user.email, TEST_PASSWORD, null, null);
    if (a.kind !== "two_step") throw new Error("expected two_step");
    const r = await auth.completeTwoStepLogin(db, a.challengeToken, codes[0].toUpperCase(), null, null);
    expect(r.method).toBe("recovery_code");
    expect(r.recoveryCodesLeft).toBe(9);
    const b = await auth.login(db, user.email, TEST_PASSWORD, null, null);
    if (b.kind !== "two_step") throw new Error("expected two_step");
    await expect(auth.completeTwoStepLogin(db, b.challengeToken, codes[0], null, null)).rejects.toThrow(/did not match/);
  });

  it("ends a sign-in after five wrong codes and when it expires", async () => {
    const db = getDb();
    const user = await makeUser();
    const { secret } = await enrol(user);
    const a = await auth.login(db, user.email, TEST_PASSWORD, null, null);
    if (a.kind !== "two_step") throw new Error("expected two_step");
    for (let i = 0; i < 5; i++) await expect(auth.completeTwoStepLogin(db, a.challengeToken, "111111", null, null)).rejects.toThrow();
    await expect(auth.completeTwoStepLogin(db, a.challengeToken, totpAt(secret, timeStep() + 1), null, null)).rejects.toThrow(/Too many/);

    const b = await auth.login(db, user.email, TEST_PASSWORD, null, null);
    if (b.kind !== "two_step") throw new Error("expected two_step");
    await db.update(mfaChallenges).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(mfaChallenges.userId, user.id));
    await expect(auth.completeTwoStepLogin(db, b.challengeToken, totpAt(secret, timeStep() + 1), null, null)).rejects.toThrow(/expired/);
  });

  it("keeps staff tools and money movements behind two-step verification", async () => {
    const db = getDb();
    const staff = await makeUser({ platformRole: "super_admin" });
    await expect(admin.overview(db, await actorFor(staff.id, null, { mfaVerified: false }))).rejects.toBeInstanceOf(TwoStepRequiredError);
    await expect(admin.overview(db, await actorFor(staff.id))).resolves.toBeTruthy();

    const { org, owner } = await makeTenant();
    const unverifiedOwner = await actorFor(owner.id, org.id, { mfaVerified: false });
    expect(() => requireOrg(unverifiedOwner, org.id, "campaign.approve")).not.toThrow();
    expect(() => requireOrg(unverifiedOwner, org.id, "wallet.deposit")).toThrow(TwoStepRequiredError);
    expect(() => requireOrg(unverifiedOwner, org.id, "wallet.refund_request")).toThrow(TwoStepRequiredError);
    const verifiedOwner = await actorFor(owner.id, org.id);
    expect(() => requireOrg(verifiedOwner, org.id, "wallet.deposit")).not.toThrow();

    // Staff looking at a customer's data also need it.
    const ops = await makeUser({ platformRole: "campaign_ops" });
    const unverifiedOps = await actorFor(ops.id, null, { mfaVerified: false });
    const verifiedOps = await actorFor(ops.id);
    expect(() => requireOrg(unverifiedOps, org.id, "campaign.view")).toThrow(TwoStepRequiredError);
    expect(() => requireOrg(verifiedOps, org.id, "campaign.view")).not.toThrow();
  });

  it("lets customers turn it off with password and code, but not staff", async () => {
    const db = getDb();
    const user = await makeUser();
    const { secret } = await enrol(user);
    const actor = await actorFor(user.id);
    await expect(mfa.disableTwoStep(db, actor, "wrong password", totpAt(secret, timeStep() + 1))).rejects.toThrow(/password/);
    await mfa.disableTwoStep(db, actor, TEST_PASSWORD, totpAt(secret, timeStep() + 1));
    expect((await mfa.twoStepStatus(db, user.id)).enabled).toBe(false);
    const again = await auth.login(db, user.email, TEST_PASSWORD, null, null);
    expect(again.kind).toBe("session");

    const staff = await makeUser({ platformRole: "finance_admin" });
    await expect(mfa.disableTwoStep(db, await actorFor(staff.id), TEST_PASSWORD, "123456")).rejects.toThrow(/staff/);
  });

  it("lets a super admin reset someone else's two-step verification, with a reason", async () => {
    const db = getDb();
    const user = await makeUser();
    await enrol(user);
    const superAdmin = await actorFor((await makeUser({ platformRole: "super_admin" })).id);
    const finance = await actorFor((await makeUser({ platformRole: "finance_admin" })).id);
    await expect(mfa.adminResetTwoStep(db, finance, user.id, "Lost phone")).rejects.toThrow(/super admin/);
    await expect(mfa.adminResetTwoStep(db, superAdmin, user.id, " ")).rejects.toThrow(/reason/);
    await expect(mfa.adminResetTwoStep(db, superAdmin, superAdmin.user.id, "Self")).rejects.toThrow(/another super admin/);
    await mfa.adminResetTwoStep(db, superAdmin, user.id, "Lost phone; identity confirmed by video call");
    expect((await mfa.twoStepStatus(db, user.id)).enabled).toBe(false);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
  });
});
