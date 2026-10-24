import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { FilterBar, FilterInput, FilterSearch, FilterSelect } from "@/components/ui/filter-bar";
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
            {can(actor, orgId, "lead.export") && <a href={`/api/leads/export?${qs}`} className={buttonClass("ghost")}><Download />Export CSV</a>}
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
      <FilterBar resetHref="/app/leads" active={Object.values(sp).some(Boolean)}>
        <FilterSearch defaultValue={sp.q} placeholder="Name, phone, email, model" />
        <FilterSelect name="status" label="Status" defaultValue={sp.status} options={LEAD_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
        <FilterSelect name="locationId" label="Location" defaultValue={sp.locationId} options={locs.map((l) => ({ value: l.location.id, label: l.location.name }))} />
        <FilterSelect name="source" label="Source" defaultValue={sp.source} options={SOURCES.map((s) => ({ value: s, label: humanize(s) }))} />
        <FilterSelect name="assignedToId" label="Assigned to" allLabel="Anyone" defaultValue={sp.assignedToId} extra={[{ value: "unassigned", label: "Unassigned" }]} options={people.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterInput type="date" name="from" label="From" defaultValue={sp.from} />
        <FilterInput type="date" name="to" label="To" defaultValue={sp.to} />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No leads match" description="Share your location's enquiry form, connect a Meta lead form campaign, or add leads manually." />
      ) : (
        <>
        <ul className="space-y-3 md:hidden">
          {rows.map((r) => (
            <li key={r.lead.id}>
              <Link href={`/app/leads/${r.lead.id}`} className="block rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink-950">{r.lead.anonymisedAt ? "Anonymised" : r.lead.name ?? r.lead.phone ?? r.lead.email}</div>
                    <div className="truncate text-xs text-ink-500">{[r.lead.vehicleBrand, r.lead.vehicleModel].filter(Boolean).join(" ") || "No model given"} · {r.locationName ?? "No location"}</div>
                  </div>
                  <span className="flex-none"><StatusBadge status={r.lead.status} /></span>
                </div>
                <div className="mt-2 flex justify-between gap-3 text-xs text-ink-500">
                  <span>{humanize(r.lead.source)}{r.assigneeName ? ` · ${r.assigneeName}` : ""}</span>
                  <span className="whitespace-nowrap">{formatDateTime(r.lead.createdAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <Table className="hidden md:block">
          <THead><tr><Th>Received (IST)</Th><Th>Customer</Th><Th>Interest</Th><Th>Location</Th><Th>Source</Th><Th>Assigned</Th><Th>Status</Th></tr></THead>
          <TBody>
            {rows.map((r) => (
              <tr key={r.lead.id}>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.lead.createdAt)}</Td>
                <Td>
                  <Link href={`/app/leads/${r.lead.id}`} className="font-medium text-ink-950 hover:text-road-600">{r.lead.anonymisedAt ? "Anonymised" : r.lead.name ?? r.lead.phone ?? r.lead.email}</Link>
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
        </>
      )}
    </>
  );
}
