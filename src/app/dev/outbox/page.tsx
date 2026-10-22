import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { outboundEmails } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** Development only: read emails the outbox driver stored (verification and reset links). */
export default async function OutboxPage() {
  if (getEnv().NODE_ENV === "production") notFound();
  const mails = await getDb().select().from(outboundEmails).orderBy(desc(outboundEmails.createdAt)).limit(50);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-bold">Development email outbox</h1>
      <p className="text-sm text-ink-600">Not available in production.</p>
      <ul className="mt-4 space-y-3">
        {mails.map((m) => (
          <li key={m.id} className="rounded-lg border border-ink-200 bg-white p-4">
            <div className="text-xs text-ink-500">{m.createdAt.toISOString()} · to {m.to}</div>
            <div className="font-semibold">{m.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap text-xs">{m.body}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}
