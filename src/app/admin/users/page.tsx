import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { SelectField, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listUsers } from "@/server/services/admin";
import { platformRoleAction, userStatusAction } from "../actions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const actor = await requireActor();
  const rows = await listUsers(getDb(), actor, q);
  const superAdmin = actor.user.platformRole === "super_admin";
  return (
    <>
      <PageHeader title="Users and permissions" description="Customer roles are managed by each organisation. Staff roles grant cross-organisation access and are changed only by a super admin." />
      <form method="get" className="mb-4"><input name="q" defaultValue={q} placeholder="Search name or email" className="h-9 w-72 rounded-md border border-ink-200 px-2 text-sm" /></form>
      <Table>
        <THead><tr><Th>User</Th><Th>Organisations</Th><Th>Staff role</Th><Th>Status</Th><Th>Last login</Th><Th></Th></tr></THead>
        <TBody>
          {rows.map(({ user: u, orgs }) => (
            <tr key={u.id}>
              <Td><div className="font-medium">{u.name}</div><div className="text-xs text-ink-500">{u.email}{u.emailVerifiedAt ? "" : " (unverified)"}</div></Td>
              <Td className="text-xs">{orgs.join(", ") || "–"}</Td>
              <Td>{u.platformRole ? <Badge tone="brand">{ROLE_LABELS[u.platformRole]}</Badge> : "–"}</Td>
              <Td><StatusBadge status={u.status} /></Td>
              <Td className="text-xs">{formatDateTime(u.lastLoginAt)}</Td>
              <Td className="text-right">
                {u.id !== actor.user.id && (
                  <div className="flex justify-end gap-2">
                    <Modal trigger={u.status === "active" ? "Suspend" : "Reactivate"} title={`${u.status === "active" ? "Suspend" : "Reactivate"} ${u.email}`} triggerVariant="ghost">
                      <ActionForm action={userStatusAction.bind(null, u.id, u.status === "active" ? "suspended" : "active")}>
                        <TextField label="Reason" name="reason" required />
                        <SubmitButton variant={u.status === "active" ? "danger" : "primary"}>Confirm</SubmitButton>
                      </ActionForm>
                    </Modal>
                    {superAdmin && (
                      <Modal trigger="Staff role" title={`Staff role for ${u.email}`} triggerVariant="ghost">
                        <ActionForm action={platformRoleAction.bind(null, u.id)}>
                          <SelectField label="Role" name="role" defaultValue={u.platformRole ?? ""} placeholder="None (customer only)" options={[{ value: "super_admin", label: ROLE_LABELS.super_admin }, { value: "finance_admin", label: ROLE_LABELS.finance_admin }, { value: "campaign_ops", label: ROLE_LABELS.campaign_ops }]} />
                          <TextField label="Reason" name="reason" required />
                          <SubmitButton>Save</SubmitButton>
                        </ActionForm>
                      </Modal>
                    )}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
