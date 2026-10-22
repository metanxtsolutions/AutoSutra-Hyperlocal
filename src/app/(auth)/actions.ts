"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkbox, formObject, runAction, type ActionState } from "@/server/actions";
import { clearSessionCookie, clientIp, currentSession, sessionToken, setSessionCookie } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import * as auth from "@/server/services/auth";
import { acceptInvitation } from "@/server/services/organisations";

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") ? s : "/app";
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let next = "/app";
  const result = await runAction(fd, async () => {
    const ua = (await headers()).get("user-agent");
    const { token, user } = await auth.login(getDb(), String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), await clientIp(), ua);
    await setSessionCookie(token);
    next = user.platformRole && safeNext(fd.get("next")) === "/app" ? "/admin" : safeNext(fd.get("next"));
  });
  if (result.ok) redirect(next);
  return result;
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(fd, async () => {
    const db = getDb();
    const ip = await clientIp();
    await auth.register(db, { ...formObject(fd), acceptTerms: checkbox(fd, "acceptTerms") }, ip);
    const { token } = await auth.login(db, String(fd.get("email")), String(fd.get("password")), ip, (await headers()).get("user-agent"));
    await setSessionCookie(token);
  });
  if (result.ok) redirect("/app/onboarding?notice=" + encodeURIComponent("Account created. Check your email for a verification link."));
  return result;
}

export async function logoutAction() {
  await auth.logout(getDb(), await sessionToken());
  await clearSessionCookie();
  redirect("/login?notice=Signed%20out");
}

export async function resendVerificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const s = await currentSession();
    if (!s) throw new Error("Not signed in");
    await auth.resendVerification(getDb(), s.actor.user.id);
    return "Verification email sent.";
  });
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await auth.requestPasswordReset(getDb(), String(fd.get("email") ?? ""), await clientIp());
    return "If an account exists for that email, a reset link is on its way. It expires in 60 minutes.";
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(fd, async () => {
    if (fd.get("password") !== fd.get("confirm")) {
      const { ValidationError } = await import("@/server/errors");
      throw new ValidationError("Passwords do not match", { confirm: "Passwords do not match" });
    }
    await auth.resetPassword(getDb(), String(fd.get("token") ?? ""), String(fd.get("password") ?? ""));
  });
  if (result.ok) redirect("/login?notice=" + encodeURIComponent("Password changed. Sign in with your new password."));
  return result;
}

export async function acceptInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let orgId = "";
  const result = await runAction(fd, async () => {
    const s = await currentSession();
    if (!s) throw new Error("Not signed in");
    const db = getDb();
    orgId = await acceptInvitation(db, s.actor, String(fd.get("token") ?? ""));
    await auth.switchOrganisation(db, s.session.id, s.actor.user.id, orgId);
  });
  if (result.ok) redirect("/app?notice=" + encodeURIComponent("You have joined the organisation."));
  return result;
}
