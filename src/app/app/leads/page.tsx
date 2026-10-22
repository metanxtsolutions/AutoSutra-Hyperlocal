import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { can, requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listCampaigns } from "@/server/services/campaigns";
import { listLocations } from "@/server/services/dealerships";
import { LEAD_STATUSES, assignableUsers, listLeads } from "@/server/services/leads";
import { createLeadAction, importAction } from "./actions";

export const metadata: Metadata = { title: "Lead centre" };

const SOURCES = ["meta_instant_form", "google_lead_form", "website_form", "test_drive_form", "phone_call", "whatsapp_click", "manual_upload", "crm_import"];
const sel = "h-9 rounded-md border border-ink-200 px-2 text-sm";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  requireOrg(actor, orgId, "lead.view");
  const db = getDb();
  const [rows, locs, camps, people] = await Promise.all([listLeads(db, actor, orgId, sp), listLocations(db, actor, orgId), listCampaigns(db, actor, orgId), assignableUsers(db, actor, orgId)]);
  const manage = can(actor, orgId, "lead.manage");
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  return (
    <>
      <PageHeader
        title="Lead centre"
        description="Enquiries from ad forms, your website, test-drive forms, calls and uploads. Personal data is handled on your behalf and every lead carries its consent record."
        actions={
          <>
            {can(actor, orgId, "lead.export") && <a href={`/api/leads/export?${qs}`} className="self-center text-sm font-semibold text-road-600">Export CSV</a>}
            {manage && (
              <Modal trigger="Import CSV" title="Import leads from CSV">
                <ActionForm action={importAction}>
                  <p className="text-sm text-ink-600">Columns: name, phone, email, vehicle_model, message, consent_source. Each row must say how the person consented (e.g. “walk-in form signed 12 Oct”). Rows without consent evidence are skipped.</p>
                  <SelectField label="Location" name="locationId" required options={locs.map((l) => ({ value: l.location.id, label: `${l.dealershipName}: ${l.location.name}` }))} placeholder="Choose…" />
                  <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" />
                  <SubmitButton>Import</SubmitButton>
                </ActionForm>
              </Modal>
            )}
            {manage && (
              <Modal trigger="Add lead" title="Add a lead" triggerVariant="primary">
                <ActionForm action={createLeadAction} showSuccess={false}>
                  <SelectField label="Location" name="locationId" required options={locs.map((l) => ({ value: l.location.id, label: `${l.dealershipName}: ${l.location.name}` }))} placeholder="Choose…" />
                  <SelectField label="Source" name="source" options={[{ value: "phone_call", label: "Phone call" }, { value: "manual_upload", label: "Walk-in / manual" }, { value: "whatsapp_click", label: "WhatsApp" }, { value: "crm_import", label: "CRM" }]} />
                  <SelectField label="Campaign (if known)" name="campaignId" placeholder="None" options={camps.map((c) => ({ value: c.campaign.id, label: c.campaign.name }))} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label="Name" name="name" />
                    <TextField label="Mobile" name="phone" type="tel" />
                    <TextField label="Email" name="email" type="email" />
                    <TextField label="Model of interest" name="vehicleModel" />
                  </div>
                  <TextAreaField label="Notes" name="message" rows={2} />
                  <Checkbox name="consentConfirmed" label="The customer agreed to be contacted about this enquiry." />
                  <TextField label="How consent was given" name="consentSource" required hint="e.g. Verbal consent on inbound call, 22 Oct" />
                  <SubmitButton>Add lead</SubmitButton>
                </ActionForm>
              </Modal>
            )}
          </>
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Search</span><input name="q" defaultValue={sp.q} placeholder="Name, phone, email, model" className={sel} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Status</span><select name="status" defaultValue={sp.status ?? ""} className={sel}><option value="">All</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Location</span><select name="locationId" defaultValue={sp.locationId ?? ""} className={sel}><option value="">All</option>{locs.map((l) => <option key={l.location.id} value={l.location.id}>{l.location.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Source</span><select name="source" defaultValue={sp.source ?? ""} className={sel}><option value="">All</option>{SOURCES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Assigned to</span><select name="assignedToId" defaultValue={sp.assignedToId ?? ""} className={sel}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">From</span><input type="date" name="from" defaultValue={sp.from} className={sel} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">To</span><input type="date" name="to" defaultValue={sp.to} className={sel} /></label>
        <button className="h-9 rounded-md bg-ink-900 px-3 font-semibold text-white">Filter</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No leads match" description="Share your location's enquiry form, connect a Meta lead form campaign, or add leads manually." />
      ) : (
        <Table>
          <THead><tr><Th>Received (IST)</Th><Th>Customer</Th><Th>Interest</Th><Th>Location</Th><Th>Source</Th><Th>Assigned</Th><Th>Status</Th></tr></THead>
          <TBody>
            {rows.map((r) => (
              <tr key={r.lead.id}>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.lead.createdAt)}</Td>
                <Td>
                  <Link href={`/app/leads/${r.lead.id}`} className="font-medium text-road-600 hover:underline">{r.lead.anonymisedAt ? "Anonymised" : r.lead.name ?? r.lead.phone ?? r.lead.email}</Link>
                  {!r.lead.anonymisedAt && <div className="text-xs text-ink-500">{r.lead.phone}</div>}
                </Td>
                <Td className="text-sm">{[r.lead.vehicleBrand, r.lead.vehicleModel].filter(Boolean).join(" ") || "–"}{r.campaignName && <div className="text-xs text-ink-500">{r.campaignName}</div>}</Td>
                <Td className="text-sm">{r.locationName ?? "–"}</Td>
                <Td className="text-xs">{humanize(r.lead.source)}</Td>
                <Td className="text-sm">{r.assigneeName ?? "–"}</Td>
                <Td><StatusBadge status={r.lead.status} /></Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
