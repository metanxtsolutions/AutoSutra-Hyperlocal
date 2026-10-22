import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { SelectField, TextField } from "@/components/ui/fields";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listDealerships } from "@/server/services/dealerships";
import { listInventory } from "@/server/services/inventory";
import { saveItemAction } from "./actions";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  const db = getDb();
  const [items, dealers] = await Promise.all([listInventory(db, actor, orgId), listDealerships(db, actor, orgId)]);
  return (
    <>
      <PageHeader title="Vehicle inventory" description="Stock records for future inventory-based campaigns. Feed and DMS imports and dynamic inventory ads are planned for a later release." />
      <div className="mb-4"><Alert tone="info">Prices shown here are those you enter. AutoSutra never generates prices, offers or specifications.</Alert></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {items.length === 0 ? <EmptyState title="No stock records" /> : (
            <Table>
              <THead><tr><Th>Stock</Th><Th>Vehicle</Th><Th>Year</Th><Th className="text-right">Price</Th><Th>Availability</Th><Th>Updated</Th></tr></THead>
              <TBody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <Td className="text-xs"><code>{i.stockId}</code></Td>
                    <Td>{i.brand} {i.model} {i.variant}{i.detailUrl && <a href={i.detailUrl} rel="noreferrer noopener" target="_blank" className="ml-1 text-xs text-road-600">link</a>}</Td>
                    <Td>{i.year ?? "–"}</Td>
                    <Td className="text-right tabular-nums">{formatINR(i.price, { decimals: false })}</Td>
                    <Td><StatusBadge status={i.availability} /></Td>
                    <Td className="text-xs">{formatDateTime(i.lastSyncedAt)}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </div>
        {can(actor, orgId, "inventory.manage") && (
          <Card>
            <CardHeader title="Add or update stock" description="Same stock ID updates the existing record." />
            <ActionForm action={saveItemAction} resetOnSuccess>
              <SelectField label="Dealership" name="dealershipId" required options={dealers.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose…" />
              <TextField label="Stock ID" name="stockId" required />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Brand" name="brand" required />
                <TextField label="Model" name="model" required />
                <TextField label="Variant" name="variant" />
                <TextField label="Year" name="year" inputMode="numeric" />
              </div>
              <TextField label="Price (₹)" name="price" inputMode="decimal" />
              <SelectField label="Availability" name="availability" options={[{ value: "in_stock", label: "In stock" }, { value: "in_transit", label: "In transit" }, { value: "booked", label: "Booked" }, { value: "sold", label: "Sold" }]} />
              <TextField label="Vehicle page URL" name="detailUrl" type="url" placeholder="https://" />
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
