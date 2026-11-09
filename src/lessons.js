// One short money lesson a day, written for life in Australia.
// Ordered as a course: sort out today first, then protect yourself, then grow.
// General information only, not personal financial advice. Numbers are rounded examples.

export const LESSONS = [
  {
    id: 'pay-yourself-first', icon: '🥇', topic: 'Basics',
    title: 'Pay yourself first',
    body: 'Most people save whatever is left at the end of the fortnight, which is usually nothing. Flip it: on payday, move your savings out first, then live on the rest.',
    action: 'Your payday checklist already does this. Tick the “Move to Saver” step on the day your pay lands, not later.',
  },
  {
    id: 'spending-money', icon: '💸', topic: 'Basics',
    title: 'Know your “free to spend” number',
    body: 'Your balance lies. Some of it already belongs to rent, Afterpay and bills. The only number that matters is what’s left after those are set aside.',
    action: 'Check your spending money in the payday card before buying something, not your Up balance.',
  },
  {
    id: 'cooling-off', icon: '🧊', topic: 'Spending',
    title: 'The cooling-off trick',
    body: 'Most impulse buys feel less urgent after a day or two. Waiting isn’t saying no, it’s checking you really want it.',
    action: 'Put the next thing you want in your Wish list. If you still want it after the cooling-off, it gets a date.',
  },
  {
    id: 'subscriptions', icon: '🔁', topic: 'Spending',
    title: 'Subscriptions add up quietly',
    body: 'Small monthly charges are easy to forget. Ten dollars a month is $120 a year, and most people have several.',
    action: 'Open the Bills tab and ask of each subscription: did I use this in the last two weeks? Cancel one you didn’t.',
  },
  {
    id: 'bnpl', icon: '🧾', topic: 'Debt',
    title: 'Afterpay is still debt',
    body: 'Buy now pay later feels free, but it spends next fortnight’s pay today. Since mid-2025 it’s regulated as credit in Australia, so missed payments can show on your credit report and late fees apply.',
    action: 'Try one month with no new Afterpay. Pay off what’s there and see how much lighter each payday feels.',
  },
  {
    id: 'emergency-fund', icon: '🛟', topic: 'Safety',
    title: 'Why an emergency fund comes first',
    body: 'Without one, every surprise (a phone screen, a dentist, a week without shifts) becomes debt or a raid on your savings. Aim for one month of essentials first, then grow it to three.',
    action: 'Keep it somewhere separate you don’t see every day, like your CommBank GoalSaver.',
  },
  {
    id: 'emergency-rules', icon: '🚨', topic: 'Safety',
    title: 'What counts as an emergency?',
    body: 'Ask three questions: is it unexpected, is it necessary, is it urgent? A sale isn’t an emergency. A weekend away isn’t either. A broken laptop you need for work might be.',
    action: 'If you use the emergency fund, refill it before you save for wants again.',
  },
  {
    id: 'sinking-funds', icon: '🪣', topic: 'Planning',
    title: 'Big bills aren’t surprises',
    body: 'Insurance, rego, visa and exam fees are known in advance. Putting a little aside every pay turns a scary $1,500 bill into a boring $60 a fortnight.',
    action: 'Add every big future cost to Bills or Coming up with its date. Weekwell spreads it out for you.',
  },
  {
    id: 'interest-basics', icon: '🏦', topic: 'Saving',
    title: 'How bonus interest really works',
    body: 'Many Australian savings accounts only pay the top rate if you meet conditions, like no withdrawals that month. One withdrawal can drop a month’s interest to almost nothing.',
    action: 'Keep money you might need soon out of your bonus-interest Saver, so you never have to touch it.',
  },
  {
    id: 'compound-interest', icon: '🌱', topic: 'Growing',
    title: 'Compound growth: time beats amount',
    body: 'Returns earn returns of their own. $50 a week at a 7% average return grows to about $114,000 in 20 years, but about $266,000 in 30. Starting ten years earlier more than doubles it.',
    action: 'The best time to start is once your emergency fund is in place, even with a small amount.',
  },
  {
    id: 'inflation', icon: '🎈', topic: 'Growing',
    title: 'Cash slowly shrinks',
    body: 'Prices rise most years. At 3% inflation, $1,000 sitting in a 0% account buys only about $744 worth of stuff after 10 years.',
    action: 'Short-term money belongs in a high-interest savings account. Long-term money usually needs to grow faster than inflation.',
  },
  {
    id: 'credit-cards', icon: '💳', topic: 'Debt',
    title: 'Credit cards: a tool, not extra money',
    body: 'Card interest is often around 20% a year. Carry $1,000 for a year and that’s about $200 gone. They only work for you if you pay the full balance every month, every time.',
    action: 'If you get one later, set up an automatic full repayment from day one, and a low limit.',
  },
  {
    id: 'credit-score', icon: '📊', topic: 'Debt',
    title: 'Your credit score matters for a home loan',
    body: 'Lenders check your history of paying bills, phone plans, BNPL and cards on time. In Australia you can check your credit report free from Equifax, Experian and illion.',
    action: 'Check your report once a year, and never let a bill go overdue.',
  },
  {
    id: 'debt-order', icon: '🧗', topic: 'Debt',
    title: 'Which debt to pay first',
    body: 'Two good ways: highest interest first (saves the most money), or smallest balance first (quick wins keep you motivated). Both work if you stick with one.',
    action: 'Money owed to friends has no interest but costs trust. Paying it soon is a good call.',
  },
  {
    id: 'super-basics', icon: '🧓', topic: 'Super',
    title: 'Super is your money too',
    body: 'Your employer must pay 12% of your ordinary earnings into super on top of your pay. It’s invested for decades, so its fees and investment option matter a lot.',
    action: 'Log in to your super fund and check its fees and which option you’re in. The ATO’s YourSuper comparison tool helps compare funds.',
  },
  {
    id: 'super-consolidate', icon: '🧩', topic: 'Super',
    title: 'More than one super account?',
    body: 'Each account charges fees and may charge for insurance. Many people have a forgotten account from an old job.',
    action: 'Check myGov (linked to the ATO) for lost or multiple super accounts. Check any insurance you’d lose before combining.',
  },
  {
    id: 'fees', icon: '🐌', topic: 'Growing',
    title: 'Fees eat returns',
    body: 'A 1% yearly fee sounds tiny. But $100 a week over 30 years growing at 7% ends near $531,000; at 6% (1% lost to fees) it’s about $437,000.',
    action: 'When you compare super funds or investments, look at the total yearly fees first.',
  },
  {
    id: 'index-funds', icon: '🧺', topic: 'Investing',
    title: 'What is an index fund?',
    body: 'Instead of picking companies, an index fund buys a small piece of hundreds or thousands of them, like the ASX 200 or global shares. Fees are usually low and you don’t need to pick winners.',
    action: 'Read Moneysmart’s page on ETFs and index funds before you buy anything.',
  },
  {
    id: 'risk-time', icon: '⏳', topic: 'Investing',
    title: 'Only invest money you won’t need for 5+ years',
    body: 'Shares can fall 20–30% in a bad year and take years to recover. That’s fine for long-term money, terrible for next year’s visa fees or rent.',
    action: 'Rule of thumb: money for the next few years stays in savings. Money for 5+ years away can be invested.',
  },
  {
    id: 'diversify', icon: '🥚', topic: 'Investing',
    title: 'Don’t put all your eggs in one basket',
    body: 'One company, one crypto coin or one property can go badly wrong. Spreading across many companies and countries makes a bad day for one hurt much less.',
    action: 'Be wary of anyone who says something “can’t lose”.',
  },
  {
    id: 'regular-investing', icon: '📅', topic: 'Investing',
    title: 'Invest a little, regularly',
    body: 'Putting in the same amount every fortnight means you buy more when prices are low and less when they’re high. It also stops you trying to guess the perfect time.',
    action: 'When you start, pick an amount you can keep up even in a tight fortnight.',
  },
  {
    id: 'cgt-discount', icon: '🗓️', topic: 'Investing',
    title: 'Holding for a year cuts your tax',
    body: 'In Australia, if you sell an investment you’ve held for more than 12 months, generally only half the gain is taxed. Selling sooner usually means paying more tax.',
    action: 'Investing is a long game, which suits the tax system too.',
  },
  {
    id: 'home-deposit', icon: '🏡', topic: 'Home',
    title: 'Ways to a first home deposit',
    body: 'The First Home Super Saver scheme lets you save part of a deposit inside super, with tax benefits. The 5% Deposit Scheme can let first home buyers buy with a 5% deposit and no lenders mortgage insurance. Check the eligibility rules once you have PR.',
    action: 'Look up the First Home Super Saver scheme on the ATO site and Housing Australia’s 5% Deposit Scheme.',
  },
  {
    id: 'tax-return', icon: '🧾', topic: 'Tax',
    title: 'Keep receipts for your tax return',
    body: 'Work-related costs you paid for yourself (some tools, a phone used for work, training for your current job) may be deductible. You need records.',
    action: 'Snap a photo of work receipts as you go. The myDeductions tool in the ATO app makes this easy.',
  },
  {
    id: 'windfall', icon: '🎁', topic: 'Planning',
    title: 'Got a windfall? Give it a job',
    body: 'Tax refunds and bonuses disappear fast when they land in your everyday account. Decide where every dollar goes before it arrives.',
    action: 'When your tax refund lands, use the Money coming in card to split it.',
  },
  {
    id: 'lifestyle-creep', icon: '📈', topic: 'Spending',
    title: 'Watch out for lifestyle creep',
    body: 'When pay goes up, spending quietly rises to match. Then a raise doesn’t change anything.',
    action: 'Next pay rise: send at least half of the extra straight to savings before you get used to it.',
  },
  {
    id: 'weekend-budget', icon: '🎉', topic: 'Spending',
    title: 'Plan the fun, so it isn’t guilt',
    body: 'A budget with no fun breaks. Set a fixed amount for going out and spend it without guilt. When it’s gone, it’s gone until next pay.',
    action: 'Give weekends their own category in Spending with a weekly limit you can live with.',
  },
  {
    id: 'scams', icon: '🎣', topic: 'Safety',
    title: 'Scams target people new to Australia',
    body: 'Fake calls claiming to be the ATO, Home Affairs or your bank often threaten fines or visa problems. Real agencies won’t demand payment in gift cards or crypto, or ask for your one-time codes.',
    action: 'Hang up and call back on the number from the official website. Report scams at Scamwatch.',
  },
  {
    id: 'insurance', icon: '☂️', topic: 'Safety',
    title: 'Insurance protects your plan',
    body: 'Your ability to earn is your biggest asset. Your super fund may include some life and income protection insurance by default.',
    action: 'Check what insurance your super fund gives you, and what it costs each year.',
  },
  {
    id: 'net-worth', icon: '🧮', topic: 'Growing',
    title: 'Track your net worth',
    body: 'Net worth is what you own (savings, super, investments) minus what you owe. Watching it grow every few months is more motivating than any single balance.',
    action: 'Write today’s number down somewhere. Check it again in three months.',
  },
  {
    id: 'moneysmart', icon: '📚', topic: 'Learning',
    title: 'Your free teacher: Moneysmart',
    body: 'Moneysmart is the Australian government’s free money website, run by ASIC. It has calculators for budgets, super, home loans and investing, with no products to sell you.',
    action: 'Bookmark moneysmart.gov.au and try the compound interest calculator.',
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
