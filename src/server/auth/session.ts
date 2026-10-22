import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { getEnv } from "../env";
import { sessionFromToken, SESSION_TTL_HOURS } from "../services/auth";
import { loadActor, type Actor } from "./context";

export const SESSION_COOKIE = "as_session";

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function setSessionCookie(token: string) {
  const env = getEnv();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The current session and actor, cached per request. */
export const currentSession = cache(async () => {
  const token = await sessionToken();
  const db = getDb();
  const session = await sessionFromToken(db, token);
  if (!session) return null;
  const actor = await loadActor(db, session.userId, session.activeOrganisationId, await clientIp());
  if (!actor) return null;
  return { session, actor };
});

export async function getActor(): Promise<Actor | null> {
  return (await currentSession())?.actor ?? null;
}

export async function requireActor(): Promise<Actor> {
  const s = await currentSession();
  if (!s) redirect("/login");
  return s.actor;
}

/** Actor with an organisation; otherwise sends them to onboarding. */
export async function requireOrgActor(): Promise<Actor & { membership: NonNullable<Actor["membership"]> }> {
  const actor = await requireActor();
  if (!actor.membership) {
    if (actor.user.platformRole) redirect("/admin");
    redirect("/app/onboarding");
  }
  return actor as Actor & { membership: NonNullable<Actor["membership"]> };
}
