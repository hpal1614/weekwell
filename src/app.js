import { api } from './api.js';
import {
  COMMITMENT_KINDS, PAY_PERIODS, PERIODS, POT_DEFAULT_NAMES, addDays, daysBetween, categoryAverages, commitmentNeed, formatMoney,
  fromCents, inRange, longDate, newId, perWeek, shortDate, spentByCategory, toCents, todayISO,
  weekLabel, weekStart, weeklyHistory, weeklyPlan, weeksPerPay,
} from './engine.js';
import { LESSONS, nextLesson, shouldShowLesson } from './lessons.js';
import { allocation, canBuyNow, coolingDays, emergencyFull, forecast, paydayPlan, suggestSplit, wantsTimeline, windfallSplit } from './forecast.js';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PERIOD_LABEL = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HISTORY_WEEKS = 8;

let state = null;
let transactions = [];       // newest first
let loadedFrom = null;       // earliest date we have fetched transactions for
let viewOffset = 0;          // 0 = this week, -1 = last week …
let saveQueue = Promise.resolve();
let up = { configured: false, accounts: null, syncing: false, lastSync: null };

const normaliseMerchant = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- helpers ----------

function today() { return todayISO(); }
function currentWeek() { return weekStart(today(), state.weekStartsOn); }
function viewedRange() {
  const start = addDays(currentWeek(), viewOffset * 7);
  return { start, end: addDays(start, 6) };
}
function budgetIcon(name) { return state.budgets.find((b) => b.name === name)?.icon || '•'; }

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A little burst of confetti plus a message, for the good moments. */
function celebrate(message, options) {
  toast(message, options);
  if (reducedMotion()) return;
  const colours = ['#c9f36a', '#234c39', '#f8b98f', '#9482b2', '#6f8f58', '#f2d06b'];
  const originX = window.innerWidth / 2;
  const originY = window.innerHeight * 0.45; // burst mid-screen, clear of the message at the bottom
  for (let i = 0; i < 26; i++) {
    const bit = document.createElement('i');
    bit.className = 'confetti';
    bit.style.background = colours[i % colours.length];
    bit.style.left = `${originX}px`;
    bit.style.top = `${originY}px`;
    document.body.append(bit);
    const angle = (Math.random() * Math.PI) - Math.PI; // upwards fan
    const dist = 120 + Math.random() * 180;
    bit.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) rotate(${360 + Math.random() * 360}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(angle) * dist * 1.2}px, ${Math.sin(angle) * dist + 140}px) rotate(${720}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => bit.remove();
  }
}

/** Numbers glide to their new value instead of jumping. */
const shownValues = new Map();
function countUp(el, cents, format = formatMoney) {
  const key = el.dataset.count;
  const from = shownValues.has(key) ? shownValues.get(key) : 0;
  shownValues.set(key, cents);
  if (reducedMotion() || from === cents) { el.textContent = format(cents); return; }
  const start = performance.now();
  const dur = 700;
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = format(Math.round(from + (cents - from) * eased));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function greet(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}` : part;
}
let userName = '';

function toast(message, { undo = false } = {}) {
  const el = $('toast');
  el.textContent = '';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (undo) {
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'toastundo', textContent: 'Undo' });
    btn.onclick = () => { el.classList.remove('show'); undoLast(); };
    el.append(btn);
  }
  el.classList.toggle('has-action', undo);
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 2600);
}

// ---------- undo ----------
// Every change can be undone: from the message that pops up, the Undo button in the
// top bar (steps back through the last 20 changes), or Ctrl/Cmd+Z on a computer.

const undoStack = [];

function pushUndo(label, run) {
  undoStack.push({ label, run });
  if (undoStack.length > 20) undoStack.shift();
  refreshUndo();
}

/** Undo for changes to the plan: put the whole plan back as it was. */
function planUndo(label, before) {
  pushUndo(label, async () => { state = before; await saveState(); });
}

function refreshUndo() {
  const top = undoStack[undoStack.length - 1];
  $('undoBtn').hidden = !top;
  if (top) $('undoBtn').title = `Undo: ${top.label}`;
}

async function undoLast() {
  const top = undoStack.pop();
  refreshUndo();
  if (!top) return;
  try {
    await top.run();
    render();
    toast(`Undone: ${top.label}`);
  } catch (error) {
    toast(`Couldn’t undo: ${error.message}`);
  }
}

function saveState() {
  render();
  const snapshot = structuredClone(state);
  saveQueue = saveQueue
    .then(() => api.putState(snapshot))
    .catch((error) => toast(`Save failed: ${error.message}`));
  return saveQueue;
}

async function ensureTransactionsFrom(start) {
  if (loadedFrom && start >= loadedFrom) return;
  const to = loadedFrom ? addDays(loadedFrom, -1) : undefined;
  const older = await api.listTransactions(start, to);
  transactions = [...transactions, ...older].sort(byNewest);
  loadedFrom = start;
}

function byNewest(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return Number(b.id) - Number(a.id);
}

function potName(key) {
  return state.pots?.[key]?.name || POT_DEFAULT_NAMES[key];
}

// ---------- rendering ----------

function render() {
  if (!state) return;
  const now = today();
  const plan = weeklyPlan(state, now);
  const range = viewedRange();
  const weekTx = transactions.filter((t) => inRange(t.date, range));
  const { byName, unmatched } = spentByCategory(weekTx, state.budgets);

  // hero
  if (document.activeElement !== $('income')) $('income').value = state.pay.amount ? fromCents(state.pay.amount).toFixed(2) : '0';
  $('payPeriod').value = state.pay.period;

  // week navigation
  $('weekLabel').textContent = viewOffset === 0 ? `This week · ${weekLabel(range)}` : weekLabel(range);
  $('nextWeek').disabled = viewOffset >= 0;
  $('spendPlanTitle').textContent = viewOffset === 0 ? 'Your weekly spending plan' : `Spending plan · ${weekLabel(range)}`;

  // budget cards
  $('budgetGrid').innerHTML = state.budgets.map((b, i) => {
    const spent = byName.get(b.name) || 0;
    const pct = b.limit > 0 ? Math.min(100, (spent / b.limit) * 100) : spent > 0 ? 100 : 0;
    const over = spent > b.limit;
    const note = over ? `Over by ${formatMoney(spent - b.limit)}` : b.limit > 0 ? `${formatMoney(b.limit - spent)} left` : 'No limit set';
    return `<article class="budget-card tone-${i % 4}">
      <div class="cardtop"><span class="cat-icon">${esc(b.icon)}</span><span class="spent">${formatMoney(spent)} spent</span></div>
      <h3>${esc(b.name)}</h3>
      <div class="budnum"><strong>${formatMoney(b.limit)}</strong><span>weekly limit</span></div>
      <div class="track"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></div>
      <div class="cardnote ${over ? 'over' : ''}">${note}</div>
    </article>`;
  }).join('') + (unmatched ? `<article class="budget-card"><div class="cardtop"><span class="cat-icon">?</span><span class="spent">${formatMoney(unmatched)} spent</span></div><h3>Uncategorised</h3><div class="cardnote">From categories you removed or renamed. Edit those entries to move them.</div></article>` : '');

  // spending list
  const total = weekTx.reduce((s, t) => s + t.amount, 0);
  $('txTitle').textContent = viewOffset === 0 ? 'Spending this week' : `Spending · ${weekLabel(range)}`;
  $('txTotal').textContent = `${formatMoney(total)} · ${weekTx.length} ${weekTx.length === 1 ? 'entry' : 'entries'}`;
  $('txList').innerHTML = weekTx.length
    ? weekTx.map((t) => `<div class="txrow">
        <span class="txicon">${esc(budgetIcon(t.category))}</span>
        <div><div class="txname">${esc(t.name)}</div><div class="txmeta">${esc(t.category)} · ${longDate(t.date)}${t.source === 'up' ? ' <span class="srcbadge" title="Added automatically from Up">Up</span>' : ''}</div></div>
        <span class="txamt">−${formatMoney(t.amount)}</span>
        <span class="rowactions"><button class="iconbtn" data-edit-tx="${esc(t.id)}" title="Edit" aria-label="Edit ${esc(t.name)}">✎</button><button class="iconbtn" data-del-tx="${esc(t.id)}" title="Delete" aria-label="Delete ${esc(t.name)}">×</button></span>
      </div>`).join('')
    : `<div class="empty">${viewOffset === 0 ? 'No spending logged yet this week. Add purchases as you go to see your limits move.' : 'Nothing was logged this week.'}</div>`;

  const f = forecast(state, transactions, now);
  renderSummary(plan, f, now);
  renderForecast(f, now);
  renderHistory(now);
  renderSide(plan, now);
  renderPots(f);
  renderIncoming(f);
  renderWants(f, now);
  renderTip(plan, f);
}

// The four numbers on the green card. Once the forecast is set up they come from it
// (what matters day to day); before that, from the simple weekly plan.
function renderSummary(plan, f, now) {
  // value: a string, or { cents } to have the number glide to its new value.
  const tile = (label, value, hint, { alert = false, negative = false, button = false } = {}) => {
    const shown = typeof value === 'object' ? `<span data-count="${esc(label)}" data-cents="${value.cents}">${formatMoney(shownValues.get(label) ?? 0)}</span>` : value;
    return `<div><label>${label}</label>${button
      ? `<button class="editable" type="button" data-open="plan" title="Change your savings plan">${shown}</button>`
      : `<strong class="${negative ? 'negative' : ''}">${shown}</strong>`}<div class="microhint ${alert ? 'alert' : ''}">${hint}</div></div>`;
  };
  let html;
  if (f.perPay !== undefined) {
    const days = daysBetween(now, f.nextPay);
    const committed = allocation(state, f.perPay);
    html = [
      tile('Next payday', shortDate(f.nextPay), days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`),
      tile('Safe to save', { cents: f.perPay }, committed.committed ? 'each pay · tap to change split' : 'each pay · tap to choose split', { button: true }),
      tile('Lowest point ahead', { cents: f.min }, `${shortDate(f.minDate)}${f.status === 'short' ? ' · tight' : ''}`, { alert: f.status === 'short', negative: f.min < 0 }),
      tile('Everyday spending', { cents: plan.spending }, 'per week · your limits'),
    ];
    $('helloSub').textContent = `${days === 0 ? 'Payday is today' : days === 1 ? 'Payday is tomorrow' : `Payday in ${days} days`} · ${f.perPay > 0 ? `${formatMoney(f.perPay)} safe to save` : 'everything’s covered, no spare to save yet'}`;
  } else {
    html = [
      tile('Bills + commitments', formatMoney(plan.bills + plan.commitments), plan.overdue ? `incl. ${formatMoney(plan.overdue)} overdue` : 'weekly + due soon', { alert: plan.overdue > 0 }),
      tile('Everyday spending', formatMoney(plan.spending), 'weekly limits'),
      tile('Savings + emergency', formatMoney(plan.saving), 'per week · tap to change', { button: true }),
      tile('Still to plan', formatMoney(plan.left), 'before other living costs', { negative: plan.left < 0 }),
    ];
  }
  $('allocation').innerHTML = html.join('');
  $('hello').textContent = greet(userName);
  if (f.perPay === undefined) $('helloSub').textContent = 'Let’s finish setting up your plan.';
  for (const el of $('allocation').querySelectorAll('[data-cents]')) countUp(el, Number(el.dataset.cents));
}

function renderHistory(now) {
  const weeks = weeklyHistory(transactions, state.budgets, now, state.weekStartsOn, HISTORY_WEEKS);
  $('weekHistory').innerHTML = `<thead><tr><th>Week</th><th class="num">Spent</th><th class="num limitcol">Limit</th><th class="barcell">Against limit</th><th class="num">Unspent</th></tr></thead><tbody>${
    weeks.map((w, i) => {
      const pct = w.limit > 0 ? Math.min(100, (w.spent / w.limit) * 100) : w.spent > 0 ? 100 : 0;
      const over = w.spent > w.limit;
      const label = w.current ? `This week (${weekLabel(w.range)})` : weekLabel(w.range);
      return `<tr class="clickable ${-i === viewOffset ? 'current' : ''}" data-week="${-i}" title="Show this week">
        <td>${label}</td>
        <td class="num">${formatMoney(w.spent)}</td>
        <td class="num limitcol">${formatMoney(w.limit)}</td>
        <td class="barcell"><div class="meter" title="${Math.round(w.limit ? (w.spent / w.limit) * 100 : 0)}% of limit"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></div></td>
        <td class="num">${over ? `<span class="overtext">over ${formatMoney(-w.unspent)}</span>` : formatMoney(w.unspent)}</td>
      </tr>`;
    }).join('')}</tbody>`;

  const avg = categoryAverages(transactions, state.budgets, now, state.weekStartsOn, 4);
  const anySpend = avg.rows.some((r) => r.total > 0);
  $('categoryHistory').innerHTML = !anySpend
    ? `<tbody><tr><td class="muted">No spending logged in the 4 weeks from ${shortDate(avg.range.start)} to ${shortDate(avg.range.end)} yet. After a few weeks of logging, this shows where your money actually goes.</td></tr></tbody>`
    : `<thead><tr><th>Category</th><th class="num">Avg / week</th><th class="num limitcol">Limit</th><th class="barcell">Against limit</th><th class="num">4-week total</th></tr></thead><tbody>${
      avg.rows.map((r) => {
        const limit = r.limit ?? 0;
        const pct = limit > 0 ? Math.min(100, (r.average / limit) * 100) : r.average > 0 ? 100 : 0;
        const over = r.limit !== null && r.average > limit;
        return `<tr><td>${esc(r.icon)} ${esc(r.name)}</td><td class="num ${over ? 'overtext' : ''}">${formatMoney(r.average)}</td><td class="num limitcol">${r.limit === null ? '—' : formatMoney(limit)}</td>
          <td class="barcell"><div class="meter"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></div></td><td class="num">${formatMoney(r.total)}</td></tr>`;
      }).join('')}</tbody>`;
}

function renderSide(plan, now) {
  $('billPill').textContent = `${formatMoney(plan.bills)} / week`;
  $('billList').innerHTML = state.bills.length
    ? state.bills.map((b) => `<div class="billrow">
        <span class="billicon">${esc(b.icon || '↻')}</span>
        <button class="billmain" data-edit-bill="${esc(b.id)}" title="Edit"><div class="billname">${esc(b.name)}</div><div class="billdue">${PERIOD_LABEL[b.period]} · ${b.nextDue ? `next ${shortDate(nextBillDate(b, now))}` : 'add a due date'} · ${formatMoney(perWeek(b.amount, b.period))}/wk</div></button>
        <span class="billcost">${formatMoney(b.amount)}<button class="iconbtn" data-del-bill="${esc(b.id)}" title="Remove" aria-label="Remove ${esc(b.name)}">×</button></span>
      </div>`).join('')
    : '<div class="empty">No bills added yet. Add rent, subscriptions and regular payments.</div>';

  $('afterpayPill').textContent = `Afterpay owing ${formatMoney(state.afterpayBalance)}`;
  const sorted = state.commitments.slice().sort((a, b) => (a.due || '0000').localeCompare(b.due || '0000'));
  $('commitmentList').innerHTML = sorted.length
    ? sorted.map((c) => {
        const need = commitmentNeed(c, now);
        const when = need.status === 'overdue' ? `Overdue since ${shortDate(c.due)} · needed now`
          : need.status === 'now' ? 'No due date · hold the full amount now'
          : `Due ${longDate(c.due)} · set aside ${formatMoney(need.perWeek)}/wk${need.savedSoFar ? ` · ≈${formatMoney(need.savedSoFar)} put aside so far` : ''}`;
        return `<div class="billrow">
          <span class="billicon">${c.kind === 'Afterpay' ? '↗' : c.kind === 'Friend' ? '☺' : '◷'}</span>
          <button class="billmain" data-edit-com="${esc(c.id)}" title="Edit"><div class="billname">${esc(c.name)}${c.kind && c.kind !== c.name ? ` <span class="muted">· ${esc(c.kind)}</span>` : ''}</div><div class="billdue ${need.status === 'overdue' ? 'overdue' : ''}">${when}${c.paid ? ` · ${formatMoney(c.paid)} paid so far` : ''}</div></button>
          <span class="billcost">${formatMoney(c.amount)}<button class="checkbtn small" type="button" data-pay-com="${esc(c.id)}" aria-label="Pay ${esc(c.name)}">${CHECK_SVG}</button><button class="iconbtn" data-del-com="${esc(c.id)}" title="Remove" aria-label="Remove ${esc(c.name)}">×</button></span>
        </div>`;
      }).join('')
    : '<div class="empty">No one-off payments. Add invoices, Afterpay instalments or anything due on a date.</div>';
  $('commitmentSummary').textContent = state.commitments.length
    ? `Needed this week: ${formatMoney(plan.commitments)}${plan.overdue ? ` (incl. ${formatMoney(plan.overdue)} overdue)` : ''}${plan.dueNow ? ` (incl. ${formatMoney(plan.dueNow)} with no due date)` : ''}`
    : '';

}

function renderTip(plan, f) {
  let tip;
  if (plan.income === 0) tip = 'Start by entering your take-home pay above. Everything else is worked out per week from it.';
  else if (f.status === 'short') tip = `Heads up: around ${longDate(f.shortDate)} your money is forecast to dip ${formatMoney(f.shortfall)} below your buffer, even with no saving. Seeing it now means you can plan for it instead of borrowing.`;
  else if (f.status === 'ok') {
    const a = allocation(state, f.perPay);
    if (a.overBy > 0) tip = `Your savings plan is ${formatMoney(a.overBy)} per pay more than is safe right now. Lower it a little. Saving less but never withdrawing beats saving more and taking it back.`;
    else if (!a.committed) tip = `You can safely save ${formatMoney(f.perPay)} each pay. Choose your split in “Looking ahead”, then move it to your Up Savers on payday.`;
    else if (state.bills.some((b) => !b.nextDue)) tip = 'Add due dates to your bills (tap a bill). The forecast already counts them, but dates make the tightest weeks show up exactly.';
    else tip = `On payday, move ${formatMoney(a.savings + a.emergency + a.wants)} out of CommBank into your Up Savers, then update balances. Everything left is already planned for.`;
  }
  else if (plan.left < 0) tip = `Your bills, limits and savings add up to ${formatMoney(-plan.left)} more than you earn each week. Lower a limit or the savings target so the plan is something you can actually follow.`;
  else if (plan.overdue > 0 && f.status !== 'short') tip = `${formatMoney(plan.overdue)} is overdue. It's counted as needed this week, so the plan won't show that money as spare.`;
  else if (plan.spending === 0) tip = `Your listed bills reserve ${formatMoney(plan.bills)} each week. The remaining ${formatMoney(plan.left)} still has to cover everything else, so set spending limits next.`;
  else tip = `With your current limits, ${formatMoney(plan.left)} is unplanned each week. Log spending for a few weeks, then use History to set limits that match real life.`;
  $('tipText').textContent = tip;
}


// ---------- forecast panel ----------

function nextBillDate(bill, now) {
  if (!bill.nextDue) return null;
  let d = bill.nextDue;
  for (let k = 0; d < now && k < 2000; k++) d = stepDate(bill.nextDue, bill.period, k + 1);
  return d;
}
function stepDate(anchor, period, k) {
  const months = { monthly: 1, quarterly: 3, annual: 12 }[period];
  if (!months) return addDays(anchor, (period === 'fortnightly' ? 14 : 7) * k);
  const [y, m, d] = anchor.split('-').map(Number);
  const total = m - 1 + months * k;
  const year = y + Math.floor(total / 12), month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function renderForecast(f, now) {
  const paydayHtml = renderPaydayCard(f);
  $('paydayPanel').innerHTML = paydayHtml;
  $('paydayPanel').hidden = !paydayHtml;
  const panel = $('forecastPanel');
  const head = `<div class="sectionhead"><h2>Looking ahead · next 12 months</h2><button class="linkbtn" data-open="balances">Update balances</button></div>`;
  if (f.status === 'needs-pay') { panel.innerHTML = `${head}<div class="notice info">Enter your take-home pay above to see what's safe to save.</div>`; return; }
  if (f.status === 'needs-payday') { panel.innerHTML = `${head}<div class="notice info">When is your next payday? The forecast needs it to know when money arrives.<br><button class="inlinebtn" data-open="settings">Set next payday</button></div>`; return; }
  if (f.status === 'needs-balances') {
    panel.innerHTML = `${head}<div class="notice info">Last step: tell Weekwell how much money you have right now: what's in CommBank and Up Spending, plus your Up Savers. It uses that to work out what's safe to save.<br><button class="inlinebtn" data-open="balances">Enter balances</button></div>`;
    return;
  }
  const alloc = allocation(state, f.perPay);
  const suggestion = suggestSplit(state, f.perPay);
  const stale = f.staleDays > 10 ? `<div class="notice">Balances were last updated ${f.staleDays} days ago. Update them after payday so the forecast stays accurate. <button class="inlinebtn light" data-open="balances">Update now</button></div>` : '';
  const spendNote = f.spending.usingActual ? `<div class="notice">The forecast uses what you actually spend (${formatMoney(f.spending.actual)}/week over the last 4 weeks), because it's more than your limits (${formatMoney(f.spending.limits)}/week).</div>` : '';
  const short = f.status === 'short'
    ? `<div class="notice warn"><b>Tight time ahead.</b> Around ${longDate(f.shortDate)}, money is forecast to drop ${f.shortDate < f.nextPay ? `${formatMoney(f.shortfall)} below $0 before your next pay arrives` : `${formatMoney(f.shortfall)} below your ${formatMoney(f.buffer)} buffer`}, even if you save nothing. Look at the dates below. Moving a payment, lowering a limit, or using the buffer now beats a credit card later.</div>` : '';
  const over = alloc.overBy > 0
    ? `<div class="notice warn">Your plan saves ${formatMoney(alloc.savings + alloc.emergency)} per pay, but only ${formatMoney(f.perPay)} is safe right now. Saving more than that is what leads to withdrawing later. <button class="inlinebtn" data-open="plan">Adjust the plan</button></div>` : '';
  const split = !alloc.committed
    ? `<div class="notice info">Suggested split of the ${formatMoney(f.perPay)}: <b>${formatMoney(suggestion.savings)}</b> to locked savings${suggestion.emergency ? `, <b>${formatMoney(suggestion.emergency)}</b> to your emergency fund` : ''}, <b>${formatMoney(suggestion.wants)}</b> to wants. <br><button class="inlinebtn" data-open="plan">Choose my split</button></div>`
    : `<div class="splitrow"><span class="muted">Each payday move:</span>
        <span class="chip">Locked savings <b>${formatMoney(alloc.savings)}</b></span>
        ${alloc.emergency ? `<span class="chip">Emergency fund <b>${formatMoney(alloc.emergency)}</b></span>` : emergencyFull(state) ? '<span class="chip">Emergency fund <b>full ✓</b></span>' : ''}
        <span class="chip">Wants <b>${formatMoney(alloc.wants)}</b></span>
        <button class="linkbtn" data-open="plan">Change</button></div>
       <div class="fieldhint">From CommBank to your Up Savers, once your pay lands. Then update balances.</div>`;
  panel.innerHTML = `${head}
    <div class="stats">
      <div class="stat hero"><label>Safe to save each pay</label><strong>${formatMoney(f.perPay)}</strong><div class="sub">next payday ${longDate(f.nextPay)}. Nothing you'll need back.</div></div>
      <div class="stat ${f.status === 'short' ? 'warn' : ''}"><label>Lowest point ahead</label><strong>${formatMoney(f.min)}</strong><div class="sub">around ${longDate(f.minDate)}, after saving</div></div>
      <div class="stat"><label>Money now</label><strong>${formatMoney(f.cash)}</strong><div class="sub">${f.belowBufferUntilPayday ? `building up to a ${formatMoney(f.buffer)} buffer from payday` : `${formatMoney(f.buffer)} of it always stays as your buffer`}</div></div>
    </div>
    ${short}${over}${split}${stale}${spendNote}
    <div class="chartwrap" id="chartWrap"></div>
    <details class="upcoming"><summary>Coming out in the next 8 weeks (${f.upcoming.length})</summary>
      <div class="tablewrap"><table class="history"><thead><tr><th>Date</th><th>What</th><th class="num">Amount</th></tr></thead><tbody>
      ${f.upcoming.length ? f.upcoming.map((u) => `<tr><td>${longDate(u.date)}</td><td>${esc(u.name)}</td><td class="num">${formatMoney(-u.amount)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Nothing dated. Add due dates to bills and payments to see them here.</td></tr>'}
      </tbody></table></div>
      ${state.bills.some((b) => !b.nextDue) ? '<div class="hint">Bills without a due date are counted as a weekly share instead of on a date.</div>' : ''}
    </details>`;
  drawChart(f);
}

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

// ---------- payday card: one place for what to do with your pay ----------

/** The payday you're working through (after ticking "pay landed"), until the next payday comes. */
function currentSession(f) {
  const pd = state.payday;
  if (!pd?.received || !Array.isArray(pd.steps)) return null;
  if (f.nextPay && today() >= f.nextPay) return null;
  return pd;
}

/** Turn the plan for a payday into a checklist you tick off one by one. */
function buildSteps(p) {
  const steps = [];
  const one = (x, overdue) => {
    const name = x.name.split(' (')[0];
    return { key: `com:${x.id}`, kind: 'commitment', ref: x.id, overdue, label: /^pay\b/i.test(name) ? name : `Pay ${name}`, amount: x.amount, done: false };
  };
  for (const x of p.dueAlready) steps.push(one(x, true));
  for (const x of p.onPayday.filter((y) => !y.auto && y.id)) steps.push(one(x, false));
  const autoNow = p.onPayday.filter((y) => y.auto);
  const keepList = [...autoNow, ...p.beforeNext];
  const keep = keepList.reduce((a, x) => a + x.amount, 0) + p.undated;
  if (keep) {
    steps.push({ key: 'keep', kind: 'keep', label: `Leave this in your account for bills until ${shortDate(p.next)}`, amount: keep, done: false,
      detail: [...keepList.map((x) => `${x.name.split(' (')[0]}${x.date !== p.pay ? ` (${shortDate(x.date)})` : ''} ${formatMoney(x.amount)}`), ...(p.undated ? [`bills with no due date yet ${formatMoney(p.undated)}`] : [])].join(' · ') });
  }
  steps.push({ key: 'spend', kind: 'spend', label: `Your spending money until ${shortDate(p.next)}`, amount: p.spending, done: false,
    detail: p.spendingBreakdown.map((b) => `${b.icon} ${b.name} ${formatMoney(b.amount)}`).join(' · ') });
  if (p.moves.savings) steps.push({ key: 'move:savings', kind: 'move', pot: 'savings', label: `Move to ${potName('savings')}`, amount: p.moves.savings, done: false });
  if (p.moves.emergency) steps.push({ key: 'move:emergency', kind: 'move', pot: 'emergency', label: `Move to ${potName('emergency')}`, amount: p.moves.emergency, done: false });
  if (p.moves.wants) steps.push({ key: 'move:wants', kind: 'wants', label: `Move to your wish list${state.wants[0] ? ` (#1 ${state.wants[0].name})` : ''}`, amount: p.moves.wants, done: false });
  return steps;
}

function moneyBar(segs) {
  const bar = segs.filter((x) => x.amount > 0).map((x) => `<i class="seg seg-${x.key}" style="flex-grow:${x.amount}" title="${x.label}: ${formatMoney(x.amount)}"></i>`).join('');
  const legend = segs.map((x) => `<li><span class="dot seg-${x.key}"></span><span>${x.label}</span><b>${formatMoney(x.amount)}</b></li>`).join('');
  return `<div class="pp-flow"><div class="pp-bar" role="img" aria-label="Where your money goes">${bar}</div><ul class="pp-legend">${legend}</ul></div>`;
}

function stepRow(st, n, { locked = false } = {}) {
  const exists = st.kind !== 'commitment' || state.commitments.some((c) => c.id === st.ref);
  const done = st.done || !exists;
  return `<li class="ckstep ${done ? 'done' : ''} ${locked && !done ? 'locked' : ''}">
    <button class="ckbox" type="button" data-step="${esc(st.key)}" ${done || locked ? 'disabled' : ''} aria-label="${done ? 'Done' : 'Mark done'}: ${esc(st.label)}">${done ? CHECK_SVG : `<span>${n}</span>`}</button>
    <div class="ckmain"><div class="cklabel">${esc(st.label)}</div>${st.detail ? `<div class="ckdetail">${esc(st.detail)}</div>` : ''}
      ${st.kind === 'commitment' && !done && !locked ? `<button class="linkbtn ckpart" type="button" data-pay-com="${esc(st.ref)}">Paying only part?</button>` : ''}</div>
    <b class="ckamt">${formatMoney(st.amount)}</b></li>`;
}

function renderPaydayCard(f) {
  const session = currentSession(f);
  if (session) {
    const steps = session.steps;
    const doneCount = steps.filter((st) => st.done || (st.kind === 'commitment' && !state.commitments.some((c) => c.id === st.ref))).length;
    const total = steps.length + 1; // + "pay landed"
    const all = doneCount === steps.length;
    const pct = Math.round(((doneCount + 1) / total) * 100);
    const head = `<div class="sectionhead"><div><h2>${all ? 'Payday done 🎉' : 'Payday checklist'}</h2><div class="pp-sub">${longDate(session.date)} · ${formatMoney(session.amount)} landed · ${doneCount + 1} of ${total} done</div></div></div>
      <div class="ckprogress"><i style="width:${pct}%"></i></div>`;
    if (all) {
      return `${head}<p class="pp-done-note">Everything for this pay is sorted. Next payday is <b>${longDate(f.nextPay)}</b>. Until then, your spending money is in “Spending”.</p>
        <details class="ckmore"><summary>See what you did</summary><ol class="checklist2">${steps.map((st, i) => stepRow(st, i + 2)).join('')}</ol></details>`;
    }
    return `${head}${session.summary ? moneyBar(session.summary) : ''}
      <ol class="checklist2"><li class="ckstep done"><span class="ckbox" aria-hidden="true">${CHECK_SVG}</span><div class="ckmain"><div class="cklabel">Pay landed</div></div><b class="ckamt">${formatMoney(session.amount)}</b></li>
      ${steps.map((st, i) => stepRow(st, i + 2)).join('')}</ol>
      <p class="hint">Each tick updates your balances and Savers for you. Changed your mind? Tap Undo.</p>`;
  }
  if (f.perPay === undefined) return '';
  const p = paydayPlan(f, state);
  if (!p) return '';
  const days = daysBetween(today(), p.pay);
  const left = p.leftBeforeNext ? p.leftBeforeNext.amount : 0;
  const keep = p.beforeNextTotal + p.undated + p.onPayday.filter((x) => x.auto).reduce((a, x) => a + x.amount, 0);
  const payNow = p.onPayday.filter((x) => !x.auto).reduce((a, x) => a + x.amount, 0);
  const segs = [
    { key: 'now', label: 'Pay on payday', amount: payNow },
    { key: 'keep', label: 'Keep for bills', amount: keep },
    { key: 'spend', label: 'Spending money', amount: p.spending },
    { key: 'save', label: 'To your Savers', amount: p.movesTotal },
    { key: 'left', label: 'Left over', amount: Math.max(0, left) },
  ];
  const steps = buildSteps(p);
  const usual = state.pay.amount;
  const ok = left >= f.buffer;
  return `<div class="sectionhead"><div><h2>Next payday · ${longDate(p.pay)}</h2><div class="pp-sub">${days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `In ${days} days`} · here’s exactly what to do with it</div></div></div>
    <div class="payinput"><label for="thisPay">This pay</label><div class="payfield"><span>$</span><input id="thisPay" type="number" inputmode="decimal" step="0.01" min="0" value="${fromCents(p.payAmount).toFixed(2)}"></div>
      <div class="fieldhint">${p.payAmount !== usual ? `Changed for this pay only. Your usual pay is ${formatMoney(usual)}. <button class="linkbtn" type="button" id="resetPay">Use usual</button>` : 'Your usual pay. Getting a different amount this time (e.g. a day off)? Change it here.'}</div></div>
    ${p.lowBeforePay ? `<div class="notice">Until then your lowest point is <b>${formatMoney(p.lowBeforePay.amount)}</b> on ${longDate(p.lowBeforePay.date)}. Keep spending light.</div>` : ''}
    ${moneyBar(segs)}
    <ol class="checklist2">
      <li class="ckstep next"><button class="ckbox" type="button" id="payLanded" aria-label="My pay landed"><span>1</span></button><div class="ckmain"><div class="cklabel">When your pay lands, tick this</div><div class="ckdetail">Adds it to your account and unlocks the steps below.</div></div><b class="ckamt">${formatMoney(p.payAmount)}</b></li>
      ${steps.map((st, i) => stepRow(st, i + 2, { locked: !st.overdue })).join('')}
    </ol>
    <div class="pp-result ${ok ? 'good' : left >= 0 ? 'tight' : 'bad'}"><div><div class="pp-result-label">Left on ${p.leftBeforeNext ? shortDate(p.leftBeforeNext.date) : ''}, the night before your next pay</div><div class="pp-result-note">${ok ? 'Your safety buffer stays untouched. 👌' : left >= 0 ? `Below your ${formatMoney(f.buffer)} buffer, but you don’t run out. Go easy this fortnight.` : 'You’d run out before your next pay. Pay something later or move less to Savers.'}</div></div><b>${formatMoney(left)}</b></div>`;
}

/** Pay a one-off in full: it leaves your account and stops counting as owed. */
function payFull(c) {
  if (c.kind === 'Afterpay') state.afterpayBalance = Math.max(0, state.afterpayBalance - c.amount);
  state.balances.everyday -= c.amount;
  state.commitments = state.commitments.filter((x) => x !== c);
  markStep(`com:${c.id}`);
}

function markStep(key) {
  const st = state.payday?.steps?.find((x) => x.key === key);
  if (st) st.done = true;
}

function afterStep() {
  const pd = state.payday;
  if (pd?.steps && pd.steps.every((st) => st.done || (st.kind === 'commitment' && !state.commitments.some((c) => c.id === st.ref)))) {
    celebrate('Payday done 🎉 Everything’s sorted until next payday.', { undo: true });
    return true;
  }
  return false;
}

async function tickStep(key) {
  const before = structuredClone(state);
  const pd = state.payday;
  const f = forecast(state, transactions, today());
  const live = !currentSession(f) && f.perPay !== undefined ? buildSteps(paydayPlan(f, state)) : null;
  const st = (pd?.steps || []).find((x) => x.key === key) || live?.find((x) => x.key === key);
  if (!st) return;
  let message = 'Done ✓';
  if (st.kind === 'commitment') {
    const c = find(state.commitments, st.ref);
    if (c) { payFull(c); message = `Paid ✓ ${c.name.split(' (')[0]}`; }
  } else if (st.kind === 'move') {
    state.pots[st.pot].balance += st.amount;
    state.balances.everyday -= st.amount;
    message = `Moved ${formatMoney(st.amount)} to ${potName(st.pot)} ✓`;
  } else if (st.kind === 'wants') {
    let left = st.amount;
    for (const w of state.wants) {
      const put = Math.min(left, Math.max(0, w.price - w.saved));
      w.saved += put;
      left -= put;
      if (!left) break;
    }
    state.balances.everyday -= st.amount - left;
    message = `Moved ${formatMoney(st.amount - left)} to your wants ✓`;
  } else if (st.kind === 'keep') message = 'Bills money is set aside ✓';
  else if (st.kind === 'spend') message = 'That’s yours to spend ✓';
  if (pd?.steps) markStep(key);
  await saveState();
  planUndo(st.label, before);
  if (!afterStep()) celebrate(message, { undo: true });
}

async function payLanded() {
  const f = forecast(state, transactions, today());
  if (f.perPay === undefined) return;
  const p = paydayPlan(f, state);
  const before = structuredClone(state);
  const keep = p.beforeNextTotal + p.undated + p.onPayday.filter((x) => x.auto).reduce((a, x) => a + x.amount, 0);
  const payNow = p.onPayday.filter((x) => !x.auto).reduce((a, x) => a + x.amount, 0);
  state.balances = { everyday: state.balances.everyday + p.payAmount, updatedOn: today() };
  state.payday = {
    date: p.pay, amount: p.payAmount, received: true, steps: buildSteps(p),
    summary: [
      { key: 'now', label: 'Pay on payday', amount: payNow },
      { key: 'keep', label: 'Keep for bills', amount: keep },
      { key: 'spend', label: 'Spending money', amount: p.spending },
      { key: 'save', label: 'To your Savers', amount: p.movesTotal },
      { key: 'left', label: 'Left over', amount: Math.max(0, p.leftBeforeNext?.amount || 0) },
    ],
  };
  await saveState();
  planUndo('Pay landed', before);
  celebrate(`Pay landed: ${formatMoney(p.payAmount)} 🎉 Now tick the steps one by one.`, { undo: true });
}

/** Pay a one-off payment in full or in part (the rest stays in the plan with a new date). */
function payForm(c) {
  if (!c) return;
  const f = forecast(state, transactions, today());
  const upcoming = (f.paydays || []).filter((d) => d > today());
  // The rest defaults to the first payday after it was due (or after today).
  const after = c.due && c.due > today() ? c.due : today();
  const restDefault = upcoming.find((d) => d > after) || addDays(after, 14);
  const half = Math.round(c.amount / 2);
  $('modalTitle').textContent = `Pay: ${c.name.split(' (')[0]}`;
  $('modalBody').innerHTML = `
    <p class="pay-due">${formatMoney(c.amount)} to pay${c.paid ? ` <span class="muted">· ${formatMoney(c.paid)} paid already</span>` : ''}</p>
    <div class="choice" role="group" aria-label="How much did you pay?">
      <button type="button" class="choicebtn active" data-amt="${c.amount}"><span>Full</span><b>${formatMoney(c.amount)}</b></button>
      <button type="button" class="choicebtn" data-amt="${half}"><span>Half</span><b>${formatMoney(half)}</b></button>
      <button type="button" class="choicebtn" data-amt="custom"><span>Other</span><b>amount</b></button>
    </div>
    <div class="formrow"><label for="payAmt">Amount you paid</label><input id="payAmt" type="number" inputmode="decimal" step="0.01" min="0.01" value="${fromCents(c.amount).toFixed(2)}"></div>
    <div class="formrow" id="restRow" hidden><label for="restDue">When will you pay the rest?</label><input id="restDue" type="date" min="${today()}" value="${restDefault}"><div class="fieldhint" id="restHint"></div></div>
    <div class="formerror" id="formError"></div>
    <button class="savebtn" id="paySave" type="button">Mark fully paid</button>`;
  const input = $('payAmt');
  const update = () => {
    const amt = toCents(input.value);
    const partial = amt > 0 && amt < c.amount;
    $('restRow').hidden = !partial;
    $('restHint').textContent = partial ? `The other ${formatMoney(c.amount - amt)} stays in your plan, due on that date.` : '';
    $('paySave').textContent = partial ? `Paid ${formatMoney(amt)} now` : 'Mark fully paid';
    for (const b of $('modalBody').querySelectorAll('.choicebtn')) b.classList.toggle('active', b.dataset.amt === String(amt) || (b.dataset.amt === 'custom' && amt !== c.amount && amt !== half));
  };
  for (const b of $('modalBody').querySelectorAll('.choicebtn')) {
    b.onclick = () => {
      if (b.dataset.amt === 'custom') { input.value = ''; input.focus(); } else input.value = fromCents(Number(b.dataset.amt)).toFixed(2);
      update();
    };
  }
  input.oninput = update;
  $('paySave').onclick = async () => {
    const amt = toCents(input.value);
    if (!(amt > 0)) { $('formError').textContent = 'Enter how much you paid.'; return; }
    const before = structuredClone(state);
    const paidNow = Math.min(amt, c.amount);
    if (amt >= c.amount) {
      payFull(c);
      await saveState();
      closeModal();
      planUndo(`Pay ${c.name.split(' (')[0]}`, before);
      celebrate(`Paid ✓ ${c.name.split(' (')[0]}. One less thing to think about.`, { undo: true });
    } else {
      const rest = $('restDue').value;
      if (!rest || rest < today()) { $('formError').textContent = 'Choose a date for the rest (today or later).'; return; }
      if (c.kind === 'Afterpay') state.afterpayBalance = Math.max(0, state.afterpayBalance - paidNow);
      state.balances.everyday -= paidNow;
      c.amount -= paidNow;
      c.paid = (c.paid || 0) + paidNow;
      c.due = rest;
      markStep(`com:${c.id}`);
      await saveState();
      closeModal();
      planUndo(`Pay part of ${c.name.split(' (')[0]}`, before);
      celebrate(`Paid ${formatMoney(paidNow)} ✓ The other ${formatMoney(c.amount)} is due ${shortDate(rest)}.`, { undo: true });
    }
  };
  $('overlay').classList.add('open');
  update();
}

// ---------- daily lesson ----------

/** One short lesson, as a sheet that pops up the first time you open the app each day. */
function lessonDialog(lesson = nextLesson(state.learning), { daily = false } = {}) {
  const learning = state.learning || { seen: [] };
  const seen = new Set(learning.seen || []);
  const n = LESSONS.indexOf(lesson) + 1;
  $('modalTitle').textContent = daily ? 'Today’s 1-minute money lesson' : 'Money lesson';
  $('modalBody').innerHTML = `<div class="lesson">
      <div class="lessonicon" aria-hidden="true">${lesson.icon}</div>
      <div class="lessontopic">${esc(lesson.topic)} · ${n} of ${LESSONS.length}</div>
      <h3>${esc(lesson.title)}</h3>
      <p>${esc(lesson.body)}</p>
      <div class="lessonaction"><b>Try this</b><span>${esc(lesson.action)}</span></div>
      <div class="lessonprogress"><i style="width:${Math.round((seen.size / LESSONS.length) * 100)}%"></i></div>
      <div class="lessonmeta">${seen.size} of ${LESSONS.length} lessons learned · general info, not personal advice · more at moneysmart.gov.au</div>
      <div class="lessonbtns"><button type="button" class="laterbtn" id="lessonLater">Later</button><button type="button" class="savebtn" id="lessonGot">Got it ✓</button></div>
    </div>`;
  $('overlay').classList.add('open');
  const learn = (fn) => {
    const next = { ...learning, seen: [...new Set([...(learning.seen || []), lesson.id])].slice(-200) };
    state.learning = next;
    saveState();
    fn?.();
  };
  $('lessonGot').onclick = () => {
    const first = !seen.has(lesson.id);
    learn(() => {
      closeModal();
      if (first) celebrate(state.learning.seen.length === LESSONS.length ? 'You’ve done every lesson 🎓 They’ll go round again.' : `Nice. ${state.learning.seen.length} of ${LESSONS.length} learned 📚`);
    });
  };
  $('lessonLater').onclick = closeModal;
}

function maybeDailyLesson() {
  if (!state || !shouldShowLesson(state.learning, today())) return;
  if ($('overlay').classList.contains('open')) return;
  state.learning = { seen: [], ...state.learning, lastShown: today() };
  saveState();
  lessonDialog(nextLesson(state.learning), { daily: true });
}

function drawChart(f) {
  const wrap = $('chartWrap');
  if (!wrap) return;
  const W = Math.max(280, wrap.clientWidth || 600);
  const narrow = W < 520;
  const H = narrow ? 190 : 230, padL = narrow ? 50 : 56, padR = 10, padT = 18, padB = 26;
  // One point per week: the lowest balance that week. That's the number that matters,
  // and it avoids the saw-tooth of pay coming in and bills going out.
  const weeks = [];
  for (let i = 0; i < f.series.length; i += 7) {
    const chunk = f.series.slice(i, i + 7);
    const low = chunk.reduce((a, x) => (x.balance < a.balance ? x : a));
    weeks.push({
      start: chunk[0].date, balance: low.balance, lowDate: low.date,
      events: chunk.flatMap((d) => d.events.filter((e) => e.kind !== 'bill-estimate').map((e) => ({ ...e, date: d.date }))),
    });
  }
  const values = weeks.map((w) => w.balance);
  let lo = Math.min(0, f.buffer, ...values), hi = Math.max(f.buffer, ...values);
  if (hi === lo) hi = lo + 10000;
  const span = hi - lo; lo -= span * 0.06; hi += span * 0.1;
  const x = (i) => padL + (i / (weeks.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.balance).toFixed(1)}`).join('');
  const area = `${line}L${x(weeks.length - 1).toFixed(1)},${(H - padB).toFixed(1)}L${x(0).toFixed(1)},${(H - padB).toFixed(1)}Z`;
  const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v) >= 100000 ? `${(Math.abs(v) / 100000).toFixed(1).replace(/\.0$/, '')}k` : Math.round(Math.abs(v) / 100)}`;
  const ticks = [...new Set([lo + (hi - lo) * 0.12, (lo + hi) / 2, hi - (hi - lo) * 0.12].map((v) => Math.round(v / 10000) * 10000))];
  const monthMarks = [];
  weeks.forEach((w, i) => { const m = w.start.slice(0, 7); if (i > 0 && m !== weeks[i - 1].start.slice(0, 7)) monthMarks.push({ i, label: shortDate(w.start).split(' ')[1] }); });
  const shownMonths = monthMarks.filter((_, k) => !narrow || k % 2 === 0);
  const minI = Math.max(0, weeks.findIndex((w) => w.start <= f.minDate && f.minDate <= addDays(w.start, 6)));
  const below = f.status === 'short';
  const lx = x(minI);
  wrap.innerHTML = `<div class="charthead">Your balance, week by week <span class="muted">· lowest point each week</span><div class="chartlow ${below ? 'over' : ''}"><span class="lowdot"></span>Lowest ahead: <b>${formatMoney(f.min)}</b> on ${longDate(f.minDate)}</div></div>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lowest balance each week for the next 12 months. Lowest ${formatMoney(f.min)} on ${longDate(f.minDate)}.">
    <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#6f8f58" stop-opacity=".28"/><stop offset="100%" stop-color="#6f8f58" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${money(t)}</text>`).join('')}
    ${shownMonths.map(({ i, label }) => `<text class="axis" x="${x(i)}" y="${H - 7}" text-anchor="middle">${label}</text>`).join('')}
    <path class="area" d="${area}" fill="url(#areaFill)"/>
    <line class="bufferline" x1="${padL}" x2="${W - padR}" y1="${y(f.buffer)}" y2="${y(f.buffer)}"/>
    <text class="label muted" x="${W - padR}" y="${y(f.buffer) - 6}" text-anchor="end">buffer ${money(f.buffer)}</text>
    <path class="line" d="${line}"/>
    <circle cx="${lx}" cy="${y(weeks[minI].balance)}" r="6" fill="${below ? 'var(--over)' : 'var(--forest)'}" stroke="var(--card)" stroke-width="2.5"/>
    <line class="crosshair" id="crosshair" y1="${padT}" y2="${H - padB}" x1="0" x2="0" visibility="hidden"/>
    <circle id="hoverDot" r="5" fill="var(--forest)" stroke="var(--card)" stroke-width="2" visibility="hidden"/>
    <rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" id="chartHit"/>
  </svg><div class="charttip" id="chartTip"></div>`;
  const hit = $('chartHit'), tip = $('chartTip'), cross = $('crosshair'), dot = $('hoverDot');
  const show = (clientX) => {
    const rect = wrap.querySelector('svg').getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(weeks.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (weeks.length - 1))));
    const w = weeks[i];
    for (const el of [cross, dot]) el.setAttribute('visibility', 'visible');
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(w.balance));
    const outs = w.events.filter((e) => e.amount < 0).sort((a, b) => a.amount - b.amount);
    const ins = w.events.filter((e) => e.amount > 0);
    tip.innerHTML = `<div class="tiphead">Week of ${shortDate(w.start)}</div>Lowest <b>${formatMoney(w.balance)}</b>${ins.map((e) => `<br>+ ${esc(e.name)} <b>${formatMoney(e.amount)}</b>`).join('')}${outs.slice(0, 4).map((e) => `<br>− ${esc(e.name.split(' (')[0])} <b>${formatMoney(-e.amount)}</b>`).join('')}${outs.length > 4 ? `<br><span class="muted">and ${outs.length - 4} more</span>` : ''}`;
    const left = (x(i) / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left - 90, 0), rect.width - 190)}px`;
    tip.classList.add('show');
  };
  const hide = () => { tip.classList.remove('show'); for (const el of [cross, dot]) el.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
}

// ---------- pots & wants ----------

function meter(value, target) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return `<div class="meter" title="${Math.round(pct)}%"><i style="width:${pct}%"></i></div>`;
}

function renderPots(f) {
  const p = state.pots;
  const alloc = f.perPay !== undefined ? allocation(state, f.perPay) : null;
  const updated = state.balances.updatedOn ? `updated ${shortDate(state.balances.updatedOn)}` : 'not entered yet';
  $('potList').innerHTML = `
    <div class="potrow"><div class="pottop"><div><div class="potname">Everyday</div><div class="potwhere">CommBank + Up Spending · ${updated}</div></div><span class="potamt">${formatMoney(state.balances.everyday)}</span></div></div>
    <div class="potrow"><div class="pottop"><div><div class="potname">${esc(potName('buffer'))}</div><div class="potwhere">Kept in your everyday account · OK for bills & small surprises</div></div><span class="potamt">${formatMoney(p.buffer.balance)}</span></div>
      <div class="potnote">Buffer to keep: ${formatMoney(p.buffer.target)}</div></div>
    <div class="potrow"><div class="pottop"><div><div class="potname">${esc(potName('emergency'))}</div><div class="potwhere">Its own account · real emergencies only</div></div><span class="potamt">${formatMoney(p.emergency.balance)} / ${formatMoney(p.emergency.target)}</span></div>
      ${meter(p.emergency.balance, p.emergency.target)}
      <div class="potnote">${emergencyFull(state) ? 'Full ✓ Its share of each pay now goes to savings and wants.' : alloc && alloc.emergency ? `+${formatMoney(alloc.emergency)} each pay until full.` : 'Not being topped up yet. Choose your split in the forecast.'}</div></div>
    <div class="potrow"><div class="pottop"><div><div class="potname">${esc(potName('savings'))}</div><div class="potwhere">Up Saver · never withdraw, keeps the bonus rate</div></div><span class="potamt">${formatMoney(p.savings.balance)}</span></div>
      <div class="potnote">${alloc && alloc.savings ? `+${formatMoney(alloc.savings)} each pay. Untouched, it keeps Up's bonus rate.` : 'Choose how much goes here each pay in the forecast.'}</div></div>`;
}

function renderIncoming(f) {
  const list = state.incoming || [];
  const total = list.reduce((a, m) => a + m.amount, 0);
  $('incomingPill').textContent = total ? `${formatMoney(total)} expected` : 'not counted yet';
  $('incomingList').innerHTML = list.length ? list.map((m) => {
    const w = windfallSplit(state, m.amount, f?.status === 'short' ? f.shortfall : 0);
    const line = (name, amount) => (amount ? `<li><span>${esc(name)}</span><b>${formatMoney(amount)}</b></li>` : '');
    return `<div class="incomingrow">
      <div class="wanttop"><button class="wantname" data-edit-incoming="${esc(m.id)}" title="Edit">${esc(m.name)}</button><span class="potamt">${formatMoney(m.amount)}</span></div>
      <div class="wantstatus">${m.expectedOn ? `Expected around ${longDate(m.expectedOn)}` : 'Date not known yet'} · not in the plan until it arrives</div>
      <div class="potnote">When it lands, move it like this:</div>
      <ul class="items">${line(`Keep in your account for what’s coming${f?.shortDate ? ` (tightest around ${shortDate(f.shortDate)})` : ''}`, w.keep)}${line(`${potName('emergency')} (fills it to ${formatMoney(state.pots.emergency.target)})`, w.emergency)}${line(potName('savings'), w.savings)}${line('Wants', w.wants)}</ul>
      <div class="wantactions">
        <button class="smallbtn primary" data-arrived-incoming="${esc(m.id)}">It arrived</button>
        <button class="iconbtn" data-del-incoming="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">×</button>
      </div></div>`;
  }).join('') : '<div class="empty">Nothing expected. Add a tax refund, bonus or anything else you’re waiting on.</div>';
}

function incomingForm(existing) {
  openForm({
    title: existing ? 'Edit expected money' : 'Money you’re expecting',
    submitLabel: existing ? 'Save changes' : 'Add',
    fields: [
      { name: 'name', label: 'What is it?', placeholder: 'e.g. Tax refund', value: existing?.name, required: true },
      { name: 'amount', label: 'About how much', type: 'money', value: existing?.amount, required: true, min: 0.01, half: true },
      { name: 'expectedOn', label: 'Expected around (optional)', type: 'date', value: existing?.expectedOn, half: true },
    ],
    note: 'Weekwell won’t count this until you tap “It arrived”, so your plan never depends on money that might be late or smaller.',
    onSubmit: (v) => {
      state.incoming = state.incoming || [];
      const fields = { name: v.name, amount: v.amount, expectedOn: v.expectedOn };
      if (existing) Object.assign(existing, fields);
      else state.incoming.push({ id: newId('in'), ...fields });
      saveState();
    },
  });
}

// Wish list: "Must have" gets money first, then "Nice to have", then "Someday".
// Within each group, the order you set (↑ ↓) decides which one is funded first.
const PRIORITIES = [
  { value: 'must', label: 'Must have', icon: '🔥' },
  { value: 'nice', label: 'Nice to have', icon: '✨' },
  { value: 'someday', label: 'Someday', icon: '🌙' },
];
const prioRank = (w) => Math.max(0, PRIORITIES.findIndex((p) => p.value === (w.priority || 'nice')));
function sortWants() {
  state.wants = state.wants.map((w, i) => [w, i]).sort((a, b) => prioRank(a[0]) - prioRank(b[0]) || a[1] - b[1]).map(([w]) => w);
}
function moveWant(w, dir) {
  const list = state.wants;
  const i = list.indexOf(w);
  const j = i + dir;
  if (j < 0 || j >= list.length) return false;
  if (prioRank(list[j]) !== prioRank(w)) w.priority = list[j].priority || 'nice'; // crossing into the next group
  [list[i], list[j]] = [list[j], list[i]];
  sortWants();
  return true;
}

function renderWants(f, now) {
  const alloc = f.perPay !== undefined ? allocation(state, f.perPay) : null;
  const wantsPerPay = alloc ? alloc.wants : 0;
  $('wantsPill').textContent = `${formatMoney(wantsPerPay)} / pay`;
  const timeline = f.paydays ? wantsTimeline(state.wants, f.paydays, wantsPerPay) : new Map();
  let lastGroup = null;
  $('wantList').innerHTML = state.wants.length ? state.wants.map((w, i) => {
    const cooling = w.coolUntil > now;
    const ready = timeline.get(w.id);
    const prio = PRIORITIES[prioRank(w)];
    const groupHead = prio.value !== lastGroup ? `<div class="wantgroup">${prio.icon} ${prio.label}</div>` : '';
    lastGroup = prio.value;
    let status;
    if (cooling) status = `Cooling off until ${shortDate(w.coolUntil)} · still want it then?`;
    else if (ready === 'now') status = '<span class="good">Fully saved ✓</span>';
    else if (ready) status = `Saved by ${longDate(ready)} at ${formatMoney(wantsPerPay)}/pay`;
    else if (f.status && f.status.startsWith('needs')) status = 'Finish setting up the forecast to get a date';
    else status = 'No wants money in your split yet';
    return `${groupHead}<div class="wantrow prio-${prio.value}">
      <div class="wanttop"><span class="wantrank">${i + 1}</span><button class="wantname" data-edit-want="${esc(w.id)}" title="Edit">${esc(w.name)}</button><span class="potamt">${formatMoney(w.saved)} / ${formatMoney(w.price)}</span></div>
      ${meter(w.saved, w.price)}
      <div class="wantstatus">${status}</div>
      <div class="wantactions">
        <button class="prioChip prio-${prio.value}" type="button" data-prio-want="${esc(w.id)}" title="Change priority">${prio.icon} ${prio.label}</button>
        <span class="orderbtns">
          <button class="iconbtn" type="button" data-move-want="${esc(w.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Fund ${esc(w.name)} sooner">↑</button>
          <button class="iconbtn" type="button" data-move-want="${esc(w.id)}" data-dir="1" ${i === state.wants.length - 1 ? 'disabled' : ''} aria-label="Fund ${esc(w.name)} later">↓</button>
        </span>
      </div>
      <div class="wantactions">
        <button class="smallbtn primary" data-check-want="${esc(w.id)}" ${cooling ? 'disabled' : ''}>Can I buy it now?</button>
        <button class="smallbtn" data-bought-want="${esc(w.id)}">Bought</button>
        <button class="iconbtn" data-del-want="${esc(w.id)}" aria-label="Remove ${esc(w.name)}">×</button>
      </div></div>`;
  }).join('') : '<div class="empty">Nothing yet. Add the next thing you want to buy, like that DDJ.</div>';
}

// ---------- modal & forms ----------

function closeModal() { $('overlay').classList.remove('open'); }

/**
 * Generic form. Field types: text, money (dollars in the input, cents out), date, select.
 * onSubmit(values) may return an error string to keep the form open.
 */
function openForm({ title, fields, submitLabel, onSubmit, note, extraButtons = [], undo = true }) {
  $('modalTitle').textContent = title;
  const fieldHtml = (f) => {
    const id = `f_${f.name}`;
    const common = `id="${id}" name="${f.name}" ${f.required ? 'required' : ''}`;
    let input;
    if (f.type === 'select') {
      input = `<select ${common}>${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value === f.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'money') {
      input = `<input ${common} type="number" inputmode="decimal" min="${f.min ?? 0}" step="0.01" placeholder="0.00" value="${f.value === undefined || f.value === null ? '' : fromCents(f.value)}">`;
    } else if (f.type === 'date') {
      input = `<input ${common} type="date" value="${esc(f.value || '')}" ${f.max ? `max="${f.max}"` : ''}>`;
    } else {
      input = `<input ${common} type="text" maxlength="200" placeholder="${esc(f.placeholder || '')}" value="${esc(f.value || '')}">`;
    }
    return `<div class="formrow"><label for="${id}">${esc(f.label)}</label>${input}${f.hint ? `<div class="fieldhint">${esc(f.hint)}</div>` : ''}</div>`;
  };
  const rows = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.half && fields[i + 1]?.half) { rows.push(`<div class="two">${fieldHtml(f)}${fieldHtml(fields[i + 1])}</div>`); i++; }
    else rows.push(fieldHtml(f));
  }
  $('modalBody').innerHTML = `<form id="modalForm" novalidate>${rows.join('')}
    <div class="formerror" id="formError"></div>
    <button class="savebtn" type="submit">${esc(submitLabel)}</button>
    ${extraButtons.map((b, i) => `<button class="secondarybtn ${b.danger ? 'dangerbtn' : ''}" type="button" data-extra="${i}">${esc(b.label)}</button>`).join('')}
    ${note ? `<div class="hint">${esc(note)}</div>` : ''}</form>`;
  const form = $('modalForm');
  extraButtons.forEach((b, i) => { form.querySelector(`[data-extra="${i}"]`).onclick = b.onClick; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      const raw = form.elements[f.name].value.trim();
      if (f.required && !raw) { $('formError').textContent = `${f.label} is required.`; form.elements[f.name].focus(); return; }
      if (f.type === 'money') {
        const n = Number(raw || 0);
        if (!Number.isFinite(n) || n < (f.min ?? 0)) { $('formError').textContent = `${f.label} must be ${f.min ? `at least $${f.min}` : 'zero or more'}.`; return; }
        values[f.name] = toCents(n);
      } else values[f.name] = raw || null;
    }
    const button = form.querySelector('.savebtn');
    button.disabled = true;
    const before = structuredClone(state);
    try {
      const error = await onSubmit(values);
      if (error) { $('formError').textContent = error; return; }
      if (undo && JSON.stringify(state) !== JSON.stringify(before)) planUndo(title.replace(/^Add (a |an )?/i, 'Add '), before);
      closeModal();
    } catch (err) {
      $('formError').textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
  $('overlay').classList.add('open');
  setTimeout(() => form.querySelector('input,select')?.focus(), 50);
}

function categoryOptions(selected) {
  const names = state.budgets.map((b) => b.name);
  if (selected && !names.includes(selected)) names.push(selected);
  return names.map((n) => ({ value: n, label: n }));
}

function spendingForm(existing) {
  const range = viewedRange();
  const defaultDate = viewOffset === 0 ? today() : range.end;
  openForm({
    title: existing ? 'Edit spending' : 'Log spending',
    submitLabel: existing ? 'Save changes' : 'Add spending',
    fields: [
      { name: 'name', label: 'What was it?', placeholder: 'e.g. Sunday market', value: existing?.name, required: true },
      { name: 'amount', label: 'Amount', type: 'money', value: existing?.amount, required: true, min: 0.01, half: true },
      { name: 'category', label: 'Category', type: 'select', options: categoryOptions(existing?.category), value: existing?.category || state.budgets[0]?.name, half: true },
      { name: 'date', label: 'Date', type: 'date', value: existing?.date || defaultDate, max: today(), required: true },
    ],
    note: 'Saved to your Weekwell database. No bank connection needed.',
    undo: false,
    onSubmit: async (v) => {
      if (v.date > today()) return 'Date can’t be in the future.';
      const entry = { name: v.name, amount: v.amount, category: v.category, date: v.date };
      if (existing) {
        if (existing.source === 'up' && existing.category !== entry.category) {
          // Remember the correction so future purchases from this shop go to the same category.
          state.merchantRules = { ...(state.merchantRules || {}), [normaliseMerchant(existing.name)]: entry.category };
          saveState();
        }
        const saved = await api.updateTransaction(existing.id, entry);
        transactions = transactions.map((t) => (t.id === existing.id ? saved : t)).sort(byNewest);
        const old = { name: existing.name, amount: existing.amount, category: existing.category, date: existing.date };
        pushUndo(`Edit ${existing.name}`, async () => {
          const back = await api.updateTransaction(existing.id, old);
          transactions = transactions.map((t) => (t.id === existing.id ? back : t)).sort(byNewest);
        });
        toast('Spending updated.', { undo: true });
      } else {
        const saved = await api.addTransaction(entry);
        transactions = [saved, ...transactions].sort(byNewest);
        pushUndo(`Log ${saved.name}`, async () => {
          await api.deleteTransaction(saved.id);
          transactions = transactions.filter((t) => t.id !== saved.id);
        });
        toast('Spending logged. Limits updated.', { undo: true });
      }
      render();
    },
  });
}

function billForm(existing) {
  openForm({
    title: existing ? 'Edit bill' : 'Add a bill or subscription',
    submitLabel: existing ? 'Save changes' : 'Save recurring bill',
    fields: [
      { name: 'name', label: 'Bill or subscription name', placeholder: 'e.g. Phone plan', value: existing?.name, required: true },
      { name: 'amount', label: 'Amount each time', type: 'money', value: existing?.amount, required: true, min: 0.01, half: true },
      { name: 'period', label: 'How often', type: 'select', options: PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })), value: existing?.period || 'monthly', half: true },
      { name: 'nextDue', label: 'Next due date', type: 'date', value: existing?.nextDue, hint: 'Optional, but it lets the forecast place the bill on the right day. It moves forward automatically after each due date.' },
    ],
    onSubmit: (v) => {
      if (existing) Object.assign(existing, { name: v.name, amount: v.amount, period: v.period, nextDue: v.nextDue });
      else state.bills.push({ id: newId('bill'), name: v.name, icon: '↻', amount: v.amount, period: v.period, nextDue: v.nextDue });
      saveState();
      toast(existing ? 'Bill updated.' : 'Bill added. Weekly plan updated.');
    },
  });
}

function commitmentForm(existing) {
  const kinds = [...new Set([...COMMITMENT_KINDS, ...state.commitments.map((c) => c.kind)])];
  openForm({
    title: existing ? 'Edit payment' : 'Add upcoming payment',
    submitLabel: existing ? 'Save changes' : 'Save payment',
    fields: [
      { name: 'name', label: 'Payment name', placeholder: 'e.g. Dentist invoice', value: existing?.name, required: true },
      { name: 'amount', label: 'Amount', type: 'money', value: existing?.amount, required: true, min: 0.01, half: true },
      { name: 'kind', label: 'Type', type: 'select', options: kinds.map((k) => ({ value: k, label: k })), value: existing?.kind || 'Invoice', half: true },
      { name: 'due', label: 'Due date (optional)', type: 'date', value: existing?.due, hint: 'With a date, the amount is spread over the weeks until then. Without one, the full amount is held now.' },
    ],
    onSubmit: (v) => {
      const fields = { name: v.name, amount: v.amount, kind: v.kind, due: v.due };
      if (existing) Object.assign(existing, fields);
      else state.commitments.push({ id: newId('com'), ...fields, addedOn: today() });
      saveState();
      toast(existing ? 'Payment updated.' : 'Payment added. Weekly plan updated.');
    },
  });
}

function wantForm(existing) {
  openForm({
    title: existing ? 'Edit want' : 'Something you want',
    submitLabel: existing ? 'Save changes' : 'Add to wants',
    fields: [
      { name: 'name', label: 'What is it?', placeholder: 'e.g. DDJ controller', value: existing?.name, required: true },
      { name: 'price', label: 'Price', type: 'money', value: existing?.price, required: true, min: 0.01, half: true },
      { name: 'saved', label: 'Already saved for it', type: 'money', value: existing?.saved ?? 0, half: true, hint: 'Money already sitting in its own Up Saver.' },
      { name: 'priority', label: 'How much do you want it?', type: 'select', value: existing?.priority || 'nice', options: PRIORITIES.map((p) => ({ value: p.value, label: `${p.icon} ${p.label}` })), hint: 'Must have gets money first, then Nice to have, then Someday.' },
    ],
    note: existing ? '' : 'It waits a cooling-off period first: 1 day under $100, 7 days up to $500, 30 days above. If you still want it after that, it gets a date.',
    onSubmit: (v) => {
      if (v.saved > v.price) return 'Already saved can’t be more than the price.';
      if (existing) Object.assign(existing, { name: v.name, price: v.price, saved: v.saved, priority: v.priority });
      else {
        const days = coolingDays(v.price);
        state.wants.push({ id: newId('want'), name: v.name, price: v.price, saved: v.saved, priority: v.priority, addedOn: today(), coolUntil: addDays(today(), days) });
        toast(`Added. Cooling off for ${days} day${days === 1 ? '' : 's'}.`);
      }
      sortWants();
      saveState();
    },
  });
}

function buyCheckDialog(want) {
  const r = canBuyNow(state, transactions, today(), want);
  let html;
  if (r.answer === 'yes-saved') html = `<div class="answer yes"><h3>Yes, it's paid for.</h3>${formatMoney(want.price)} is already saved for it. Buy it from its Up Saver, then tap “Bought”.</div>`;
  else if (r.answer === 'yes') html = `<div class="answer yes"><h3>Yes, you can buy it now.</h3>Paying the remaining ${formatMoney(r.need)} today still keeps your buffer safe for the next 12 months, and your ${formatMoney(r.protectedAmount)} per pay for savings${state.plan.emergencyPerPay ? ' and emergency fund' : ''} stays the same.<br><br>The cost: safe-to-save drops from ${formatMoney(r.perPayBefore)} to ${formatMoney(r.perPayAfter)} per pay for a while, so less goes to your other wants.</div>`;
  else if (r.answer === 'not-yet') {
    html = `<div class="answer no"><h3>Not yet. ${r.readyOn ? `It'll be saved by ${longDate(r.readyOn)}.` : 'There’s no wants money to save it with yet.'}</h3>
      Buying it today would mean saving less than your ${formatMoney(r.protectedAmount)} per pay, or dipping below your buffer, and that's how savings end up withdrawn.
      ${r.readyOn ? `<br><br>At ${formatMoney(r.wantsPerPay)} per pay into its Up Saver, it's paid for by ${longDate(r.readyOn)} without touching savings.` : '<br><br>Your whole safe-to-save amount goes to savings and the emergency fund right now. Lower one of them in the forecast to start funding wants.'}
      ${r.fasterOn && r.readyOn && r.fasterOn < r.readyOn ? `<br><br><b>Sooner:</b> spend $20 a week less (e.g. on Meals out) and it's ready by ${longDate(r.fasterOn)}.` : ''}</div>`;
  } else if (r.answer === 'setup') html = '<div class="answer no"><h3>Finish setting up the forecast first.</h3>Enter your pay, next payday and balances so Weekwell can check properly.</div>';
  else html = `<div class="answer no"><h3>Still cooling off.</h3>Ask again on ${longDate(r.until)}.</div>`;
  $('modalTitle').textContent = want.name;
  $('modalBody').innerHTML = `${html}<p class="hint">Checked against every bill, payment and payday in the next 12 months, with your spending at ${formatMoney(spendingWeekly())}/week.</p><button class="secondarybtn" type="button" id="closeAnswer">OK</button>`;
  $('closeAnswer').onclick = closeModal;
  $('overlay').classList.add('open');
}

function spendingWeekly() {
  return forecast(state, transactions, today()).spending.weekly;
}

function balancesForm() {
  const fromUp = (name) => up.accounts?.find((a) => a.type === 'SAVER' && normaliseMerchant(a.name) === normaliseMerchant(name));
  const upLine = up.accounts ? `From Up just now: ${up.accounts.map((a) => `${a.name} ${formatMoney(a.balance)}`).join(' · ')}. Savers with the same name as your pots are filled in for you.` : '';
  openForm({
    title: 'Your balances right now',
    submitLabel: 'Save balances',
    fields: [
      { name: 'everyday', label: 'Everyday: CommBank + Up Spending together', type: 'money', value: state.balances.everyday, required: true, hint: 'Everything you can spend or pay bills from today, not counting Up Savers.' },
      { name: 'buffer', label: `${potName('buffer')} Saver`, type: 'money', value: fromUp(potName('buffer'))?.balance ?? state.pots.buffer.balance, half: true },
      { name: 'bufferTarget', label: 'Buffer to always keep', type: 'money', value: state.pots.buffer.target, half: true },
      { name: 'emergency', label: `${potName('emergency')} Saver`, type: 'money', value: fromUp(potName('emergency'))?.balance ?? state.pots.emergency.balance, half: true },
      { name: 'emergencyTarget', label: 'Emergency fund goal', type: 'money', value: state.pots.emergency.target, half: true },
      { name: 'savings', label: `${potName('savings')} Saver`, type: 'money', value: fromUp(potName('savings'))?.balance ?? state.pots.savings.balance },
    ],
    note: upLine || 'Up Saver you have today? If it’s your only savings, count it as the emergency fund. A new Saver for locked savings starts at $0.',
    onSubmit: (v) => {
      state.balances = { everyday: v.everyday, updatedOn: today() };
      state.pots.buffer = { ...state.pots.buffer, balance: v.buffer, target: v.bufferTarget };
      state.pots.emergency = { ...state.pots.emergency, balance: v.emergency, target: v.emergencyTarget };
      state.pots.savings = { ...state.pots.savings, balance: v.savings };
      saveState();
      toast('Balances saved. Forecast updated.');
    },
  });
}

function planForm() {
  const f = forecast(state, transactions, today());
  if (f.perPay === undefined) { toast('Finish setting up the forecast first.'); return; }
  const s = suggestSplit(state, f.perPay);
  const full = emergencyFull(state);
  openForm({
    title: 'Your savings plan',
    submitLabel: 'Save plan',
    fields: [
      { name: 'savingsPerPay', label: 'Locked savings each pay', type: 'money', value: state.plan.savingsPerPay || s.savings, half: !full },
      ...(full ? [] : [{ name: 'emergencyPerPay', label: 'Emergency fund each pay', type: 'money', value: state.plan.emergencyPerPay || s.emergency, half: true }]),
    ],
    extraButtons: [{
      label: `Use suggested split (${formatMoney(s.savings)} savings${s.emergency ? ` + ${formatMoney(s.emergency)} emergency` : ''})`,
      onClick: () => { state.plan = { savingsPerPay: s.savings, emergencyPerPay: full ? 0 : s.emergency }; saveState(); closeModal(); toast('Plan saved.'); },
    }],
    note: `Safe to save right now: ${formatMoney(f.perPay)} per pay. Suggested: ${formatMoney(s.savings)} savings${s.emergency ? `, ${formatMoney(s.emergency)} emergency fund` : ''}, ${formatMoney(s.wants)} wants. Whatever you don't commit goes to wants. Pick an amount you can keep every pay: steady beats big.`,
    onSubmit: (v) => {
      const emergency = full ? 0 : v.emergencyPerPay;
      if (v.savingsPerPay + emergency > f.perPay) return `That's ${formatMoney(v.savingsPerPay + emergency - f.perPay)} more than is safe. Saving it now would likely mean withdrawing later.`;
      state.plan = { savingsPerPay: v.savingsPerPay, emergencyPerPay: emergency };
      saveState();
      toast('Plan saved.');
    },
  });
}

function afterpayPurchaseForm() {
  openForm({
    title: 'Afterpay purchase',
    submitLabel: 'Add instalments',
    fields: [
      { name: 'name', label: 'What was it?', placeholder: 'e.g. Headphones', required: true },
      { name: 'amount', label: 'Each instalment', type: 'money', required: true, min: 0.01, half: true },
      { name: 'left', label: 'Instalments left', type: 'select', options: ['1', '2', '3', '4'].map((n) => ({ value: n, label: n })), value: '3', half: true },
      { name: 'due', label: 'Next instalment date', type: 'date', required: true, value: addDays(today(), 14) },
    ],
    note: 'Instalments are every 2 weeks. Each one is added to your plan and forecast, and the Afterpay balance goes up by the total left.',
    onSubmit: (v) => {
      const n = Number(v.left);
      for (let k = 0; k < n; k++) {
        state.commitments.push({ id: newId('com'), name: `${v.name} (${k + 1} of ${n} left)`, amount: v.amount, due: addDays(v.due, 14 * k), kind: 'Afterpay', addedOn: today() });
      }
      state.afterpayBalance += v.amount * n;
      saveState();
      toast(`${n} Afterpay instalment${n === 1 ? '' : 's'} added.`);
    },
  });
}

function afterpayForm() {
  openForm({
    title: 'Afterpay balance',
    submitLabel: 'Save balance',
    fields: [{ name: 'amount', label: 'Total still owing on Afterpay', type: 'money', value: state.afterpayBalance, required: true, hint: 'Check the Afterpay app for the exact figure. Marking an Afterpay payment paid lowers this automatically.' }],
    onSubmit: (v) => { state.afterpayBalance = v.amount; saveState(); },
  });
}

function settingsForm() {
  openForm({
    title: 'Settings',
    submitLabel: 'Save settings',
    fields: [
      { name: 'amount', label: 'Take-home pay', type: 'money', value: state.pay.amount, half: true },
      { name: 'period', label: 'Paid', type: 'select', options: PAY_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })), value: state.pay.period, half: true },
      { name: 'nextPayday', label: 'Next payday (optional)', type: 'date', value: state.pay.nextPayday, hint: 'Used by the upcoming “safe to save” forecast.' },
      { name: 'weekStartsOn', label: 'Weeks start on', type: 'select', options: DAY_NAMES.map((d, i) => ({ value: String(i), label: d })), value: String(state.weekStartsOn), hint: 'Tip: choose your payday so each week starts with fresh money.' },
      { name: 'nameSavings', label: 'Your Up Saver for locked savings is called', placeholder: POT_DEFAULT_NAMES.savings, value: state.pots.savings.name, half: true },
      { name: 'nameEmergency', label: 'Your emergency fund Saver is called', placeholder: POT_DEFAULT_NAMES.emergency, value: state.pots.emergency.name, half: true },
      { name: 'nameBuffer', label: 'Your bills & buffer Saver is called', placeholder: POT_DEFAULT_NAMES.buffer, value: state.pots.buffer.name, hint: 'Optional. Use the names you see in the Up app, so the payday plan says exactly where to move money.' },
      { name: 'lessons', label: 'Daily money lesson', type: 'select', value: state.learning?.off ? 'off' : 'on', options: [{ value: 'on', label: 'On: show one when I first open the app each day' }, { value: 'off', label: 'Off' }] },
    ],
    onSubmit: async (v) => {
      state.pay = { amount: v.amount, period: v.period, nextPayday: v.nextPayday };
      state.weekStartsOn = Number(v.weekStartsOn);
      const named = (pot, value) => { const next = { ...pot }; if (value) next.name = value.slice(0, 40); else delete next.name; return next; };
      state.pots.savings = named(state.pots.savings, v.nameSavings);
      state.pots.emergency = named(state.pots.emergency, v.nameEmergency);
      state.pots.buffer = named(state.pots.buffer, v.nameBuffer);
      state.learning = { seen: [], ...state.learning, off: v.lessons === 'off' };
      await ensureTransactionsFrom(addDays(weekStart(today(), state.weekStartsOn), -7 * (HISTORY_WEEKS - 1)));
      saveState();
      toast('Settings saved.');
    },
  });
}

function categoriesForm() {
  $('modalTitle').textContent = 'Spending categories';
  const draft = state.budgets.map((b) => ({ ...b }));
  const rowHtml = (b, i) => `<div class="catrow" data-i="${i}">
      <input class="icon" value="${esc(b.icon)}" maxlength="4" aria-label="Icon">
      <input class="name" value="${esc(b.name)}" maxlength="40" aria-label="Category name" placeholder="Category">
      <input class="limit" type="number" min="0" step="0.01" value="${fromCents(b.limit)}" aria-label="Weekly limit">
      <button type="button" class="iconbtn" data-remove="${i}" aria-label="Remove category">×</button>
    </div>`;
  const paint = () => {
    $('catRows').innerHTML = draft.map(rowHtml).join('');
    $('catRows').querySelectorAll('[data-remove]').forEach((btn) => { btn.onclick = () => { readRows(); draft.splice(Number(btn.dataset.remove), 1); paint(); }; });
  };
  const readRows = () => {
    $('catRows').querySelectorAll('.catrow').forEach((row) => {
      const b = draft[Number(row.dataset.i)];
      b.icon = row.querySelector('.icon').value.trim() || '•';
      b.name = row.querySelector('.name').value.trim();
      b.limit = toCents(row.querySelector('.limit').value || 0);
    });
  };
  $('modalBody').innerHTML = `<div class="cathead"><span>Icon</span><span>Name</span><span>Weekly limit $</span><span></span></div>
    <div id="catRows"></div>
    <button type="button" class="addrow" id="catAdd">＋ Add a category</button>
    <div class="formerror" id="formError"></div>
    <button type="button" class="savebtn" id="catSave">Save categories</button>
    <div class="hint">Renaming a category also renames it on past spending. Removing one keeps its past spending, shown as “Uncategorised” until you edit those entries.</div>`;
  paint();
  $('catAdd').onclick = () => { readRows(); draft.push({ id: newId('cat'), name: '', icon: '•', limit: 0 }); paint(); $('catRows').querySelector('.catrow:last-child .name').focus(); };
  $('catSave').onclick = async () => {
    readRows();
    const names = draft.map((b) => b.name);
    if (!draft.length) { $('formError').textContent = 'Keep at least one category.'; return; }
    if (names.some((n) => !n)) { $('formError').textContent = 'Every category needs a name.'; return; }
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) { $('formError').textContent = 'Two categories have the same name.'; return; }
    if (draft.some((b) => b.limit < 0)) { $('formError').textContent = 'Limits can’t be negative.'; return; }
    try {
      const snapshot = structuredClone(state);
      const renames = [];
      for (const b of draft) {
        const before = state.budgets.find((x) => x.id === b.id);
        if (before && before.name !== b.name) {
          await api.renameCategory(before.name, b.name);
          transactions = transactions.map((t) => (t.category === before.name ? { ...t, category: b.name } : t));
          renames.push([before.name, b.name]);
        }
      }
      state.budgets = draft;
      await saveState();
      pushUndo('Change categories', async () => {
        for (const [from, to] of renames) {
          await api.renameCategory(to, from);
          transactions = transactions.map((t) => (t.category === to ? { ...t, category: from } : t));
        }
        state = snapshot;
        await saveState();
      });
      closeModal();
      toast('Categories saved.', { undo: true });
    } catch (error) {
      $('formError').textContent = error.message;
    }
  };
  $('overlay').classList.add('open');
}

function backupDialog() {
  let last = null;
  try { last = localStorage.getItem('weekwell:lastBackup'); } catch { /* storage unavailable */ }
  $('modalTitle').textContent = 'Backup';
  $('modalBody').innerHTML = `
    <p class="hint">Download a copy of everything (plan, bills, commitments, all spending history) as a file. Keep it somewhere safe, e.g. your Google Drive.</p>
    <p class="hint">${last ? `Last downloaded on this device: ${esc(longDate(last))}.` : 'No backup downloaded on this device yet.'}</p>
    <button type="button" class="savebtn" id="doExport">Download backup</button>
    <div class="formrow" style="margin-top:22px"><label for="importFile">Restore from a backup file</label><input id="importFile" type="file" accept="application/json,.json"></div>
    <div class="formerror" id="formError"></div>
    <p class="hint">Restoring replaces all current data with the file’s contents. Your current data is saved as an automatic snapshot in the database first, so nothing is lost.</p>`;
  $('doExport').onclick = async () => {
    try {
      const backup = await api.exportAll();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `weekwell-backup-${today()}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      try { localStorage.setItem('weekwell:lastBackup', today()); } catch { /* storage unavailable */ }
      toast(`Backup downloaded (${backup.transactions.length} spending entries).`);
    } catch (error) {
      $('formError').textContent = error.message;
    }
  };
  $('importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      const when = backup.exportedAt ? longDate(backup.exportedAt.slice(0, 10)) : 'an unknown date';
      if (!confirm(`Replace ALL current data with the backup from ${when} (${backup.transactions?.length ?? 0} spending entries)?\n\nYour current data is snapshotted first.`)) { e.target.value = ''; return; }
      const result = await api.importAll(backup);
      closeModal();
      await loadEverything();
      toast(`Restored. ${result.transactions} spending entries loaded.`);
    } catch (error) {
      $('formError').textContent = error instanceof SyntaxError ? 'That file isn’t valid JSON.' : `${error.message}${error.details ? `: ${error.details.slice(0, 3).join('; ')}` : ''}`;
      e.target.value = '';
    }
  };
  $('overlay').classList.add('open');
}

// ---------- events ----------

function find(list, id) { return list.find((x) => x.id === id); }

function wireEvents() {
  $('income').addEventListener('change', (e) => { state.pay.amount = Math.max(0, toCents(e.target.value)); saveState(); });
  $('payPeriod').addEventListener('change', (e) => { state.pay.period = e.target.value; saveState(); });

  $('prevWeek').onclick = async () => {
    viewOffset -= 1;
    try { await ensureTransactionsFrom(viewedRange().start); } catch { toast('Could not load older spending.'); }
    render();
  };
  $('nextWeek').onclick = () => { if (viewOffset < 0) { viewOffset += 1; render(); } };
  $('weekHistory').onclick = (e) => {
    const row = e.target.closest('[data-week]');
    if (row) { viewOffset = Number(row.dataset.week); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  $('addExpense').onclick = () => spendingForm();
  $('addBill').onclick = () => billForm();
  $('addCommitment').onclick = () => commitmentForm();
  $('addWant').onclick = () => wantForm();
  $('addIncoming').onclick = () => incomingForm();
  $('syncUp').onclick = () => syncUp();
  // Coming back to the app (e.g. from the home screen) pulls in new Up purchases.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && up.configured && (!up.lastSync || Date.now() - up.lastSync > 60000)) syncUp({ quiet: true }); });
  onTap($('tabAdd'), () => spendingForm());
  for (const b of document.querySelectorAll('[data-goto]')) onTap(b, () => setTab(b.dataset.goto, true));
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1), false));
  $('addAfterpay').onclick = afterpayPurchaseForm;
  $('updateBalances').onclick = balancesForm;
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
  $('afterpayPill').onclick = afterpayForm;
  $('openSettings').onclick = settingsForm;
  $('openBackup').onclick = backupDialog;
  $('editCategories').onclick = categoriesForm;
  $('closeModal').onclick = closeModal;
  $('undoBtn').onclick = undoLast;
  // "This pay" on the payday card: a different amount for this one pay only.
  document.body.addEventListener('change', (e) => {
    if (e.target.id !== 'thisPay') return;
    const f = forecast(state, transactions, today());
    if (f.perPay === undefined) return;
    const amount = Math.max(0, toCents(e.target.value));
    const before = structuredClone(state);
    state.payday = amount && amount !== state.pay.amount ? { date: f.nextPay, amount } : undefined;
    if (!state.payday) delete state.payday;
    saveState();
    planUndo('Change this pay', before);
    toast(amount !== state.pay.amount ? `This pay set to ${formatMoney(amount)}. Plan updated.` : 'Back to your usual pay.', { undo: true });
  });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && !$('overlay').classList.contains('open')) { e.preventDefault(); undoLast(); }
  });
  $('overlay').onclick = (e) => { if (e.target === $('overlay')) closeModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  document.body.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.editTx) spendingForm(find(transactions, d.editTx));
    if (d.delTx) {
      const tx = find(transactions, d.delTx);
      if (!tx) return;
      try {
        await api.deleteTransaction(tx.id);
        transactions = transactions.filter((x) => x.id !== tx.id);
        render();
        pushUndo(`Delete ${tx.name}`, async () => {
          const back = await api.restoreTransaction(tx.id);
          transactions = [back, ...transactions].sort(byNewest);
        });
        toast(`Deleted ${tx.name}.`, { undo: true });
      } catch (error) { toast(error.message); }
    }
    if (d.editBill) billForm(find(state.bills, d.editBill));
    if (d.delBill) {
      const bill = find(state.bills, d.delBill);
      if (bill) { const before = structuredClone(state); state.bills = state.bills.filter((b) => b !== bill); saveState(); planUndo(`Remove ${bill.name}`, before); toast(`Removed ${bill.name}.`, { undo: true }); }
    }
    if (d.editCom) commitmentForm(find(state.commitments, d.editCom));
    if (d.paidCom) {
      const c = find(state.commitments, d.paidCom);
      if (!c) return;
      const before = structuredClone(state);
      payFull(c);
      saveState();
      planUndo(`Pay ${c.name.split(' (')[0]}`, before);
      celebrate(`Paid ✓ ${c.name.split(' (')[0]}. One less thing to think about.`, { undo: true });
    }
    if (d.delCom) {
      const c = find(state.commitments, d.delCom);
      if (c) { const before = structuredClone(state); state.commitments = state.commitments.filter((x) => x !== c); saveState(); planUndo(`Remove ${c.name.split(' (')[0]}`, before); toast(`Removed ${c.name.split(' (')[0]}.`, { undo: true }); }
    }
    if (d.open) ({ balances: balancesForm, settings: settingsForm, plan: planForm })[d.open]?.();
    if (d.payCom) payForm(find(state.commitments, d.payCom));
    if (t.id === 'openLesson') lessonDialog();
    if (d.step) tickStep(d.step);
    if (t.id === 'payLanded') payLanded();
    if (t.id === 'resetPay') { const before = structuredClone(state); delete state.payday; saveState(); planUndo('Use usual pay', before); }
    if (d.editWant) wantForm(find(state.wants, d.editWant));
    if (d.editIncoming) incomingForm(find(state.incoming || [], d.editIncoming));
    if (d.delIncoming) {
      const m = find(state.incoming || [], d.delIncoming);
      if (m) { const before = structuredClone(state); state.incoming = state.incoming.filter((x) => x !== m); saveState(); planUndo(`Remove ${m.name}`, before); toast(`Removed ${m.name}.`, { undo: true }); }
    }
    if (d.arrivedIncoming) {
      const m = find(state.incoming || [], d.arrivedIncoming);
      if (!m) return;
      const before = structuredClone(state);
      state.incoming = state.incoming.filter((x) => x !== m);
      await saveState();
      planUndo(`${m.name} arrived`, before);
      celebrate(`${m.name} arrived 🎉 Move it as shown, then enter your new balances.`, { undo: true });
      balancesForm();
    }
    if (d.checkWant) buyCheckDialog(find(state.wants, d.checkWant));
    if (d.moveWant) {
      const w = find(state.wants, d.moveWant);
      const before = structuredClone(state);
      if (w && moveWant(w, Number(d.dir))) { saveState(); planUndo(`Move ${w.name}`, before); }
    }
    if (d.prioWant) {
      const w = find(state.wants, d.prioWant);
      if (!w) return;
      const before = structuredClone(state);
      const next = PRIORITIES[(prioRank(w) + 1) % PRIORITIES.length];
      w.priority = next.value;
      sortWants();
      saveState();
      planUndo(`${w.name}: ${next.label}`, before);
      toast(`${w.name}: ${next.icon} ${next.label}`, { undo: true });
    }
    if (d.boughtWant) {
      const w = find(state.wants, d.boughtWant);
      if (!w) return;
      const before = structuredClone(state);
      state.wants = state.wants.filter((x) => x !== w);
      saveState();
      planUndo(`Bought ${w.name}`, before);
      if (w.saved >= w.price) celebrate('Enjoy it! Paid for without touching savings.', { undo: true }); else toast('Bought. Update your balances so the forecast knows.', { undo: true });
    }
    if (d.delWant) {
      const w = find(state.wants, d.delWant);
      if (w) { const before = structuredClone(state); state.wants = state.wants.filter((x) => x !== w); saveState(); planUndo(`Remove ${w.name}`, before); toast(`Removed ${w.name}.`, { undo: true }); }
    }
  });
}

// ---------- tabs (phones & tablets) ----------

/**
 * Tap handler for the tab bar that works first time on iPhone.
 * iOS swallows the first tap while the page is still gliding after a scroll (it only stops
 * the scroll), so we act on the finger lifting instead of waiting for a click — unless the
 * finger moved (a swipe). The click that may follow is ignored so nothing runs twice.
 */
function onTap(el, fn) {
  let start = null;
  let handledAt = 0;
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; start = { x: t.clientX, y: t.clientY }; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!start || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) return;
    e.preventDefault();
    handledAt = Date.now();
    fn();
  }, { passive: false });
  el.addEventListener('click', () => { if (Date.now() - handledAt > 700) fn(); });
}

const TABS = ['home', 'spending', 'bills', 'savings'];

function setTab(name, fromTap) {
  const tab = TABS.includes(name) ? name : 'home';
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('[data-goto]')) {
    if (b.dataset.goto === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  if (fromTap) {
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', tab === 'home' ? location.pathname : `#${tab}`);
    window.scrollTo({ top: 0 });
    // Slide the new tab's cards in, one after another.
    // Only the cards, never <body> (it carries data-tab too): animating body breaks the fixed tab bar.
    document.querySelectorAll(`#shell [data-tab~="${tab}"]`).forEach((el, i) => {
      el.classList.remove('enter');
      void el.offsetWidth;
      el.style.setProperty('--d', `${i * 60}ms`);
      el.classList.add('enter');
    });
  }
  try { localStorage.setItem('weekwell:tab', tab); } catch { /* storage unavailable */ }
  if (fromTap && tab === 'home' && state) render(); // redraw the chart at its real width
}

function initialTab() {
  const fromHash = location.hash.slice(1);
  if (TABS.includes(fromHash)) return fromHash;
  try { return localStorage.getItem('weekwell:tab') || 'home'; } catch { return 'home'; }
}

// ---------- start ----------

async function syncUp({ quiet = false } = {}) {
  if (!up.configured || up.syncing) return;
  up.syncing = true;
  $('syncUp').classList.add('busy');
  $('syncText').textContent = 'Syncing…';
  try {
    const r = await api.upSync();
    up.accounts = r.accounts || up.accounts;
    up.lastSync = new Date();
    if (r.added) {
      const fresh = await api.listTransactions(loadedFrom);
      transactions = fresh.sort(byNewest);
      render();
      celebrate(`${r.added} new ${r.added === 1 ? 'purchase' : 'purchases'} from Up`);
    } else if (!quiet) toast('Up is in sync. Nothing new.');
  } catch (error) {
    if (!quiet || error.status === 401) toast(error.message);
  } finally {
    up.syncing = false;
    $('syncUp').classList.remove('busy');
    $('syncText').textContent = up.lastSync ? `Synced ${up.lastSync.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : 'Sync Up';
  }
}

async function loadEverything() {
  state = await api.getState();
  const from = addDays(weekStart(today(), state.weekStartsOn), -7 * (HISTORY_WEEKS - 1));
  transactions = (await api.listTransactions(from)).sort(byNewest);
  loadedFrom = from;
  viewOffset = 0;
  render();
  try {
    up.configured = (await api.upStatus()).configured;
    $('syncUp').hidden = !up.configured;
    if (up.configured) syncUp({ quiet: true });
  } catch { /* Up sync is optional */ }
  setTimeout(maybeDailyLesson, 900);
}

// ---------- sign in ----------

function showGate(message, isError = false) {
  $('shell').hidden = true;
  $('addExpense').hidden = true;
  $('gate').hidden = false;
  if (message) { $('gateText').textContent = message; $('gateText').classList.toggle('error', isError); }
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const script = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection.'));
    document.head.append(script);
  });
}

async function showGoogleSignIn(clientId) {
  const reason = new URLSearchParams(location.search).get('login');
  if (reason) history.replaceState(null, '', '/');
  showGate(
    reason === 'denied' ? 'That Google account isn’t allowed to open this budget. Try the account you set up.'
      : reason === 'failed' ? 'Sign-in didn’t work. Please try again.'
        : 'Sign in with your Google account to open your budget.',
    Boolean(reason),
  );
  try {
    await loadGoogleScript();
    // Redirect mode: works in a normal browser and when installed on a phone's home screen.
    google.accounts.id.initialize({ client_id: clientId, ux_mode: 'redirect', login_uri: `${location.origin}/auth/google` });
    google.accounts.id.renderButton($('googleButton'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', width: 280 });
  } catch (error) {
    showGate(error.message, true);
  }
}

async function boot() {
  let config;
  try { config = await api.authConfig(); } catch (error) { toast(`Could not reach Weekwell: ${error.message}`); return; }
  if (config.mode === 'misconfigured') {
    showGate(`This server needs its login settings before it can show any data: ${config.missing.join(', ')}. See docs/DEPLOY.md.`, true);
    $('gateNote').hidden = true;
    return;
  }
  $('avatar').hidden = config.mode !== 'google';
  if (config.mode === 'google') {
    try {
      const me = await api.me();
      $('avatar').textContent = (me.name || me.email || '?').trim().charAt(0).toUpperCase();
      userName = me.name || '';
      $('signOut').hidden = false;
    } catch (error) {
      if (error.status === 401) return showGoogleSignIn(config.clientId);
      toast(error.message);
      return;
    }
    window.addEventListener('weekwell:signed-out', () => showGoogleSignIn(config.clientId), { once: true });
  }
  $('gate').hidden = true;
  $('shell').hidden = false;
  try { await loadEverything(); } catch (error) { if (error.status !== 401) toast(`Could not connect to the budget database: ${error.message}`); }
}

$('signOut').onclick = async () => {
  try { await api.logout(); } catch { /* signed out anyway */ }
  window.google?.accounts?.id?.disableAutoSelect?.();
  location.replace('/');
};

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* app still works without it */ });
}

$('today').textContent = longDate(today());
setTab(initialTab(), false);
wireEvents();
boot();
