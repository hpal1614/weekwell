// Up Bank sync: turns Up transactions into Weekwell spending entries.
// Uses Up's official personal-use API with a read-only personal access token (UP_API_TOKEN).
//
// What counts as "spending" (logged against your weekly limits):
//   - card purchases from your Up Spending account (not Savers)
//   - that are money going out (not refunds, pay or interest)
//   - that are not transfers between your own accounts
//   - that are not a bill or payment already in your plan (rent, Netflix, gym, Afterpay…),
//     because the forecast already counts those
// Everything else is skipped and counted by reason, so nothing disappears silently.

const UP_API = 'https://api.up.com.au/api/v1';

// Up category id -> which of your budget categories it belongs to (matched by name).
const CATEGORY_RULES = [
  { up: ['groceries'], budget: /grocer|food shop|supermarket/i },
  { up: ['pubs-and-bars', 'booze', 'events-and-gigs'], budget: /weekend|night|going out|social|party/i, fallback: /eat|meal|restaurant|dining/i },
  { up: ['restaurants-and-cafes', 'takeaway'], budget: /eat|meal|restaurant|dining|cafe|coffee/i },
  { up: ['public-transport', 'fuel', 'parking', 'taxis-and-share-cars', 'toll-roads', 'cycling'], budget: /transport|travel|car|uber|commute/i },
];

// Up categories that are almost always bills, which the plan already covers.
const BILL_CATEGORIES = new Set(['rent-and-mortgage', 'utilities', 'internet', 'mobile-phone', 'home-insurance-and-rates', 'car-insurance-and-maintenance', 'car-repayments', 'investments']);

export function normalise(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Words that identify your planned bills and payments in a bank description. */
export function plannedKeys(state) {
  const keys = new Set();
  const add = (name) => {
    const n = normalise(name).replace(/\b(share|bill|reserve|payment|instalment|of|\d+)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return;
    const first = n.split(' ')[0];
    keys.add(first.length >= 4 ? first : n);
  };
  for (const b of state.bills || []) add(b.name);
  for (const c of state.commitments || []) {
    if (c.kind === 'Afterpay') keys.add('afterpay');
    else if (c.kind !== 'Friend') add(c.name);
  }
  return [...keys].filter((k) => k.length >= 3);
}

export function budgetFor(upCategory, description, state) {
  const budgets = state.budgets || [];
  const rule = (state.merchantRules || {})[normalise(description)];
  if (rule && budgets.some((b) => b.name === rule)) return rule;
  for (const r of CATEGORY_RULES) {
    if (!r.up.includes(upCategory)) continue;
    const hit = budgets.find((b) => r.budget.test(b.name)) || (r.fallback && budgets.find((b) => r.fallback.test(b.name)));
    if (hit) return hit.name;
  }
  return (budgets.find((b) => /other|misc/i.test(b.name)) || budgets[budgets.length - 1] || { name: 'Other' }).name;
}

/**
 * Decide what to do with one Up transaction.
 * Returns { action: 'add', entry } or { action: 'skip', reason }.
 */
export function classify(tx, { transactionalIds, planned, state }) {
  const a = tx.attributes || {};
  const r = tx.relationships || {};
  const cents = a.amount?.valueInBaseUnits;
  if (!transactionalIds.has(r.account?.data?.id)) return { action: 'skip', reason: 'saver' };
  if (typeof cents !== 'number' || cents >= 0) return { action: 'skip', reason: 'money in' };
  if (r.transferAccount?.data) return { action: 'skip', reason: 'transfer' };
  if (!a.cardPurchaseMethod && a.transactionType !== 'Purchase') return { action: 'skip', reason: 'not a card purchase' };
  const category = r.category?.data?.id || null;
  const desc = normalise(a.description);
  if ((category && BILL_CATEGORIES.has(category)) || planned.some((k) => desc.includes(k))) return { action: 'skip', reason: 'planned bill' };
  return {
    action: 'add',
    entry: {
      externalId: `up:${tx.id}`,
      // Up gives local Australian time with an offset, so the first 10 characters are your local date.
      date: String(a.createdAt || a.settledAt).slice(0, 10),
      amount: -cents,
      category: budgetFor(category, a.description, state),
      name: String(a.description || 'Up purchase').slice(0, 200),
    },
  };
}

async function upGet(fetchImpl, token, url) {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw Object.assign(new Error('Up rejected the token. Create a new one in the Up app and update UP_API_TOKEN in Vercel.'), { status: 401 });
  if (!res.ok) throw new Error(`Up API error (${res.status})`);
  return res.json();
}

/** Fetch accounts and recent transactions from Up, and classify them. */
export async function fetchFromUp({ token, since, state, fetchImpl = fetch, maxPages = 6 }) {
  const accounts = (await upGet(fetchImpl, token, `${UP_API}/accounts?page[size]=50`)).data || [];
  const transactionalIds = new Set(accounts.filter((x) => x.attributes?.accountType === 'TRANSACTIONAL').map((x) => x.id));
  const planned = plannedKeys(state);
  const entries = [];
  const skipped = {};
  let url = `${UP_API}/transactions?page[size]=100&filter[since]=${encodeURIComponent(`${since}T00:00:00+00:00`)}`;
  for (let page = 0; url && page < maxPages; page++) {
    const body = await upGet(fetchImpl, token, url);
    for (const tx of body.data || []) {
      const result = classify(tx, { transactionalIds, planned, state });
      if (result.action === 'add') entries.push(result.entry);
      else skipped[result.reason] = (skipped[result.reason] || 0) + 1;
    }
    url = body.links?.next || null;
  }
  return {
    entries,
    skipped,
    accounts: accounts.map((x) => ({
      name: x.attributes?.displayName,
      type: x.attributes?.accountType,
      balance: x.attributes?.balance?.valueInBaseUnits ?? 0,
    })),
  };
}
