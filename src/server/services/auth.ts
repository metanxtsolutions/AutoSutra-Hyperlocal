import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import { emailTokens, organisationMemberships, sessions, users } from "../db/schema";
import { audit } from "../audit";
import { hashPassword, hashToken, randomToken, verifyPassword } from "../crypto";
import { sendEmail } from "../email";
import { getEnv } from "../env";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "../errors";
import { isEnabled } from "../flags";
import { rateLimit } from "../rate-limit";
import { email, optionalIndianPhone, parse, password, requiredText } from "../validation";

export const SESSION_TTL_HOURS = 12;
const VERIFY_TTL_HOURS = 48;
const RESET_TTL_MINUTES = 60;

const registerSchema = z.object({
  name: requiredText("Name", 120),
  email,
  phone: optionalIndianPhone,
  password,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms of Service and Privacy Policy" }) }),
});

// A fixed hash so failed logins for unknown emails take as long as real ones.
let dummyHash: Promise<string> | null = null;

export async function register(db: Database, input: unknown, ip: string | null) {
  const data = parse(registerSchema, input);
  await rateLimit(db, `register:${ip ?? "unknown"}`, 10, 3600);
  if (!(await isEnabled(db, "self_registration"))) {
    throw new ForbiddenError("Self-service registration is currently closed. Please contact AutoSutra.");
  }
  const passwordHash = await hashPassword(data.password);
  return db.transaction(async (tx) => {
    const existing = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${data.email}` });
    if (existing) throw new ValidationError("An account with this email already exists. Sign in or reset your password.", { email: "Already registered" });
    const [user] = await tx
      .insert(users)
      .values({ email: data.email, name: data.name, phone: data.phone ?? null, passwordHash })
      .returning();
    await audit(tx, { user: { ...user, platformRole: null, emailVerified: false }, membership: null, ip }, {
      action: "user.registered",
      entityType: "user",
      entityId: user.id,
      summary: `Registered ${user.email} (terms accepted)`,
      data: { termsAccepted: true },
    });
    await issueVerification(tx, user.id, user.email, user.name);
    return user;
  });
}

async function issueVerification(db: DbOrTx, userId: string, to: string, name: string) {
  const token = randomToken();
  await db.insert(emailTokens).values({
    userId,
    purpose: "verify_email",
    tokenHash: hashToken(token),
    email: to,
    expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 3600_000),
  });
  const link = `${getEnv().APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail(db, to, "Verify your AutoSutra email address", `Hello ${name},\n\nConfirm your email address to finish setting up AutoSutra:\n${link}\n\nThis link expires in ${VERIFY_TTL_HOURS} hours. If you did not create an account, ignore this email.`);
}

export async function resendVerification(db: Database, userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.emailVerifiedAt) return;
  await rateLimit(db, `verify-resend:${userId}`, 5, 3600);
  await issueVerification(db, user.id, user.email, user.name);
}

export async function verifyEmail(db: Database, token: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = await tx.query.emailTokens.findFirst({
      where: and(
        eq(emailTokens.tokenHash, hashToken(token)),
        eq(emailTokens.purpose, "verify_email"),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    });
    if (!row || !row.userId) return false;
    await tx.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, row.id));
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
    await audit(tx, null, { action: "user.email_verified", entityType: "user", entityId: row.userId, summary: `Verified ${row.email}` });
    return true;
  });
}

export async function login(db: Database, rawEmail: string, rawPassword: string, ip: string | null, userAgent: string | null) {
  const emailValue = String(rawEmail ?? "").trim().toLowerCase();
  await rateLimit(db, `login-ip:${ip ?? "unknown"}`, 30, 900);
  await rateLimit(db, `login-email:${emailValue}`, 8, 900);
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${emailValue}` });
  if (!user) {
    dummyHash ??= hashPassword("timing-equaliser-password");
    await verifyPassword(String(rawPassword ?? ""), await dummyHash);
    await audit(db, null, { action: "auth.login_failed", entityType: "user", summary: `Failed sign-in for unknown email`, data: { ip } });
    throw new UnauthenticatedError("Incorrect email or password");
  }
  const ok = await verifyPassword(String(rawPassword ?? ""), user.passwordHash);
  if (!ok) {
    await audit(db, null, { action: "auth.login_failed", entityType: "user", entityId: user.id, summary: `Failed sign-in for ${user.email}`, data: { ip } });
    throw new UnauthenticatedError("Incorrect email or password");
  }
  if (user.status !== "active") throw new ForbiddenError("This account is suspended. Contact AutoSutra support.");
  const firstMembership = await db.query.organisationMemberships.findFirst({ where: eq(organisationMemberships.userId, user.id) });
  const token = randomToken();
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      tokenHash: hashToken(token),
      userId: user.id,
      activeOrganisationId: firstMembership?.organisationId ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600_000),
      ip,
      userAgent: userAgent?.slice(0, 300) ?? null,
    });
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await audit(tx, null, { action: "auth.login", entityType: "user", entityId: user.id, summary: `Signed in ${user.email}`, data: { ip } });
  });
  return { token, user };
}

export async function sessionFromToken(db: DbOrTx, token: string | undefined | null) {
  if (!token) return null;
  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())),
  });
  return row ?? null;
}

export async function logout(db: DbOrTx, token: string | undefined | null) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function switchOrganisation(db: DbOrTx, sessionId: string, userId: string, organisationId: string) {
  const membership = await db.query.organisationMemberships.findFirst({
    where: and(eq(organisationMemberships.userId, userId), eq(organisationMemberships.organisationId, organisationId)),
  });
  if (!membership) throw new ForbiddenError("You are not a member of that organisation");
  await db.update(sessions).set({ activeOrganisationId: organisationId }).where(eq(sessions.id, sessionId));
}

/** Always succeeds from the caller's point of view, so it cannot be used to discover accounts. */
export async function requestPasswordReset(db: Database, rawEmail: string, ip: string | null) {
  const emailValue = String(rawEmail ?? "").trim().toLowerCase();
  await rateLimit(db, `reset-ip:${ip ?? "unknown"}`, 10, 3600);
  await rateLimit(db, `reset-email:${emailValue}`, 3, 3600);
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${emailValue}` });
  if (!user || user.status !== "active") return;
  const token = randomToken();
  await db.transaction(async (tx) => {
    await tx.insert(emailTokens).values({
      userId: user.id,
      purpose: "reset_password",
      tokenHash: hashToken(token),
      email: user.email,
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
    });
    const link = `${getEnv().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail(tx, user.email, "Reset your AutoSutra password", `Hello ${user.name},\n\nUse this link to choose a new password:\n${link}\n\nIt expires in ${RESET_TTL_MINUTES} minutes. If you did not ask for this, ignore this email; your password has not changed.`);
    await audit(tx, null, { action: "auth.password_reset_requested", entityType: "user", entityId: user.id, summary: `Password reset requested for ${user.email}`, data: { ip } });
  });
}

export async function resetPassword(db: Database, token: string, newPassword: string) {
  const pw = parse(z.object({ password }), { password: newPassword }).password;
  const hash = await hashPassword(pw);
  await db.transaction(async (tx) => {
    const row = await tx.query.emailTokens.findFirst({
      where: and(
        eq(emailTokens.tokenHash, hashToken(token)),
        eq(emailTokens.purpose, "reset_password"),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    });
    if (!row || !row.userId) throw new ValidationError("This reset link is invalid or has expired. Request a new one.");
    await tx.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, row.id));
    // Resetting by email also proves ownership of the address.
    await tx.update(users).set({ passwordHash: hash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, row.userId));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
    await audit(tx, null, { action: "auth.password_reset", entityType: "user", entityId: row.userId, summary: `Password reset for ${row.email}; all sessions revoked` });
  });
}

export async function changePassword(db: Database, userId: string, current: string, next: string, keepSessionId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !(await verifyPassword(current, user.passwordHash))) throw new ValidationError("Current password is incorrect", { currentPassword: "Incorrect" });
  const pw = parse(z.object({ password }), { password: next }).password;
  const hash = await hashPassword(pw);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, userId));
    await tx.delete(sessions).where(and(eq(sessions.userId, userId), sql`${sessions.id} <> ${keepSessionId}`));
    await audit(tx, null, { action: "auth.password_changed", entityType: "user", entityId: userId, summary: `Password changed for ${user.email}; other sessions revoked` });
  });
}
