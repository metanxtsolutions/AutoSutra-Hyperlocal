"use server";

import { runAction, type ActionState } from "@/server/actions";
import { currentSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { ValidationError } from "@/server/errors";
import { changePassword } from "@/server/services/auth";

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const s = await currentSession();
    if (!s) throw new ValidationError("Sign in again");
    if (fd.get("newPassword") !== fd.get("confirm")) throw new ValidationError("Passwords do not match", { confirm: "Does not match" });
    await changePassword(getDb(), s.actor.user.id, String(fd.get("currentPassword") ?? ""), String(fd.get("newPassword") ?? ""), s.session.id);
    return "Password changed. Other devices have been signed out.";
  });
}
