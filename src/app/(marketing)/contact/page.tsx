import type { Metadata } from "next";
import { PageHero, Section } from "@/components/marketing/site-chrome";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { contactAction } from "./actions";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to the AutoSutra team" intro="Questions about the platform, managed advertising or dealer group pricing. We reply within two working days." />
      <Section title="Send us a message">
        <div className="max-w-2xl rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
          <ActionForm action={contactAction} resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Your name" name="name" required autoComplete="name" />
              <TextField label="Work email" name="email" type="email" required autoComplete="email" />
              <TextField label="Mobile number" name="phone" type="tel" autoComplete="tel" hint="Optional" />
              <TextField label="Dealership or company" name="company" autoComplete="organization" />
              <TextField label="City" name="city" />
              <SelectField
                label="I am interested in"
                name="interest"
                options={[
                  { value: "general", label: "General question" },
                  { value: "self_service", label: "Using the platform myself" },
                  { value: "managed_service", label: "Managed advertising" },
                  { value: "dealer_group", label: "Dealer group pricing" },
                  { value: "partnership", label: "Partnership" },
                ]}
              />
            </div>
            <TextAreaField label="Message" name="message" required rows={5} />
            <div className="hidden" aria-hidden>
              <label>
                Leave this empty <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <Checkbox name="consentToContact" label="AutoSutra may contact me by email or phone about this enquiry." hint="We use your details only to respond. See our privacy policy." />
            <SubmitButton>Send message</SubmitButton>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
