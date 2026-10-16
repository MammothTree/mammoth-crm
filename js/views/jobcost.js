/* Mammoth CRM — Job cost: estimated vs. actual cost on every job */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const EXP_CATS = ['Dump fees', 'Subcontractor', 'Equipment rental', 'Materials', 'Fuel', 'Permit or fee', 'Other'];
  const RANGES = [{ value: '30', label: 'Jobs in the last 30 days' }, { value: '90', label: 'Jobs in the last 90 days' }, { value: 'ytd', label: 'Jobs this year' }, { value: 'all', label: 'All jobs' }];

  const view = { title: 'Job cost', range: '90', q: '', only: '' };

  function rowFor(d, s) {
    const est = d.estimateId && store.estimate(d.estimateId);
    const estCost = est ? calc.estimate(est, s).cost : null;
    const act = calc.jobActuals(d, s);
    const used = calc.dealCost(d, s);
    const revenue = u.num(d.value);
    const variance = act.tracked && estCost ? (act.total - estCost) / estCost : null;
    return { d, est, estCost, act, used, revenue, profit: used == null ? null : revenue - used, margin: used == null || !revenue ? null : (revenue - used) / revenue, variance, unsynced: act.tracked && !act.open && (used == null || Math.abs(act.total - used) >= 1) };
  }

  view.render = function (root) {
    const s = store.state;
    const today = u.todayISO();
    const from = view.range === 'all' ? '0000' : view.range === 'ytd' ? today.slice(0, 4) + '-01-01' : u.addDays(today, -u.num(view.range));
    const q = view.q.toLowerCase();
    let rows = s.deals.filter((d) => d.stage === 'won' && calc.jobDate(d) && calc.jobDate(d) <= today && calc.jobDate(d) >= from)
      .filter((d) => !q || (d.title + ' ' + store.customerName(d.customerId)).toLowerCase().includes(q))
      .map((d) => rowFor(d, s))
      .sort((a, b) => (calc.jobDate(a.d) < calc.jobDate(b.d) ? 1 : -1));
    if (view.only === 'over') rows = rows.filter((r) => r.variance != null && r.variance > 0.1);
    if (view.only === 'tracked') rows = rows.filter((r) => r.act.tracked);
    if (view.only === 'nocost') rows = rows.filter((r) => r.used == null);
    const costed = rows.filter((r) => r.used != null);
    const rev = u.sum(costed, (r) => r.revenue), cost = u.sum(costed, (r) => r.used);
    const over = rows.filter((r) => !r.act.open && r.variance != null && r.variance > 0.1);
    const unsynced = rows.filter((r) => r.unsynced);
    const flag = (r) => r.act.open ? ui.badge('In progress', 'info') : r.variance == null ? '' : r.variance > 0.1 ? ui.badge(Math.round(r.variance * 100) + '% over', 'bad') : r.variance < -0.1 ? ui.badge(Math.round(-r.variance * 100) + '% under', 'good') : ui.badge('On budget', 'info');

    root.innerHTML = `
      <section class="kpis">
        <article class="kpi"><h3 class="kpi-label">Profit</h3><div class="kpi-value ${rev - cost < 0 ? 'neg' : ''}">${u.money(rev - cost)}</div><div class="kpi-sub">${costed.length} jobs with costs, ${u.money(rev)} revenue</div></article>
        <article class="kpi"><h3 class="kpi-label">Average margin</h3><div class="kpi-value">${rev ? u.pct((rev - cost) / rev, 1) : '—'}</div><div class="kpi-sub">Target ${u.esc(s.overhead.targetProfit)}%</div></article>
        <article class="kpi"><h3 class="kpi-label">Average profit per job</h3><div class="kpi-value">${costed.length ? u.money((rev - cost) / costed.length) : '—'}</div><div class="kpi-sub">Job value minus job cost</div></article>
        <article class="kpi"><h3 class="kpi-label">Over budget</h3><div class="kpi-value ${over.length ? 'neg' : ''}">${over.length}</div><div class="kpi-sub">Tracked cost more than 10% above the estimate</div></article>
      </section>
      ${unsynced.length ? `<div class="notice"><span>${unsynced.length} ${unsynced.length === 1 ? 'job has' : 'jobs have'} tracked time and expenses that differ from the job cost used for profit.</span><button class="btn primary sm" id="jc-sync">Use tracked cost on ${unsynced.length === 1 ? 'it' : 'all ' + unsynced.length}</button></div>` : ''}
      <div class="toolbar">
        <input type="search" class="input" id="jcq" placeholder="Search jobs or clients" value="${u.esc(view.q)}" aria-label="Search jobs">
        <select class="input" id="jcr" aria-label="Date range">${u.options(RANGES, view.range)}</select>
        <select class="input" id="jco" aria-label="Show">${u.options([{ value: 'tracked', label: 'Jobs with tracked time' }, { value: 'over', label: 'Over budget' }, { value: 'nocost', label: 'Missing a job cost' }], view.only, 'All jobs')}</select>
      </div>
      <section class="panel flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Job</th><th>Date</th><th class="num">Revenue</th><th class="num">Estimated cost</th><th class="num">Tracked cost</th><th class="num">Job cost used</th><th class="num">Profit</th><th class="num">Margin</th><th>Budget</th></tr></thead>
        <tbody>${rows.slice(0, 250).map((r) => `<tr class="click" data-id="${r.d.id}">
          <td><b>${u.esc(r.d.title)}</b><div class="row-sub">${u.esc(store.customerName(r.d.customerId))}</div></td>
          <td class="nowrap">${u.fmtShort(calc.jobDate(r.d))}</td>
          <td class="num">${u.money(r.revenue)}</td>
          <td class="num">${r.estCost == null ? '<span class="muted">No estimate</span>' : u.money(r.estCost)}</td>
          <td class="num">${r.act.tracked ? u.money(r.act.total) + '<div class="row-sub">' + (Math.round(r.act.crewHours * 10) / 10) + ' crew-hrs</div>' : '<span class="muted">Not tracked</span>'}</td>
          <td class="num">${r.used == null ? '<span class="muted">Missing</span>' : u.money(r.used)}${r.unsynced ? '<div class="row-sub warn-text">Differs from tracked</div>' : ''}</td>
          <td class="num ${r.profit < 0 ? 'neg' : ''}">${r.profit == null ? '—' : u.money(r.profit)}</td>
          <td class="num">${r.margin == null ? '—' : u.pct(r.margin)}</td>
          <td>${flag(r)}</td></tr>`).join('') || `<tr><td colspan="9">${ui.empty('No finished jobs match.')}</td></tr>`}</tbody>
      </table></div></section>
      <p class="hint">Tracked cost = crew time from Time tracking (wages plus ${u.esc(s.overhead.laborBurden)}% burden) + an overhead share for those crew-hours + job expenses + equipment operating cost from the estimate. Click a job to see the breakdown and add expenses like dump fees or crane bills.</p>`;

    const qi = u.qs('#jcq', root);
    qi.addEventListener('input', u.debounce(() => { view.q = qi.value; view.render(root); const n = u.qs('#jcq', root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    u.qs('#jcr', root).addEventListener('change', (e) => { view.range = e.target.value; view.render(root); });
    u.qs('#jco', root).addEventListener('change', (e) => { view.only = e.target.value; view.render(root); });
    u.qsa('tr[data-id]', root).forEach((tr) => tr.addEventListener('click', () => view.open(tr.dataset.id)));
    const sync = u.qs('#jc-sync', root);
    if (sync) sync.addEventListener('click', () => {
      unsynced.forEach((r) => { r.d.jobCost = Math.round(r.act.total); r.d.costSource = 'tracked'; });
      store.save();
      ui.toast('Job cost updated on ' + unsynced.length + (unsynced.length === 1 ? ' job' : ' jobs'));
    });
  };

  view.open = function (dealId) {
    const s = store.state;
    const d = store.deal(dealId);
    if (!d) return;
    d.expenses = d.expenses || [];
    const r = rowFor(d, s);
    const t = r.est ? calc.estimate(r.est, s) : null;
    const oh = calc.overhead(s);
    const line = (label, est, act) => `<tr><td>${label}</td><td class="num">${est == null ? '—' : u.money(est)}</td><td class="num">${act == null ? '—' : u.money(act)}</td><td class="num">${est != null && act != null ? (act - est >= 0 ? '+' : '−') + u.money(Math.abs(act - est)) : ''}</td></tr>`;
    ui.modal({
      title: d.title,
      size: 'lg',
      body: `
        <p class="hint">${u.esc(store.customerName(d.customerId))}, job ${u.fmtDate(calc.jobDate(d))}, ${u.money(d.value)} job value.</p>
        <div class="table-wrap"><table class="table cost-compare">
          <thead><tr><th></th><th class="num">Estimated</th><th class="num">Actual (tracked)</th><th class="num">Difference</th></tr></thead>
          <tbody>
            <tr><td>Crew-hours</td><td class="num">${t ? u.num(r.est.crewHours) : '—'}</td><td class="num">${r.act.tracked ? Math.round(r.act.crewHours * 10) / 10 : '—'}</td><td class="num">${t && r.act.tracked ? (r.act.crewHours - u.num(r.est.crewHours) >= 0 ? '+' : '−') + Math.abs(Math.round((r.act.crewHours - u.num(r.est.crewHours)) * 10) / 10) : ''}</td></tr>
            ${line('Crew pay and overhead', t ? t.laborCost : null, r.act.tracked ? r.act.labor + r.act.overheadShare : null)}
            ${line('Equipment operating cost', t ? t.equipCost : null, r.act.equipment)}
            ${line('Subs, rentals, dump fees, materials', t ? t.addonCost + t.disposal : null, r.act.expenses)}
            <tr class="total-row"><td>Total cost</td><td class="num">${r.estCost == null ? '—' : u.money(r.estCost)}</td><td class="num">${r.act.tracked || r.act.expenses ? u.money(r.act.total) : '—'}</td><td class="num">${r.estCost != null && (r.act.tracked || r.act.expenses) ? (r.act.total - r.estCost >= 0 ? '+' : '−') + u.money(Math.abs(r.act.total - r.estCost)) : ''}</td></tr>
            <tr><td>Profit</td><td class="num">${r.estCost == null ? '—' : u.money(d.value - r.estCost)}</td><td class="num">${r.act.tracked ? u.money(d.value - r.act.total) : '—'}</td><td></td></tr>
          </tbody></table></div>
        <p class="hint">Overhead share is ${u.money(oh.ohPerHour)} per crew-hour from Overhead &amp; pricing. Job cost used for profit right now: <b>${r.used == null ? 'none' : u.money(r.used)}</b>${d.costSource ? ' (' + u.esc({ actual: 'entered by hand', estimate: 'from the estimate', tracked: 'from tracked time' }[d.costSource] || d.costSource) + ')' : ''}.</p>

        <h4 class="sub-h">Expenses on this job</h4>
        ${d.expenses.length ? '<ul class="pay-list exp-list">' + d.expenses.map((x) => `<li><span>${u.fmtShort(x.date)}</span><span>${u.esc(x.category)}: ${u.esc(x.desc)}</span><b>${u.money(x.amount, true)}</b><button class="icon-btn" data-delx="${x.id}" aria-label="Remove expense">&times;</button></li>`).join('') + '</ul>' : '<p class="hint">No expenses recorded.</p>'}
        <div class="exp-add">
          <label class="field"><span>Category</span><select class="input" id="ex-cat">${u.options(EXP_CATS, 'Dump fees')}</select></label>
          <label class="field"><span>Description</span><input class="input" id="ex-desc" placeholder="e.g. 2 loads at green waste"></label>
          <label class="field"><span>Amount ($)</span><input class="input" type="number" min="0" step="0.01" id="ex-amt"></label>
          <button class="btn ghost" id="ex-add">Add expense</button>
        </div>

        <h4 class="sub-h">Crew time</h4>
        ${r.act.entries.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Who</th><th class="num">Hours</th><th class="num">Cost</th></tr></thead><tbody>${r.act.entries.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => `<tr><td>${u.fmtShort(e.date)}</td><td>${u.esc((store.crewMember(e.crewId) || {}).name || 'Removed')}</td><td class="num">${Math.round(calc.entryHours(e) * 100) / 100}</td><td class="num">${u.money(calc.entryCost(e, s))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No time tracked on this job. Clock the crew in from Time tracking.</p>'}`,
      onMount(b, close) {
        u.qs('#ex-add', b).addEventListener('click', () => {
          const amt = u.num(u.qs('#ex-amt', b).value);
          if (!(amt > 0)) { ui.toast('Enter the expense amount.', 'err'); return; }
          d.expenses.push({ id: u.uid('ex'), date: u.todayISO(), category: u.qs('#ex-cat', b).value, desc: u.qs('#ex-desc', b).value.trim(), amount: amt });
          store.save(); close(); view.open(dealId);
        });
        u.qsa('[data-delx]', b).forEach((x) => x.addEventListener('click', () => { d.expenses = d.expenses.filter((y) => y.id !== x.dataset.delx); store.save(); close(); view.open(dealId); }));
      },
      actions: [
        { label: 'Open deal', kind: 'ghost', left: true, onClick: () => MT.views.pipeline.openDeal(d.id) },
        { label: 'Close' },
        (r.act.tracked || r.act.expenses) ? { label: 'Use tracked cost (' + u.money(r.act.total) + ')', kind: 'primary', onClick: () => { d.jobCost = Math.round(r.act.total); d.costSource = 'tracked'; store.save(); ui.toast('Job cost updated'); } } : null,
      ].filter(Boolean),
    });
  };

  MT.views.jobcost = view;
})();
