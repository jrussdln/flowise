# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Project structure

Data flows frontend → API → Supabase (the browser never queries the database directly):

```
src/                       React app
  pages/                   Route screens (Dashboard, Login, admin/users, ...)
    shared/overview/       The dashboard + the pages it opens in place of
                           itself: dashboard/ (Dashboard), bills/ (Bills),
                           metrics/ (Metrics), budget-plans/ (Budget Plans)
  services/                API layer — pages call these, never fetch/Supabase
    api.js                 Generic fetch helper for /api/*
    userService.js         User CRUD calls
    authService.js         Login / logout / session restore
    transactionService.js  Income/Expense (tbltransactions) CRUD
    loanService.js         Loans (tblloans) + payment entries
    savingService.js       Savings (tblsavings) CRUD + its deposit entries
    budgetPlanService.js   Budget Plans (tblbudgetplan) CRUD — plain CRUD,
                            no money attached
  context/AuthContext.jsx  Signed-in user + login()/logout() for the app
  components/              Reusable UI (DataTable, Table, Pagination,
                           SummaryCard, Modal, Fields, AccountMenu, ...)
  lib/                     Client-side helpers shared across pages
    kpiStats.js            Arithmetic behind the Income/Expense, Loans and
                           Savings KPI cards (plain functions, no JSX)
    loanSchedule.js        Due-date helpers shared by Loans.jsx and
                           LoanEntriesModal.jsx (nthDue / dueRange /
                           overdueTerms)
    cards.js               Card cosmetics shared by the Loans and Savings
                           grids: colour presets, cardColor()/isFavorite()
                           guards, favourites-first sortCards()

server/                    Express API (local dev + Node hosting)
  routes/                  URL -> controller wiring (users.route.js,
                           auth.route.js, transactions.route.js,
                           loans.route.js, entries.route.js,
                           savings.route.js, budgetPlans.route.js)
  controllers/             Validation + response shaping (user.controller.js,
                           auth.controller.js, transaction.controller.js,
                           loan.controller.js, entry.controller.js,
                           saving.controller.js, budgetPlan.controller.js)
  models/                  Supabase queries — the only code that knows
                           table/column names (user.model.js,
                           transaction.model.js, loan.model.js,
                           entry.model.js, saving.model.js,
                           budgetPlan.model.js)
  utils/                   scrypt password hashing + signed session
                           cookies + schedule helpers (schedule.js:
                           due dates, generated Payment rows,
                           generated Savings rows) + cardMeta.js (the
                           strColor / bIsFavorite columns both card
                           tables share)
  config/supabase.js       Server-side Supabase client (lazy, env-driven)
  app.js                   The Express app: every /api route + JSON errors
                           (shared by both entry points)
  index.js                 Local entry point: boots app.js, serves dist/

api/                       Vercel serverless entry point (production)
  index.js                 The ONE Serverless Function — forwards /api/* to
                           server/app.js. (Hobby plan caps a deployment at 12
                           functions; this project uses 1.)
```

To add an endpoint for a new table: model → controller → route (mount it in `server/app.js`) → a `src/services/<name>Service.js` → page. Vercel runs that same app through `api/index.js`, so nothing else has to change.

### Environment

`.env.example` lists every variable: SMTP (contact form), `PORT`, Supabase (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for the server, `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for the browser), and `SESSION_SECRET` (signs auth session cookies). The server falls back to the `VITE_*` Supabase values if the server-side ones are unset.

## Authentication (login/logout only)

`POST /api/auth/login` ({ `strUserName`, `strPassword` }) verifies against
`tblusers` and sets an **httpOnly** `bms_session` cookie (HMAC-signed, 7 days);
`POST /api/auth/logout` clears it; `GET /api/auth/me` restores the session after
a refresh. The `/login` page redirects to the dashboard on success, and every
route under `PageLayout` waits on `RequireAuth` (in `src/routes/AppRoute.jsx`).

**Per-user data:** `/api/transactions` and `/api/loans` require a signed-in
session and are scoped to the session user — each account only reads/creates/
edits/deletes its own `tbltransactions` / `tblloans` rows (`nUserId` is stamped
server-side from the cookie and ignored if sent in a body). The **Users** tab
+ route are admin-only
(`cType "A"`): hidden in the header/footer nav for other types, and `/users`
bounces non-admins to the dashboard (`RequireAdmin`). `/api/users` is not yet
session-gated — adding `requireUser` + an admin check there is the natural
next step.

Passwords are stored as **scrypt hashes** (`server/utils/password.js`, no extra
dependencies). Rows created before hashing stored plain text and are upgraded
transparently on the user's next successful sign-in. Failed logins are rate
limited per IP (10 / 15 min).

## Loans (tblloans)

The Loans tab renders **cards** (no table) at `/loans`:

- **Create** → the form includes a **Due Date** (required) — the FIRST
  payment date. The server forces `cStatus = "P"` (Pending), stamps `nUserId`
  from the session and assigns `strCode = LON-<id>`. Sending
  `cStatus`/`nUserId`/`strCode` in a body is ignored.
- **Card due range** → the card renders the schedule as *first – last* across
  the terms (`cInterestType`: `D` days, `W` weeks, `M` months, `A` years) —
  e.g. 2 monthly terms picked for Oct 2, 2027 read
  `Oct 2, 2027 - Nov 2, 2027`. An Active loan with **at least one term
  past its due date** shows red `· Overdue` (the same test the Overdue
  Payments KPI sums).
- **Activate** → each Pending card has an Activate button that sends
  `PUT /api/loans/:id { cStatus: "A" }`. `cStatus` only accepts `P`/`A`/`C`
  (Pending / Active / Completed). Activation builds the loan's **payment
  schedule in `tblentries`**: one row per term (`cType "L"`,
  `nReferenceId = nLoanId`, `cStatus "X"` = pending / `"P"` = paid /
  `"L"` = late / `"A"` = advance) with a **flat**-interest installment —
  `total = amount × (1 + rate% × terms)`, each term `total ÷ terms`, last
  term absorbing the rounding so the schedule sums exactly.
- **Remaining balance** → the card title is rendered **uppercase**, set
  **light (weight 400)** and sized just above the code (`0.9rem` against
  `LON-0005`'s `0.75rem`), so the figure right below it can be the loud one:
  the **remaining balance** — every scheduled installment minus what has been settled (`dRemaining`, computed in `listLoans`). A
  Pending loan has no schedule rows yet, so it falls back to the
  installments its current numbers would produce. Riding that same row,
  right after the balance, is the **paid-progress badge** (`9/12`, green
  once everything is settled, hidden until a schedule exists).
- **Paid progress** → the progress used to read `1/12 paid · ₱…` on the
  card; the counts moved into the badge and the paid total dropped out
  (the balance already says what is left). The line below the
  description is now `Amount ₱… · 12% interest · Monthly`. The counts
  come from the list endpoint (`nEntriesTotal` / `nEntriesPaid`, one
  entries query for all cards).
- **Completed (`C`)** → a loan flips to Completed automatically when its
  **last** entry is paid (`PUT /api/entries/:id` keeps it in step, and back
  to Active when one is un-paid). The card gets a blue Completed chip, the
  status filter gains a Completed toggle, and Completed cards keep the
  top-right **View** icon (plus Edit / Delete — Active is the only status
  that hides **Delete**; it keeps Edit for its title / colour /
  description).
- **Card actions** → the icons sit in the card's **upper-right corner, on
  one row**: **View**, **Edit**, **Delete**, then the **favourite star**
  closing the row on the right — all on the same row as the code /
  status chip. **View** only appears once a schedule exists
  (Active / Completed), and an **Active** loan hides **Delete** and opens
  **Edit** with only the presentation fields (title / card colour /
  description / favourite — the schedule is locked, see below). The status
  toggle is a **pill badge in the bottom-right corner, on the same row as
  the created date**: Pending → **Activate**, Active → **Cancel**.
- **Cancel** → an Active card's badge sends
  `PUT /api/loans/:id { cStatus: "P" }` (after a confirm that spells out
  what's lost). The server's `updateLoan` treats **deactivation (A → P)**
  as "this loan owns no schedule": it drops the loan's `tblentries` rows
  **and** the Payment transactions they generated (`clearEntries` →
  `removeByReference` + `removePaymentTransactions`), so nothing is left
  behind. The card then reads **Pending** again — the Edit / Delete icons
  return, and Delete removes the loan outright.
- **Editing an Active loan** → the Edit icon is always present, but for an
  Active loan `LoanAEModal` drops `SCHEDULE_FIELDS` (amount, terms, due
  date, interest period, interest rate) and the page sends only
  `{ strTitle, strDescription, strColor, bIsFavorite }` — skipping the
  schedule validations too. The API enforces the same rule: `updateLoan`
  rejects any schedule field on a row whose `cStatus` is `"A"` with a
  `400` naming the locked fields. Cancel the loan first to rework its
  terms.
- **View** → the icon opens the schedule
  (`GET /api/entries?cType=L&nReferenceId=<id>` —
  read-only; ownership is enforced through the referenced loan since
  entries have no `nUserId`).
- **Repay / PAY / Advance** → each row in that dialog shows its own due
  date (`1. Jun 10, 2027`), and every unpaid row carries a button matched
  to its month: **missed** → red row + **Repay**, **due this month** →
  **PAY** (red row once the day arrives), **due next month or later** →
  **Advance** (blue). The button is visible instead of the Pending badge;
  a paid row keeps its status badge next to an **Undo Payment** button.
  Buttons send `PUT /api/entries/:id { cStatus }` 1:1 with the label:
  Repay → `L` (late payment), PAY → `P` (paid), Advance → `A` (advance
  payment), Undo Payment → `X` (back to Pending — which also flips the
  loan from Completed back to Active if it was the last settled entry).
  Badges: `X` **Pending**, `P` **Paid**, `L` **Late Payment**,
  `A` **Advance Payment**. Foreign entries read as 404, and settled
  statuses (P/L/A) are carried across schedule rebuilds so editing a loan
  never loses recorded payments.
- **Payment transactions** → settling an entry (P/L/A) also writes its row in
  **`tbltransactions`**: `cType "P"` (Payment), `strTitle` =
  `"<loan title> - <due date of that term>"` (e.g. `Car Loan - Nov 2, 2026`),
  `dAmount` = that term's installment ("the amount of the loan in that
  month"), `strDescription` = `Loan Payment`, `strCode` = `TXN-<id>`. The
  entry keeps its id in `tblentries.nTransactionId`, so **Undo Payment**
  (`X`) deletes the row again and re-paying recreates it.
- **Stays in step** → editing an Active or Completed loan rebuilds its
  entries from the current numbers (settled statuses — and their
  `nTransactionId` links — carry over by term position, and each Payment
  row is refreshed to the loan's current title, due date and installment);
  deactivating (A → P) or deleting the loan clears the entries **and their
  Payment rows** (no orphans).
- **Edit** → the due date is **user-owned**: changing `nTerms` or
  `cInterestType` does not move it (the card's range re-derives from it) —
  change the date explicitly in the form if the schedule should shift.
- **Summary row** → four KPI cards: **To Collect** (`dRemaining` summed
  over *Active* loans only — a Pending loan hasn't been handed out, so it
  isn't money owed), **Collected to Date** (`dPaidAmount`, with the
  collection rate against what Active + Completed loans were worth),
  **Active Loans** (count, with the ₱ disbursed and how many are Pending)
  and **Overdue Payments** (terms whose due date elapsed minus terms
  settled — a green *All repayments on track* while it is 0). All four
  come from `computeLoanStats()` in `src/lib/kpiStats.js` and stay put
  while the status filter narrows the cards below.

## Income / Expense (tbltransactions)

The **Income/Expense** tab renders four KPI cards (Total Income / Total
Expense / Net Balance / Savings Rate) over `tbltransactions` — rows are
scoped by `nUserId`, and `strCode` is assigned as `TXN-<id>` on insert.

| `cType` | Label | Meaning |
| --- | --- | --- |
| `I` | Income | money in — added by hand in this tab, or written by a **Transfer to Fund** from a saving's entries modal (description `Transfer to fund`) |
| `E` | Expense | money out |
| `P` | Payment | a loan installment, auto-created by the Loans tab (title `"<loan title> - <due date>"`, amount = that term's installment, description `Loan Payment`) |
| `S` | Savings | a deposit, auto-created by the Savings tab (title `"<saving title> - <date added>"`, amount = the deposit, description `Savings deposit`) |

`P` is money going out and `S` money set aside, so **Total Income sums `I`
and `S`, Total Expense sums `E` and `P`**, and Net Balance = (Income +
Savings) − (Expense + Payment). Every card carries a hint line with the
context the bare number lacks: income and expense show **what landed this
month** (`dttCreated` — undated rows still count in the totals), Net
Balance shows its **margin on income** and turns red when it goes
negative, and **Savings Rate** is `S ÷ income` with the peso figure set
aside. The table's type filter has **Payment** and
**Savings** toggles next to All / Income / Expense, and the column chips
render them in purple and teal (`S` amounts print as a green `+`).

The add/edit dialog only offers **Income** and **Expense** — `P` and `S`
rows are written by the Loans and Savings tabs, so their Edit / Delete
icons render **greyed out and non-clickable** (hovering explains which tab
owns them). A **Transfer to Fund** row is a plain `I` row so it counts as
income, but it is locked the same way: it is only the income half of a
deposit, and deleting it here would leave the saving holding money this tab
no longer accounts for — the tooltip says so, and removing the deposit in
Savings takes the row with it. (The row is recognised by its description,
`Transfer to fund`, matching `TRANSFER_DESCRIPTION` in
`server/utils/schedule.js`.)

## Savings (tblsavings)

The **Savings** tab is the Loans tab minus the schedule. `tblsavings` holds
`nSavingId` (identity PK), `nUserId`, `strCode`, `strTitle`, `strDescription`,
`cStatus`, `dttCreated` — **no amount column (yet)**, so a saving is a titled
goal with a status: the money lives in its deposits, and `GET /api/savings`
adds two derived columns to every row — `dBalance` (the sum of that
saving's deposits) and `nDeposits` (how many there are) — which the cards
and the summary row both read from.

| `cStatus` | Label | How a row gets there |
| --- | --- | --- |
| `P` | Pending | every new saving — `POST /api/savings` forces it (a body-sent status or `nUserId` is ignored) |
| `A` | Active | the card's **Activate** button → `PUT /api/savings/:id { cStatus: "A" }` (from Pending *or* Completed) |
| `C` | Completed | the card's **Complete** button → `PUT /api/savings/:id { cStatus: "C" }` |

The flow is therefore a loop, not a one-way street: **Pending → Active →
Completed → Active**. Re-activating a Completed saving changes nothing but
`cStatus` — its deposits (and their transactions) stay put, so the balance
is still there when it reopens.

- **Cards** show `SAV-0001` (assigned from the identity after insert, like
  `LON-`/`TXN-`), the status chip, title, description and created date. The
  title is rendered **uppercase**, **light (weight 400)** and sized just
  above the code (`0.9rem` against `SAV-0001`'s `0.75rem`), so the
  **balance** underneath it can be the loud one — the sum of
  that saving's deposits (`dBalance`, aggregated for every card in one
  entries query on `GET /api/savings`). The
  **View / Edit / Delete icons sit in the card's upper-right corner, on
  one row with the favourite star at the right end** (View only appears
  once the saving is Active or Completed). **Edit is on every card** —
  Active included — because the dialog only holds presentation fields
  (title / card colour / description / favourite); only **Delete** hides
  while a saving is **Active**, since deposits already hang off it. The
  status toggle is a **pill badge in the bottom-right corner, on the same
  row as the created date**: Pending → **Activate**, Active →
  **Complete**, Completed → **Activate** (reopens it).
- **View** opens the entries modal: a caption with the deposit count and
  total, one row per deposit with a delete button, and an empty state.
  The footer has **two pills** — **Add** and **Transfer to Fund** — and
  both swap the modal content for the same one-field form (Amount);
  saving posts `POST /api/entries { cType: "S", nReferenceId, dAmount }`,
  with `transfer: true` added for the second one.
- **Deposits write two rows**: the entry itself (`cType "S"`,
  `nReferenceId = nSavingId`, `cStatus "A"` — recorded immediately, since
  a deposit has nothing left to pay) and its `tbltransactions` row,
  linked through `tblentries.nTransactionId`. What differs is that row's
  type: **Add** writes `cType "S"` (description `Savings deposit`),
  **Transfer to Fund** writes `cType "I"` (description `Transfer to
  fund`) so the money lands in Income / Expense as **Income**. Either
  way the row is titled `"<saving title> - <date added>"` with
  `strCode = TXN-<id>`. **Deleting the deposit deletes that transaction
  too** — same cleanup rule as undoing a loan payment.
- Active cards show **Complete** as the badge in that date row, with only
  **Delete** hidden from the corner (Edit stays); Completed cards show
  **View** again plus Edit / Delete, and their badge reads **Activate** —
  `PUT { cStatus: "A" }` puts the saving back in circulation.
- **Summary row** → four KPI cards: **Total Saved** (`dBalance` summed
  across every fund, with the fund and deposit counts), **Active Funds**
  (count + the ₱ held in them), **Deposits Made** (count + the average per
  deposit) and **Pending Funds** (count, *Waiting to be activated*). They
  come from `computeSavingsStats()` in `src/lib/kpiStats.js` and ignore the
  status toggle, which narrows the grid below.
- Rows are scoped by `nUserId` exactly like `tblloans`: each user sees only
  their own, and foreign ids read as 404. Entries inherit that ownership
  through the saving behind `nReferenceId`, and the write endpoints are
  split by type: `PUT /api/entries/:id` settles loan entries (`cType
  "L"`) and card repayments (`cType "C"`) and edits budget-plan entries
  (`cType "B"` — their title / amount), `DELETE /api/entries/:id`
  removes savings deposits (`cType "S"`) and budget-plan entries (`cType
  "B"`) — a loan's schedule stays managed by the loan.

## Budget Plans (tblbudgetplan)

The **Budget Plans** page is the Savings tab minus the money. A budget plan
is a **named plan** — title, description, status, colour, favourite flag —
plus the **line items** that make it up (a title and an amount each, held
in `tblentries` as `cType "B"`). A plan carries no balance of its own and
never writes a row to `tbltransactions`: it is a plan, not a movement of
money. It lives in its own table and is opened from the dashboard's
**BUDGET PLANS** button (the dashboard body is swapped for the page, the
same way it does for Bills and Metrics; the page's breadcrumb
`DASHBOARD / BUDGET PLANS` brings it back).

```sql
create table public.tblbudgetplan (
  "nBudgetPlanId" bigint generated by default as identity not null,
  "strCode" character varying null,
  "strTitle" character varying null,
  "strDescription" character varying null,
  "cStatus" character varying null,
  "dttCreated" timestamp without time zone null,
  "nUserId" bigint null,
  "strColor" character varying null,
  "bIsFavorite" boolean null,
  "dBudgetAmount" double precision null,
  constraint tblbudgetplan_pkey primary key ("nBudgetPlanId")
) TABLESPACE pg_default;
```

| `cStatus` | Label | How a row gets there |
| --- | --- | --- |
| `A` | Active | every new plan — `POST /api/budget-plans` forces it (a body-sent status or `nUserId` is ignored) |
| `C` | Used | the card's **Used Plan** button → `PUT /api/budget-plans/:id { cStatus: "C" }` — the plan's entries are posted to the ledger as expenses |
| `P` | Pending | only legacy rows; the **Activate** button sends a plan back to `"A"` |

A plan is **used**, never "finished" for its own sake: using it is what
turns its line items into real expenses. The status chip reads **Active**
or **Used**, and the action pill is **Used Plan** on an Active plan and
**Activate** on a used one.

### Using a plan (Active → Used → Active)

**Used Plan** (`cStatus "C"`) posts the plan's entries to the ledger:
each line item becomes an **Expense** row in `tbltransactions` (cType
`"E"`, titled `"<plan title> - <entry title>"` with the description
`"Budget plan expense"`), and the entry is linked to it through
`nTransactionId` (its `cStatus` flips from `"P"` to `"A"`, the
savings-deposit convention for a recorded row). The card that funded
the plan is carried on the row (`nCardId`) when one was picked.

- **The balance gate** → using a plan opens
  **`BudgetPlanUsedPlanModal`** (the "money step"): the same **Pay With**
  panel the savings deposit form uses.
  - **Current Balance** — the ledger balance minus the money already
    sitting on the user's debit cards (`currentBalanceOf()` in
    `src/lib/kpiStats.js`). It reads *Insufficient* in red when it does
    not cover the plan's total, and the footnote spells the formula out
    ("Current Balance = Total Balance − balances held on your debit
    cards.").
  - **Cards (Select)** — the user's debit cards and what each of them
    holds; a card that cannot cover the plan is not pickable, and the
    note asks for "a card with a sufficient balance".
  - The ✓ button stays disabled until the chosen source covers the
    plan's total, and the red note says why it cannot go through.
  - Picking a **card** also links it to the plan's expense rows, so that
    card's balance takes the deduction — the same rule the savings
    deposit and the loan installment follow. The server checks the card
    anyway: it must be the caller's and it must be a **debit** card
    (a credit card or a foreign id is refused with a 400, and nothing
    is written).
- **The entries lock** → a used plan's entries are expenses now, so
  adding, editing or deleting one is refused (400) and the modal hides
  the Add / Edit / Delete controls, showing a **Posted** badge per row
  instead. Activating the plan again unlocks them.
- **Activate again** (`cStatus "A"`) takes the plan's expenses back out
  of the ledger: the transaction rows are deleted, the entries drop
  their `nTransactionId` and return to `"P"`.
- **In the Transactions tab** the generated rows are locked (like the
  loan payments and savings deposits): the marker is the
  `"Budget plan expense"` description, and the hint says to activate
  the plan to remove them.
- **Deleting a plan** takes its entries **and** the expenses they
  wrote with them — the same cleanup rule the savings controller applies
  to a fund's deposits.

| Endpoint | Does |
| --- | --- |
| `GET /api/budget-plans` | the signed-in user's rows, newest first — each row carries the derived `dTotal` (the sum of its entries) and `nEntries` (how many) |
| `GET /api/budget-plans/:id` | one row (a foreign id reads as 404) |
| `POST /api/budget-plans` | creates a plan — `strCode` is stamped `BUD-<id>` after insert, `cStatus` forced to `"P"`, `nUserId` taken from the session cookie |
| `PUT /api/budget-plans/:id` | partial update — `{ cStatus }` for the status badge, `{ bIsFavorite }` for the star, `{ dBudgetAmount }` for the plan's figure, the presentation fields for the dialog |
| `DELETE /api/budget-plans/:id` | removes the row **and its line items** (the `cType "B"` entries behind it) |

- **`dBudgetAmount`** is what the plan is budgeted for — **optional**. It
  is a number of zero or more; an empty field clears it (`null`). The
  card leads with it when it is set (the entries' sum rides underneath as
  `₱1,800 planned · 3 entries`); a plan without one leads with the
  entries' sum instead.

### Plan entries (tblentries, cType "B")

Each plan holds **line items** — a title and an amount — written straight
into `tblentries` with `cType "B"`, `nReferenceId = nBudgetPlanId`,
`cStatus "P"` and **`nTransactionId` left null**: a plan is a plan, so
it never writes a ledger row and never touches the transactions tab.

| Endpoint | Does |
| --- | --- |
| `GET /api/entries?cType=B&nReferenceId=<planId>` | the plan's line items, oldest first (a foreign plan reads as 404) |
| `POST /api/entries { cType:"B", nReferenceId, strTitle, dAmount }` | adds one line item — the title is required, the amount must be a number above zero, and the server writes `cStatus "P"` with no transaction link |
| `PUT /api/entries/:id { strTitle?, dAmount? }` | edits one line item — partial update, so a key left out keeps its stored value; the entry's `cStatus` ("P") and its (empty) transaction link are never touched |
| `DELETE /api/entries/:id` | removes one line item (there is no ledger row behind it to clean up) |

- **View** (the eye icon in the card's upper-right corner) opens the
  plan's entries: the caption carries the plan's title, the entry count
  and the total, every row shows its **title** and **amount** with an
  **edit** and a delete button, and a **Total** row closes the list.
- **Add** (the pill in the modal's footer) swaps the dialog's content
  for the two-field form — **Title** and **Amount** — and the ✓ button
  posts the entry. ✕ goes back to the list instead of closing the dialog.
- **Edit** (the pencil on a row) opens the same two-field form,
  prefilled with that row, and ✓ saves the change. A budget-plan entry
  is not a payment, so it has no status to settle — the only things to
  change are its title and its amount.
- The card itself shows the **planned total** (`dTotal`, the sum of the
  plan's entries) under the title, with the entry count beneath it — the
  same slot the Savings card gives its balance. With a `dBudgetAmount`
  set, that figure is the headline instead and the total rides under it
  (`₱1,800 planned · 3 entries`). The list endpoint aggregates every
  plan's entries in one query (like the savings one), so the grid never
  makes a request per card.
- **Delete a plan** takes its line items with it — the same cleanup rule
  the savings controller applies to a fund's deposits.
- The add/edit dialog carries a **Budget amount** peso field (the
  plan's own `dBudgetAmount` — clear it to drop the figure).

### The cards

- **Cards** show `BUD-0001` (assigned from the identity after insert, like
  `LON-`/`SAV-`), the status chip, the uppercase title, the plan's
  figure, the description and the created date. The **View / Edit /
  Delete icons sit in the card's upper-right corner, on one row with the
  favourite star at the right end**, and the status toggle is a **pill
  badge in the bottom-right corner, on the same row as the created
  date**: Active → **Used Plan** (posts its entries as expenses),
  Used → **Activate** (takes those expenses back out).
- **Delete** is always available — the plan takes its entries (and the
  expenses they wrote) with it.
- **Search + status filter** narrow the grid (the filter shows the per
  status counts — All / Active / Used / Pending), and favourites pin to
  the top of the grid
  (`sortCards(rows, "nBudgetPlanId")`, the same helper the Loans and
  Savings grids use).
- **Cosmetic columns** — `strColor` (a colour code, `G`/`R`/`B`/… or a
  legacy hex) and `bIsFavorite` are the same two columns the Loans and
  Savings cards carry, validated once in `server/utils/cardMeta.js` and
  read through `src/lib/cards.js`.
- **Rows are scoped by `nUserId`** exactly like `tblloans` / `tblsavings`:
  each user sees only their own, and foreign ids read as 404.

## Card cosmetics (colour + favourites)

`tblloans`, `tblsavings` and `tblbudgetplan` carry the same two
user-owned, purely cosmetic columns — validated once in
`server/utils/cardMeta.js`, read by the pages through `src/lib/cards.js`:

| Column | Meaning |
| --- | --- |
| `strColor` | Accent colour: a 4px bar down the card's left edge **and** the colour of its `LON-…` / `SAV-…` code. Holds an **enumerated code** — one letter exactly like the interest period's `D/W/M/A`: `G` Green, `R` Red, `B` Blue, `Y` Yellow, `O` Orange, `P` Purple, `T` Teal, `S` Slate — or `null` for the plain border. A raw `#rgb` / `#rrggbb` is still accepted (rows written before the codes existed keep their colour and show up as a "Custom" option in the dialog); anything else comes back `400` with `errors.strColor`. |
| `bIsFavorite` | Pins the card to the **top of the grid**. Nullable — only a real `true` counts as favourited. |

- **Star** → every card has a star at the **far right of the icon row**,
  straight after View / Edit / Delete (filled amber when on). It
  sends `PUT /api/loans/:id` / `PUT /api/savings/:id` /
  `PUT /api/budget-plans/:id` with just `{ bIsFavorite: <next> }` and
  refreshes the grid **silently** (no skeleton
  flash). It stays clickable on **Active** cards, whose Delete is hidden —
  pinning is cosmetic, deleting isn't.
- **Order** → favourites first, then newest first (the id order the list
  endpoint already returns). `sortCards(rows, "nLoanId" | "nSavingId" |
  "nBudgetPlanId")` runs *after* the status filter, so the KPI cards
  still count every row.
- **In the dialog** → Add/Edit gained a **Card colour** select (enumerated
  codes — `None`, `Green` → `G`, `Red` → `R`, … — each row showing its
  swatch **and** the stored letter, plus a live swatch ahead of the label;
  `FieldsComponent`'s `color` type) and a **Favourite** switch.
- **Server side** → `applyCardMeta()` folds both columns into each
  controller's `values` / `errors`: on create they default to `null` /
  `false`, on update they are only touched when the key is present, so a
  partial update never wipes them. A write that touches **only** these two
  (`isPresentationOnly()`) skips the loan's schedule sync — no number
  changed, so `tblentries` is left alone (checked against the live DB: the
  schedule's entry ids are identical before and after a star toggle).

Both models already `SELECT *`, so the columns reach the client without a
query change, and rows written before this feature (`null` in both
columns) simply render uncoloured and unpinned.

## Summary cards (KPIs)

`src/components/ui/SummaryCard.jsx` is the one card all three tabs use
(they each used to carry their own copy): uppercase label, big value, an
optional **hint line** underneath — the context that makes the number mean
something — and the icon on the right. Its `SummaryGrid` companion lays
them out 1-up on phones, 2-up on tablets and 4-up from `lg`.

| Tab | Cards |
| --- | --- |
| Income / Expense | Total Income · Total Expense · Net Balance · Savings Rate |
| Loans | To Collect · Collected to Date · Active Loans · Overdue Payments |
| Savings | Total Saved · Active Funds · Deposits Made · Pending Funds |

The arithmetic lives in `src/lib/kpiStats.js` — `computeTransactionStats()`,
`computeLoanStats()`, `computeSavingsStats()` are plain functions over the
rows the list endpoints already return, so they can be checked without
rendering anything. `src/lib/loanSchedule.js` holds the date helpers
(`nthDue`, `dueRange`, `overdueTerms`), shared by `Loans.jsx` and
`LoanEntriesModal.jsx` instead of being copied into both. **The cards
always cover every row** — the status / type filters only narrow the list
underneath.

One MUI v9 trap this code had fallen into: `Stack` no longer honours
`justifyContent` / `alignItems` as props — they leak onto the DOM as
attributes and never become CSS, so React logs a "does not recognize the
prop" warning and the layout stays left-packed. They go in `sx`.

## Loading states (skeletons)

Every list that used to show a spinner (or a "Loading …" line) now paints a
**skeleton shaped like the real content**, so the page doesn't jump when the
data lands. The components live in `src/components/ui/AppSkeleton.jsx`, with
the shared bar style in `src/components/ui/skeletonStyles.js` (`--text-muted`
at 30% — a colour defined for **both** themes, unlike MUI's raw default,
which all but disappears on the navy dark theme).

| Where | Skeleton | Replaces |
| --- | --- | --- |
| Loans / Savings card grids | `CardGridSkeleton` (6 placeholder cards) | "Loading loans…" / "Loading savings…" |
| Shared `DataTable` (Income/Expense, admin Users) | 5 rows, one bar per column | `CircularProgress` + "Loading data..." |
| Loan schedule & savings deposit dialogs | `RowsSkeleton` (4 rows) | `CircularProgress` + "Loading entries…" |

Buttons keep their small inline spinner while a write is in flight — that
signals an action, not a list loading.

## Modals (bubble UI)

`src/components/ui/ModalComponent.jsx` paints every dialog as detached rounded
"bubble" pieces instead of one header/body/footer card:

- a standalone circular **type icon** on top — `type="add" | "edit" | "delete" | "view"`,
- a **title bubble** (title plus an optional `subtitle`),
- the **content bubble** (body; scrolls on its own past ~70vh),
- a bottom row of **standalone circles**: ✕ to cancel/close and ✓ to save,
  tinted by the modal type (blue / amber / red / indigo).

The labeled `Cancel` / `Create …` footer buttons are gone: forms now pass
`onSave` + `saving` instead of `actions`, and the labels moved to the circles'
tooltips (`saveLabel`, e.g. "Create loan"). Buttons that don't fit either
circle still live in a rounded pill beside them through the optional `actions`
slot — only the savings deposit dialog uses it, for its **Add** and
**Transfer to Fund** pills. `onCancel` replaces what ✕ does, so backing
out of a nested form doesn't close the dialog (savings: ✕ returns from
the deposit form to its list).

| Dialog | `type` | Footer |
| --- | --- | --- |
| Loan / Saving / Transaction / User add-edit | `add` or `edit` | ✕ + ✓ |
| Loan & savings entries | `view` | ✕ (+ **Add** / **Transfer to Fund** pills on savings) |

## Form fields

`src/components/ui/FieldsComponent.jsx` keeps its `fields` / `values` /
`onChange(name, value)` API and gained the richer field types:

| `type` | Behaviour |
| --- | --- |
| `peso` | ₱ adornment, digits only while typing, grouped + 2 decimals on blur (Loan Amount, transaction Amount) |
| `color` | select of the enumerated colour codes (`None`, `Green` → `G`, `Red` → `R`, …) led by a live swatch of the current value, with the stored letter shown beside each label (Card colour on the loan / saving dialogs — see `colorOptions()` / `colorHex()` in `src/lib/cards.js`) |
| `date` / `time` / `datetime-local` | reads `Oct 02, 2026` until focused, then the native picker — a click on the field arms **and** opens it |
| `select` | searchable pop-up above 8 options, skeleton rows while `loading`, "No data available" when a search matches nothing |
| `password` / `email` / `phone` / `username` / `tin` / `bank` | leading icon (eye toggle for password, digits-only for phone/bank, grouped PH TIN) |
| `label` / `checkbox` / `custom` | section heading, checkbox row, or a hand-written `render()` block |

Also: an optional `errors` map rendered as helper text, `switches` rows for
toggles, and Enter/Tab moving on to the next field (Shift+Tab still walks
backwards).

## Contact form (SMTP)

The Contact section posts to `POST /api/contact` with `{ email, message }`, which sends
the message through Gmail SMTP with `Reply-To:` set to the visitor.

| Environment | Handler | Notes |
| --- | --- | --- |
| Development (`npm run dev`) | `server/index.js` (Express) | Vite proxies `/api` → `localhost:3001` |
| Production (Vercel) | `api/index.js` → `server/app.js` | One Serverless Function runs the whole Express app |
| Production (any Node host) | `server/index.js` | Also serves the built `dist/` folder |

**Local setup**

1. `cp .env.example .env` and fill in `SMTP_USER`, `SMTP_PASS` (a Gmail [App Password](https://myaccount.google.com/apppasswords)), and optionally `CONTACT_TO_EMAIL`.
2. `npm run dev` — runs the API server and Vite together.
3. Test it: `curl -X POST http://localhost:3001/api/contact -H "Content-Type: application/json" -d '{"email":"you@example.com","message":"Hello from the contact form test!"}'`

**Vercel setup**

1. Import the repo — build command `vite build`, output directory `dist` (auto-detected). `vercel.json` already rewrites `/api/*` to the single function in `api/index.js` and everything else to `index.html` (SPA fallback).
2. Project → Settings → Environment Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CONTACT_TO_EMAIL` (plus `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` — `.env` is not deployed).
3. Redeploy. The form then calls `https://<your-domain>/api/contact`.

There is deliberately only **one** function: the Hobby plan allows 12 Serverless Functions per deployment, and every file under `api/` counts as one. Never add a second file under `api/` (put new endpoints in `server/routes/*.route.js` instead).

Never commit `.env` — it is gitignored. Keep the app password out of client-side code.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
