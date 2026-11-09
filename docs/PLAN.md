# Weekwell: plan

Phases 0–3 are **built**, and Phase 4 onward is a proposal. This page explains the money system the app is being built around, and why.

> General information to help you organise your own money, not personal financial advice. Bank rates and conditions change, so confirm them in the Up and CommBank apps before relying on them.

---

## 1. The problems we're solving

1. **Savings keep getting withdrawn.** Money looks spare today, so it goes into savings. Then a bill, an Afterpay instalment or a surprise turns up, and it comes back out. Each withdrawal can cost that month's bonus interest.
2. **Wanting things** (e.g. a ~$1,000 DDJ controller) with no way to know *if* or *when* you can buy it without hurting savings, which leads to impulse buys.
3. **Emergencies** have nowhere to come from except savings.
4. **Lots of upcoming payments**, and a temptation to cover them with a credit card.

All four have the same root cause. **Every dollar sits in one pile with no job.** Bill money, fun money, emergency money and long-term savings are mixed together, so you can't tell which dollars are safe to use.

## 2. What the research says

### Proven budgeting systems

- **YNAB's four rules**, among the most widely used budgeting methods:
  - give every dollar a job
  - embrace your true expenses (set aside for irregular bills before they arrive)
  - roll with the punches (overspent? move money from another category, don't abandon the plan)
  - age your money (spend money that came in a while ago, not today's pay)
- **Barefoot Investor "buckets"**, the most popular system in Australia:
  - day-to-day (~60%)
  - a "Fire Extinguisher" for problems and debt (~20%)
  - "Splurge" for treats (~10%)
  - "Smile" for bigger wants (~10%)
  - a separate "Mojo" emergency fund that starts around $2,000 and grows toward 3–6 months of expenses

  Scott Pape himself says the percentages are a rough guide.
- **Sinking funds:** irregular but expected costs (rego, insurance, gifts) become a small fixed weekly amount. When the bill comes, the money is already there.
- **Emergency fund:** the common guidance is about 3 months of essential expenses, more if income varies. Build a smaller starter amount first.

### Behaviour studies (why the structure matters more than willpower)

- **Earmarking / mental accounting** (Thaler; Soman & Cheema 2011): people are much less likely to spend money that is labelled and kept apart for a purpose. A pot named "Car rego" or "DDJ" gets raided far less than a general "savings" balance.
- **Commitment devices** (Ashraf, Karlan & Yin 2006): savers who chose to lock money away saved significantly more than those who kept access. The lock works because it removes the decision.
- **Save More Tomorrow** (Thaler & Benartzi 2004): committing in advance to save a steady amount works far better than deciding each time.
- **Cooling-off periods:** waiting before a purchase (e.g. 24 hours for small items, 30 days for big ones) is a widely used practitioner rule against impulse buying. The urge usually fades, and the things you still want afterwards are the ones worth planning for.

### Your banks

**Up: ordinary Savers** (5.35–5.6% p.a. reported for late 2026, up to $250k):

- You need **5 card purchases** from Up in a calendar month.
- A **Saver you withdraw from that month drops to the low "Flow" rate**. Reports say this applies only to the Saver you touched, not all of them.
- Missing the 5 purchases may lower the rate on *all* Savers that month.

This is the key finding. **Up lets you keep several separate Savers, and touching one doesn't hurt the others.** That makes Up a natural fit for the bucket system: one Saver for long-term savings that you never touch, and separate Savers for things you're allowed to use.

**CommBank GoalSaver** (about 4.9–5.25% p.a. reported):

- Bonus paid if you make **at least one deposit** in the month **and** finish the month with a **higher balance** than you started with.
- A withdrawal is OK if you deposit more than you took out that month.
- It's one account, though, so all your money mixes together again.

**Recommendation:** keep long-term savings in a dedicated Up Saver, and use other Up Savers as the "allowed to touch" pots. Keep CommBank Smart Access as your low-balance "subscription trap", which is a good trick you already use. Make sure at least 5 everyday purchases a month go on your Up card.

### Credit card: recommendation is **not now**

- A card doesn't create money. When upcoming payments exceed what you have, a card fills the gap by borrowing. Typical Australian card rates are about 20–27% p.a.
- Interest-free days only apply if you **pay the full balance** every statement.
- You're already juggling Afterpay. Adding a second credit line tends to repeat the same pattern with more expensive money.
- The forecast (Phase 3) shows a cash crunch **weeks in advance**, so it can be planned around instead of borrowed through.
- If you want a card later: only once your buffer and starter emergency fund exist. Pick a no or low annual fee card, set autopay to the **full** balance, and only buy things already in the plan.

## 3. The system: five pots

| Pot | Where it lives | What it's for | Allowed to touch? |
|---|---|---|---|
| **Everyday** | Up Spending | This week's spending allowance and bill auto-debits | Yes |
| **Bills & buffer** | Up Saver | Sinking funds for irregular bills + a small buffer for little surprises | Yes, for bills and small surprises |
| **Emergency fund** | Up Saver | Real emergencies only (car breakdown, medical, urgent travel, losing income) | Only in a real emergency |
| **Wants** | One Up Saver per goal (e.g. "DDJ") | Planned purchases | Yes, when the goal is reached |
| **Locked savings** | Up Saver | Long-term savings | **Never**. The app tracks your streak |

Because each pot is a separate Up Saver, using Bills & buffer or the DDJ Saver doesn't change the interest on Locked savings.

### How each pay is split (worked out by the app)

The forecast looks 52 weeks ahead at every known payment, then fills the pots in this order:

1. Overdue and due-now payments
2. Bills, Afterpay and sinking-fund amounts
3. Everyday spending allowance
4. Top up **Bills & buffer** to its target
5. Whatever is provably spare is the **safe-to-save** amount, split between:
   - **Locked savings**: your committed amount, which stays steady every pay
   - **Emergency fund**: until it reaches its target, then this share moves to savings or wants
   - **Wants**: funds your goals in priority order

You choose the split, and the app suggests one. For example, while the emergency fund is building: 40% savings / 40% emergency / 20% wants. Once it's full: 70% savings / 30% wants.

### Planned purchases (the DDJ example)

Add a want with its price. The app then shows one of two answers.

1. **"You can buy it now"**, but only if *both* are true:
   - the 52-week forecast stays above your buffer after paying for it today, **and**
   - your committed savings amount per pay doesn't go down.

   "No upcoming payments today" isn't enough on its own. Money that looks free now may be needed in 6 weeks, and the check looks a year ahead.
2. **"Ready on 14 Feb"**, based on what the Wants share puts aside each pay. It also shows ways to get there sooner, e.g. "lower Meals out by $20/week and it's ready 3 weeks earlier."

**Cooling-off:** a new want waits before "Buy" unlocks:

- 24 hours under $100
- 7 days up to $500
- 30 days above $500

If you still want it afterwards, it becomes a goal with a date. **Your locked savings are never used to buy wants.**

### What to do in each situation

| What happens | Money comes from | What the app does next |
|---|---|---|
| Small surprise (parking fine, extra groceries) | Bills & buffer | Next pay refills the buffer **before** anything else |
| Overspent a category | Another category this week, or the buffer | Shows it in History so the limit can be fixed |
| Real emergency (car, medical, urgent travel) | Emergency fund | Refills it from the **wants** share first, so your committed savings amount stays the same |
| An emergency bigger than the emergency fund | Emergency fund, then Locked savings as a last resort | This is what savings are for, and it's still better than debt at 20%+ |
| Pay is late or smaller | Buffer | Safe-to-save pauses for that pay instead of you withdrawing later |
| Annual bill (rego, insurance) | Its sinking fund in Bills & buffer | Already saved weekly, tracked as "saved so far" |
| Want something | Wants pot for that item | Cooling-off, then a purchase date |
| "It's on sale!" | Only the wants pot | A deal only counts if the item was already on your list |
| Afterpay offer | — | Shows all 4 instalments in the forecast. Rule: if it fails "buy it now" as cash, it fails as Afterpay too |
| Windfall (tax refund, bonus, gift) | — | Suggests: top up emergency fund first, then split between savings and wants |
| New subscription | — | Shows the yearly cost and adds it to the forecast before you commit |

---

## 4. Phases

### ✅ Phase 0: Safety net (built)

- [x] **Backup → Download backup** saves everything as a JSON file. **Restore** loads one, after automatically snapshotting the current data first.
- [x] Automatic snapshot of your original data before it's converted to the new format, in the `weekwell_backups` table.
- [x] All money stored as whole cents.
- [x] Money maths in `src/engine.js` with automated tests: `npm test`, 18 tests including the server ones.
- [x] Readable code split into separate files.
- [x] Fixed: the migration runner never actually ran SQL (`sql.unsafe` doesn't execute in this driver).

### ✅ Phase 1: Wrong-number bugs (built)

- [x] Overdue payments stay in the plan as "needed now" and are highlighted, instead of disappearing.
- [x] Week arrows browse weeks instead of deleting spending. The destructive "Reset week" button is removed.
- [x] "Other" is its own category, and categories can be added, renamed (past entries follow) or removed.
- [x] Spending can be edited and deleted, every entry for the week is shown, and entries can be logged on past dates.
- [x] Afterpay balance editable, payment type selectable, hardcoded "Water" line removed.
- [x] Fixed labels ("saved to your database", not "browser"), and names are escaped safely.
- [x] Settings: pay, next payday, and which day weeks start (tip: your payday).

### ✅ Phase 2: Real dates and history (built)

- [x] Every entry has a real date and is stored in its own table, kept indefinitely.
- [x] Weeks follow the calendar. A new week starts automatically and nothing is deleted.
- [x] History: the last 8 weeks against your limits (tap a week to open it), and average per week per category over the last 4 full weeks.

### ✅ Phase 3: Forecast and the five pots (built)

- [x] **Looking ahead** panel: a 365-day day-by-day forecast of the money you can spend, which is CommBank + Up Spending + the Bills & buffer Saver.
- [x] **Safe to save each pay**: the largest steady amount that never lets money drop below your buffer. Tested so that $1 more per pay would break the buffer.
- [x] **Lowest point ahead**, with a chart (hover or tap for any day's balance and what comes out) and a list of everything coming out in the next 8 weeks.
- [x] **Tight time ahead** warning when the forecast dips below the buffer even with no saving, weeks before it happens.
- [x] Uses your *actual* spending average when it's higher than your limits, so the forecast isn't optimistic.
- [x] Bills get an optional next due date that moves forward automatically. Bills without one are still counted as a weekly share.
- [x] Dated payments get a fixed weekly set-aside from the day they were added, plus "put aside so far". This fixes the creeping amount.
- [x] **Your pots**: Everyday, Bills & buffer, Emergency fund (with goal), Locked savings, with balances you update.
- [x] **Savings plan**: a suggested split, you choose the amounts, and it refuses anything more than is safe. Wants get whatever is left.
- [x] **Wants**: cooling-off (1 / 7 / 30 days by price), a "saved by" date, reordering, **Can I buy it now?** (yes / not yet + when + how to get there sooner), and Bought.
- [x] **Afterpay purchase**: enter the instalment amount and how many are left, and the fortnightly instalments are added.
- [x] Data upgraded automatically again (version 3), with a backup snapshot first. Old backup files still restore.

### Phase 4: Payday check-in and savings protection

- [ ] Check-in: enter real balances, get the exact transfer list ("Move $X to the DDJ Saver"), confirm.
- [ ] Savings record and **no-withdrawal streak**.
- [ ] Up conditions tracker: "4 of 5 card purchases this month" and "Locked savings untouched ✓". Warns before month end.
- [ ] If you withdraw, the app asks why, and adds that cost to the plan so it doesn't happen again.

### Phase 5: Learning from real spending

- [ ] Suggest limits from your actual 4-week averages (the History data from Phase 2).
- [ ] Monthly review: planned vs actual, interest kept, savings growth, Afterpay payoff date.

### Phase 6: Connect Up Bank (no more manual logging)

- [ ] Up has an official API for personal use. You create a **personal access token** in the Up app (Data sharing → Personal Access Token). Weekwell can then read your Up transactions and balances automatically.
- [ ] Read-only use. The token stays in `.env.local`, never in Git.
- [ ] CommBank has no personal API. Import its CSV export instead.

### ✅ Access from anywhere (built)

- [x] Google sign-in, limited to approved emails, with a 30-day signed session cookie. Fails closed when hosted without login settings.
- [x] Vercel hosting config (free Hobby plan). Data stays in Neon.
- [x] Installable as an app on iPhone, Android and desktop Chrome: icon, full screen, and fast loading. Budget data is never cached on the device.
- [x] Step-by-step setup in `docs/DEPLOY.md`.

---

## 5. Your setup (from your answers)

- **Pay lands in CommBank.** On payday, move the amounts from "Each payday move" out of CommBank into your Up Savers. Then tap **Update balances**.
- **Your existing Up Saver ($1,000) is your only savings, so it becomes the Emergency fund.** That's a solid starter. It's set to grow to $2,000 by default (you can change this). Using it in a real emergency is fine and only affects that Saver's rate for the month.
- **Create a new Up Saver called "Locked savings"** for the money you never touch, plus a **"Bills & buffer"** Saver and one Saver per want (e.g. "DDJ").
- **Bills:** add them when ready, with their next due dates if you know them.

### Still open

- Payday: which day, and is the amount always the same? Enter it under Settings.
- Which bills come out of Up and which out of CommBank. Phase 4 uses this to tell you exactly what to leave in each account.

## Sources

- Up conditions:
  - [savings.com.au](https://www.savings.com.au/news/new-conditions-for-up-saver-account-interest)
  - [OzBargain](https://www.ozbargain.com.au/node/958410)
  - [Money Hack HQ rate tracker](https://moneyhackhq.com/australian-savings-rate-bank-bonus-tracker/)
- CommBank GoalSaver:
  - [CommBank terms (PDF)](https://www.commbank.com.au/personal/apply-online/download-printed-forms/SavingsInvestment_ADB2852.pdf)
  - [Finder](https://www.finder.com.au/bank-accounts/commonwealth-bank-savings-accounts/commonwealth-bank-goal-saver-savings-account)
  - [Bankmate](https://bankmate.app/savings/account/commonwealth-bank-goalsaver)
- [Up API](https://developer.up.com.au/)
- [Afterpay late fees](https://www.afterpay.com/en-AU/help/360031624311-Why-have-I-been-charged-a-late-fee)
- [Barefoot buckets (PocketSmith)](https://pocketsmith.com/methodologies/barefoot-investor-buckets)
- [YNAB four rules](https://www.ynab.com/ynab-four-rules-budgeting)
- [Sinking funds (Empower)](https://www.empower.com/the-currency/money/what-is-a-sinking-fund)
- Studies (well known, cited from memory):
  - Soman & Cheema (2011), *Earmarking and partitioning*, Journal of Marketing Research
  - Ashraf, Karlan & Yin (2006), *Tying Odysseus to the Mast*, Quarterly Journal of Economics
  - Thaler & Benartzi (2004), *Save More Tomorrow*, Journal of Political Economy
