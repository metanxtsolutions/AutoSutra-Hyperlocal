# User guide (dealerships)

## Getting started

1. **Register** at `/register` and confirm your email address.
2. **Create your organisation**: independent dealership, dealer group or agency.
3. **Business details**: legal name, GSTIN, billing address and contact. AutoSutra verifies these before any money can be deposited.
4. **Add a dealership** (brands, sales / service / pre-owned, GSTIN) and its **locations**. For each location set the map pin, catchment radius, permitted and excluded PIN codes, the objectives it supports and who receives its leads. If a catchment overlaps another location's, you will see a warning; continuing requires a reason, which is recorded.
5. **Connect advertising accounts** under *Settings → Connections*. You sign in with your own Meta and Google accounts; AutoSutra never asks for your passwords. Until AutoSutra's API access is approved you will see *Demo* or *Access pending*.
6. **Invite your team** under *Team* and give each person a role.
7. **Turn on two-step verification** under *Account → Two-step verification* (recommended for owners and finance users; required for wallet deposits and refund requests). Scan the QR code with an authenticator app, enter the code, and keep the recovery codes somewhere safe.

## On your phone

AutoSutra works in the phone's browser. To get an app icon, open AutoSutra in Chrome on Android and choose **Install app**, or in Safari on iPhone choose **Share → Add to Home Screen**. If AutoSutra gave you an Android app file (APK), you can install that instead.

## Roles

| Role | Typical person | Can |
|---|---|---|
| Owner, Admin | Dealer principal, group marketing head | Everything in the organisation |
| Marketing manager | Marketing lead | Build, approve, publish and pause campaigns; leads; reports; connections |
| Branch manager | Showroom or workshop manager | Build and submit campaigns for their locations; manage leads |
| Sales user | Sales consultant | Work the leads assigned to them |
| Finance user | Accounts | Wallet, deposits, refund requests, invoices, reports |
| Analyst | Read-only | View campaigns and reports |

People can be limited to specific locations; they then see only those locations' campaigns and leads.

## Building a campaign

The builder saves after every step, so you can stop and come back.

1. **Location and objective**: pick where and what (for example new car launch, test drive enquiries, service reminder, pre-owned stock). Objectives a platform cannot run are marked with the reason.
2. **Product and offer**: model, variant, price or offer. Any claim (price, discount, EMI, exchange bonus) must be confirmed as accurate and approved.
3. **Platforms**: Meta, Google or both.
4. **Targeting and audience**: radius around the location, PIN codes, age range.
5. **Budget and schedule**: per platform and per location; lifetime or daily; maximum authorised spend and the alert threshold.
6. **Creative**: headline, text, call to action, landing page, images; previews show how ads may look.
7. **Review and submit**: a checklist shows anything still missing.

## Approval and publishing

- An approver (owner, admin or marketing manager) reviews the full configuration and approves. If someone other than the creator is available to approve, the creator cannot approve their own campaign.
- Approval locks the configuration. **Any change after approval needs a new approval.**
- **Publish** sends the campaign to Meta and Google. Each platform's status is shown separately and exactly as the platform reports it: *Publishing*, *In review*, *Active*, *Paused*, *Rejected*, *Failed*. A campaign is only shown as Active when the platform says so.
- New campaigns are created **paused** on the platforms by default; resume them from the campaign page when you are ready.
- **Demo** means nothing was sent to Meta or Google; it is for practice and shows no results.

## Spend safety

- You receive a notification when reported spend reaches the alert threshold (80% by default).
- When reported spend reaches the maximum authorised spend, AutoSutra pauses the campaign on the platforms automatically. Platforms report spend with a delay, so actual spend can be slightly higher.

## Leads

- Leads arrive from hosted enquiry and test-drive forms, Meta lead forms, manual entry and CSV import.
- Each lead shows its source, campaign, location, consent record and history. Duplicates (same phone or email within 30 days) are linked to the original.
- Move leads through the stages: New, Assigned, Contacted, Follow-up required, Qualified, Test drive scheduled, Test drive completed, Booking, Sold, Lost, Invalid. Response time is measured from capture to first contact.
- If someone asks you to stop contacting them, use **Record consent withdrawal**; their personal details are removed.
- Exporting leads requires permission and is recorded.

## Reports

Reports show Meta and Google separately (they measure differently, see [METRICS.md](METRICS.md)), your lead funnel from AutoSutra records, cost per enquiry and per test drive, and when data was last updated. A warning appears when platform data is more than 6 hours old.

## Money

- **Subscription** invoices appear under *Billing*.
- **Advertising spend** is paid by you directly to Meta and Google on your own ad accounts (dealer-funded). If AutoSutra enables its central wallet for your organisation, you will deposit budgets under *Wallet*, approved budgets are reserved per campaign, and unused funds can be refunded on request.

## Getting help

Open a ticket under *Support*. For urgent issues with a live campaign, pause it first from the campaign page.
