/* Mammoth CRM — Sales pipeline (board) and sales goal */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const PAY_METHODS = ['Check', 'Card', 'Cash', 'Zelle', 'ACH', 'Venmo', 'Financing', 'Other'];
  const SEASON = [0.45, 0.5, 0.9, 1.25, 1.35, 1.2, 1.05, 1.0, 1.1, 1.2, 0.85, 0.55];

  const view = { mode: 'board', q: '', source: '', closedDays: 30 };

  function dealCard(d) {
    const today = u.todayISO();
    const overdue = store.OPEN_STAGES.includes(d.stage) && d.expectedClose && d.expectedClose < today;
    const est = d.estimateId ? store.estimate(d.estimateId) : null;
    let meta;
    if (d.stage === 'won') meta = d.scheduledDate ? 'Job ' + u.fmtShort(d.scheduledDate) : 'Won ' + u.fmtShort(d.closedAt);
    else if (d.stage === 'lost') meta = d.lostReason || 'Lost ' + u.fmtShort(d.closedAt);
    else meta = d.expectedClose ? (overdue ? 'Overdue, was due ' : 'Close by ') + u.fmtShort(d.expectedClose) : 'No close date';
    return `<article class="deal-card ${overdue ? 'overdue' : ''}" draggable="true" data-id="${d.id}" tabindex="0" aria-label="${u.esc(d.title)}">
      <div class="deal-top"><span class="deal-title">${u.esc(d.title)}</span><span class="deal-val">${u.moneyShort(d.value)}</span></div>
      <div class="deal-cust">${u.esc(store.customerName(d.customerId))}</div>
      <div class="deal-meta"><span>${u.esc(meta)}</span>${d.stage === 'won' ? (calc.balance(d) > 0 ? '<span class="tag owed">' + u.moneyShort(calc.balance(d)) + ' due</span>' : '<span class="tag paid">Paid</span>') : est ? '<span class="tag">' + u.esc(est.number) + '</span>' : ''}</div>
    </article>`;
  }

  function filtered() {
    const q = view.q.toLowerCase();
    const since = u.addDays(u.todayISO(), -view.closedDays);
    return store.state.deals.filter((d) => {
      if (view.source && d.source !== view.source) return false;
      if ((d.stage === 'won' || d.stage === 'lost') && view.closedDays && (d.closedAt || '') < since) return false;
      if (q && !(d.title + ' ' + store.customerName(d.customerId)).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderBoard(host) {
    const deals = filtered();
    host.innerHTML = `
      <div class="toolbar">
        <input type="search" class="input" id="pl-q" placeholder="Search deals or customers" value="${u.esc(view.q)}" aria-label="Search deals">
        <select class="input" id="pl-src" aria-label="Lead source">${u.options(store.SOURCES, view.source, 'All lead sources')}</select>
        <select class="input" id="pl-closed" aria-label="Closed deals shown">${u.options([{ value: 30, label: 'Closed in last 30 days' }, { value: 90, label: 'Closed in last 90 days' }, { value: 0, label: 'All closed deals' }], view.closedDays)}</select>
        <span class="spacer"></span>
        <button class="btn primary" id="pl-new">New deal</button>
      </div>
      <div class="board">${store.STAGES.map((st) => {
        const ds = deals.filter((d) => d.stage === st.id).sort((a, b) => ((a.closedAt || a.expectedClose || '') < (b.closedAt || b.expectedClose || '') ? (st.id === 'won' || st.id === 'lost' ? 1 : -1) : st.id === 'won' || st.id === 'lost' ? -1 : 1));
        return `<div class="col stage-${st.id}" data-stage="${st.id}">
          <div class="col-head"><h4>${st.name}</h4><span class="col-count">${ds.length}</span><span class="col-total">${u.money(u.sum(ds, (d) => d.value))}</span></div>
          <div class="col-body">${ds.map(dealCard).join('') || '<div class="col-empty">Drop a deal here</div>'}</div>
        </div>`;
      }).join('')}</div>`;

    const rerender = () => renderBoard(host);
    const q = u.qs('#pl-q', host);
    q.addEventListener('input', u.debounce(() => { view.q = q.value; rerender(); const n = u.qs('#pl-q', host); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    u.qs('#pl-src', host).addEventListener('change', (e) => { view.source = e.target.value; rerender(); });
    u.qs('#pl-closed', host).addEventListener('change', (e) => { view.closedDays = +e.target.value; rerender(); });
    u.qs('#pl-new', host).addEventListener('click', () => view.openDeal(null));

    u.qsa('.deal-card', host).forEach((c) => {
      c.addEventListener('click', () => view.openDeal(c.dataset.id));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter') view.openDeal(c.dataset.id); });
      c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
    });
    u.qsa('.col', host).forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drop');
        const d = store.deal(e.dataTransfer.getData('text/plain'));
        if (!d || d.stage === col.dataset.stage) return;
        moveDeal(d, col.dataset.stage);
      });
    });
  }

  function moveDeal(d, stageId) {
    if (stageId === 'lost') {
      ui.modal({
        title: 'Why was this deal lost?', size: 'sm',
        body: `<label class="field"><span>Reason</span><select class="input" name="reason">${u.options(['Price too high', 'Went with another company', 'Decided to wait', 'No response', 'Out of service area', 'Other'], '')}</select></label>`,
        actions: [{ label: 'Cancel' }, { label: 'Mark as lost', kind: 'primary', onClick: (b) => { d.lostReason = u.qs('[name=reason]', b).value; store.setStage(d, 'lost'); store.save(); ui.toast('Marked as lost'); } }],
      });
      return;
    }
    store.setStage(d, stageId);
    if (stageId === 'won' && d.estimateId) { const e = store.estimate(d.estimateId); if (e) e.status = 'accepted'; }
    store.save();
    ui.toast(stageId === 'won' ? 'Deal won. Nice work.' : 'Moved to ' + store.stage(stageId).name);
    if (stageId === 'won' && !d.scheduledDate) view.openDeal(d.id);
  }

  view.openDeal = function (id, preset) {
    const s = store.state;
    const existing = id ? store.deal(id) : null;
    const d = existing ? Object.assign({}, existing) : Object.assign({ id: u.uid('d'), title: '', customerId: '', value: '', stage: 'lead', source: '', probability: '', expectedClose: u.addDays(u.todayISO(), 14), scheduledDate: '', notes: '', estimateId: '', createdAt: u.todayISO(), closedAt: '', lostReason: '', payments: [], jobCost: '', costSource: '' }, preset || {});
    const custs = s.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name + (c.company ? ' (' + c.company + ')' : '') }));
    const est = d.estimateId ? store.estimate(d.estimateId) : null;
    const estCost = est ? calc.estimate(est, s).cost : null;
    const oh = calc.overhead(s);
    let pays = (d.payments || []).map((x) => Object.assign({}, x));
    ui.modal({
      title: existing ? 'Edit deal' : 'New deal',
      body: `<div class="form-grid">
        <label class="field span-2"><span>Job title</span><input class="input" name="title" value="${u.esc(d.title)}" placeholder="e.g. Remove dead oak near driveway" required></label>
        <label class="field"><span>Customer</span><select class="input" name="customerId">${u.options(custs, d.customerId, 'Choose a customer')}</select></label>
        <label class="field"><span>Deal value ($)</span><input class="input" type="number" min="0" step="25" name="value" value="${u.esc(d.value)}"></label>
        <label class="field"><span>Stage</span><select class="input" name="stage">${u.options(store.STAGES.map((x) => ({ value: x.id, label: x.name })), d.stage)}</select></label>
        <label class="field"><span>Win probability (%)</span><input class="input" type="number" min="0" max="100" name="probability" value="${u.esc(d.probability)}" placeholder="Stage default: ${Math.round(store.stage(d.stage).prob * 100)}"></label>
        <label class="field"><span>Lead source</span><select class="input" name="source">${u.options(store.SOURCES, d.source, 'Unknown')}</select></label>
        <label class="field"><span>Found us online through</span><select class="input" name="channel">${u.options(store.CHANNELS.map((c) => ({ value: c.id, label: c.label })), d.channel || '', 'Not recorded')}</select></label>
        <label class="field"><span>Expected close</span><input class="input" type="date" name="expectedClose" value="${u.esc(d.expectedClose)}"></label>
        <label class="field"><span>Job date</span><input class="input" type="date" name="scheduledDate" value="${u.esc(d.scheduledDate)}"></label>
        <label class="field won-only"><span>Start time</span><input class="input" type="time" name="startTime" value="${u.esc(d.startTime || '')}"></label>
        <label class="field won-only"><span>Job length (days)</span><input class="input" type="number" min="1" step="1" name="days" value="${u.esc(d.days || 1)}"></label>
        <div class="field span-2 won-only"><span>Crew on this job</span><div class="crew-pick" id="dm-crew">${s.crew.filter((c) => c.active !== false && c.role !== 'Office').map((c) => `<label class="crew-chip"><input type="checkbox" value="${c.id}" ${(d.crewIds || []).includes(c.id) ? 'checked' : ''}><span style="--c:${u.esc(c.color || '#888')}">${u.esc(c.name)}</span></label>`).join('') || '<span class="hint">Add your crew in Settings to assign people to jobs.</span>'}</div></div>
        <label class="field lost-only"><span>Lost reason</span><input class="input" name="lostReason" value="${u.esc(d.lostReason)}"></label>
        <label class="field span-2"><span>Notes</span><textarea class="input" rows="3" name="notes">${u.esc(d.notes)}</textarea></label>
      </div>
      ${est ? `<p class="hint">Linked estimate: <a href="#" data-open-est="${est.id}">${u.esc(est.number)}</a>, ${u.money(calc.estimate(est, s).total)}, ${u.esc(est.status)}</p>` : ''}
      <section class="money-box won-only">
        <h4>Job cost &amp; profit</h4>
        <div class="form-grid">
          <label class="field"><span>Job cost ($)</span><input class="input" type="number" min="0" step="1" name="jobCost" value="${u.esc(d.jobCost == null ? '' : d.jobCost)}" placeholder="${estCost != null ? 'From estimate: ' + Math.round(estCost) : 'Not entered'}"><small>Crew labor, equipment, dump fees, and subs for this job.</small></label>
          <div class="field"><span>Work it out from crew hours</span><div class="input-with-btn"><input class="input" type="number" min="0" step="0.5" id="dm-hours" placeholder="Crew hours" aria-label="Crew hours"><button class="btn ghost sm" type="button" id="dm-hours-go">Use</button></div><small>Hours × your break-even rate of ${u.money(oh.breakEvenRate)}/crew-hr</small></div>
        </div>
        <div class="profit-line" id="dm-profit"></div>
        <h4>Payments</h4>
        <div id="dm-pays"></div>
        <div class="pay-add">
          <label class="field"><span>Amount ($)</span><input class="input" type="number" min="0" step="0.01" id="pay-amt"></label>
          <label class="field"><span>Date</span><input class="input" type="date" id="pay-date" value="${u.todayISO()}"></label>
          <label class="field"><span>Method</span><select class="input" id="pay-method">${u.options(PAY_METHODS, 'Check')}</select></label>
          <button class="btn ghost" type="button" id="pay-add">Record payment</button>
          <button class="btn ghost" type="button" id="pay-full">Paid in full</button>
        </div>
      </section>`,
      onMount(b, close) {
        const stageSel = u.qs('[name=stage]', b);
        const sync = () => {
          u.qs('.lost-only', b).hidden = stageSel.value !== 'lost';
          u.qsa('.won-only', b).forEach((x) => { x.hidden = stageSel.value !== 'won'; });
          u.qs('[name=probability]', b).placeholder = 'Stage default: ' + Math.round(store.stage(stageSel.value).prob * 100);
        };
        stageSel.addEventListener('change', sync); sync();
        // Payments and profit
        const valueIn = u.qs('[name=value]', b), costIn = u.qs('[name=jobCost]', b);
        const renderMoney = () => {
          const value = u.num(valueIn.value);
          const paid = u.sum(pays, (x) => x.amount);
          const bal = Math.max(0, value - paid);
          u.qs('#dm-pays', b).innerHTML = (pays.length ? '<ul class="pay-list">' + pays.slice().sort((x, y) => (x.date < y.date ? -1 : 1)).map((x) =>
            `<li><span>${u.fmtDate(x.date)}</span><span>${u.esc(x.method)}</span><b>${u.money(x.amount, true)}</b><button class="icon-btn" type="button" data-del-pay="${x.id}" aria-label="Remove payment">&times;</button></li>`).join('') + '</ul>' : '<p class="hint">No payments recorded.</p>') +
            `<div class="pay-sum"><span>Paid ${u.money(paid, true)} of ${u.money(value, true)}</span>${bal > 0 ? '<b class="owed">' + u.money(bal, true) + ' owed</b>' : value ? '<b class="paid">Paid in full</b>' : ''}</div>`;
          u.qs('#pay-amt', b).placeholder = bal ? bal.toFixed(2) : '';
          u.qsa('[data-del-pay]', b).forEach((x) => x.addEventListener('click', () => { pays = pays.filter((y) => y.id !== x.dataset.delPay); renderMoney(); }));
          const cost = costIn.value !== '' ? u.num(costIn.value) : estCost;
          u.qs('#dm-profit', b).innerHTML = cost == null ? '<span class="hint">Add a job cost to see this job\'s profit.</span>'
            : `<span>Profit <b class="${value - cost < 0 ? 'neg' : ''}">${u.money(value - cost)}</b></span><span>Margin <b>${value ? u.pct((value - cost) / value, 1) : '—'}</b></span>${costIn.value === '' ? '<span class="hint">Using the estimate\'s projected cost</span>' : ''}`;
        };
        const addPay = (amount) => {
          const date = u.qs('#pay-date', b).value || u.todayISO();
          if (!(amount > 0)) { ui.toast('Enter the payment amount.', 'err'); return; }
          const openInv = existing ? store.invoicesFor(existing.id).find((x) => calc.invoiceBalance(x) > 0) || store.invoicesFor(existing.id)[0] : null;
          pays.push({ id: u.uid('pay'), amount: Math.round(amount * 100) / 100, date, method: u.qs('#pay-method', b).value, invoiceId: openInv ? openInv.id : '' });
          u.qs('#pay-amt', b).value = '';
          renderMoney();
        };
        u.qs('#pay-add', b).addEventListener('click', () => addPay(u.num(u.qs('#pay-amt', b).value)));
        u.qs('#pay-full', b).addEventListener('click', () => addPay(Math.max(0, u.num(valueIn.value) - u.sum(pays, (x) => x.amount))));
        u.qs('#dm-hours-go', b).addEventListener('click', () => {
          const h = u.num(u.qs('#dm-hours', b).value);
          if (!h) { ui.toast('Enter the crew hours first.', 'err'); return; }
          costIn.value = Math.round(h * oh.breakEvenRate);
          renderMoney();
        });
        [valueIn, costIn].forEach((x) => x.addEventListener('input', renderMoney));
        renderMoney();
        const link = u.qs('[data-open-est]', b);
        if (link) link.addEventListener('click', (e) => { e.preventDefault(); close(); MT.app.go('estimator', { id: link.dataset.openEst }); });
      },
      actions: [
        existing ? { label: 'Delete', kind: 'danger-ghost', left: true, onClick: () => { ui.confirm('Delete deal?', 'This removes "' + d.title + '" permanently.', 'Delete deal', () => { store.remove('deals', d.id); store.save(); ui.toast('Deal deleted'); }); } } : null,
        existing ? { label: 'Job photos', kind: 'ghost', onClick: () => MT.views.jobcam.openFolderForDeal(d.id) } : null,
        existing && existing.stage === 'won' ? { label: store.invoicesFor(existing.id).length ? 'Open invoice' : 'Create invoice', kind: 'ghost', onClick: (b) => { if (!save(b)) return false; const inv = store.invoicesFor(existing.id)[0]; if (inv) MT.app.go('invoices', { id: inv.id }); else MT.app.go('invoices', { dealId: existing.id }); } } : null,
        existing && !est ? { label: 'Create estimate', kind: 'ghost', onClick: (b) => { if (!save(b)) return false; MT.app.go('estimator', { dealId: d.id }); } } : null,
        { label: 'Cancel', kind: 'ghost' },
        { label: existing ? 'Save deal' : 'Add deal', kind: 'primary', onClick: (b) => save(b) },
      ].filter(Boolean),
    });

    function save(b) {
      const f = u.formData(b);
      if (!f.title) { ui.toast('Add a job title for this deal.', 'err'); return false; }
      if (!f.customerId) { ui.toast('Choose a customer for this deal.', 'err'); return false; }
      const target = existing || d;
      const newStage = f.stage;
      const prevCost = target.jobCost == null ? '' : target.jobCost;
      const before = (target.payments || []).map((x) => x.id);
      Object.assign(target, f, { stage: target.stage, value: u.num(f.value), probability: f.probability === '' ? '' : u.num(f.probability), payments: pays, days: Math.max(1, u.num(f.days) || 1), crewIds: u.qsa('#dm-crew input:checked', b).map((x) => x.value), expenses: target.expenses || [] });
      if (String(f.jobCost) !== String(prevCost)) target.costSource = f.jobCost === '' ? '' : 'actual';
      const added = pays.filter((x) => !before.includes(x.id));
      if (added.length) store.log('payment', 'Received ' + u.money(u.sum(added, (x) => x.amount)) + ' from ' + store.customerName(f.customerId) + ' for "' + f.title + '"', { customerId: f.customerId, dealId: target.id });
      if (!existing) {
        target.stage = newStage;
        if (newStage === 'won' || newStage === 'lost') target.closedAt = u.todayISO();
        store.state.deals.unshift(target);
        store.log('lead', 'New deal for ' + store.customerName(target.customerId) + ': ' + target.title, { customerId: target.customerId, dealId: target.id });
      } else if (newStage !== existing.stage) {
        store.setStage(target, newStage);
      }
      store.save();
      ui.toast(existing ? 'Deal saved' : 'Deal added');
      return true;
    }
  };

  function renderGoal(host) {
    const s = store.state;
    const g = calc.goal(s);
    const ahead = g.paceDelta >= 0;
    const bySource = {};
    calc.wonInYear(s, g.year).forEach((d) => { bySource[d.source || 'Unknown'] = (bySource[d.source || 'Unknown'] || 0) + u.num(d.value); });
    host.innerHTML = `
      <div class="grid-goal">
        <section class="panel goal-big">
          <div id="goal-rings"></div>
          <div class="goal-copy">
            <h2 class="display">${u.money(g.ytd)} <span class="of">booked in ${g.year}</span></h2>
            <p class="goal-line ${ahead ? 'good' : 'warn'}"><span class="status-dot" aria-hidden="true"></span>${ahead ? u.money(g.paceDelta) + ' ahead of pace' : u.money(-g.paceDelta) + ' behind pace'}</p>
            <dl class="facts">
              <div><dt>Annual goal</dt><dd>${u.money(g.annual)}</dd></div>
              <div><dt>Should have by today</dt><dd>${u.money(g.paceTarget)}</dd></div>
              <div><dt>Still to book</dt><dd>${u.money(g.remaining)}</dd></div>
              <div><dt>Needed per month</dt><dd>${u.money(g.neededPerMonth)}</dd></div>
              <div><dt>Weighted pipeline</dt><dd>${u.money(g.forecast - g.ytd)}</dd></div>
              <div><dt>Year-end forecast</dt><dd>${u.money(g.forecast)}</dd></div>
            </dl>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Set your goal</h3></div>
          <div class="form-grid">
            <label class="field"><span>Year</span><input class="input" type="number" id="g-year" value="${g.year}"></label>
            <label class="field"><span>Annual revenue goal ($)</span><input class="input" type="number" step="1000" min="0" id="g-annual" value="${Math.round(g.annual)}"></label>
          </div>
          <div class="btn-row">
            <button class="btn ghost" id="g-season">Split by season</button>
            <button class="btn ghost" id="g-even">Split evenly</button>
          </div>
          <p class="hint">Season split puts more of the goal in spring and fall, when tree work peaks. You can fine-tune any month below.</p>
          <div class="month-grid">${g.targets.map((t, i) => `
            <label class="field"><span>${u.MONTHS[i]}</span><input class="input" type="number" min="0" step="100" data-m="${i}" value="${Math.round(t)}"></label>`).join('')}
          </div>
          <div class="btn-row end"><span class="hint" id="g-sum"></span><button class="btn primary" id="g-save">Save goal</button></div>
        </section>
      </div>
      <div class="grid-2-1">
        <section class="panel">
          <div class="panel-head"><h3>Revenue vs. target</h3><div class="legend"><span><i class="sw bar"></i>Booked revenue</span><span><i class="sw target"></i>Monthly target</span></div></div>
          <div id="goal-months"></div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Won revenue by lead source</h3></div>
          <div id="goal-src"></div>
        </section>
      </div>`;

    MT.charts.rings(u.qs('#goal-rings', host), g);
    MT.charts.monthBars(u.qs('#goal-months', host), { actual: g.actual, target: g.targets, curMonth: g.curMonth });
    const src = Object.keys(bySource).map((k) => ({ label: k, value: bySource[k] })).sort((a, b) => b.value - a.value);
    if (src.length) MT.charts.hbars(u.qs('#goal-src', host), src);
    else u.qs('#goal-src', host).innerHTML = ui.empty('Won deals will be broken down by lead source here.');

    const inputs = u.qsa('[data-m]', host);
    const sumEl = u.qs('#g-sum', host);
    const updateSum = () => { sumEl.textContent = 'Months add up to ' + u.money(u.sum(inputs, (i) => i.value)); };
    inputs.forEach((i) => i.addEventListener('input', updateSum));
    updateSum();
    const spread = (weights) => {
      const annual = u.num(u.qs('#g-annual', host).value);
      const ws = u.sum(weights);
      let vals = weights.map((w) => u.round((annual * w) / ws, 100));
      vals[11] += annual - u.sum(vals);
      inputs.forEach((i, k) => { i.value = vals[k]; });
      updateSum();
    };
    u.qs('#g-season', host).addEventListener('click', () => spread(SEASON));
    u.qs('#g-even', host).addEventListener('click', () => spread(new Array(12).fill(1)));
    u.qs('#g-save', host).addEventListener('click', () => {
      const monthly = inputs.map((i) => u.num(i.value));
      s.goals = { year: u.num(u.qs('#g-year', host).value) || new Date().getFullYear(), monthly, annual: u.sum(monthly) };
      store.save();
      ui.toast('Goal saved');
    });
  }

  view.title = 'Leads';
  view.renderGoal = renderGoal;
  view.render = function (root) {
    // The sales goal now lives in the Sales hub.
    if (MT.app.params.mode === 'goal') { MT.app.go('dashboard', { mode: 'goal' }); return; }
    root.innerHTML = '<div id="pl-host" class="stack"></div>';
    renderBoard(u.qs('#pl-host', root));
  };

  MT.views.pipeline = view;
})();
