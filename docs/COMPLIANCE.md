# Privacy and compliance notes

**These are engineering notes, not legal advice.** The privacy policy, terms, cookie notice and data processing agreement in this repository are drafts and must be reviewed by Indian counsel before launch.

## Roles under the DPDP Act 2023

| Data | AutoSutra's role | Notes |
|---|---|---|
| Customer user accounts (dealership staff names, emails, phones) | Data fiduciary | Needed to provide the service |
| Leads (enquirers' names, phones, emails, vehicle interest) | Data processor for the dealership | The dealership decides why and how leads are used; AutoSutra processes on its instructions |
| Website visitors (contact form) | Data fiduciary | |
| Billing details (GSTIN, addresses) | Data fiduciary | Retained as required by GST law |

## Consent for leads

- Hosted enquiry and test-drive forms show a consent notice naming the dealership and stating that AutoSutra processes the data on its behalf. Submission without ticking consent is rejected.
- Each consent is stored in `consent_records` with purpose, notice version, the exact notice text shown, source, IP address and time.
- CSV imports require the importer to confirm that consent evidence exists and to name its source; that statement is stored as the consent record.
- Meta instant-form leads carry Meta's own form consent; the lead form's privacy policy link must point to the dealership's policy.
- **Withdrawal**: staff with lead management permission record a withdrawal on the lead; the consent record is closed and the lead's personal data is removed immediately.

## Data subject requests (Data Principal rights)

| Request | How |
|---|---|
| Access / summary | Staff open the lead and export it (lead export respects filters); account holders see their profile under Account |
| Correction | Edit the lead or the user profile |
| Erasure (lead) | *Remove personal data* on the lead (requires `lead.delete`): name, phone, email and message are cleared, consent IP removed, an activity and an audit record are written. Aggregate counts in reports stay correct. |
| Erasure (user account) | Not self-service yet; a super admin suspends the user and removes memberships. A full account deletion routine is on the backlog. |
| Grievance | Publish a grievance officer contact in the privacy policy and respond within the period the Rules require |

Because lead activity notes are append-only, staff must not type personal data into free-text notes beyond what is needed. Anonymisation clears the lead record but not previously written notes; see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Retention

| Data | Default | Mechanism |
|---|---|---|
| Leads | 730 days from capture, then anonymised | Platform setting `lead_retention_days`, applied daily by the automation scan |
| Sessions | 12 hours; expired rows can be purged | |
| Email tokens and OAuth states | Minutes to hours; single use | |
| Audit logs, ledger, invoices, payment events | Retained (financial and legal records; GST law requires at least 72 months after the relevant annual return) | Append-only by design |
| Creative assets | Until the organisation deletes them or closes its account | |

## Subprocessors (to be confirmed at launch)

Keep this list current in the privacy policy and notify customers of changes.

| Subprocessor | Purpose | Data location |
|---|---|---|
| Vercel | Application hosting | Region `bom1` for functions; edge network global |
| Database provider (e.g. AWS RDS ap-south-1) | Primary data store | India |
| Object storage (e.g. AWS S3 ap-south-1 / Cloudflare R2) | Creative files | India / configurable |
| Email provider | Transactional email | Provider-dependent |
| Payment gateway (Razorpay) | Payments, refunds | India |
| Meta Platforms, Google | Advertising delivery and reporting on the customer's own accounts | Global |
| Error monitoring | Diagnostics (configure PII scrubbing) | Provider-dependent |
| Map tile provider | Map images (no personal data sent) | Provider-dependent |

## Advertising policy compliance

- Ads run on the customer's own Meta and Google accounts after the customer authorises AutoSutra through OAuth; AutoSutra never uses a shared account to bypass advertiser verification.
- Offer claims (prices, discounts, EMI, exchange bonus, warranty) require explicit confirmation by an authorised user that the claim is accurate and approved by the manufacturer where required; the confirmation is stored with the approval.
- Finance and EMI ads may fall under platform special ad categories or financial services verification; review before enabling those objectives live.
- No remarketing or customer-list audiences are offered, so no customer personal data is uploaded to ad platforms.

## Cookies

Only strictly necessary cookies are set (`as_session` for sign-in). No analytics or advertising cookies are used, so no consent banner is shown. If analytics are added, update the cookie notice and add consent before setting them.

## Data processing agreement (template outline)

Use this outline for the DPA counsel drafts with each customer:

1. Parties, definitions (DPDP Act 2023 and Rules).
2. Subject matter: processing of lead and campaign data to provide AutoSutra Hyperlocal Ads.
3. Customer instructions; AutoSutra processes only on documented instructions.
4. Categories of data and Data Principals (enquirers, customer staff).
5. Confidentiality of AutoSutra personnel.
6. Security measures (reference [SECURITY.md](SECURITY.md) controls).
7. Subprocessors: current list, notice of changes, flow-down obligations.
8. Assistance with Data Principal requests and breach notification (timelines).
9. Retention and deletion at end of contract; export in CSV.
10. Audit rights and evidence (reports, certifications when available).
11. Cross-border transfer terms (subject to any government restrictions under section 16).
12. Liability, term, governing law.

## Launch compliance checklist

- [ ] Counsel review of privacy policy, terms, cookie notice and DPA.
- [ ] Grievance officer named and contact published.
- [ ] Consent notice wording approved for dealership enquiry forms.
- [ ] Subprocessor list finalised with locations.
- [ ] Breach notification procedure agreed (DPDP Board, CERT-In, customers).
- [ ] GST registration details and invoice format reviewed by a tax adviser.
- [ ] Central wallet: written legal, gateway, platform and tax confirmation (see [FUNDING_MODEL.md](FUNDING_MODEL.md)) before enabling.
