# Weekwell: implementation plan

Status: **proposal, not built yet**. Nothing in this plan changes the app until a phase is approved.

## 1. The goal

Make a savings amount that you **never have to take back**.

Today the problem looks like this:

1. A few dollars look "spare", so you move money to savings.
2. A bill, an Afterpay instalment or a one-off cost turns up that the plan didn't account for.
3. You withdraw from savings, and the bank drops you to the base interest rate for that month.

Most Australian bonus-interest savers pay bonus interest only in months with **no withdrawals** (and usually a minimum deposit or balance growth). Missing the condition once means the base rate for the whole month. So one withdrawal costs more than its own size.

The withdrawals aren't a willpower problem. They happen because the app (and most budgets) only look at **this week**. The money that seemed spare was already needed for something coming in 3, 6 or 20 weeks.

## 2. The approach, and why

### Options considered

| Approach | Why not (alone) |
|---|---|
| Save a fixed % of pay ("pay yourself first") | Ignores lumpy bills. In a heavy month the % is too much, and you withdraw. This is close to what happens now. |
| Save whatever is left at the end of the week | Reactive. Leftover usually gets spent, and it can't see next month's bills either. |
| Full envelope budgeting (every dollar assigned) | Works, but takes a lot of manual effort every week, which is what makes people stop. |
| **Forecast-based "safe to save" (chosen)** | Looks ahead at every known cost, then only suggests what is provably spare. |

### How "safe to save" works

1. The app knows every money movement it can predict over the **next 52 weeks**:
   - paydays
   - rent and recurring bills, each with a next due date
   - Afterpay instalments
   - one-off commitments
   - quarterly and annual bills (rego, insurance)
   - weekly spending limits
2. It runs a forecast of your everyday balance, week by week.
3. It finds the **lowest point** that balance ever reaches.
4. It searches for the largest **steady amount per pay** that keeps that lowest point above a **safety buffer**.

That amount is the suggestion. By construction, if you save it every pay, the forecast never needs that money back.

The suggestion is recalculated every payday. After a big bill passes, the amount goes up. When a new cost is added, the suggestion goes down, **before** you're short, rather than after.

### Worked example (made-up numbers, not yours)

Assumptions:

- pay: $2,000 fortnightly
- rent: $450 a week
- everyday spending: $250 a week
- phone: $60 a month
- $1,200 one-off due in week 9
- $800 car rego due in week 20
- current balance: $600, with a $500 buffer

| Strategy | Saved per pay | Lowest balance in the year |
|---|---|---|
| "Leftover this fortnight" | $540 | **−$1,100** in week 9: you'd have to withdraw |
| Forecast safe-to-save | $344 | $500 (buffer untouched), and no withdrawal ever |

Saving $344 every pay beats saving $540 and taking $1,100+ back out, losing that month's bonus interest along the way.

### The 3-account setup the app will plan around

The app can't make withdrawals impossible, but this setup removes the reasons for them. It needs one extra account, and most banks offer free ones.

| Account | Holds | Withdrawals |
|---|---|---|
| **Everyday** | This week's spending allowance | Yes, this is the spending money |
| **Bills & buffer** | Money for upcoming bills, Afterpay and annual costs (sinking funds) + safety buffer | Yes, this is the account you *are* allowed to dip into |
| **Locked savings** (bonus saver) | Only the safe-to-save amount | **Never.** The app tracks your no-withdrawal streak |

If something unexpected happens, it comes out of the buffer, never out of savings. The next forecast then refills the buffer before suggesting more savings.

### The payday routine (about 5 minutes per pay)

On payday the app shows a **check-in** screen:

1. Enter the actual balances of your Everyday and Bills & buffer accounts. This corrects any drift between the app and reality.
2. The app shows exact transfers, for example:
   - "Move $X to Bills & buffer"
   - "Move $Y to Locked savings"
   - "Keep $Z in Everyday for this fortnight"
3. Tap "Done" and the transfers are recorded.

Order of priority each payday:

1. Overdue and due-now items
2. Bills, Afterpay and sinking-fund contributions
3. Weekly spending allowance
4. Top up the buffer to its target
5. Safe-to-save to locked savings

## 3. Phases

Each phase is shippable on its own and is reviewed before the next starts.

### Phase 0: Safety net (do first)

- [ ] **Backup/export**: a button to download all data as JSON, plus a restore option. Your real data must be safe before anything changes.
- [ ] Store money as **whole cents** (integers), so no floating-point rounding drift.
- [ ] Move the money maths out of `index.html` into a separate `engine.js` module of plain functions, with automated tests (`node --test`). This is money maths, so every rule gets a test.
- [ ] Split the single long line of JavaScript into readable files.

### Phase 1: Fix the bugs that give wrong numbers

- [ ] Overdue commitments stay in the plan (as due now) instead of disappearing.
- [ ] Week arrows no longer delete spending (removed in Phase 2 anyway).
- [ ] "Other" spending gets its own category instead of counting as Meals out.
- [ ] Edit and delete for logged spending; show the whole week, not just 5 entries.
- [ ] Fix the labels: the edit-limits prompt, and "Entries stay in this browser".
- [ ] Afterpay balance editable; remove the hardcoded "Water" line.
- [ ] Escape names before showing them, so a `<` in a name can't break the page.

### Phase 2: Real dates and history

- [ ] Every transaction gets a real date. Weeks come from the calendar and your payday, not a counter.
- [ ] Move transactions into their own database table (`transactions`), so history isn't capped by the 256 KB state limit.
- [ ] History view: spending per category per week and month, and "where did it go" over the last 4 weeks.
- [ ] The week rolls over automatically. Leftover allowance goes to the buffer, not back into spending.

### Phase 3: Forecast engine and safe to save (the core)

- [ ] Bills get a **next due date** as well as a frequency. You'll be asked to fill these in once.
- [ ] Afterpay purchases: enter the total and first payment date, and the app creates the 4 fortnightly instalments. It warns if any instalment lands where the forecast is short, since Afterpay late fees are $10 + $7, capped at the lower of $68 or 25% of the order.
- [ ] Annual and quarterly bills get sinking funds: a weekly set-aside with a **saved so far** amount. This fixes the "growing reserve" bug.
- [ ] 52-week forecast plus the lowest-point search described above.
- [ ] Safety buffer target, with a suggested default: one fortnight of essential spending, adjustable.
- [ ] Forecast chart: projected balance over coming weeks, with bills marked and the low point highlighted.
- [ ] Main screen headline numbers:
  - **"Safe to spend until payday"**
  - **"Safe to save this pay"**

### Phase 4: Payday check-in and the savings ledger

- [ ] Check-in flow: enter real balances, see the transfer list, confirm.
- [ ] Savings ledger: every deposit recorded, and running total of locked savings.
- [ ] Bonus-interest rules for your account, e.g. "min $X deposit per month, no withdrawals". The app shows "this month: condition met / at risk" and reminds you before month end if a deposit is still needed.
- [ ] No-withdrawal streak counter.
- [ ] If you ever do withdraw, the app asks what it was for. That cost is added to the plan (as a bill or sinking fund) so the same thing doesn't cause a withdrawal again.

### Phase 5: Learning from your real spending

- [ ] After 2–4 weeks of logging, suggest spending limits based on what you actually spend rather than guesses.
- [ ] Monthly review: planned vs actual, interest kept, savings growth.
- [ ] Optional: Afterpay payoff view (what's owed and when it's all clear).

### Later / only if needed

- Login and password, required **before** the app is ever hosted publicly. It stays on localhost until then.
- Bank import (CSV upload from your bank) to reduce manual logging.

## 4. Data model (target)

Configuration stays in the existing `weekwell_state` JSONB, with these new fields:

- `pay`: amount in cents, frequency, next payday
- `bills[]`: amount, frequency, next due date, sinking-fund saved so far
- `commitments[]`: one-off items, and Afterpay purchases with their instalment schedule
- `buffer`: target amount
- `savingsRules`: the bank's bonus conditions

New tables:

- `transactions` (id, date, amount_cents, category, note)
- `checkins` (id, date, everyday_balance, bills_balance, transfers jsonb)
- `savings_events` (id, date, amount_cents, kind: deposit | withdrawal, reason)

Migrations are added as new numbered SQL files (`0002_…`), run by the existing `scripts/migrate.mjs` (to be extended to run every file in order).

## 5. Questions to answer before Phase 3

1. **Your savings account:** which bank/product, and its exact bonus conditions (min deposit? balance must grow? no withdrawals?), so the app checks the right rules.
2. **A Bills & buffer account:** do you have, or are you willing to open, a second account for it? The plan works best with it. Without it, the buffer can live in Everyday, but it's easier to spend by accident.
3. **Payday:** which day, and is the amount always the same?
4. **Buffer size:** is one fortnight of essentials comfortable, or would you rather start smaller and grow it?
