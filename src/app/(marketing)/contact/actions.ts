"use server";

import { checkbox, formObject, runAction, type ActionState } from "@/server/actions";
import { clientIp } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { submitContactRequest } from "@/server/services/public";

export async function contactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await submitContactRequest(getDb(), { ...formObject(fd), consentToContact: checkbox(fd, "consentToContact") }, await clientIp());
    return "Thank you. We have received your message and will reply within two working days.";
  });
}
