// One short money lesson a day, written for life in Australia.
// Ordered as a course: sort out today first, then protect yourself, then grow.
// General information only, not personal financial advice. Numbers are rounded examples.

export const LESSONS = [
  {
    id: 'pay-yourself-first', icon: '🥇', topic: 'Basics',
    title: 'Pay yourself first',
    body: 'Most people save whatever is left at the end of the fortnight, which is usually nothing. Flip it: on payday, move your savings out first, then live on the rest.',
    action: 'Your payday checklist already does this. Tick the “Move to Saver” step on the day your pay lands, not later.',
    url: "https://moneysmart.gov.au/saving/how-to-start-saving",
    more: [
      "Savings that wait for “leftovers” lose to everyday temptations. Moving money out on payday means you never see it as spendable.",
      "Start small if money is tight. Even $20 a pay builds the habit, and you can raise it when a bill finishes (like your last Afterpay instalment).",
      "Automate it if you can: in Up you can set a recurring transfer to a Saver for each payday.",
    ],
  },
  {
    id: 'spending-money', icon: '💸', topic: 'Basics',
    title: 'Know your “free to spend” number',
    body: 'Your balance lies. Some of it already belongs to rent, Afterpay and bills. The only number that matters is what’s left after those are set aside.',
    action: 'Check your spending money in the payday card before buying something, not your Up balance.',
    url: "https://moneysmart.gov.au/budgeting/budget-planner",
    more: [
      "Your account balance mixes three kinds of money: already promised (rent, bills, debts), planned savings, and truly free money. Only the last one is safe to spend.",
      "Weekwell works this out for you every day: it subtracts everything due before your next pay and keeps your safety buffer.",
      "Moneysmart’s free budget planner is a good once-a-year check that nothing is missing from your list of bills.",
    ],
  },
  {
    id: 'cooling-off', icon: '🧊', topic: 'Spending',
    title: 'The cooling-off trick',
    body: 'Most impulse buys feel less urgent after a day or two. Waiting isn’t saying no, it’s checking you really want it.',
    action: 'Put the next thing you want in your Wish list. If you still want it after the cooling-off, it gets a date.',
    url: "https://moneysmart.gov.au/saving/simple-ways-to-save-money",
    more: [
      "Shops design checkout to be quick on purpose. A short wait breaks the “I need it now” feeling.",
      "A simple rule: under $100 wait a day, up to $500 wait a week, more than that wait a month. That’s what the Wish list uses.",
      "If you still want it after waiting, buy it without guilt, from money you saved for it, not from bill money.",
    ],
  },
  {
    id: 'subscriptions', icon: '🔁', topic: 'Spending',
    title: 'Subscriptions add up quietly',
    body: 'Small monthly charges are easy to forget. Ten dollars a month is $120 a year, and most people have several.',
    action: 'Open the Bills tab and ask of each subscription: did I use this in the last two weeks? Cancel one you didn’t.',
    url: "https://moneysmart.gov.au/saving/simple-ways-to-save-money",
    more: [
      "Go through your bank statement once and list every repeating charge. Many people find one they forgot about.",
      "Ask: would I sign up again today at this price? If not, cancel. You can always re-join later.",
      "Annual plans are often cheaper, but only for things you’re sure you’ll keep using all year.",
    ],
  },
  {
    id: 'bnpl', icon: '🧾', topic: 'Debt',
    title: 'Afterpay is still debt',
    body: 'Buy now pay later feels free, but it spends next fortnight’s pay today. Since mid-2025 it’s regulated as credit in Australia, so missed payments can show on your credit report and late fees apply.',
    action: 'Try one month with no new Afterpay. Pay off what’s there and see how much lighter each payday feels.',
    url: "https://moneysmart.gov.au/other-ways-to-borrow/buy-now-pay-later-services",
    more: [
      "Buy now pay later splits a purchase into instalments. It feels free, but every instalment is a bill your future pay must cover.",
      "Late fees apply if a payment fails. Since mid-2025 it’s regulated as credit, so providers must check it’s affordable for you, and missed payments can show on your credit report and affect future loans.",
      "A good rule: if you can’t afford to pay the full price today from money you already have, it’s a sign to wait, not to split it.",
    ],
  },
  {
    id: 'emergency-fund', icon: '🛟', topic: 'Safety',
    title: 'Why an emergency fund comes first',
    body: 'Without one, every surprise (a phone screen, a dentist, a week without shifts) becomes debt or a raid on your savings. Aim for one month of essentials first, then grow it to three.',
    action: 'Keep it somewhere separate you don’t see every day, like your CommBank GoalSaver.',
    url: "https://moneysmart.gov.au/saving/save-for-an-emergency-fund",
    more: [
      "Moneysmart suggests building up to about three months of expenses over time. Start with a smaller first goal so it feels reachable.",
      "Keep it in a separate account you don’t use day to day, ideally one that pays good interest.",
      "An emergency fund is what lets you say no to debt when life surprises you.",
    ],
  },
  {
    id: 'emergency-rules', icon: '🚨', topic: 'Safety',
    title: 'What counts as an emergency?',
    body: 'Ask three questions: is it unexpected, is it necessary, is it urgent? A sale isn’t an emergency. A weekend away isn’t either. A broken laptop you need for work might be.',
    action: 'If you use the emergency fund, refill it before you save for wants again.',
    url: "https://moneysmart.gov.au/saving/save-for-an-emergency-fund",
    more: [
      "Good uses: losing work hours, urgent medical or dental costs, car or laptop repairs you need for work, urgent travel for family.",
      "Not emergencies: sales, concerts, gifts, holidays. Those belong in your Wish list or savings goals.",
      "After using it, pause extra spending until it’s back to where it was.",
    ],
  },
  {
    id: 'sinking-funds', icon: '🪣', topic: 'Planning',
    title: 'Big bills aren’t surprises',
    body: 'Insurance, rego, visa and exam fees are known in advance. Putting a little aside every pay turns a scary $1,500 bill into a boring $60 a fortnight.',
    action: 'Add every big future cost to Bills or Coming up with its date. Weekwell spreads it out for you.',
    url: "https://moneysmart.gov.au/budgeting/steps-to-get-your-money-sorted",
    more: [
      "A “sinking fund” is money put aside bit by bit for a cost you know is coming.",
      "Divide the cost by the number of pays until it’s due. That small amount each pay is your set-aside.",
      "Weekwell does this for every item in Coming up: it counts the money as already spoken for, so the plan never treats it as spare.",
    ],
  },
  {
    id: 'interest-basics', icon: '🏦', topic: 'Saving',
    title: 'How bonus interest really works',
    body: 'Many Australian savings accounts only pay the top rate if you meet conditions, like no withdrawals that month. One withdrawal can drop a month’s interest to almost nothing.',
    action: 'Keep money you might need soon out of your bonus-interest Saver, so you never have to touch it.',
    url: "https://moneysmart.gov.au/saving/how-to-start-saving",
    more: [
      "Read the conditions: some accounts need a deposit each month, a number of card purchases, or no withdrawals to earn the bonus rate.",
      "Keep two places: one for money you won’t touch (to earn the bonus) and one for spending and bills.",
      "Compare the ongoing rate, not just an introductory one that drops after a few months.",
    ],
  },
  {
    id: 'compound-interest', icon: '🌱', topic: 'Growing',
    title: 'Compound growth: time beats amount',
    body: 'Returns earn returns of their own. $50 a week at a 7% average return grows to about $114,000 in 20 years, but about $266,000 in 30. Starting ten years earlier more than doubles it.',
    action: 'The best time to start is once your emergency fund is in place, even with a small amount.',
    url: "https://moneysmart.gov.au/saving/compound-interest-calculator",
    more: [
      "Compounding means your returns earn returns. Over long periods, time does more of the work than the amount you put in.",
      "The 7% figure is a rough long-run average for diversified shares. Real returns go up and down a lot from year to year and are not guaranteed.",
      "Try Moneysmart’s compound interest calculator with your own numbers.",
    ],
  },
  {
    id: 'inflation', icon: '🎈', topic: 'Growing',
    title: 'Cash slowly shrinks',
    body: 'Prices rise most years. At 3% inflation, $1,000 sitting in a 0% account buys only about $744 worth of stuff after 10 years.',
    action: 'Short-term money belongs in a high-interest savings account. Long-term money usually needs to grow faster than inflation.',
    url: "https://moneysmart.gov.au/glossary/inflation",
    more: [
      "Inflation means prices rise over time, so the same dollars buy less.",
      "For money you need soon, safety matters more than growth, so a high-interest savings account is right.",
      "For money you won’t need for many years, investments that can grow faster than inflation usually make sense.",
    ],
  },
  {
    id: 'credit-cards', icon: '💳', topic: 'Debt',
    title: 'Credit cards: a tool, not extra money',
    body: 'Card interest is often around 20% a year. Carry $1,000 for a year and that’s about $200 gone. They only work for you if you pay the full balance every month, every time.',
    action: 'If you get one later, set up an automatic full repayment from day one, and a low limit.',
    url: "https://moneysmart.gov.au/credit-cards",
    more: [
      "If you don’t pay the full closing balance, interest is usually charged on purchases, often from the day you bought them.",
      "Annual fees, cash-advance fees and overseas fees add up. A low-rate, no-fee card is the safer choice for most people.",
      "Never use a card to pay for everyday spending you can’t already cover. It hides the problem instead of fixing it.",
    ],
  },
  {
    id: 'credit-score', icon: '📊', topic: 'Debt',
    title: 'Your credit score matters for a home loan',
    body: 'Lenders check your history of paying bills, phone plans, BNPL and cards on time. In Australia you can check your credit report free from Equifax, Experian and illion.',
    action: 'Check your report once a year, and never let a bill go overdue.',
    url: "https://moneysmart.gov.au/managing-debt/credit-scores-and-credit-reports",
    more: [
      "Your credit report lists your loans, cards, BNPL and repayment history. A credit score is a number based on that report.",
      "Paying on time every time, and having fewer credit applications, helps your score.",
      "You can get your report free from the credit reporting bodies. Check it for mistakes, and fix them with the body directly.",
    ],
  },
  {
    id: 'debt-order', icon: '🧗', topic: 'Debt',
    title: 'Which debt to pay first',
    body: 'Two good ways: highest interest first (saves the most money), or smallest balance first (quick wins keep you motivated). Both work if you stick with one.',
    action: 'Money owed to friends has no interest but costs trust. Paying it soon is a good call.',
    url: "https://moneysmart.gov.au/managing-debt/get-debt-under-control",
    more: [
      "Always make at least the minimum payment on every debt so nothing goes overdue.",
      "Then put any extra money on one debt at a time until it’s gone, and roll that payment into the next one.",
      "If you ever feel stuck with debts, the National Debt Helpline (1800 007 007) is free and confidential.",
    ],
  },
  {
    id: 'super-basics', icon: '🧓', topic: 'Super',
    title: 'Super is your money too',
    body: 'Your employer must pay 12% of your ordinary earnings into super on top of your pay. It’s invested for decades, so its fees and investment option matter a lot.',
    action: 'Log in to your super fund and check its fees and which option you’re in. The ATO’s YourSuper comparison tool helps compare funds.',
    url: "https://moneysmart.gov.au/how-super-works/superannuation",
    more: [
      "Super is paid by your employer into a fund chosen by you (or a default fund). It’s invested until you retire.",
      "Check your payslips show super being paid, and log in to your fund once a year.",
      "Fees, the investment option, and any insurance inside super all make a big difference over decades.",
    ],
  },
  {
    id: 'super-consolidate', icon: '🧩', topic: 'Super',
    title: 'More than one super account?',
    body: 'Each account charges fees and may charge for insurance. Many people have a forgotten account from an old job.',
    action: 'Check myGov (linked to the ATO) for lost or multiple super accounts. Check any insurance you’d lose before combining.',
    url: "https://moneysmart.gov.au/how-super-works/find-lost-super",
    more: [
      "If you’ve had several jobs, you might have several super accounts, each charging fees.",
      "You can find all your super through myGov linked to the ATO, and combine accounts there.",
      "Before combining, check whether an account has insurance you want to keep.",
    ],
  },
  {
    id: 'fees', icon: '🐌', topic: 'Growing',
    title: 'Fees eat returns',
    body: 'A 1% yearly fee sounds tiny. But $100 a week over 30 years growing at 7% ends near $531,000; at 6% (1% lost to fees) it’s about $437,000.',
    action: 'When you compare super funds or investments, look at the total yearly fees first.',
    url: "https://www.ato.gov.au/calculators-and-tools/super-yoursuper-comparison-tool",
    more: [
      "Fees are taken every year whether returns are good or bad, so they compound against you.",
      "Compare funds on total fees and long-term net returns, not just last year’s results.",
      "The ATO’s YourSuper comparison tool compares MySuper products side by side.",
    ],
  },
  {
    id: 'index-funds', icon: '🧺', topic: 'Investing',
    title: 'What is an index fund?',
    body: 'Instead of picking companies, an index fund buys a small piece of hundreds or thousands of them, like the ASX 200 or global shares. Fees are usually low and you don’t need to pick winners.',
    action: 'Read Moneysmart’s page on ETFs and index funds before you buy anything.',
    url: "https://moneysmart.gov.au/managed-funds-and-etfs/exchange-traded-funds-etfs",
    more: [
      "An ETF (exchange traded fund) is bought on the share market like a share. Many ETFs track an index.",
      "A “broad” index fund owns many companies at once, for example the biggest Australian companies, or thousands worldwide.",
      "Look at the management fee, what it actually holds, and how big and established the fund is.",
    ],
  },
  {
    id: 'invest-order', icon: '🪜', topic: 'Investing',
    title: 'The order to do things in',
    body: 'Most money guides agree on an order: a budget that works, clear expensive debts like Afterpay, build an emergency fund, save for big costs coming in the next few years, then invest regularly.',
    action: 'Open “Am I ready to invest?” in the menu to see which step you’re on.',
    url: "https://moneysmart.gov.au/how-to-invest",
    more: [
      "The usual order: a budget that works, no high-interest debt (Afterpay, credit cards), an emergency fund, money for big costs in the next few years kept in savings, then invest.",
      "Weekwell’s “Am I ready to invest?” checklist follows this order and tells you which step you’re on.",
      "Investing before these are sorted often means selling at a bad time to cover a surprise bill.",
    ],
  },
  {
    id: 'first-etf', icon: '🛒', topic: 'Investing',
    title: 'How people buy their first ETF',
    body: 'You open an account with a share trading platform (a broker), transfer money in, and buy units of an ETF like you would a share. Fees, and whether the shares are held in your own name, differ between brokers.',
    action: 'Before choosing, compare brokerage fees and check the broker is licensed by ASIC.',
    url: "https://moneysmart.gov.au/how-to-invest/develop-an-investing-plan",
    more: [
      "To buy ETFs you need a share trading account with a broker. Compare brokerage fees, and whether you own the shares in your name (CHESS sponsored) or through the broker (custodian).",
      "Write a simple plan first: how much each pay, what you’ll buy, and that you won’t sell when prices fall.",
      "Avoid anyone promising high returns with no risk. Check a company is licensed on ASIC’s professional register before giving them money.",
    ],
  },
  {
    id: 'risk-time', icon: '⏳', topic: 'Investing',
    title: 'Only invest money you won’t need for 5+ years',
    body: 'Shares can fall 20–30% in a bad year and take years to recover. That’s fine for long-term money, terrible for next year’s visa fees or rent.',
    action: 'Rule of thumb: money for the next few years stays in savings. Money for 5+ years away can be invested.',
    url: "https://moneysmart.gov.au/how-to-invest/develop-an-investing-plan",
    more: [
      "The share market rises over long periods on average but has frequent falls along the way.",
      "Moneysmart suggests matching investments to time: cash for goals in the next few years, growth assets like shares for 5+ years.",
      "Your PR fees and next year’s costs are short-term money, so they stay in savings.",
    ],
  },
  {
    id: 'diversify', icon: '🥚', topic: 'Investing',
    title: 'Don’t put all your eggs in one basket',
    body: 'One company, one crypto coin or one property can go badly wrong. Spreading across many companies and countries makes a bad day for one hurt much less.',
    action: 'Be wary of anyone who says something “can’t lose”.',
    url: "https://moneysmart.gov.au/how-to-invest",
    more: [
      "Diversifying means spreading money across many companies, industries and countries.",
      "A single broad index fund already gives you hundreds or thousands of companies.",
      "Scams often promise guaranteed or very high returns. That promise alone is a warning sign.",
    ],
  },
  {
    id: 'regular-investing', icon: '📅', topic: 'Investing',
    title: 'Invest a little, regularly',
    body: 'Putting in the same amount every fortnight means you buy more when prices are low and less when they’re high. It also stops you trying to guess the perfect time.',
    action: 'When you start, pick an amount you can keep up even in a tight fortnight.',
    url: "https://moneysmart.gov.au/how-to-invest",
    more: [
      "Investing a set amount on a schedule is sometimes called dollar-cost averaging.",
      "It turns investing into a boring habit, which is good: emotions cause most investing mistakes.",
      "Check brokerage fees: very small, frequent purchases can cost a lot in fees. Investing monthly or each payday in larger amounts can be cheaper.",
    ],
  },
  {
    id: 'cgt-discount', icon: '🗓️', topic: 'Investing',
    title: 'Holding for a year cuts your tax',
    body: 'For Australian tax residents, selling an investment held for at least 12 months generally means only half the gain is taxed. Selling sooner usually means paying more tax. While you’re on a temporary visa the capital gains rules are different, so check before you sell.',
    action: 'Investing is a long game, which suits the tax system too.',
    url: "https://moneysmart.gov.au/how-to-invest/investing-and-tax",
    more: [
      "When you sell an investment for more than you paid, that profit (a capital gain) is added to your taxable income.",
      "For Australian tax residents, assets held for at least 12 months generally get a 50% discount on the gain. Temporary visa holders are treated differently (for gains and the discount), so check the ATO rules or ask a registered tax agent until you have PR.",
      "Keep records of what you paid and when. Dividends are also taxable income each year.",
    ],
  },
  {
    id: 'home-deposit', icon: '🏡', topic: 'Home',
    title: 'Ways to a first home deposit',
    body: 'The First Home Super Saver scheme lets you save part of a deposit inside super, with tax benefits. The 5% Deposit Scheme can let first home buyers buy with a 5% deposit and no lenders mortgage insurance. Check the eligibility rules once you have PR.',
    action: 'Look up the First Home Super Saver scheme on the ATO site and Housing Australia’s 5% Deposit Scheme.',
    url: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme",
    more: [
      "The First Home Super Saver (FHSS) scheme lets you make voluntary contributions to super and later withdraw them (with earnings) for a first home deposit, with tax benefits. There are yearly and total limits.",
      "The Australian Government 5% Deposit Scheme (run by Housing Australia) lets eligible first home buyers buy with a smaller deposit without lenders mortgage insurance. You need to be a citizen or permanent resident.",
      "Rules change, so check the official pages when you’re getting close to buying.",
    ],
  },
  {
    id: 'tax-return', icon: '🧾', topic: 'Tax',
    title: 'Keep receipts for your tax return',
    body: 'Work-related costs you paid for yourself (some tools, a phone used for work, training for your current job) may be deductible. You need records.',
    action: 'Snap a photo of work receipts as you go. The myDeductions tool in the ATO app makes this easy.',
    url: "https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/records-you-need-to-keep",
    more: [
      "To claim a deduction you generally must have spent the money yourself, it must relate to earning your income, and you need a record.",
      "Private costs (like normal clothes or commuting from home to work) usually can’t be claimed.",
      "The myDeductions tool in the ATO app stores receipts and can upload them at tax time.",
    ],
  },
  {
    id: 'windfall', icon: '🎁', topic: 'Planning',
    title: 'Got a windfall? Give it a job',
    body: 'Tax refunds and bonuses disappear fast when they land in your everyday account. Decide where every dollar goes before it arrives.',
    action: 'When your tax refund lands, use the Money coming in card to split it.',
    url: "https://moneysmart.gov.au/budgeting/steps-to-get-your-money-sorted",
    more: [
      "Before spending a windfall, cover anything overdue or due soon, then debts, then your emergency fund.",
      "It’s fine to keep a small part for something fun. A planned treat beats an accidental spend.",
      "Weekwell’s “Money coming in” card suggests a split when you log a tax refund or bonus.",
    ],
  },
  {
    id: 'lifestyle-creep', icon: '📈', topic: 'Spending',
    title: 'Watch out for lifestyle creep',
    body: 'When pay goes up, spending quietly rises to match. Then a raise doesn’t change anything.',
    action: 'Next pay rise: send at least half of the extra straight to savings before you get used to it.',
    url: "https://moneysmart.gov.au/budgeting/budget-planner",
    more: [
      "Lifestyle creep is when spending rises with income, so you never feel richer.",
      "Decide in advance what happens to a raise: a fixed share to savings or investing, the rest to enjoy.",
      "The same applies when a bill ends, like your last Afterpay instalment: redirect that amount instead of spending it.",
    ],
  },
  {
    id: 'weekend-budget', icon: '🎉', topic: 'Spending',
    title: 'Plan the fun, so it isn’t guilt',
    body: 'A budget with no fun breaks. Set a fixed amount for going out and spend it without guilt. When it’s gone, it’s gone until next pay.',
    action: 'Give weekends their own category in Spending with a weekly limit you can live with.',
    url: "https://moneysmart.gov.au/budgeting/budget-planner",
    more: [
      "Fun money is part of a healthy budget. Leaving it out is why strict budgets fail.",
      "Pick a weekly amount, spend it freely, and stop when it’s gone.",
      "If you go over one week, take it from next week’s fun money, not from bills or savings.",
    ],
  },
  {
    id: 'scams', icon: '🎣', topic: 'Safety',
    title: 'Scams target people new to Australia',
    body: 'Fake calls claiming to be the ATO, Home Affairs or your bank often threaten fines or visa problems. Real agencies won’t demand payment in gift cards or crypto, or ask for your one-time codes.',
    action: 'Hang up and call back on the number from the official website. Report scams at Scamwatch.',
    url: "https://www.scamwatch.gov.au",
    more: [
      "Common scams: fake ATO or Home Affairs calls about visas or tax debts, delivery texts with links, fake investment platforms, and romance scams.",
      "Never share one-time codes, and don’t click links in unexpected messages. Contact the organisation using details from its official website.",
      "If you’ve lost money, contact your bank immediately, then report to Scamwatch.",
    ],
  },
  {
    id: 'insurance', icon: '☂️', topic: 'Safety',
    title: 'Insurance protects your plan',
    body: 'Your ability to earn is your biggest asset. Your super fund may include some life and income protection insurance by default.',
    action: 'Check what insurance your super fund gives you, and what it costs each year.',
    url: "https://moneysmart.gov.au/how-life-insurance-works/insurance-through-super",
    more: [
      "Many super funds include default life, total and permanent disability (TPD) and income protection cover, paid from your super balance.",
      "Check what you have and what it costs. Cover you don’t need reduces your super; cover you do need protects your income.",
      "If you’re a temporary resident, check the details of your cover with your fund.",
    ],
  },
  {
    id: 'net-worth', icon: '🧮', topic: 'Growing',
    title: 'Track your net worth',
    body: 'Net worth is what you own (savings, super, investments) minus what you owe. Watching it grow every few months is more motivating than any single balance.',
    action: 'Write today’s number down somewhere. Check it again in three months.',
    url: "https://moneysmart.gov.au/managing-debt/net-worth-calculator",
    more: [
      "Add up what you own (bank accounts, savers, super, investments) and subtract what you owe (Afterpay, cards, loans, money owed to friends).",
      "Your net worth can be negative at first. What matters is the direction it moves.",
      "Moneysmart has a free net worth calculator.",
    ],
  },
  {
    id: 'moneysmart', icon: '📚', topic: 'Learning',
    title: 'Your free teacher: Moneysmart',
    body: 'Moneysmart is the Australian government’s free money website, run by ASIC. It has calculators for budgets, super, home loans and investing, with no products to sell you.',
    action: 'Bookmark moneysmart.gov.au and try the compound interest calculator.',
    url: "https://moneysmart.gov.au",
    more: [
      "Moneysmart is run by ASIC, the government regulator, so it has no products to sell.",
      "Useful tools: budget planner, compound interest calculator, super calculator, and guides on investing and scams.",
      "This app’s lessons are general information only. For advice about your own situation, talk to a licensed financial adviser.",
    ],
  },
];

/** The next lesson you haven't seen, starting again from the top once you've seen them all. */
export function nextLesson(learning) {
  const seen = new Set(learning?.seen || []);
  return LESSONS.find((l) => !seen.has(l.id)) || LESSONS[(learning?.seen?.length || 0) % LESSONS.length];
}

/** Show at most once a day, unless turned off. */
export function shouldShowLesson(learning, today) {
  if (learning?.off) return false;
  return learning?.lastShown !== today;
}
