"use server";

import { runAction, type ActionState } from "@/server/actions";
import { currentSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { UnauthenticatedError } from "@/server/errors";
import * as mfa from "@/server/services/mfa";

async function session() {
  const s = await currentSession();
  if (!s) throw new UnauthenticatedError("Sign in again");
  return s;
}

export async function startTwoStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await mfa.startEnrolment(getDb(), (await session()).actor);
    return "Scan the QR code with your authenticator app";
  });
}

export async function confirmTwoStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let codes: string[] = [];
  const result = await runAction(fd, async () => {
    const s = await session();
    codes = await mfa.confirmEnrolment(getDb(), s.actor, s.session.id, String(fd.get("code") ?? ""));
    return "Two-step verification is on";
  });
  return result.ok ? { ...result, data: { codes } } : result;
}

export async function regenerateCodesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let codes: string[] = [];
  const result = await runAction(fd, async () => {
    codes = await mfa.regenerateRecoveryCodes(getDb(), (await session()).actor, String(fd.get("code") ?? ""));
    return "New recovery codes created. The old ones no longer work.";
  });
  return result.ok ? { ...result, data: { codes } } : result;
}

export async function disableTwoStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await mfa.disableTwoStep(getDb(), (await session()).actor, String(fd.get("password") ?? ""), String(fd.get("code") ?? ""));
    return "Two-step verification is off";
  });
}
