import { describe, expect, it } from "vitest";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, outboundEmails, sessions, users } from "@/server/db/schema";
import * as auth from "@/server/services/auth";
import { TEST_PASSWORD, expectDbError, makeUser } from "./helpers";

function tokenFrom(body: string, path: string) {
  const m = body.match(new RegExp(`${path}\\?token=([^\\s]+)`));
  if (!m) throw new Error("no token in email");
  return decodeURIComponent(m[1]);
}

describe("registration and email verification", () => {
  it("registers a user, stores a hashed password and sends a verification link", async () => {
    const db = getDb();
    const user = await auth.register(db, { name: "Asha Rao", email: "Asha@Example.test", password: "long enough pw 1", acceptTerms: true }, "1.1.1.1");
    expect(user.email).toBe("asha@example.test");
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.emailVerifiedAt).toBeNull();
    const [mail] = await db.select().from(outboundEmails).where(eq(outboundEmails.to, "asha@example.test"));
    const token = tokenFrom(mail.body, "/verify-email");
    expect(await auth.verifyEmail(db, token)).toBe(true);
    expect(await auth.verifyEmail(db, token)).toBe(false); // single use
    const reloaded = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(reloaded?.emailVerifiedAt).not.toBeNull();
  });

  it("requires terms acceptance and a strong password, and rejects duplicate emails", async () => {
    const db = getDb();
    await expect(auth.register(db, { name: "A", email: "a@example.test", password: "long enough pw 1" }, null)).rejects.toThrow(/Terms/);
    await expect(auth.register(db, { name: "A", email: "a@example.test", password: "short", acceptTerms: true }, null)).rejects.toThrow(/10 characters/);
    await auth.register(db, { name: "A", email: "a@example.test", password: "long enough pw 1", acceptTerms: true }, null);
    await expect(auth.register(db, { name: "B", email: "A@EXAMPLE.TEST", password: "long enough pw 2", acceptTerms: true }, null)).rejects.toThrow(/already exists/);
  });
});

describe("login and sessions", () => {
  it("logs in with correct credentials and rejects wrong ones without revealing which part was wrong", async () => {
    const db = getDb();
    const u = await makeUser({ email: "dealer@example.test" });
    const { token } = await auth.login(db, "DEALER@example.test", TEST_PASSWORD, "1.2.3.4", "vitest");
    const session = await auth.sessionFromToken(db, token);
    expect(session?.userId).toBe(u.id);
    // Only a hash of the token is stored.
    const raw = await db.select().from(sessions);
    expect(raw[0].tokenHash).not.toContain(token);
    await expect(auth.login(db, "dealer@example.test", "wrong password!", null, null)).rejects.toThrow("Incorrect email or password");
    await expect(auth.login(db, "nobody@example.test", "wrong password!", null, null)).rejects.toThrow("Incorrect email or password");
    await auth.logout(db, token);
    expect(await auth.sessionFromToken(db, token)).toBeNull();
  });

  it("rate limits repeated failed logins for one email", async () => {
    const db = getDb();
    await makeUser({ email: "target@example.test" });
    for (let i = 0; i < 8; i++) {
      await expect(auth.login(db, "target@example.test", "bad password " + i, `10.0.0.${i}`, null)).rejects.toThrow();
    }
    await expect(auth.login(db, "target@example.test", TEST_PASSWORD, "10.0.0.99", null)).rejects.toThrow(/Too many attempts/);
  });

  it("refuses suspended users", async () => {
    const db = getDb();
    const u = await makeUser({ email: "sus@example.test" });
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, u.id));
    await expect(auth.login(db, "sus@example.test", TEST_PASSWORD, null, null)).rejects.toThrow(/suspended/);
  });
});

describe("password reset", () => {
  it("resets the password with a single-use link and revokes all sessions", async () => {
    const db = getDb();
    const u = await makeUser({ email: "reset@example.test" });
    const { token: sessionToken } = await auth.login(db, "reset@example.test", TEST_PASSWORD, null, null);
    await auth.requestPasswordReset(db, "reset@example.test", null);
    const [mail] = await db.select().from(outboundEmails).orderBy(desc(outboundEmails.createdAt)).limit(1);
    const token = tokenFrom(mail.body, "/reset-password");
    await auth.resetPassword(db, token, "a brand new passphrase");
    expect(await auth.sessionFromToken(db, sessionToken)).toBeNull();
    await expect(auth.resetPassword(db, token, "another new passphrase")).rejects.toThrow(/invalid or has expired/);
    const { user } = await auth.login(db, "reset@example.test", "a brand new passphrase", null, null);
    expect(user.id).toBe(u.id);
  });

  it("does not reveal whether an email is registered", async () => {
    const db = getDb();
    await expect(auth.requestPasswordReset(db, "ghost@example.test", null)).resolves.toBeUndefined();
    const mails = await db.select().from(outboundEmails);
    expect(mails).toHaveLength(0);
  });
});

describe("audit log", () => {
  it("is append-only at the database level", async () => {
    const db = getDb();
    await makeUser({ email: "x@example.test" });
    await auth.login(db, "x@example.test", TEST_PASSWORD, null, null);
    const [row] = await db.select().from(auditLogs).limit(1);
    await expectDbError(db.update(auditLogs).set({ summary: "tampered" }).where(eq(auditLogs.id, row.id)), /append-only/);
    await expectDbError(db.execute(sql`DELETE FROM audit_logs`), /append-only/);
  });
});
