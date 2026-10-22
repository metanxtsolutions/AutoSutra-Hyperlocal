"use server";

import { checkbox, formObject, runAction, type ActionState } from "@/server/actions";
import { clientIp } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { submitPublicEnquiry } from "@/server/services/leads";

export async function enquiryAction(locationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await submitPublicEnquiry(getDb(), { ...formObject(fd), locationId, consent: checkbox(fd, "consent") }, await clientIp());
    return "Thank you. The dealership will contact you shortly.";
  });
}
