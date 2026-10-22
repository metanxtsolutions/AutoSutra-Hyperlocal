import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ROLE_OPTIONS, labelFor } from "@/lib/catalog";
import { can } from "@/server/auth/context";
import { LOCATION_SCOPED_ROLES, ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listLocations } from "@/server/services/dealerships";
import { listTeam } from "@/server/services/organisations";
import { inviteAction, removeMemberAction, updateMemberAction } from "./actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const actor = await requireOrgActor();
  const db = getDb();
  const orgId = actor.membership.organisationId;
  const [team, locs] = await Promise.all([listTeam(db, actor, orgId), listLocations(db, actor, orgId)]);
  const manage = can(actor, orgId, "team.manage");
  return (
    <>
      <PageHeader title="Team" description="Roles decide what each person can do. Branch managers and sales users can be limited to specific locations." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table>
            <THead><tr><Th>Member</Th><Th>Role</Th><Th>Location access</Th><Th></Th></tr></THead>
            <TBody>
              {team.members.map((m) => (
                <tr key={m.membership.id}>
                  <Td>
                    <div className="font-medium">{m.user.name}</div>
                    <div className="text-xs text-ink-500">{m.user.email}</div>
                  </Td>
                  <Td>{labelFor(ROLE_OPTIONS, m.membership.role)}</Td>
                  <Td>
                    {m.membership.allLocations ? (
                      <Badge>All locations</Badge>
                    ) : (
                      <span className="text-sm">{locs.filter((l) => m.locationIds.includes(l.location.id)).map((l) => l.location.name).join(", ")}</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {manage && m.user.id !== actor.user.id && (
                      <div className="flex justify-end gap-2">
                        <Modal trigger="Edit access" title={`Access for ${m.user.name}`}>
                          <ActionForm action={updateMemberAction.bind(null, m.membership.id)}>
                            <SelectField label="Role" name="role" options={ROLE_OPTIONS} defaultValue={m.membership.role} />
                            <Checkbox name="limitLocations" defaultChecked={!m.membership.allLocations} label="Limit to selected locations" hint={`Applies to ${LOCATION_SCOPED_ROLES.map((r) => labelFor(ROLE_OPTIONS, r)).join(" and ")} only.`} />
                            <fieldset className="grid gap-2 sm:grid-cols-2">
                              <legend className="sr-only">Locations</legend>
                              {locs.map((l) => (
                                <Checkbox key={l.location.id} name="locationIds" value={l.location.id} defaultChecked={m.locationIds.includes(l.location.id)} label={`${l.dealershipName}: ${l.location.name}`} />
                              ))}
                            </fieldset>
                            <SubmitButton>Save access</SubmitButton>
                          </ActionForm>
                        </Modal>
                        <Modal trigger="Remove" title={`Remove ${m.user.name}?`} triggerVariant="ghost">
                          <ActionForm action={removeMemberAction.bind(null, m.membership.id)}>
                            <p className="text-sm">{m.user.name} will lose access to this organisation immediately. Their past actions stay in the audit log.</p>
                            <SubmitButton variant="danger">Remove member</SubmitButton>
                          </ActionForm>
                        </Modal>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
          {team.pending.length > 0 && (
            <Card className="mt-6">
              <CardHeader title="Pending invitations" />
              <ul className="space-y-1 text-sm">
                {team.pending.map((p) => (
                  <li key={p.id}>{p.email} · {labelFor(ROLE_OPTIONS, p.role)} · expires {p.expiresAt.toLocaleDateString("en-IN")}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {manage && (
            <Card>
              <CardHeader title="Invite a team member" />
              <ActionForm action={inviteAction} resetOnSuccess>
                <TextField label="Email" name="email" type="email" required />
                <SelectField label="Role" name="role" options={ROLE_OPTIONS.filter((r) => r.value !== "owner" || actor.membership.role === "owner")} defaultValue="sales_user" />
                <SubmitButton>Send invitation</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card>
            <CardHeader title="What each role can do" />
            <ul className="space-y-3 text-sm">
              {ROLE_OPTIONS.map((r) => (
                <li key={r.value}>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-ink-500">{ROLE_PERMISSIONS[r.value].length} permissions: {ROLE_PERMISSIONS[r.value].slice(0, 6).join(", ")}{ROLE_PERMISSIONS[r.value].length > 6 ? "…" : ""}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
