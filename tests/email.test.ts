import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { jobs, outboundEmails } from "@/server/db/schema";
import { resetEnvCache, setEnvForTests } from "@/server/env";
import { sendEmail } from "@/server/email";
import { runAllHandlers } from "@/server/jobs/run";
import { register } from "@/server/services/auth";

interface Received {
  to: string[];
  raw: string;
}

let server: SMTPServer;
let port = 0;
let received: Received[] = [];
// What the server answers to RCPT TO: null accepts, otherwise an SMTP reply code.
let rejectWith: number | null = null;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    logger: false,
    onRcptTo(address, _session, callback) {
      if (rejectWith) {
        const err = Object.assign(new Error(rejectWith >= 500 ? "Mailbox unavailable" : "Try again later"), { responseCode: rejectWith });
        return callback(err);
      }
      callback();
    },
    onData(stream, session, callback) {
      let raw = "";
      stream.on("data", (c: Buffer) => (raw += c.toString("utf8")));
      stream.on("end", () => {
        received.push({ to: session.envelope.rcptTo.map((r) => r.address), raw });
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function useSmtp() {
  setEnvForTests({ EMAIL_DRIVER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: port, SMTP_TLS: "none", EMAIL_FROM: "AutoSutra <no-reply@autosutra.test>" });
}

afterEach(() => {
  received = [];
  rejectWith = null;
  resetEnvCache();
});

describe("email delivery", () => {
  it("stores messages without delivering them when using the outbox driver", async () => {
    const db = getDb();
    await sendEmail(db, "dealer@example.test", "Hello", "Body");
    const rows = await db.select().from(outboundEmails);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("stored_for_development");
    expect(await db.select().from(jobs)).toHaveLength(0);
  });

  it("delivers through SMTP from the job queue and removes the body afterwards", async () => {
    useSmtp();
    const db = getDb();
    await sendEmail(db, "dealer@example.test", "Verify your AutoSutra email address", "Open https://app.test/verify?token=abc");
    const [queued] = await db.select().from(outboundEmails);
    expect(queued.status).toBe("queued");
    expect(received).toHaveLength(0);

    await runAllHandlers(db);

    expect(received).toHaveLength(1);
    expect(received[0].to).toEqual(["dealer@example.test"]);
    expect(received[0].raw).toContain("Subject: Verify your AutoSutra email address");
    expect(received[0].raw).toContain("https://app.test/verify?token=abc");
    const [sent] = await db.select().from(outboundEmails);
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).not.toBeNull();
    expect(sent.providerMessageId).toBeTruthy();
    expect(sent.body).not.toContain("token=abc");
  });

  it("sends nothing when the transaction that created the email rolls back", async () => {
    useSmtp();
    const db = getDb();
    await expect(
      db.transaction(async (tx) => {
        await sendEmail(tx, "dealer@example.test", "Hello", "Body");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await runAllHandlers(db);
    expect(received).toHaveLength(0);
    expect(await db.select().from(outboundEmails)).toHaveLength(0);
  });

  it("does not retry an address the server permanently rejects", async () => {
    useSmtp();
    rejectWith = 550;
    const db = getDb();
    await sendEmail(db, "nobody@example.test", "Hello", "Secret link");
    await runAllHandlers(db);
    const [email] = await db.select().from(outboundEmails);
    expect(email.status).toBe("failed");
    expect(email.lastError).toMatch(/Mailbox unavailable/);
    expect(email.body).not.toContain("Secret link");
    const [job] = await db.select().from(jobs).where(eq(jobs.type, "send_email"));
    expect(job.status).toBe("failed");
  });

  it("retries a temporary failure and marks the email failed after the last attempt", async () => {
    useSmtp();
    rejectWith = 451;
    const db = getDb();
    await sendEmail(db, "dealer@example.test", "Hello", "Body");
    await runAllHandlers(db);
    let [email] = await db.select().from(outboundEmails);
    let [job] = await db.select().from(jobs).where(eq(jobs.type, "send_email"));
    expect(email.status).toBe("queued");
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(1);

    // Jump to the final attempt.
    await db.update(jobs).set({ attempts: job.maxAttempts - 1, runAt: new Date() }).where(eq(jobs.id, job.id));
    await runAllHandlers(db);
    [email] = await db.select().from(outboundEmails);
    [job] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(email.status).toBe("failed");
    expect(job.status).toBe("dead");

    // Once the server recovers, nothing is sent twice or late.
    rejectWith = null;
    await runAllHandlers(db);
    expect(received).toHaveLength(0);
  });

  it("delivers the verification email when someone registers", async () => {
    useSmtp();
    const db = getDb();
    await register(db, { name: "Asha Rao", email: "asha@example.test", password: "a long password 123", acceptTerms: true }, "127.0.0.1");
    await runAllHandlers(db);
    expect(received).toHaveLength(1);
    expect(received[0].raw).toMatch(/verify-email\?token=/);
  });
});
