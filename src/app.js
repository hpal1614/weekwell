import { api } from './api.js';
import {
  COMMITMENT_KINDS, PAY_PERIODS, PERIODS, addDays, categoryAverages, commitmentNeed, formatMoney,
  fromCents, inRange, longDate, newId, perWeek, shortDate, spentByCategory, toCents, todayISO,
  weekLabel, weekStart, weeklyHistory, weeklyPlan,
} from './engine.js';

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
  if (document.activeElement !== $('savingInput')) $('savingInput').value = fromCents(state.saving) || 0;
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

  renderHistory(now);
  renderSide(plan, now);
  renderTip(plan);
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
        <button class="billmain" data-edit-bill="${esc(b.id)}" title="Edit"><div class="billname">${esc(b.name)}</div><div class="billdue">${PERIOD_LABEL[b.period].toUpperCase()} · SET ASIDE ${formatMoney(perWeek(b.amount, b.period))}/WK</div></button>
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
          : `DUE ${longDate(c.due).toUpperCase()} · SET ASIDE ${formatMoney(need.perWeek)}/WK`;
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

  $('goalList').innerHTML = state.goals.map((g) => `<div class="billrow">
      <span class="billicon">◎</span><div><div class="billname">${esc(g.name)}</div><div class="billdue">PLANNING COMING NEXT</div></div>
      <span class="billcost">${formatMoney(g.amount)}<button class="iconbtn" data-del-goal="${esc(g.id)}" title="Remove" aria-label="Remove ${esc(g.name)}">×</button></span>
    </div>`).join('');
}

function renderTip(plan) {
  let tip;
  if (plan.income === 0) tip = 'Start by entering your take-home pay above. Everything else is worked out per week from it.';
  else if (plan.left < 0) tip = `Your bills, limits and savings add up to ${formatMoney(-plan.left)} more than you earn each week. Lower a limit or the savings target so the plan is something you can actually follow.`;
  else if (plan.overdue > 0) tip = `${formatMoney(plan.overdue)} is overdue. It's counted as needed this week, so the plan won't show that money as spare.`;
  else if (plan.spending === 0) tip = `Your listed bills reserve ${formatMoney(plan.bills)} each week. The remaining ${formatMoney(plan.left)} still has to cover everything else, so set spending limits next.`;
  else tip = `With your current limits, ${formatMoney(plan.left)} is unplanned each week. Log spending for a few weeks, then use History to set limits that match real life.`;
  $('tipText').textContent = tip;
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
    ],
    onSubmit: (v) => {
      if (existing) Object.assign(existing, { name: v.name, amount: v.amount, period: v.period });
      else state.bills.push({ id: newId('bill'), name: v.name, icon: '↻', amount: v.amount, period: v.period });
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
      else state.commitments.push({ id: newId('com'), ...fields });
      saveState();
      toast(existing ? 'Payment updated.' : 'Payment added. Weekly plan updated.');
    },
  });
}

function goalForm() {
  openForm({
    title: 'Add a goal',
    submitLabel: 'Save goal',
    fields: [
      { name: 'name', label: 'What are you saving for?', placeholder: 'e.g. DJ controller', required: true },
      { name: 'amount', label: 'Cost', type: 'money', required: true, min: 0.01 },
    ],
    note: 'The next update will work out when you can buy it without touching your savings.',
    onSubmit: (v) => { state.goals.push({ id: newId('goal'), name: v.name, amount: v.amount }); saveState(); },
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
  $('savingInput').addEventListener('change', (e) => { state.saving = Math.max(0, toCents(e.target.value)); saveState(); });
  $('savingDisplay').onclick = () => { $('savingInput').focus(); $('savingInput').select(); };

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
  $('addGoal').onclick = () => goalForm();
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
    if (d.delGoal) {
      const g = find(state.goals, d.delGoal);
      if (g && confirm(`Remove goal “${g.name}”?`)) { state.goals = state.goals.filter((x) => x !== g); saveState(); }
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

$('today').textContent = longDate(today()).toUpperCase();
wireEvents();
loadEverything().catch((error) => toast(`Could not connect to the budget database: ${error.message}`));
