import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { getDb } from "@/server/db/client";
import { dealerships, locations } from "@/server/db/schema";
import { consentNotice } from "@/server/services/leads";
import { enquiryAction } from "./actions";

export const metadata: Metadata = { title: "Enquire", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Hosted enquiry and test-drive form for a dealership location. Link to it from ads or the dealer's website. */
export default async function EnquirePage({ params, searchParams }: { params: Promise<{ locationId: string }>; searchParams: Promise<{ campaign?: string; type?: string }> }) {
  const { locationId } = await params;
  const { campaign, type } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) notFound();
  const db = getDb();
  const loc = await db.query.locations.findFirst({ where: and(eq(locations.id, locationId), eq(locations.status, "active")) });
  if (!loc) notFound();
  const d = await db.query.dealerships.findFirst({ where: eq(dealerships.id, loc.dealershipId) });
  if (!d || d.status !== "active") notFound();
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">{d.name}</h1>
        <p className="text-sm text-ink-600">{loc.name}, {loc.city}</p>
        <div className="mt-5">
          <ActionForm action={enquiryAction.bind(null, loc.id)} resetOnSuccess>
            <input type="hidden" name="campaignId" value={campaign ?? ""} />
            <SelectField label="I would like to" name="kind" defaultValue={type === "test_drive" ? "test_drive_form" : "website_form"} options={[{ value: "website_form", label: "Make an enquiry" }, { value: "test_drive_form", label: "Book a test drive" }]} />
            <TextField label="Your name" name="name" required autoComplete="name" />
            <TextField label="Mobile number" name="phone" type="tel" required autoComplete="tel" />
            <TextField label="Email (optional)" name="email" type="email" autoComplete="email" />
            <TextField label="Model you are interested in" name="vehicleModel" />
            <TextAreaField label="Message (optional)" name="message" rows={2} />
            <div className="hidden" aria-hidden><input name="website" tabIndex={-1} autoComplete="off" /></div>
            <Checkbox name="consent" label={consentNotice(d.name)} />
            <SubmitButton className="w-full">Send</SubmitButton>
            <p className="text-[11px] text-ink-500">Processed by AutoSutra for {d.name}. See the <a className="underline" href="/privacy">privacy policy</a>.</p>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
