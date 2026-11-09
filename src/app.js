import { api } from './api.js';
import {
  COMMITMENT_KINDS, PAY_PERIODS, PERIODS, addDays, categoryAverages, commitmentNeed, formatMoney,
  fromCents, inRange, longDate, newId, perWeek, shortDate, spentByCategory, toCents, todayISO,
  weekLabel, weekStart, weeklyHistory, weeklyPlan, weeksPerPay,
} from './engine.js';
import { allocation, canBuyNow, coolingDays, emergencyFull, forecast, suggestSplit, wantsTimeline } from './forecast.js';

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

// ---------- helpers ----------

function today() { return todayISO(); }
function currentWeek() { return weekStart(today(), state.weekStartsOn); }
function viewedRange() {
  const start = addDays(currentWeek(), viewOffset * 7);
  return { start, end: addDays(start, 6) };
}
function budgetIcon(name) { return state.budgets.find((b) => b.name === name)?.icon || '•'; }

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').classList.remove('show'), 2600);
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

// ---------- rendering ----------

function render() {
  if (!state) return;
  const now = today();
  const plan = weeklyPlan(state, now);
  const range = viewedRange();
  const weekTx = transactions.filter((t) => inRange(t.date, range));
  const { byName, unmatched } = spentByCategory(weekTx, state.budgets);

  // hero
  if (document.activeElement !== $('income')) $('income').value = fromCents(state.pay.amount) || 0;
  $('payPeriod').value = state.pay.period;
  $('billsTotal').textContent = formatMoney(plan.bills + plan.commitments);
  $('billsHint').textContent = plan.overdue ? `incl. ${formatMoney(plan.overdue)} overdue` : 'weekly + due soon';
  $('billsHint').classList.toggle('alert', plan.overdue > 0);
  $('spendTotal').textContent = formatMoney(plan.spending);
  $('savingDisplay').textContent = formatMoney(plan.saving);
  $('leftTotal').textContent = formatMoney(plan.left);
  $('leftTotal').classList.toggle('negative', plan.left < 0);

  // week navigation
  $('weekLabel').textContent = viewOffset === 0 ? `THIS WEEK · ${weekLabel(range).toUpperCase()}` : weekLabel(range).toUpperCase();
  $('nextWeek').disabled = viewOffset >= 0;
  $('spendPlanTitle').textContent = viewOffset === 0 ? 'Your weekly spending plan' : `Spending plan · ${weekLabel(range)}`;

  // budget cards
  $('budgetGrid').innerHTML = state.budgets.map((b, i) => {
    const spent = byName.get(b.name) || 0;
    const pct = b.limit > 0 ? Math.min(100, (spent / b.limit) * 100) : spent > 0 ? 100 : 0;
    const over = spent > b.limit;
    const note = over ? `OVER BY ${formatMoney(spent - b.limit)}` : b.limit > 0 ? `${formatMoney(b.limit - spent)} LEFT` : 'NO LIMIT SET';
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
        <div><div class="txname">${esc(t.name)}</div><div class="txmeta">${esc(t.category)} · ${longDate(t.date)}</div></div>
        <span class="txamt">−${formatMoney(t.amount)}</span>
        <span class="rowactions"><button class="iconbtn" data-edit-tx="${esc(t.id)}" title="Edit" aria-label="Edit ${esc(t.name)}">✎</button><button class="iconbtn" data-del-tx="${esc(t.id)}" title="Delete" aria-label="Delete ${esc(t.name)}">×</button></span>
      </div>`).join('')
    : `<div class="empty">${viewOffset === 0 ? 'No spending logged yet this week. Add purchases as you go to see your limits move.' : 'Nothing was logged this week.'}</div>`;

  const f = forecast(state, transactions, now);
  const ready = f.perPay !== undefined;
  if (ready) {
    const wants = allocation(state, f.perPay).wants;
    $('leftTotal').textContent = formatMoney(Math.round(wants / weeksPerPay(state.pay.period)));
    $('leftTotal').classList.toggle('negative', false);
    $('leftLabel').textContent = 'Left for wants';
    $('leftHint').textContent = 'per week · from the forecast';
  } else {
    $('leftLabel').textContent = 'Still to plan';
    $('leftHint').textContent = 'before other living costs';
  }
  renderForecast(f, now);
  renderHistory(now);
  renderSide(plan, now);
  renderPots(f);
  renderWants(f, now);
  renderTip(plan, f);
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
        <button class="billmain" data-edit-bill="${esc(b.id)}" title="Edit"><div class="billname">${esc(b.name)}</div><div class="billdue">${PERIOD_LABEL[b.period].toUpperCase()} · ${b.nextDue ? `NEXT ${shortDate(nextBillDate(b, now)).toUpperCase()}` : 'ADD DUE DATE'} · ${formatMoney(perWeek(b.amount, b.period))}/WK</div></button>
        <span class="billcost">${formatMoney(b.amount)}<button class="iconbtn" data-del-bill="${esc(b.id)}" title="Remove" aria-label="Remove ${esc(b.name)}">×</button></span>
      </div>`).join('')
    : '<div class="empty">No bills added yet. Add rent, subscriptions and regular payments.</div>';

  $('afterpayPill').textContent = `Afterpay owing ${formatMoney(state.afterpayBalance)}`;
  const sorted = state.commitments.slice().sort((a, b) => (a.due || '0000').localeCompare(b.due || '0000'));
  $('commitmentList').innerHTML = sorted.length
    ? sorted.map((c) => {
        const need = commitmentNeed(c, now);
        const when = need.status === 'overdue' ? `OVERDUE SINCE ${shortDate(c.due).toUpperCase()} · NEEDED NOW`
          : need.status === 'now' ? 'NO DUE DATE · HOLD THE FULL AMOUNT NOW'
          : `DUE ${longDate(c.due).toUpperCase()} · SET ASIDE ${formatMoney(need.perWeek)}/WK${need.savedSoFar ? ` · ≈${formatMoney(need.savedSoFar)} PUT ASIDE SO FAR` : ''}`;
        return `<div class="billrow">
          <span class="billicon">${c.kind === 'Afterpay' ? '↗' : '◷'}</span>
          <button class="billmain" data-edit-com="${esc(c.id)}" title="Edit"><div class="billname">${esc(c.name)}${c.kind && c.kind !== c.name ? ` <span class="muted">· ${esc(c.kind)}</span>` : ''}</div><div class="billdue ${need.status === 'overdue' ? 'overdue' : ''}">${when}</div></button>
          <span class="billcost">${formatMoney(c.amount)}<button class="iconbtn" data-paid-com="${esc(c.id)}" title="Mark paid" aria-label="Mark ${esc(c.name)} paid">✓</button><button class="iconbtn" data-del-com="${esc(c.id)}" title="Remove" aria-label="Remove ${esc(c.name)}">×</button></span>
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
  const panel = $('forecastPanel');
  const head = `<div class="sectionhead"><h2>Looking ahead · next 12 months</h2><button class="linkbtn" data-open="balances">UPDATE BALANCES ↗</button></div>`;
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
    ? `<div class="notice warn"><b>Tight time ahead.</b> Around ${longDate(f.shortDate)}, money is forecast to drop ${formatMoney(f.shortfall)} below your ${formatMoney(f.buffer)} buffer, even if you save nothing. Look at the dates below. Moving a payment, lowering a limit, or using the buffer now beats a credit card later.</div>` : '';
  const over = alloc.overBy > 0
    ? `<div class="notice warn">Your plan saves ${formatMoney(alloc.savings + alloc.emergency)} per pay, but only ${formatMoney(f.perPay)} is safe right now. Saving more than that is what leads to withdrawing later. <button class="inlinebtn" data-open="plan">Adjust the plan</button></div>` : '';
  const split = !alloc.committed
    ? `<div class="notice info">Suggested split of the ${formatMoney(f.perPay)}: <b>${formatMoney(suggestion.savings)}</b> to locked savings${suggestion.emergency ? `, <b>${formatMoney(suggestion.emergency)}</b> to your emergency fund` : ''}, <b>${formatMoney(suggestion.wants)}</b> to wants. <br><button class="inlinebtn" data-open="plan">Choose my split</button></div>`
    : `<div class="splitrow"><span class="muted">Each payday move:</span>
        <span class="chip">Locked savings <b>${formatMoney(alloc.savings)}</b></span>
        ${alloc.emergency ? `<span class="chip">Emergency fund <b>${formatMoney(alloc.emergency)}</b></span>` : emergencyFull(state) ? '<span class="chip">Emergency fund <b>full ✓</b></span>' : ''}
        <span class="chip">Wants <b>${formatMoney(alloc.wants)}</b></span>
        <button class="linkbtn" data-open="plan">CHANGE</button></div>
       <div class="fieldhint">From CommBank to your Up Savers, once your pay lands. Then update balances.</div>`;
  panel.innerHTML = `${head}
    <div class="stats">
      <div class="stat hero"><label>Safe to save each pay</label><strong>${formatMoney(f.perPay)}</strong><div class="sub">next payday ${longDate(f.nextPay)}. Nothing you'll need back.</div></div>
      <div class="stat ${f.min < f.buffer ? 'warn' : ''}"><label>Lowest point ahead</label><strong>${formatMoney(f.min)}</strong><div class="sub">around ${longDate(f.minDate)}, after saving</div></div>
      <div class="stat"><label>Money now</label><strong>${formatMoney(f.cash)}</strong><div class="sub">${formatMoney(f.buffer)} of it always stays as your buffer</div></div>
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

function drawChart(f) {
  const wrap = $('chartWrap');
  if (!wrap) return;
  const W = Math.max(280, wrap.clientWidth || 600), H = 220, padL = 52, padR = 12, padT = 18, padB = 24;
  const pts = f.series;
  const values = pts.map((p) => p.balance);
  let lo = Math.min(0, f.buffer, ...values), hi = Math.max(f.buffer, ...values);
  if (hi === lo) hi = lo + 10000;
  const span = hi - lo; lo -= span * 0.05; hi += span * 0.08;
  const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join('');
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].map((v) => Math.round(v / 10000) * 10000);
  const months = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.date.endsWith('-01'));
  const minI = pts.findIndex((p) => p.date === f.minDate);
  const minBelow = f.min < f.buffer;
  const minLabelX = Math.min(Math.max(x(minI), padL + 40), W - padR - 80);
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected balance over the next 12 months. Lowest ${formatMoney(f.min)} on ${longDate(f.minDate)}.">
    ${ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${t < 0 ? '-' : ''}$${Math.abs(t / 100) >= 1000 ? `${(Math.abs(t) / 100000).toFixed(1).replace(/\.0$/, '')}k` : Math.abs(t / 100)}</text>`).join('')}
    ${months.map(({ p, i }) => `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${shortDate(p.date).split(' ')[1]}</text>`).join('')}
    <line class="bufferline" x1="${padL}" x2="${W - padR}" y1="${y(f.buffer)}" y2="${y(f.buffer)}"/>
    <text class="label muted" x="${padL + 4}" y="${y(f.buffer) - 5}" text-anchor="start">buffer ${formatMoney(f.buffer)}</text>
    <path class="line" d="${path}"/>
    <circle cx="${x(minI)}" cy="${y(f.min)}" r="5" fill="${minBelow ? 'var(--over)' : 'var(--forest)'}" stroke="var(--white)" stroke-width="2"/>
    <text class="label ${minBelow ? 'over' : ''}" x="${minLabelX}" y="${Math.min(y(f.min) + 18, H - padB - 2)}" text-anchor="middle">lowest ${formatMoney(f.min)} · ${shortDate(f.minDate)}</text>
    <line class="crosshair" id="crosshair" y1="${padT}" y2="${H - padB}" x1="0" x2="0" visibility="hidden"/>
    <rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" id="chartHit"/>
  </svg><div class="charttip" id="chartTip"></div>`;
  const hit = $('chartHit'), tip = $('chartTip'), cross = $('crosshair');
  const show = (clientX) => {
    const rect = wrap.querySelector('svg').getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (pts.length - 1))));
    const p = pts[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    const ev = p.events.filter((e) => e.kind !== 'bill-estimate');
    tip.innerHTML = `${longDate(p.date)}<br>Balance <b>${formatMoney(p.balance)}</b>${ev.map((e) => `<br>${esc(e.name)} <b>${e.amount > 0 ? '+' : '−'}${formatMoney(Math.abs(e.amount))}</b>`).join('')}`;
    const left = (x(i) / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left - 75, 0), rect.width - 160)}px`;
    tip.style.top = '-8px';
    tip.classList.add('show');
  };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', () => { tip.classList.remove('show'); cross.setAttribute('visibility', 'hidden'); });
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
    <div class="potrow"><div class="pottop"><div><div class="potname">Everyday</div><div class="potwhere">COMMBANK + UP SPENDING · ${updated.toUpperCase()}</div></div><span class="potamt">${formatMoney(state.balances.everyday)}</span></div></div>
    <div class="potrow"><div class="pottop"><div><div class="potname">Bills & buffer</div><div class="potwhere">UP SAVER · OK TO USE FOR BILLS & SMALL SURPRISES</div></div><span class="potamt">${formatMoney(p.buffer.balance)}</span></div>
      <div class="potnote">Buffer to keep: ${formatMoney(p.buffer.target)}</div></div>
    <div class="potrow"><div class="pottop"><div><div class="potname">Emergency fund</div><div class="potwhere">UP SAVER · REAL EMERGENCIES ONLY</div></div><span class="potamt">${formatMoney(p.emergency.balance)} / ${formatMoney(p.emergency.target)}</span></div>
      ${meter(p.emergency.balance, p.emergency.target)}
      <div class="potnote">${emergencyFull(state) ? 'Full ✓ Its share of each pay now goes to savings and wants.' : alloc && alloc.emergency ? `+${formatMoney(alloc.emergency)} each pay until full.` : 'Not being topped up yet. Choose your split in the forecast.'}</div></div>
    <div class="potrow"><div class="pottop"><div><div class="potname">Locked savings</div><div class="potwhere">UP SAVER · NEVER WITHDRAW</div></div><span class="potamt">${formatMoney(p.savings.balance)}</span></div>
      <div class="potnote">${alloc && alloc.savings ? `+${formatMoney(alloc.savings)} each pay. Untouched, it keeps Up's bonus rate.` : 'Choose how much goes here each pay in the forecast.'}</div></div>`;
}

function renderWants(f, now) {
  const alloc = f.perPay !== undefined ? allocation(state, f.perPay) : null;
  const wantsPerPay = alloc ? alloc.wants : 0;
  $('wantsPill').textContent = `${formatMoney(wantsPerPay)} / pay`;
  const timeline = f.paydays ? wantsTimeline(state.wants, f.paydays, wantsPerPay) : new Map();
  $('wantList').innerHTML = state.wants.length ? state.wants.map((w, i) => {
    const cooling = w.coolUntil > now;
    const ready = timeline.get(w.id);
    let status;
    if (cooling) status = `COOLING OFF UNTIL ${shortDate(w.coolUntil).toUpperCase()} · STILL WANT IT THEN?`;
    else if (ready === 'now') status = '<span class="good">FULLY SAVED ✓</span>';
    else if (ready) status = `SAVED BY ${longDate(ready).toUpperCase()} AT ${formatMoney(wantsPerPay)}/PAY`;
    else if (f.status && f.status.startsWith('needs')) status = 'FINISH SETTING UP THE FORECAST TO GET A DATE';
    else status = 'NO WANTS MONEY IN YOUR SPLIT YET';
    return `<div class="wantrow">
      <div class="wanttop"><button class="wantname" data-edit-want="${esc(w.id)}" title="Edit">${i + 1}. ${esc(w.name)}</button><span class="potamt">${formatMoney(w.saved)} / ${formatMoney(w.price)}</span></div>
      ${meter(w.saved, w.price)}
      <div class="wantstatus">${status}</div>
      <div class="wantactions">
        <button class="smallbtn primary" data-check-want="${esc(w.id)}" ${cooling ? 'disabled' : ''}>Can I buy it now?</button>
        ${i > 0 ? `<button class="smallbtn" data-up-want="${esc(w.id)}" title="Fund this one first">↑ First</button>` : ''}
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
function openForm({ title, fields, submitLabel, onSubmit, note, extraButtons = [] }) {
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
    try {
      const error = await onSubmit(values);
      if (error) { $('formError').textContent = error; return; }
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
    onSubmit: async (v) => {
      if (v.date > today()) return 'Date can’t be in the future.';
      const entry = { name: v.name, amount: v.amount, category: v.category, date: v.date };
      if (existing) {
        const saved = await api.updateTransaction(existing.id, entry);
        transactions = transactions.map((t) => (t.id === existing.id ? saved : t)).sort(byNewest);
        toast('Spending updated.');
      } else {
        const saved = await api.addTransaction(entry);
        transactions = [saved, ...transactions].sort(byNewest);
        toast('Spending logged. Limits updated.');
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
    ],
    note: existing ? '' : 'It waits a cooling-off period first: 1 day under $100, 7 days up to $500, 30 days above. If you still want it after that, it gets a date.',
    onSubmit: (v) => {
      if (v.saved > v.price) return 'Already saved can’t be more than the price.';
      if (existing) Object.assign(existing, { name: v.name, price: v.price, saved: v.saved });
      else {
        const days = coolingDays(v.price);
        state.wants.push({ id: newId('want'), name: v.name, price: v.price, saved: v.saved, addedOn: today(), coolUntil: addDays(today(), days) });
        toast(`Added. Cooling off for ${days} day${days === 1 ? '' : 's'}.`);
      }
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
  openForm({
    title: 'Your balances right now',
    submitLabel: 'Save balances',
    fields: [
      { name: 'everyday', label: 'Everyday: CommBank + Up Spending together', type: 'money', value: state.balances.everyday, required: true, hint: 'Everything you can spend or pay bills from today, not counting Up Savers.' },
      { name: 'buffer', label: 'Bills & buffer Saver', type: 'money', value: state.pots.buffer.balance, half: true },
      { name: 'bufferTarget', label: 'Buffer to always keep', type: 'money', value: state.pots.buffer.target, half: true },
      { name: 'emergency', label: 'Emergency fund Saver', type: 'money', value: state.pots.emergency.balance, half: true },
      { name: 'emergencyTarget', label: 'Emergency fund goal', type: 'money', value: state.pots.emergency.target, half: true },
      { name: 'savings', label: 'Locked savings Saver', type: 'money', value: state.pots.savings.balance },
    ],
    note: 'Up Saver you have today? If it’s your only savings, count it as the emergency fund. A new Saver for locked savings starts at $0.',
    onSubmit: (v) => {
      state.balances = { everyday: v.everyday, updatedOn: today() };
      state.pots.buffer = { balance: v.buffer, target: v.bufferTarget };
      state.pots.emergency = { balance: v.emergency, target: v.emergencyTarget };
      state.pots.savings = { balance: v.savings };
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
    ],
    onSubmit: async (v) => {
      state.pay = { amount: v.amount, period: v.period, nextPayday: v.nextPayday };
      state.weekStartsOn = Number(v.weekStartsOn);
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
      for (const b of draft) {
        const before = state.budgets.find((x) => x.id === b.id);
        if (before && before.name !== b.name) {
          await api.renameCategory(before.name, b.name);
          transactions = transactions.map((t) => (t.category === before.name ? { ...t, category: b.name } : t));
        }
      }
      state.budgets = draft;
      await saveState();
      closeModal();
      toast('Categories saved.');
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
  $('savingDisplay').onclick = planForm;

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
  $('addAfterpay').onclick = afterpayPurchaseForm;
  $('updateBalances').onclick = balancesForm;
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
  $('afterpayPill').onclick = afterpayForm;
  $('openSettings').onclick = settingsForm;
  $('openBackup').onclick = backupDialog;
  $('editCategories').onclick = categoriesForm;
  $('closeModal').onclick = closeModal;
  $('overlay').onclick = (e) => { if (e.target === $('overlay')) closeModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  document.body.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.editTx) spendingForm(find(transactions, d.editTx));
    if (d.delTx) {
      const tx = find(transactions, d.delTx);
      if (!tx || !confirm(`Delete “${tx.name}” (${formatMoney(tx.amount)})?`)) return;
      try { await api.deleteTransaction(tx.id); transactions = transactions.filter((x) => x.id !== tx.id); render(); toast('Entry deleted.'); }
      catch (error) { toast(error.message); }
    }
    if (d.editBill) billForm(find(state.bills, d.editBill));
    if (d.delBill) {
      const bill = find(state.bills, d.delBill);
      if (bill && confirm(`Remove “${bill.name}”?`)) { state.bills = state.bills.filter((b) => b !== bill); saveState(); }
    }
    if (d.editCom) commitmentForm(find(state.commitments, d.editCom));
    if (d.paidCom) {
      const c = find(state.commitments, d.paidCom);
      if (!c || !confirm(`Mark “${c.name}” (${formatMoney(c.amount)}) as paid?`)) return;
      if (c.kind === 'Afterpay') state.afterpayBalance = Math.max(0, state.afterpayBalance - c.amount);
      state.commitments = state.commitments.filter((x) => x !== c);
      saveState();
      toast('Marked paid.');
    }
    if (d.delCom) {
      const c = find(state.commitments, d.delCom);
      if (c && confirm(`Remove “${c.name}” without marking it paid?`)) { state.commitments = state.commitments.filter((x) => x !== c); saveState(); }
    }
    if (d.open) ({ balances: balancesForm, settings: settingsForm, plan: planForm })[d.open]?.();
    if (d.editWant) wantForm(find(state.wants, d.editWant));
    if (d.checkWant) buyCheckDialog(find(state.wants, d.checkWant));
    if (d.upWant) {
      const w = find(state.wants, d.upWant);
      state.wants = [w, ...state.wants.filter((x) => x !== w)];
      saveState();
    }
    if (d.boughtWant) {
      const w = find(state.wants, d.boughtWant);
      if (!w || !confirm(`Mark “${w.name}” as bought and remove it from wants?`)) return;
      state.wants = state.wants.filter((x) => x !== w);
      saveState();
      toast(w.saved >= w.price ? 'Enjoy it. Paid for without touching savings.' : 'Bought. Update your balances so the forecast knows.');
    }
    if (d.delWant) {
      const w = find(state.wants, d.delWant);
      if (w && confirm(`Remove “${w.name}” from wants?`)) { state.wants = state.wants.filter((x) => x !== w); saveState(); }
    }
  });
}

// ---------- start ----------

async function loadEverything() {
  state = await api.getState();
  const from = addDays(weekStart(today(), state.weekStartsOn), -7 * (HISTORY_WEEKS - 1));
  transactions = (await api.listTransactions(from)).sort(byNewest);
  loadedFrom = from;
  viewOffset = 0;
  render();
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

$('today').textContent = longDate(today()).toUpperCase();
wireEvents();
boot();
