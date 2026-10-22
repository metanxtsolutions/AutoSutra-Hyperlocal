"use server";

import { redirect } from "next/navigation";
import { currentSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { switchOrganisation } from "@/server/services/auth";

export async function switchOrgAction(fd: FormData) {
  const s = await currentSession();
  if (!s) redirect("/login");
  await switchOrganisation(getDb(), s.session.id, s.actor.user.id, String(fd.get("organisationId") ?? ""));
  redirect("/app");
}
