# Funding model and ledger

## Two models, one product

| | Dealer-funded (default) | Central wallet (flag `central_wallet`) |
|---|---|---|
| Who pays Meta / Google | The dealership, on its own ad accounts | AutoSutra, from customer deposits held in a client-funds account |
| What AutoSutra records | Planned and approved budgets, maximum authorised spend, provider-reported spend | All of that, plus deposits, reservations, recognised spend, payments to providers, refunds |
| Approval step | Records authorisation; no funds reserved | Reserves the approved budget per platform; waits in *pending funding* if the balance is short |
| Legal / platform review needed | Standard SaaS terms | **Yes, before enabling** (see below) |

Switching the flag changes only the funding step of approval. Campaign building, approval, publishing and reporting are identical in both models.

## Before enabling the central wallet

Do not enable `central_wallet` or `live_deposit_collection` until AutoSutra has written confirmation of all of the following:

1. **Legal**: advice from Indian counsel on whether collecting, holding, pooling and allocating customers' advertising budgets is permitted for AutoSutra's entity, whether it is a regulated payment activity (for example under the Payment and Settlement Systems Act and RBI directions on payment aggregators or prepaid instruments), what contractual structure applies (agency / pure agent / reseller), and how customer money must be segregated.
2. **Payment provider**: the gateway's written approval of this use case and settlement into a designated client-funds bank account, separate from AutoSutra's operating account.
3. **Ad platforms**: confirmation that paying for customers' advertising from AutoSutra's funds complies with Meta's and Google's terms for agencies and advertisers, and the required billing set-up (for example agency credit lines or consolidated billing), without bypassing advertiser verification.
4. **Tax**: GST treatment of advertising budgets (pure agent vs supply), management fees and gateway charges; TDS obligations if any.
5. **Operations**: who reconciles daily, who approves refunds and adjustments, and how overspend is settled with customers.

The admin console repeats this checklist on the feature-flag page, and every flag change requires a reason and typed confirmation.

## Ledger design

- Money is integer **paise** (`bigint`), never floating point.
- Every entry is double-entry and must balance; a **deferred database trigger** rejects any transaction that leaves an entry unbalanced or whose lines do not match the entry amount.
- Entries and lines are **append-only** (triggers block UPDATE and DELETE). Corrections are new compensating entries.
- Every entry has a unique **idempotency key** and a human-readable **transaction id** (`TXN-2026-0000123`). Duplicate webhooks, retried jobs and double clicks cannot double-post.
- Balance checks lock the account row (`SELECT ... FOR UPDATE`) inside the transaction, so concurrent reservations cannot overdraw a balance (covered by a concurrency test).

### Chart of accounts

| Code | Type | Category (brief section 9.1) |
|---|---|---|
| `clearing:gateway:client` | asset | Customer advertising deposits (awaiting settlement) |
| `bank:client_funds` | asset | Customer advertising deposits (settled) |
| `org:{id}:available` | liability | Unallocated balances |
| `org:{id}:reserved:{platform}` | liability | Campaign budget reservations (one per campaign platform, so Meta and Google are separate) |
| `media_payable:{provider}` | liability | Advertising spend / provider-reported charges recognised |
| `org:{id}:refund_pending` | liability | Refunds |
| `suspense:reconciliation` | liability | Reconciliation differences |
| `clearing:gateway:operating`, `bank:operating` | asset | AutoSutra's own receipts |
| `receivable:org:{id}` | asset | Invoices issued, unpaid |
| `revenue:subscription` | revenue | Subscription revenue |
| `revenue:management_fees`, `revenue:setup_fees`, `revenue:addons` | revenue | Advertising management and service fees |
| `tax:gst_output` | liability | Taxes |
| `expense:gateway_fees` | expense | Payment gateway fees |

Customer deposits are **liabilities**, never revenue. Subscription and service invoices are paid into the **operating** clearing account, never into client funds.

### Flows

| Event | Entry |
|---|---|
| Deposit confirmed by verified webhook | Dr gateway client clearing / Cr org available |
| Gateway fee on a deposit | Dr gateway fees expense / Cr gateway client clearing (AutoSutra bears it; customer credited in full) |
| Settlement received | Dr client funds bank / Cr gateway client clearing |
| Campaign approved (funds available) | Dr org available / Cr org reserved (per platform) |
| Provider reports spend | Dr org reserved / Cr media payable (capped at the reservation) |
| AutoSutra pays the provider | Dr media payable / Cr client funds bank |
| Campaign cancelled or completed | Dr org reserved / Cr org available (unspent remainder) |
| Refund approved | Dr org available / Cr refund pending |
| Refund paid | Dr refund pending / Cr gateway clearing (or bank) |
| Refund failed | Dr refund pending / Cr org available |
| Invoice issued | Dr receivable / Cr revenue, Cr GST output |
| Invoice paid | Dr gateway operating clearing / Cr receivable |

### Deposit flow

1. Customer enters an amount (limits: ₹1,000 to ₹10,00,000 per deposit, ₹50,00,000 per month; organisation must be verified).
2. A pending payment and deposit are created and a gateway order is opened (idempotent per request key).
3. The customer pays on the gateway's checkout.
4. The gateway calls `/api/webhooks/payments/{gateway}`. The signature is verified over the raw body; the event id is stored once; the amount must match exactly.
5. Only then is the ledger credited and the deposit marked confirmed, and the customer notified.
6. A browser redirect after checkout never changes any balance.

### Overspend

Provider reporting lags delivery, so spend can exceed a reservation. Recognition is capped at the reservation; the excess appears in reconciliation as `overspend`. Finance proposes an adjustment (charge the customer's available balance, or AutoSutra absorbs it via suspense) and a **different** finance user approves it before anything is posted. In both models AutoSutra also pauses active platforms automatically when reported spend reaches the customer's maximum authorised spend.
