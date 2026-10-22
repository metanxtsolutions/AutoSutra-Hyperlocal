/**
 * Two-step verification with an authenticator app (TOTP) and single-use
 * recovery codes.
 *
 * - AutoSutra staff must use it: staff tools refuse sessions that did not pass
 *   a second step (see requirePlatform).
 * - Moving customer money (wallet deposits and refund requests) also needs it.
 * - Anyone else can turn it on from Account → Two-step verification.
 */
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import QRCode from "qrcode";
import type { Database, DbOrTx } from "../db/client";
import { mfaChallenges, mfaRecoveryCodes, sessions, users } from "../db/schema";
import { audit } from "../audit";
import { type Actor } from "../auth/context";
import { decryptSecret, encryptSecret, hashToken, randomToken, verifyPassword } from "../crypto";
import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "../errors";
import { rateLimit } from "../rate-limit";
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from "../totp";
import { randomBytes } from "node:crypto";

export const CHALLENGE_TTL_MINUTES = 10;
const MAX_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

type User = typeof users.$inferSelect;

function normaliseRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, "");
}

function recoveryHash(code: string): string {
  return hashToken(`recovery:${normaliseRecoveryCode(code)}`);
}

function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

async function storeRecoveryCodes(tx: DbOrTx, userId: string): Promise<string[]> {
  const codes = newRecoveryCodes();
  await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  await tx.insert(mfaRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: recoveryHash(c) })));
  return codes;
}

async function loadUser(db: DbOrTx, userId: string): Promise<User> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("User not found");
  return user;
}

/**
 * Accepts a 6-digit authenticator code or an unused recovery code. Records
 * the accepted time step (so the code cannot be replayed) or marks the
 * recovery code used. Returns how the user verified, or null.
 */
async function verifySecondFactor(tx: DbOrTx, user: User, code: string): Promise<"authenticator" | "recovery_code" | null> {
  const clean = code.trim();
  if (!user.totpSecretEnc || !user.totpEnabledAt) return null;
  if (/^\d{3}\s?\d{3}$/.test(clean)) {
    const step = verifyTotp(decryptSecret(user.totpSecretEnc), clean, { lastStep: user.totpLastStep });
    if (step === null) return null;
    // Conditional update: two concurrent requests with the same code cannot both succeed.
    const updated = await tx
      .update(users)
      .set({ totpLastStep: step })
      .where(and(eq(users.id, user.id), sql`coalesce(${users.totpLastStep}, -1) < ${step}`))
      .returning({ id: users.id });
    return updated.length ? "authenticator" : null;
  }
  const used = await tx
    .update(mfaRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(mfaRecoveryCodes.userId, user.id), eq(mfaRecoveryCodes.codeHash, recoveryHash(clean)), isNull(mfaRecoveryCodes.usedAt)))
    .returning({ id: mfaRecoveryCodes.id });
  return used.length ? "recovery_code" : null;
}

// ------------------------------------------------------------------ status and enrolment

export async function twoStepStatus(db: DbOrTx, userId: string) {
  const user = await loadUser(db, userId);
  const [{ n }] = await db
    .select({ n: count() })
    .from(mfaRecoveryCodes)
    .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
  return {
    enabled: !!user.totpEnabledAt,
    enabledAt: user.totpEnabledAt,
    pending: !user.totpEnabledAt && !!user.totpSecretEnc,
    recoveryCodesLeft: Number(n),
  };
}

/** Creates (or replaces) an unconfirmed authenticator secret. */
export async function startEnrolment(db: Database, actor: Actor): Promise<void> {
  const user = await loadUser(db, actor.user.id);
  if (user.totpEnabledAt) throw new ConflictError("Two-step verification is already on");
  await db.update(users).set({ totpSecretEnc: encryptSecret(generateTotpSecret()), totpLastStep: null }).where(eq(users.id, user.id));
}

/** QR code and manual key for an unconfirmed enrolment. */
export async function enrolmentDetails(db: DbOrTx, actor: Actor) {
  const user = await loadUser(db, actor.user.id);
  if (user.totpEnabledAt || !user.totpSecretEnc) return null;
  const secret = decryptSecret(user.totpSecretEnc);
  const uri = otpauthUri(secret, user.email);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret: secret.replace(/(.{4})/g, "$1 ").trim(), qrSvg };
}

/** Confirms enrolment with a code from the app. Returns the recovery codes, shown once. */
export async function confirmEnrolment(db: Database, actor: Actor, sessionId: string, code: string): Promise<string[]> {
  await rateLimit(db, `mfa-enrol:${actor.user.id}`, 10, 900);
  const user = await loadUser(db, actor.user.id);
  if (user.totpEnabledAt) throw new ConflictError("Two-step verification is already on");
  if (!user.totpSecretEnc) throw new ValidationError("Start the set-up again");
  const step = verifyTotp(decryptSecret(user.totpSecretEnc), code, { lastStep: null });
  if (step === null) throw new ValidationError("That code did not match. Check the time on your phone and try the newest code.", { code: "Incorrect code" });
  return db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnabledAt: new Date(), totpLastStep: step }).where(eq(users.id, user.id));
    const codes = await storeRecoveryCodes(tx, user.id);
    await tx.update(sessions).set({ mfaVerifiedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)));
    await audit(tx, actor, { action: "auth.two_step_enabled", entityType: "user", entityId: user.id, summary: `Two-step verification turned on for ${user.email}` });
    return codes;
  });
}

export async function regenerateRecoveryCodes(db: Database, actor: Actor, code: string): Promise<string[]> {
  await rateLimit(db, `mfa-codes:${actor.user.id}`, 10, 900);
  return db.transaction(async (tx) => {
    const user = await loadUser(tx, actor.user.id);
    if (!user.totpEnabledAt) throw new ValidationError("Two-step verification is not on");
    if (!/^\d{3}\s?\d{3}$/.test(code.trim()) || !(await verifySecondFactor(tx, user, code))) {
      throw new ValidationError("Enter the current code from your authenticator app", { code: "Incorrect code" });
    }
    const codes = await storeRecoveryCodes(tx, user.id);
    await audit(tx, actor, { action: "auth.recovery_codes_regenerated", entityType: "user", entityId: user.id, summary: `New recovery codes generated for ${user.email}; old codes no longer work` });
    return codes;
  });
}

export async function disableTwoStep(db: Database, actor: Actor, password: string, code: string): Promise<void> {
  if (actor.user.platformRole) throw new ForbiddenError("AutoSutra staff accounts must keep two-step verification on");
  await rateLimit(db, `mfa-disable:${actor.user.id}`, 10, 900);
  const user = await loadUser(db, actor.user.id);
  if (!user.totpEnabledAt) throw new ValidationError("Two-step verification is not on");
  if (!(await verifyPassword(password, user.passwordHash))) throw new ValidationError("Your password is incorrect", { password: "Incorrect" });
  await db.transaction(async (tx) => {
    if (!(await verifySecondFactor(tx, user, code))) throw new ValidationError("That code did not match", { code: "Incorrect code" });
    await tx.update(users).set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null }).where(eq(users.id, user.id));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
    await tx.update(sessions).set({ mfaVerifiedAt: null }).where(eq(sessions.userId, user.id));
    await audit(tx, actor, { action: "auth.two_step_disabled", entityType: "user", entityId: user.id, summary: `Two-step verification turned off for ${user.email}` });
  });
}

/** A super admin clears a user's two-step set-up (lost phone and recovery codes). Signs them out everywhere. */
export async function adminResetTwoStep(db: Database, actor: Actor, userId: string, reason: string): Promise<void> {
  if (actor.user.platformRole !== "super_admin" || !actor.mfaVerified) throw new ForbiddenError("Only a super admin can reset two-step verification");
  if (userId === actor.user.id) throw new ForbiddenError("Ask another super admin to reset your own two-step verification");
  if (!reason.trim()) throw new ValidationError("A reason is required", { reason: "Required" });
  const user = await loadUser(db, userId);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null }).where(eq(users.id, user.id));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await audit(tx, actor, { action: "auth.two_step_reset", entityType: "user", entityId: user.id, summary: `Two-step verification reset for ${user.email}: ${reason.trim()}` });
  });
}

// ------------------------------------------------------------------ sign-in

/** Called by login() once the password is correct, for users with two-step verification on. */
export async function createChallenge(db: DbOrTx, user: User, ip: string | null, userAgent: string | null): Promise<string> {
  const token = randomToken();
  await db.insert(mfaChallenges).values({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
    ip,
    userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return token;
}

/**
 * Second step of sign-in. `createSession` is passed in by the auth service so
 * session creation stays in one place.
 */
export async function completeChallenge(
  db: Database,
  challengeToken: string | undefined | null,
  code: string,
  createSession: (tx: DbOrTx, user: User, opts: { mfaVerified: boolean; ip: string | null; userAgent: string | null }) => Promise<string>,
  ip: string | null,
  userAgent: string | null,
) {
  const challenge = challengeToken
    ? await db.query.mfaChallenges.findFirst({
        where: and(eq(mfaChallenges.tokenHash, hashToken(challengeToken)), isNull(mfaChallenges.usedAt), gt(mfaChallenges.expiresAt, new Date())),
      })
    : undefined;
  if (!challenge) throw new UnauthenticatedError("Your sign-in has expired. Please sign in again.");
  await rateLimit(db, `mfa-login:${challenge.userId}`, 10, 900);
  if (challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    await db.update(mfaChallenges).set({ usedAt: new Date() }).where(eq(mfaChallenges.id, challenge.id));
    throw new UnauthenticatedError("Too many incorrect codes. Please sign in again.");
  }
  const user = await loadUser(db, challenge.userId);
  if (user.status !== "active") throw new ForbiddenError("This account is suspended. Contact AutoSutra support.");

  const outcome = await db.transaction(async (tx) => {
    const method = await verifySecondFactor(tx, user, code);
    if (!method) return null;
    const claimed = await tx
      .update(mfaChallenges)
      .set({ usedAt: new Date() })
      .where(and(eq(mfaChallenges.id, challenge.id), isNull(mfaChallenges.usedAt)))
      .returning({ id: mfaChallenges.id });
    if (!claimed.length) throw new UnauthenticatedError("Your sign-in has expired. Please sign in again.");
    const token = await createSession(tx, user, { mfaVerified: true, ip, userAgent });
    await audit(tx, null, {
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      summary: `Signed in ${user.email} with two-step verification (${method === "recovery_code" ? "recovery code" : "authenticator app"})`,
      data: { ip, method },
    });
    return { token, method };
  });

  if (!outcome) {
    await db.update(mfaChallenges).set({ attempts: sql`${mfaChallenges.attempts} + 1` }).where(eq(mfaChallenges.id, challenge.id));
    await audit(db, null, { action: "auth.two_step_failed", entityType: "user", entityId: user.id, summary: `Incorrect two-step code for ${user.email}`, data: { ip } });
    throw new ValidationError("That code did not match. Use the newest code from your app, or one of your recovery codes.", { code: "Incorrect code" });
  }
  const status = await twoStepStatus(db, user.id);
  return { token: outcome.token, user, method: outcome.method, recoveryCodesLeft: status.recoveryCodesLeft };
}
