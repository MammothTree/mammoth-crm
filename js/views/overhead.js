/* Mammoth CRM — Overhead & pricing: business overhead, rate card, job pricing calculator, add-ons library */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const CATS = ['Insurance', 'Vehicles & equipment', 'Facilities', 'Office & admin', 'Marketing', 'Licensing & training', 'Shop & small tools', 'Other'];
  const FREQ = [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Yearly' }, { value: 'weekly', label: 'Weekly' }];
  const ADDON_CATS = ['Subcontractor', 'Equipment rental', 'Permit or fee', 'Disposal', 'Materials', 'Other'];
  const ADDON_UNITS = [{ value: 'flat', label: 'Per job' }, { value: 'hour', label: 'Per hour' }, { value: 'day', label: 'Per day' }, { value: 'load', label: 'Per load' }, { value: 'each', label: 'Each' }];

  const view = { title: 'Overhead & pricing', mode: 'rates', job: null };

  /* ---------- saving & rate history ---------- */
  function touched() { store.state.overhead.updatedAt = new Date().toISOString(); }
  const saveSoon = u.debounce(() => store.save(true), 400);
  // History is recorded after edits settle, so half-typed numbers are never logged.
  const recordSoon = u.debounce(() => {
    const o = store.state.overhead;
    const r = calc.overhead(store.state);
    const h = (o.history = o.history || []);
    const last = h[h.length - 1];
    if (last && last.rate === r.recommendedRateRounded) return;
    const entry = { date: u.todayISO(), rate: r.recommendedRateRounded, breakEven: Math.round(r.breakEvenRate), monthly: Math.round(r.monthly), note: '' };
    if (last && last.date === entry.date) { entry.note = last.note; h[h.length - 1] = entry; } else h.push(entry);
    store.save(true);
    const el = document.getElementById('oh-history');
    if (el) el.innerHTML = historyHTML();
  }, 2500);
  function changed() { touched(); saveSoon(); recordSoon(); }

  function historyHTML() {
    const h = (store.state.overhead.history || []).slice().reverse().slice(0, 8);
    if (!h.length) return '<p class="hint">Your rate is recorded here whenever your numbers change.</p>';
    return '<ul class="rate-hist">' + h.map((x, i) => {
      const prev = h[i + 1];
      const d = prev ? x.rate - prev.rate : 0;
      return `<li><div class="rh-top"><b>${u.money(x.rate)}/crew-hr</b>${prev && d ? `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${u.money(Math.abs(d))}</span>` : ''}<time>${u.fmtDate(x.date)}</time></div>
        <input class="input rh-note" data-date="${u.esc(x.date)}" data-rate="${x.rate}" value="${u.esc(x.note || '')}" placeholder="What changed? (optional)" aria-label="Note for ${u.esc(x.date)}">
        <small>Break-even ${u.money(x.breakEven)}, overhead ${u.money(x.monthly)}/mo</small></li>`;
    }).join('') + '</ul>';
  }

  view.render = function (root) {
    const o = store.state.overhead;
    root.innerHTML = `
      <div class="oh-top">
        <div class="seg" role="tablist">
          ${[['rates', 'Overhead & rates'], ['job', 'Price a job'], ['addons', 'Add-ons & subs'], ['pricebook', 'Price book']].map((m) => `<button role="tab" data-mode="${m[0]}" class="${view.mode === m[0] ? 'on' : ''}" aria-selected="${view.mode === m[0]}">${m[1]}</button>`).join('')}
        </div>
        <span class="hint">${o.updatedAt ? 'Numbers last changed ' + u.fmtDate(o.updatedAt.slice(0, 10)) : 'Changes save automatically'}</span>
      </div>
      <div id="oh-host"></div>`;
    u.qsa('.oh-top .seg button', root).forEach((b) => b.addEventListener('click', () => { view.mode = b.dataset.mode; view.render(root); }));
    const host = u.qs('#oh-host', root);
    if (view.mode === 'job') renderJob(host, root);
    else if (view.mode === 'addons') renderAddons(host, root);
    else if (view.mode === 'pricebook') renderPriceBook(host);
    else renderRates(host, root);
  };

  /* ================= Overhead & rates ================= */
  function renderRates(root) {
    const o = store.state.overhead;
    const ops = [
      ['crews', 'Crews working', 1, 'crews'],
      ['crewSize', 'People per crew', 1, 'people'],
      ['avgWage', 'Average crew wage', 0.25, '$/hr'],
      ['laborBurden', 'Labor burden (payroll tax, workers\' comp)', 1, '%'],
      ['hoursPerDay', 'Hours per workday', 0.5, 'hrs'],
      ['daysPerMonth', 'Workdays per month', 1, 'days'],
      ['utilization', 'Billable share of crew time', 1, '%'],
      ['targetProfit', 'Target net profit', 1, '%'],
    ];
    root.innerHTML = `
      <div class="oh-layout">
        <div class="oh-inputs">
          <section class="panel">
            <div class="panel-head"><h3>How your crews work</h3></div>
            <div class="form-grid">${ops.map((x) => `
              <label class="field"><span>${u.esc(x[1])}</span><div class="input-unit"><input class="input" type="number" min="0" step="${x[2]}" data-op="${x[0]}" value="${u.esc(o[x[0]])}"><em>${x[3]}</em></div></label>`).join('')}
            </div>
            <p class="hint">Billable share is the part of paid crew time spent on jobs you can charge for. Drive time, shop days, weather, and estimates are not billable. 65–80% is typical.</p>
          </section>

          <section class="panel">
            <div class="panel-head"><h3>Business overhead</h3><span class="hint" id="oh-count"></span></div>
            <p class="hint">Everything it costs to keep the doors open, whether or not a crew is working: insurance, loans, rent, office, marketing.</p>
            <div class="table-wrap"><table class="items">
              <thead><tr><th>Expense</th><th>Category</th><th class="num">Amount</th><th>Paid</th><th class="num">Per month</th><th></th></tr></thead>
              <tbody>${o.expenses.map((e, i) => `
                <tr data-i="${i}">
                  <td><input class="input" data-f="name" value="${u.esc(e.name)}" aria-label="Expense name"></td>
                  <td><select class="input" data-f="category" aria-label="Category">${u.options(CATS, e.category)}</select></td>
                  <td class="num"><input class="input num" type="number" min="0" step="any" data-f="amount" value="${u.esc(e.amount)}" aria-label="Amount"></td>
                  <td><select class="input" data-f="frequency" aria-label="How often">${u.options(FREQ, e.frequency)}</select></td>
                  <td class="num per-month"></td>
                  <td><button class="icon-btn" data-del="${i}" aria-label="Remove expense">&times;</button></td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td colspan="4">Total overhead</td><td class="num" id="oh-total"></td><td></td></tr></tfoot>
            </table></div>
            <div class="btn-row"><button class="btn ghost" id="oh-add">Add expense</button></div>
          </section>

          <section class="panel">
            <div class="panel-head"><h3>Your equipment</h3></div>
            <p class="hint">Bill rate is what you charge per hour on time &amp; materials jobs. Operating cost is fuel, maintenance, and wear per running hour. Loan payments belong in overhead above. Rented equipment and subcontractors go in Add-ons &amp; subs.</p>
            <div class="table-wrap"><table class="items">
              <thead><tr><th>Equipment</th><th class="num">Bill rate / hr</th><th class="num">Operating cost / hr</th><th class="num">Markup</th><th></th></tr></thead>
              <tbody>${o.equipment.map((q, i) => `
                <tr data-q="${i}">
                  <td><input class="input" data-qf="name" value="${u.esc(q.name)}" aria-label="Equipment name"></td>
                  <td class="num"><input class="input num" type="number" min="0" step="any" data-qf="rate" value="${u.esc(q.rate)}" aria-label="Bill rate"></td>
                  <td class="num"><input class="input num" type="number" min="0" step="any" data-qf="cost" value="${u.esc(q.cost)}" aria-label="Operating cost"></td>
                  <td class="num markup"></td>
                  <td><button class="icon-btn" data-qdel="${i}" aria-label="Remove equipment">&times;</button></td>
                </tr>`).join('')}
              </tbody></table></div>
            <div class="btn-row"><button class="btn ghost" id="oh-addq">Add equipment</button></div>
          </section>
        </div>

        <aside class="oh-results">
          <section class="panel rate-card" id="oh-rate"></section>
          <section class="panel"><div class="panel-head"><h3>Where overhead goes</h3></div><div id="oh-cats"></div></section>
          <section class="panel"><div class="panel-head"><h3>Rate history</h3></div><div id="oh-history">${historyHTML()}</div></section>
        </aside>
      </div>`;

    const results = () => {
      const r = calc.overhead(store.state);
      const hpd = u.num(o.hoursPerDay);
      u.qsa('tr[data-i]', root).forEach((tr) => { u.qs('.per-month', tr).textContent = u.money(r.monthlyOf(o.expenses[+tr.dataset.i])); });
      u.qsa('tr[data-q]', root).forEach((tr) => { const q = o.equipment[+tr.dataset.q]; u.qs('.markup', tr).textContent = u.num(q.cost) ? u.pct(u.num(q.rate) / u.num(q.cost) - 1) : '—'; });
      u.qs('#oh-total', root).textContent = u.money(r.monthly) + '/mo';
      u.qs('#oh-count', root).textContent = o.expenses.length + ' expenses, ' + u.money(r.annual) + ' a year';
      const rows = [
        ['Per crew-hour', 1],
        ['Per person-hour', 1 / Math.max(1, u.num(o.crewSize))],
        ['Half day (' + hpd / 2 + ' hrs)', hpd / 2],
        ['Full day (' + hpd + ' hrs)', hpd],
        ['Week (5 days)', hpd * 5],
      ];
      u.qs('#oh-rate', root).innerHTML = `
        <h3>Charge at least</h3>
        <div class="rate-big">${u.money(r.recommendedRateRounded)}<small>per crew-hour on site</small></div>
        <p class="rate-note">That covers your crew's pay, your overhead, and your ${u.esc(o.targetProfit)}% profit target.</p>
        <table class="rate-table">
          <thead><tr><th></th><th>Break-even</th><th>Charge</th></tr></thead>
          <tbody>${rows.map((x) => `<tr><td>${u.esc(x[0])}</td><td>${u.money(r.breakEvenRate * x[1])}</td><td><b>${u.money(r.recommendedRateRounded * x[1])}</b></td></tr>`).join('')}</tbody>
        </table>
        <dl class="facts stacked">
          <div><dt>Overhead per billable hour</dt><dd>${u.money(r.ohPerHour)}</dd></div>
          <div><dt>Crew pay per billable hour</dt><dd>${u.money(r.breakEvenRate - r.ohPerHour)}</dd></div>
          <div><dt>Billable crew-hours a month</dt><dd>${Math.round(r.billableHours).toLocaleString()} of ${Math.round(r.paidCrewHours).toLocaleString()}</dd></div>
          <div><dt>Break-even revenue</dt><dd>${u.money(r.breakEvenRevenueMonthly)}/mo</dd></div>
          <div><dt>Revenue to hit your profit target</dt><dd>${u.money(r.targetRevenueMonthly)}/mo</dd></div>
          <div><dt>Per year</dt><dd>${u.money(r.targetRevenueMonthly * 12)}</dd></div>
        </dl>
        <p class="hint">Break-even means you cover every cost but make no profit. New estimates start at the charge rate.</p>`;
      MT.charts.hbars(u.qs('#oh-cats', root), r.byCategory, {
        fmt: (v) => u.money(v) + '/mo',
        tip: (x) => '<strong>' + u.esc(x.label) + '</strong><div class="tip-row">' + u.money(x.value) + ' a month</div><div class="tip-muted">' + (r.monthly ? u.pct(x.value / r.monthly) : '0%') + ' of overhead</div>',
      });
    };
    results();

    u.qsa('[data-op]', root).forEach((inp) => inp.addEventListener('input', () => { o[inp.dataset.op] = u.num(inp.value); results(); changed(); }));
    u.qsa('tr[data-i]', root).forEach((tr) => {
      const e = o.expenses[+tr.dataset.i];
      u.qsa('[data-f]', tr).forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
        e[inp.dataset.f] = inp.type === 'number' ? u.num(inp.value) : inp.value;
        results(); changed();
      }));
    });
    u.qsa('tr[data-q]', root).forEach((tr) => {
      const q = o.equipment[+tr.dataset.q];
      u.qsa('[data-qf]', tr).forEach((inp) => inp.addEventListener('input', () => { q[inp.dataset.qf] = inp.type === 'number' ? u.num(inp.value) : inp.value; results(); changed(); }));
    });
    u.qsa('[data-del]', root).forEach((b) => b.addEventListener('click', () => { o.expenses.splice(+b.dataset.del, 1); touched(); recordSoon(); store.save(); }));
    u.qsa('[data-qdel]', root).forEach((b) => b.addEventListener('click', () => {
      const q = o.equipment[+b.dataset.qdel];
      const used = store.state.estimates.some((e) => (e.equipment || []).some((r) => r.equipmentId === q.id));
      const go = () => { o.equipment.splice(+b.dataset.qdel, 1); touched(); store.save(); };
      if (used) ui.confirm('Remove ' + q.name + '?', 'Some saved estimates use this equipment. Their equipment cost will drop to $0.', 'Remove', go); else go();
    }));
    u.qs('#oh-add', root).addEventListener('click', () => {
      o.expenses.push({ id: u.uid('ox'), name: '', category: 'Other', amount: 0, frequency: 'monthly' });
      store.save();
      const last = u.qsa('[data-f=name]', root).pop(); if (last) last.focus();
    });
    u.qs('#oh-addq', root).addEventListener('click', () => { o.equipment.push({ id: u.uid('eq'), name: 'New equipment', rate: 0, cost: 0 }); touched(); store.save(); });
    bindHistoryNotes(root);
  }

  function bindHistoryNotes(root) {
    const host = u.qs('#oh-history', root);
    if (!host) return;
    host.addEventListener('input', (e) => {
      if (!e.target.classList.contains('rh-note')) return;
      const h = store.state.overhead.history.find((x) => x.date === e.target.dataset.date && String(x.rate) === e.target.dataset.rate);
      if (h) { h.note = e.target.value; saveSoon(); }
    });
  }

  /* ================= Price a job ================= */
  function blankJob() {
    const r = calc.overhead(store.state);
    return { crewHours: u.num(store.state.overhead.hoursPerDay) || 8, crewRate: r.recommendedRateRounded, equipment: [], addons: [], complexity: 0, disposal: 0 };
  }
  /** Turns the calculator inputs into an estimate-shaped object so prices match the Estimator exactly. */
  function jobAsEstimate(j) {
    const lib = store.state.overhead.addons || [];
    const items = j.addons.map((x) => {
      const a = x.custom || lib.find((l) => l.id === x.addonId);
      if (!a) return null;
      return { desc: a.name, qty: u.num(x.qty), unit: calc.addonUnitLabel(a.unit), price: Math.round(calc.addonPrice(a) * 100) / 100, cost: u.num(a.cost) };
    }).filter(Boolean);
    return { items, billTM: true, crewHours: j.crewHours, crewRate: j.crewRate, equipment: j.equipment.map((x) => ({ equipmentId: x.equipmentId, hours: x.hours })), disposal: j.disposal, complexity: j.complexity, discount: 0, taxRate: 0 };
  }

  function renderJob(root, outer) {
    const s = store.state;
    if (!view.job) view.job = blankJob();
    const j = view.job;
    const o = s.overhead;
    const hpd = u.num(o.hoursPerDay) || 8;
    const lib = o.addons || [];
    const eqOpts = o.equipment.map((q) => ({ value: q.id, label: q.name }));
    root.innerHTML = `
      <div class="est-layout">
        <div class="est-form">
          <section class="panel">
            <div class="panel-head"><h3>Crew time</h3></div>
            <div class="form-grid">
              <label class="field"><span>Crew hours on site</span><input class="input" type="number" min="0" step="0.5" id="pj-hours" value="${u.esc(j.crewHours)}"></label>
              <label class="field"><span>Crew rate ($ per crew-hour)</span><input class="input" type="number" min="0" step="5" id="pj-rate" value="${u.esc(j.crewRate)}"><small>Your charge rate from overhead is ${u.money(calc.overhead(s).recommendedRateRounded)}</small></label>
            </div>
            <div class="chips"><span class="chips-label">Quick set:</span>
              ${[['Half day', hpd / 2], ['Full day', hpd], ['2 days', hpd * 2], ['3 days', hpd * 3], ['1 week', hpd * 5]].map((x) => `<button class="chip ${u.num(j.crewHours) === x[1] ? 'on' : ''}" data-hours="${x[1]}">${x[0]}</button>`).join('')}
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h3>Your equipment on this job</h3></div>
            ${j.equipment.length ? `<div class="table-wrap"><table class="items pj-items"><thead><tr><th>Equipment</th><th class="num">Hours</th><th class="num hide-sm">Charge</th><th class="num hide-sm">Your cost</th><th></th></tr></thead><tbody>
              ${j.equipment.map((r, i) => { const q = o.equipment.find((x) => x.id === r.equipmentId) || { rate: 0, cost: 0 }; return `<tr data-eq="${i}">
                <td><select class="input" data-k="equipmentId" aria-label="Equipment">${u.options(eqOpts, r.equipmentId)}</select></td>
                <td class="num"><input class="input num" type="number" min="0" step="0.5" data-k="hours" value="${u.esc(r.hours)}" aria-label="Hours"></td>
                <td class="num hide-sm">${u.money(q.rate * u.num(r.hours))}</td><td class="num hide-sm">${u.money(q.cost * u.num(r.hours))}</td>
                <td><button class="icon-btn" data-del-eq="${i}" aria-label="Remove">&times;</button></td></tr>`; }).join('')}
            </tbody></table></div>` : '<p class="hint">No equipment yet.</p>'}
            <div class="btn-row"><button class="btn ghost" id="pj-addeq" ${eqOpts.length ? '' : 'disabled'}>Add equipment</button><button class="btn ghost" id="pj-alleq" ${eqOpts.length ? '' : 'disabled'}>Bucket truck + chipper for the full job</button></div>
          </section>

          <section class="panel">
            <div class="panel-head"><h3>Cranes, subs, rentals &amp; permits</h3><a href="#" class="link" id="pj-lib">Edit the list</a></div>
            ${j.addons.length ? `<div class="table-wrap"><table class="items pj-items"><thead><tr><th>Add-on</th><th class="num">Qty</th><th class="hide-sm">Unit</th><th class="num hide-sm">Your cost</th><th class="num">Charge</th><th></th></tr></thead><tbody>
              ${j.addons.map((x, i) => { const a = x.custom || lib.find((l) => l.id === x.addonId) || { name: 'Removed add-on', cost: 0, markup: 0, unit: 'each' }; return `<tr data-ad="${i}">
                <td>${u.esc(a.name)}${x.custom ? ' <span class="tag">One-off</span>' : ''}<div class="row-sub">${u.money(a.cost)} + ${u.esc(a.markup)}% markup</div></td>
                <td class="num"><input class="input num" type="number" min="0" step="0.5" data-k="qty" value="${u.esc(x.qty)}" aria-label="Quantity"></td>
                <td class="hide-sm">${u.esc(calc.addonUnitLabel(a.unit))}</td>
                <td class="num hide-sm">${u.money(u.num(a.cost) * u.num(x.qty))}</td><td class="num"><b>${u.money(calc.addonPrice(a) * u.num(x.qty))}</b></td>
                <td><button class="icon-btn" data-del-ad="${i}" aria-label="Remove">&times;</button></td></tr>`; }).join('')}
            </tbody></table></div>` : '<p class="hint">Nothing extra yet. Add a crane, climbing sub, rental, or permit if this job needs one.</p>'}
            <div class="btn-row">
              <select class="input" id="pj-addon" aria-label="Add from your list">${u.options(lib.map((a) => ({ value: a.id, label: a.name + ' (' + u.money(calc.addonPrice(a)) + '/' + calc.addonUnitLabel(a.unit) + ')' })), '', 'Add from your list')}</select>
              <button class="btn ghost" id="pj-oneoff">Add a one-off cost</button>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h3>Site conditions</h3></div>
            <div class="form-grid">
              <label class="field span-2"><span>Job difficulty</span><select class="input" id="pj-cx">${u.options(store.COMPLEXITY, j.complexity)}</select></label>
              <label class="field"><span>Disposal / dump fees ($)</span><input class="input" type="number" min="0" step="5" id="pj-disp" value="${u.esc(j.disposal)}"></label>
            </div>
          </section>
        </div>
        <aside class="est-summary panel" id="pj-sum"></aside>
      </div>`;

    const rerender = () => renderJob(root, outer);
    const summary = () => {
      const est = jobAsEstimate(j);
      const t = calc.estimate(est, s);
      const target = u.num(o.targetProfit) / 100;
      const rounded = Math.ceil(t.total / 25) * 25;
      const margin = rounded ? (rounded - t.cost) / rounded : 0;
      const mk = margin >= target ? 'good' : margin >= 0.1 ? 'warn' : 'bad';
      const row = (l, v, cls) => `<div class="sum-row ${cls || ''}"><span>${l}</span><span>${v}</span></div>`;
      const days = u.num(j.crewHours) / hpd;
      u.qs('#pj-sum', root).innerHTML = `
        <h3>Price this job at</h3>
        <div class="sum-total">${u.money(rounded)}</div>
        <p class="hint">Exact figure ${u.money(t.total, true)}, rounded up to the nearest $25.</p>
        <div class="sum-lines">
          ${row('Crew time (' + u.num(j.crewHours) + ' hrs × ' + u.money(j.crewRate) + ')', u.money(t.labor))}
          ${t.equipment ? row('Your equipment', u.money(t.equipment)) : ''}
          ${t.services ? row('Cranes, subs &amp; rentals', u.money(t.services)) : ''}
          ${t.surcharge ? row('Difficulty adjustment', u.money(t.surcharge)) : ''}
          ${t.disposal ? row('Disposal fees', u.money(t.disposal)) : ''}
        </div>
        <div class="sum-internal">
          <h4>Your numbers</h4>
          ${row('Crew cost, fully loaded', u.money(t.laborCost))}
          ${t.equipCost ? row('Equipment operating cost', u.money(t.equipCost)) : ''}
          ${t.addonCost ? row('Cranes, subs &amp; rentals', u.money(t.addonCost)) : ''}
          ${t.disposal ? row('Disposal', u.money(t.disposal)) : ''}
          ${row('Total job cost', u.money(t.cost), 'strong')}
          ${row('Profit at ' + u.money(rounded), u.money(rounded - t.cost), 'strong')}
          <div class="margin ${mk}">
            <div class="margin-head"><span class="status-dot" aria-hidden="true"></span><span>${{ good: 'Healthy margin', warn: 'Thin margin', bad: 'Losing money or close to it' }[mk]}</span><b>${u.pct(margin, 1)}</b></div>
            <small>Target ${u.pct(target)}. Break-even for this job is ${u.money(t.cost)}.</small>
          </div>
        </div>
        <dl class="facts stacked per-unit">
          <div><dt>Per crew-hour on site</dt><dd>${u.num(j.crewHours) ? u.money(rounded / u.num(j.crewHours)) : '—'}</dd></div>
          <div><dt>Per crew day</dt><dd>${days ? u.money(rounded / days) : '—'}</dd></div>
        </dl>
        <div class="sum-actions">
          <button class="btn primary" id="pj-est">Create estimate from this</button>
          <button class="btn ghost" id="pj-reset">Start over</button>
        </div>`;
      u.qs('#pj-est', root).addEventListener('click', () => {
        if (!u.num(j.crewHours) && !est.items.length) { ui.toast('Add crew hours or an add-on first.', 'err'); return; }
        MT.views.estimator.startWith(Object.assign(JSON.parse(JSON.stringify(est)), { taxRate: s.settings.taxRate || 0 }));
        MT.app.go('estimator');
        ui.toast('Estimate started. Choose the customer and save it.');
      });
      u.qs('#pj-reset', root).addEventListener('click', () => { view.job = blankJob(); rerender(); });
    };
    summary();

    u.qs('#pj-hours', root).addEventListener('input', (e) => { j.crewHours = u.num(e.target.value); u.qsa('[data-hours]', root).forEach((c) => c.classList.toggle('on', +c.dataset.hours === j.crewHours)); summary(); });
    u.qs('#pj-rate', root).addEventListener('input', (e) => { j.crewRate = u.num(e.target.value); summary(); });
    u.qsa('[data-hours]', root).forEach((c) => c.addEventListener('click', () => {
      const old = j.crewHours;
      j.crewHours = +c.dataset.hours;
      // Equipment that ran the whole job follows the new length.
      j.equipment.forEach((r) => { if (u.num(r.hours) === old) r.hours = j.crewHours; });
      rerender();
    }));
    u.qs('#pj-cx', root).addEventListener('change', (e) => { j.complexity = u.num(e.target.value); summary(); });
    u.qs('#pj-disp', root).addEventListener('input', (e) => { j.disposal = u.num(e.target.value); summary(); });
    u.qsa('tr[data-eq]', root).forEach((tr) => u.qsa('[data-k]', tr).forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      const r = j.equipment[+tr.dataset.eq];
      r[inp.dataset.k] = inp.tagName === 'SELECT' ? inp.value : u.num(inp.value);
      if (inp.tagName === 'SELECT') rerender(); else summary();
    })));
    u.qsa('[data-del-eq]', root).forEach((b) => b.addEventListener('click', () => { j.equipment.splice(+b.dataset.delEq, 1); rerender(); }));
    u.qs('#pj-addeq', root).addEventListener('click', () => { j.equipment.push({ equipmentId: o.equipment[0].id, hours: j.crewHours }); rerender(); });
    u.qs('#pj-alleq', root).addEventListener('click', () => {
      const pick = (re) => o.equipment.find((q) => re.test(q.name));
      [pick(/bucket/i), pick(/chipper/i)].filter(Boolean).forEach((q) => { if (!j.equipment.some((r) => r.equipmentId === q.id)) j.equipment.push({ equipmentId: q.id, hours: j.crewHours }); });
      rerender();
    });
    u.qsa('tr[data-ad] [data-k=qty]', root).forEach((inp) => inp.addEventListener('input', () => { j.addons[+inp.closest('tr').dataset.ad].qty = u.num(inp.value); summary(); }));
    u.qsa('[data-del-ad]', root).forEach((b) => b.addEventListener('click', () => { j.addons.splice(+b.dataset.delAd, 1); rerender(); }));
    u.qs('#pj-addon', root).addEventListener('change', (e) => {
      const a = lib.find((l) => l.id === e.target.value);
      if (!a) return;
      j.addons.push({ addonId: a.id, qty: a.unit === 'hour' ? Math.min(u.num(j.crewHours) || 1, 4) : a.unit === 'day' ? Math.max(1, Math.ceil(u.num(j.crewHours) / hpd)) : 1 });
      rerender();
    });
    u.qs('#pj-oneoff', root).addEventListener('click', () => oneOff((a, save) => {
      j.addons.push({ custom: a, qty: 1 });
      if (save) { (o.addons = o.addons || []).push(Object.assign({ id: u.uid('ad') }, a)); touched(); store.save(true); }
      rerender();
    }));
    u.qs('#pj-lib', root).addEventListener('click', (e) => { e.preventDefault(); view.mode = 'addons'; view.render(outer); });
  }

  function oneOff(done) {
    ui.modal({
      title: 'Add a one-off cost',
      size: 'sm',
      body: `<div class="form-grid">
        <label class="field span-2"><span>What is it?</span><input class="input" name="name" placeholder="e.g. Second crane for tight backyard"></label>
        <label class="field"><span>Your cost ($)</span><input class="input" type="number" min="0" step="any" name="cost"></label>
        <label class="field"><span>Markup (%)</span><input class="input" type="number" min="0" step="1" name="markup" value="20"></label>
        <label class="field"><span>Category</span><select class="input" name="category">${u.options(ADDON_CATS, 'Subcontractor')}</select></label>
        <label class="field"><span>Priced</span><select class="input" name="unit">${u.options(ADDON_UNITS, 'flat')}</select></label>
        <label class="check span-2"><input type="checkbox" name="keep"><span>Save it to my add-ons list for next time</span></label>
      </div>`,
      actions: [{ label: 'Cancel' }, { label: 'Add to job', kind: 'primary', onClick: (b) => {
        const f = u.formData(b);
        if (!f.name) { ui.toast('Name the cost so it shows on the estimate.', 'err'); return false; }
        const keep = f.keep; delete f.keep;
        done({ name: f.name, cost: u.num(f.cost), markup: u.num(f.markup), category: f.category, unit: f.unit }, keep);
      } }],
    });
  }

  /* ================= Add-ons & subs library ================= */
  function renderAddons(root) {
    const o = store.state.overhead;
    const lib = (o.addons = o.addons || []);
    root.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>Add-ons &amp; subs</h3><span class="hint">${lib.length} items</span></div>
        <p class="hint">Costs that only some jobs have: cranes, climbing subs, rentals, permits, extra dump loads. Enter what it costs you and your markup, and the customer price is worked out. These show up in Price a job and in the Estimator. Update them here when a vendor changes prices.</p>
        <div class="table-wrap"><table class="items addons-table">
          <thead><tr><th>Name</th><th>Category</th><th>Priced</th><th class="num">Your cost</th><th class="num">Markup %</th><th class="num">Customer price</th><th></th></tr></thead>
          <tbody>${lib.map((a, i) => `
            <tr data-i="${i}">
              <td><input class="input" data-f="name" value="${u.esc(a.name)}" aria-label="Name"></td>
              <td><select class="input" data-f="category" aria-label="Category">${u.options(ADDON_CATS, a.category)}</select></td>
              <td><select class="input" data-f="unit" aria-label="Priced">${u.options(ADDON_UNITS, a.unit)}</select></td>
              <td class="num"><input class="input num" type="number" min="0" step="any" data-f="cost" value="${u.esc(a.cost)}" aria-label="Your cost"></td>
              <td class="num"><input class="input num" type="number" min="0" step="1" data-f="markup" value="${u.esc(a.markup)}" aria-label="Markup percent"></td>
              <td class="num price"></td>
              <td><button class="icon-btn" data-del="${i}" aria-label="Remove">&times;</button></td>
            </tr>`).join('') || `<tr><td colspan="7">${ui.empty('No add-ons yet. Add your crane company, climbing sub, or rental yard.')}</td></tr>`}
          </tbody></table></div>
        <div class="btn-row"><button class="btn ghost" id="ad-add">Add an add-on</button></div>
      </section>`;
    const prices = () => u.qsa('tr[data-i]', root).forEach((tr) => {
      const a = lib[+tr.dataset.i];
      u.qs('.price', tr).innerHTML = '<b>' + u.money(calc.addonPrice(a), calc.addonPrice(a) % 1 !== 0) + '</b><small> /' + u.esc(calc.addonUnitLabel(a.unit)) + '</small>';
    });
    prices();
    u.qsa('tr[data-i]', root).forEach((tr) => u.qsa('[data-f]', tr).forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      lib[+tr.dataset.i][inp.dataset.f] = inp.type === 'number' ? u.num(inp.value) : inp.value;
      prices(); touched(); saveSoon();
    })));
    u.qsa('[data-del]', root).forEach((b) => b.addEventListener('click', () => { lib.splice(+b.dataset.del, 1); touched(); store.save(); }));
    u.qs('#ad-add', root).addEventListener('click', () => {
      lib.push({ id: u.uid('ad'), name: '', category: 'Subcontractor', unit: 'flat', cost: 0, markup: 20 });
      touched(); store.save();
      const last = u.qsa('[data-f=name]', root).pop(); if (last) last.focus();
    });
  }

  /* ================= Price book ================= */
  function renderPriceBook(root) {
    const s = store.state;
    const pb = s.settings.priceBook;
    root.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>Price book</h3><span class="hint">${pb.length} services</span></div>
        <p class="hint">Your standard services and prices. Pick from these in Estimates and Invoices, then adjust per job. Changes save automatically.</p>
        <div class="table-wrap"><table class="items">
          <thead><tr><th>Service</th><th>Unit</th><th class="num">Price</th><th class="num">Crew-hours at your rate</th><th></th></tr></thead>
          <tbody>${pb.map((p, i) => `<tr data-i="${i}">
            <td><input class="input" data-f="name" value="${u.esc(p.name)}" aria-label="Service"></td>
            <td><input class="input unit" data-f="unit" value="${u.esc(p.unit)}" aria-label="Unit"></td>
            <td class="num"><input class="input num" type="number" min="0" step="any" data-f="price" value="${u.esc(p.price)}" aria-label="Price"></td>
            <td class="num pb-hrs"></td>
            <td><button class="icon-btn" data-del="${i}" aria-label="Remove service">&times;</button></td></tr>`).join('')}</tbody></table></div>
        <div class="btn-row"><button class="btn ghost" id="pb-add">Add service</button></div>
        <p class="hint">"Crew-hours at your rate" shows how much crew time each price pays for at ${u.money(calc.overhead(s).recommendedRateRounded)}/crew-hour. If a job usually takes longer than that, the price is too low.</p>
      </section>`;
    const hrsCell = () => u.qsa('tr[data-i]', root).forEach((tr) => {
      const p = pb[+tr.dataset.i];
      const r = calc.overhead(s).recommendedRateRounded;
      u.qs('.pb-hrs', tr).textContent = r ? (u.num(p.price) / r).toFixed(1) + ' per ' + p.unit : '—';
    });
    hrsCell();
    u.qsa('tr[data-i]', root).forEach((tr) => u.qsa('[data-f]', tr).forEach((inp) => inp.addEventListener('input', () => {
      pb[+tr.dataset.i][inp.dataset.f] = inp.type === 'number' ? u.num(inp.value) : inp.value;
      hrsCell(); saveSoon();
    })));
    u.qsa('[data-del]', root).forEach((b) => b.addEventListener('click', () => { pb.splice(+b.dataset.del, 1); store.save(); }));
    u.qs('#pb-add', root).addEventListener('click', () => {
      pb.push({ id: u.uid('pb'), name: '', unit: 'job', price: 0 });
      store.save();
      const last = u.qsa('[data-f=name]', root).pop(); if (last) last.focus();
    });
  }

  MT.views.overhead = view;
})();
