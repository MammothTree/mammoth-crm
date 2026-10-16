/* Mammoth CRM — Estimator */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;

  const view = { title: 'Estimates', mode: 'build', draft: null, isNew: true, filter: '', q: '' };
  const STATUS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined' };
  const STATUS_KIND = { draft: '', sent: 'info', accepted: 'good', declined: 'bad' };

  function blank(preset) {
    const s = store.state;
    const oh = calc.overhead(s);
    return Object.assign({
      id: u.uid('e'), number: '', customerId: '', dealId: '', title: '', jobAddress: '', date: u.todayISO(),
      validDays: s.settings.estimateValidDays || 30, status: 'draft', items: [], billTM: false,
      crewHours: 4, crewRate: oh.recommendedRateRounded, equipment: [], disposal: 0, complexity: 0, discount: 0,
      taxRate: s.settings.taxRate || 0, notes: '', sentAt: '',
    }, preset || {});
  }

  function load(params) {
    if (params.id) {
      const e = store.estimate(params.id);
      if (e) {
        view.draft = JSON.parse(JSON.stringify(e));
        if (!u.num(view.draft.crewRate)) view.draft.crewRate = calc.overhead(store.state).recommendedRateRounded;
        view.isNew = false;
        view.mode = 'build';
      }
    } else if (params.dealId) {
      const d = store.deal(params.dealId);
      const c = d && store.customer(d.customerId);
      view.draft = blank({ dealId: d ? d.id : '', customerId: d ? d.customerId : '', title: d ? d.title : '', jobAddress: c ? c.address + ', ' + c.city : '' });
      view.isNew = true;
      view.mode = 'build';
    } else if (params.customerId) {
      const c = store.customer(params.customerId);
      view.draft = blank({ customerId: c ? c.id : '', jobAddress: c ? c.address + ', ' + c.city : '' });
      view.isNew = true;
      view.mode = 'build';
    }
  }

  view.render = function (root) {
    const p = MT.app.params;
    if (p.id || p.dealId || p.customerId) { load(p); MT.app.params = {}; }
    if (p.mode) { view.mode = p.mode; MT.app.params = {}; }
    if (!view.draft) view.draft = blank();
    const n = store.state.estimates.length;
    root.innerHTML = `<div class="seg" role="tablist">
        <button role="tab" data-mode="build" class="${view.mode === 'build' ? 'on' : ''}" aria-selected="${view.mode === 'build'}">${view.isNew ? 'New estimate' : 'Edit ' + u.esc(view.draft.number)}</button>
        <button role="tab" data-mode="list" class="${view.mode === 'list' ? 'on' : ''}" aria-selected="${view.mode === 'list'}">Saved estimates (${n})</button>
      </div><div id="est-host"></div>`;
    u.qsa('.seg button', root).forEach((b) => b.addEventListener('click', () => { view.mode = b.dataset.mode; view.render(root); }));
    const host = u.qs('#est-host', root);
    if (view.mode === 'list') renderList(host, root); else renderBuilder(host, root);
  };

  /* ================= Builder ================= */
  function renderBuilder(host, root) {
    const s = store.state;
    const e = view.draft;
    const oh = calc.overhead(s);
    const custs = s.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name + (c.company ? ' (' + c.company + ')' : '') }));
    const custDeals = s.deals.filter((d) => d.customerId === e.customerId && (store.OPEN_STAGES.includes(d.stage) || d.id === e.dealId)).map((d) => ({ value: d.id, label: d.title + ' (' + store.stage(d.stage).name + ')' }));
    const eqOpts = s.overhead.equipment.map((q) => ({ value: q.id, label: q.name + ' (' + u.money(q.rate) + '/hr)' }));

    host.innerHTML = `
    <div class="est-layout">
      <div class="est-form">
        <section class="panel">
          <div class="panel-head"><h3>Job details</h3>${!view.isNew ? ui.badge(STATUS[e.status], STATUS_KIND[e.status]) : ''}</div>
          <div class="form-grid">
            <label class="field"><span>Customer</span>
              <div class="input-with-btn"><select class="input" data-k="customerId">${u.options(custs, e.customerId, 'Choose a customer')}</select><button class="btn ghost sm" id="est-newcust" type="button">New</button></div></label>
            <label class="field"><span>Pipeline deal</span><select class="input" data-k="dealId" ${e.customerId ? '' : 'disabled'}>${u.options(custDeals, e.dealId, 'Create a new deal on save')}</select></label>
            <label class="field span-2"><span>Job title</span><input class="input" data-k="title" value="${u.esc(e.title)}" placeholder="e.g. Remove two oaks and grind stumps"></label>
            <label class="field span-2"><span>Job address</span><input class="input" data-k="jobAddress" value="${u.esc(e.jobAddress)}"></label>
            <label class="field"><span>Estimate date</span><input class="input" type="date" data-k="date" value="${u.esc(e.date)}"></label>
            <label class="field"><span>Valid for (days)</span><input class="input" type="number" min="1" data-k="validDays" value="${u.esc(e.validDays)}"></label>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>Work to be done</h3></div>
          <div class="table-wrap"><table class="items">
            <thead><tr><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Price</th><th class="num">Line total</th><th></th></tr></thead>
            <tbody>${e.items.map((it, i) => `
              <tr data-i="${i}">
                <td><input class="input" data-item="desc" value="${u.esc(it.desc)}" aria-label="Description"></td>
                <td class="num"><input class="input num" type="number" min="0" step="any" data-item="qty" value="${u.esc(it.qty)}" aria-label="Quantity"></td>
                <td><input class="input unit" data-item="unit" value="${u.esc(it.unit)}" aria-label="Unit"></td>
                <td class="num"><input class="input num" type="number" min="0" step="any" data-item="price" value="${u.esc(it.price)}" aria-label="Unit price"></td>
                <td class="num line-total"><span>${u.money(u.num(it.qty) * u.num(it.price), true)}</span>${it.cost ? `<small class="line-cost">Your cost ${u.money(u.num(it.qty) * u.num(it.cost))}</small>` : ''}</td>
                <td><button class="icon-btn" data-del-item="${i}" aria-label="Remove line">&times;</button></td>
              </tr>`).join('') || '<tr><td colspan="6" class="muted center">Add work from your price book or type a custom line.</td></tr>'}
            </tbody></table></div>
          <div class="btn-row">
            <select class="input" id="est-pb" aria-label="Add from price book">${u.options(s.settings.priceBook.map((p) => ({ value: p.id, label: p.name + ', ' + u.money(p.price, p.price % 1 !== 0) + '/' + p.unit })), '', 'Add from price book')}</select>
            <select class="input" id="est-addon" aria-label="Add a crane, subcontractor, or rental">${u.options((s.overhead.addons || []).map((a) => ({ value: a.id, label: a.name + ', ' + u.money(calc.addonPrice(a)) + '/' + calc.addonUnitLabel(a.unit) })), '', 'Add a crane, sub, or rental')}</select>
            <button class="btn ghost" id="est-addline" type="button">Add custom line</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>Crew time & equipment</h3></div>
          <div class="form-grid">
            <label class="field"><span>Crew hours on site</span><input class="input" type="number" min="0" step="0.5" data-k="crewHours" value="${u.esc(e.crewHours)}"></label>
            <label class="field"><span>Crew rate ($ per crew-hour)</span><input class="input" type="number" min="0" step="5" data-k="crewRate" value="${u.esc(e.crewRate)}"><small>Recommended from overhead: ${u.money(oh.recommendedRateRounded)}</small></label>
            <label class="check span-2"><input type="checkbox" data-k="billTM" ${e.billTM ? 'checked' : ''}><span>Bill crew time and equipment to the customer (time &amp; materials). Leave off for flat-priced jobs; the hours still drive your cost and margin.</span></label>
          </div>
          <div class="table-wrap"><table class="items">
            <thead><tr><th>Equipment</th><th class="num">Hours</th><th class="num">Bill rate</th><th class="num">Your cost</th><th></th></tr></thead>
            <tbody>${e.equipment.map((r, i) => {
              const q = s.overhead.equipment.find((x) => x.id === r.equipmentId) || { rate: 0, cost: 0 };
              return `<tr data-eq="${i}">
                <td><select class="input" data-eqk="equipmentId" aria-label="Equipment">${u.options(eqOpts, r.equipmentId)}</select></td>
                <td class="num"><input class="input num" type="number" min="0" step="0.5" data-eqk="hours" value="${u.esc(r.hours)}" aria-label="Hours"></td>
                <td class="num">${u.money(q.rate)}/hr</td><td class="num">${u.money(q.cost)}/hr</td>
                <td><button class="icon-btn" data-del-eq="${i}" aria-label="Remove equipment">&times;</button></td></tr>`;
            }).join('') || '<tr><td colspan="5" class="muted center">No equipment added.</td></tr>'}</tbody></table></div>
          <div class="btn-row"><button class="btn ghost" id="est-addeq" type="button" ${eqOpts.length ? '' : 'disabled'}>Add equipment</button></div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>Adjustments</h3></div>
          <div class="form-grid">
            <label class="field span-2"><span>Job difficulty</span><select class="input" data-k="complexity">${u.options(store.COMPLEXITY, e.complexity)}</select></label>
            <label class="field"><span>Disposal / dump fees ($)</span><input class="input" type="number" min="0" step="5" data-k="disposal" value="${u.esc(e.disposal)}"></label>
            <label class="field"><span>Discount ($)</span><input class="input" type="number" min="0" step="5" data-k="discount" value="${u.esc(e.discount)}"></label>
            <label class="field"><span>Sales tax (%)</span><input class="input" type="number" min="0" step="0.01" data-k="taxRate" value="${u.esc(e.taxRate)}"></label>
            <label class="field span-2"><span>Notes for the customer</span><textarea class="input" rows="3" data-k="notes">${u.esc(e.notes)}</textarea></label>
          </div>
        </section>
      </div>

      <aside class="est-summary panel" id="est-summary"></aside>
    </div>`;

    renderSummary(host);

    // Field bindings
    u.qsa('[data-k]', host).forEach((inp) => {
      const k = inp.dataset.k;
      const evt = inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input';
      inp.addEventListener(evt, () => {
        if (inp.type === 'checkbox') e[k] = inp.checked;
        else if (inp.type === 'number' || k === 'complexity') e[k] = u.num(inp.value);
        else e[k] = inp.value;
        if (k === 'customerId') {
          const c = store.customer(e.customerId);
          if (c) e.jobAddress = c.address + ', ' + c.city;
          e.dealId = '';
          renderBuilder(host, root);
          return;
        }
        if (k === 'dealId' && e.dealId && !e.title) { const d = store.deal(e.dealId); if (d) e.title = d.title; renderBuilder(host, root); return; }
        renderSummary(host);
      });
    });
    u.qsa('tr[data-i]', host).forEach((tr) => {
      const it = e.items[+tr.dataset.i];
      u.qsa('[data-item]', tr).forEach((inp) => inp.addEventListener('input', () => {
        it[inp.dataset.item] = inp.type === 'number' ? u.num(inp.value) : inp.value;
        u.qs('.line-total span', tr).textContent = u.money(u.num(it.qty) * u.num(it.price), true);
        const lc = u.qs('.line-cost', tr);
        if (lc) lc.textContent = 'Your cost ' + u.money(u.num(it.qty) * u.num(it.cost));
        renderSummary(host);
      }));
    });
    u.qsa('tr[data-eq]', host).forEach((tr) => {
      const r = e.equipment[+tr.dataset.eq];
      u.qsa('[data-eqk]', tr).forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
        r[inp.dataset.eqk] = inp.type === 'number' ? u.num(inp.value) : inp.value;
        if (inp.tagName === 'SELECT') renderBuilder(host, root); else renderSummary(host);
      }));
    });
    u.qsa('[data-del-item]', host).forEach((b) => b.addEventListener('click', () => { e.items.splice(+b.dataset.delItem, 1); renderBuilder(host, root); }));
    u.qsa('[data-del-eq]', host).forEach((b) => b.addEventListener('click', () => { e.equipment.splice(+b.dataset.delEq, 1); renderBuilder(host, root); }));
    u.qs('#est-pb', host).addEventListener('change', (ev) => {
      const p = s.settings.priceBook.find((x) => x.id === ev.target.value);
      if (!p) return;
      e.items.push({ desc: p.name, qty: 1, unit: p.unit, price: p.price });
      renderBuilder(host, root);
    });
    u.qs('#est-addon', host).addEventListener('change', (ev) => {
      const a = (s.overhead.addons || []).find((x) => x.id === ev.target.value);
      if (!a) return;
      e.items.push({ desc: a.name, qty: a.unit === 'hour' ? u.num(e.crewHours) || 1 : 1, unit: calc.addonUnitLabel(a.unit), price: Math.round(calc.addonPrice(a) * 100) / 100, cost: u.num(a.cost) });
      renderBuilder(host, root);
    });
    u.qs('#est-addline', host).addEventListener('click', () => {
      e.items.push({ desc: '', qty: 1, unit: 'job', price: 0 });
      renderBuilder(host, root);
      const last = u.qsa('[data-item=desc]', host).pop();
      if (last) last.focus();
    });
    u.qs('#est-addeq', host).addEventListener('click', () => {
      e.equipment.push({ equipmentId: s.overhead.equipment[0].id, hours: u.num(e.crewHours) || 1 });
      renderBuilder(host, root);
    });
    u.qs('#est-newcust', host).addEventListener('click', () => MT.views.customers.edit(null, (c) => {
      e.customerId = c.id;
      e.jobAddress = c.address + (c.city ? ', ' + c.city : '');
      e.dealId = '';
      renderBuilder(host, root);
    }));
  }

  function renderSummary(host) {
    const s = store.state;
    const e = view.draft;
    const t = calc.estimate(e, s);
    const oh = calc.overhead(s);
    const target = u.num(s.overhead.targetProfit) / 100;
    const mk = t.margin >= target ? 'good' : t.margin >= 0.1 ? 'warn' : 'bad';
    const mkText = { good: 'Healthy margin', warn: 'Thin margin', bad: 'Losing money or close to it' }[mk];
    const box = u.qs('#est-summary', host);
    const row = (l, v, cls) => `<div class="sum-row ${cls || ''}"><span>${l}</span><span>${v}</span></div>`;
    box.innerHTML = `
      <h3>Estimate total</h3>
      <div class="sum-total">${u.money(t.total, true)}</div>
      <div class="sum-lines">
        ${row('Work items', u.money(t.services, true))}
        ${e.billTM ? row('Crew time (' + u.num(e.crewHours) + ' hrs)', u.money(t.labor, true)) + row('Equipment', u.money(t.equipment, true)) : ''}
        ${t.surcharge ? row('Difficulty adjustment', u.money(t.surcharge, true)) : ''}
        ${t.disposal ? row('Disposal fees', u.money(t.disposal, true)) : ''}
        ${t.discount ? row('Discount', '−' + u.money(t.discount, true)) : ''}
        ${t.tax ? row('Sales tax', u.money(t.tax, true)) : ''}
      </div>
      <div class="sum-internal">
        <h4>Your numbers <small>(not shown to the customer)</small></h4>
        ${row('Crew cost, fully loaded', u.money(t.laborCost))}
        ${row('Equipment operating cost', u.money(t.equipCost))}
        ${t.disposal ? row('Disposal', u.money(t.disposal)) : ''}
        ${t.addonCost ? row('Cranes, subs &amp; rentals', u.money(t.addonCost)) : ''}
        ${row('Total job cost', u.money(t.cost), 'strong')}
        ${row('Profit', u.money(t.profit), 'strong')}
        <div class="margin ${mk}">
          <div class="margin-head"><span class="status-dot" aria-hidden="true"></span><span>${mkText}</span><b>${u.pct(t.margin, 1)}</b></div>
          <div class="meter"><span style="width:${Math.max(0, Math.min(100, t.margin * 100 * 2))}%"></span><i style="left:${Math.min(100, target * 200)}%" title="Target ${u.pct(target)}"></i></div>
          <small>Target margin ${u.pct(target)}. You are earning ${u.money(t.effectiveRate)} per crew-hour; break-even is ${u.money(oh.breakEvenRate)}.</small>
        </div>
      </div>
      <div class="sum-actions">
        <button class="btn primary" data-act="save">${view.isNew ? 'Save estimate' : 'Save changes'}</button>
        ${e.status === 'draft' ? '<button class="btn" data-act="send">Mark as sent</button>' : ''}
        ${e.status === 'sent' ? '<button class="btn good" data-act="accept">Customer accepted</button><button class="btn ghost" data-act="decline">Customer declined</button>' : ''}
        <button class="btn ghost" data-act="print">Print or save PDF</button>
        ${!view.isNew ? '<button class="btn ghost" data-act="dup">Duplicate</button>' : ''}
        <button class="btn ghost" data-act="new">Start a new estimate</button>
        ${!view.isNew ? '<button class="btn danger-ghost" data-act="del">Delete estimate</button>' : ''}
      </div>`;
    u.qsa('[data-act]', box).forEach((b) => b.addEventListener('click', () => action(b.dataset.act, host)));
  }

  function validate(e) {
    if (!e.customerId) { ui.toast('Choose a customer before saving.', 'err'); return false; }
    if (!e.items.length && !e.billTM) { ui.toast('Add at least one work item, or turn on time & materials billing.', 'err'); return false; }
    return true;
  }

  function commit(statusChange) {
    const s = store.state;
    const e = view.draft;
    if (!validate(e)) return false;
    if (!e.title) e.title = e.items[0] ? e.items[0].desc : 'Tree work';
    if (!e.number) { e.number = 'EST-' + s.nextEstimateNo; s.nextEstimateNo++; }
    if (statusChange) e.status = statusChange;
    if (statusChange === 'sent') e.sentAt = u.todayISO();
    const t = calc.estimate(e, s);
    // Keep the pipeline in step with the estimate.
    let d = e.dealId ? store.deal(e.dealId) : null;
    if (!d) {
      d = { id: u.uid('d'), customerId: e.customerId, title: e.title, value: 0, stage: 'contacted', source: (store.customer(e.customerId) || {}).source || '', probability: '', createdAt: u.todayISO(), expectedClose: u.addDays(u.todayISO(), 14), scheduledDate: '', closedAt: '', notes: '', estimateId: e.id, lostReason: '' };
      s.deals.unshift(d);
      e.dealId = d.id;
      store.log('lead', 'New deal from estimate ' + e.number + ': ' + e.title, { customerId: e.customerId, dealId: d.id });
    }
    d.value = Math.round(t.taxable);
    d.estimateId = e.id;
    if (e.status === 'sent' && (d.stage === 'lead' || d.stage === 'contacted')) store.setStage(d, 'estimate');
    if (e.status === 'accepted' && d.stage !== 'won') store.setStage(d, 'won');
    if (e.status === 'accepted' && (d.jobCost === '' || d.jobCost == null)) { d.jobCost = Math.round(t.cost); d.costSource = 'estimate'; }
    if (e.status === 'declined' && d.stage !== 'lost') { d.lostReason = 'Declined estimate'; store.setStage(d, 'lost'); }
    if (statusChange) store.log(statusChange === 'accepted' ? 'won' : statusChange === 'declined' ? 'lost' : 'estimate', 'Estimate ' + e.number + ' ' + STATUS[e.status].toLowerCase() + ' for ' + store.customerName(e.customerId) + ' (' + u.money(t.total) + ')', { customerId: e.customerId, dealId: d.id });
    store.upsert('estimates', JSON.parse(JSON.stringify(e)));
    view.isNew = false;
    store.save();
    return true;
  }

  function action(act, host) {
    const e = view.draft;
    if (act === 'save') { if (commit()) ui.toast('Estimate ' + e.number + ' saved'); }
    else if (act === 'send') { if (commit('sent')) ui.toast('Estimate ' + e.number + ' marked as sent'); }
    else if (act === 'accept') {
      if (commit('accepted')) {
        ui.toast('Accepted. The deal moved to Won.');
        MT.views.pipeline.openDeal(e.dealId);
      }
    }
    else if (act === 'decline') { if (commit('declined')) ui.toast('Estimate marked as declined'); }
    else if (act === 'print') { if (validate(e)) printEstimate(e); }
    else if (act === 'dup') {
      view.draft = Object.assign(JSON.parse(JSON.stringify(e)), { id: u.uid('e'), number: '', status: 'draft', sentAt: '', date: u.todayISO(), dealId: '' });
      view.isNew = true;
      MT.app.render();
      ui.toast('Copied into a new draft estimate');
    }
    else if (act === 'new') { view.draft = blank(); view.isNew = true; MT.app.render(); }
    else if (act === 'del') {
      ui.confirm('Delete estimate ' + e.number + '?', 'The estimate is removed permanently. Its pipeline deal is kept.', 'Delete estimate', () => {
        store.remove('estimates', e.id);
        const d = e.dealId && store.deal(e.dealId);
        if (d && d.estimateId === e.id) d.estimateId = '';
        view.draft = blank();
        view.isNew = true;
        view.mode = 'list';
        store.save();
        ui.toast('Estimate deleted');
      });
    }
  }

  function printEstimate(e) {
    const s = store.state;
    const c = store.customer(e.customerId) || {};
    const t = calc.estimate(e, s);
    const lines = e.items.map((it) => ({ desc: it.desc, qty: it.qty, unit: it.unit, price: u.num(it.price), total: u.num(it.qty) * u.num(it.price) }));
    if (e.billTM) {
      lines.push({ desc: 'Crew time', qty: u.num(e.crewHours), unit: 'crew-hr', price: u.num(e.crewRate), total: t.labor });
      t.equipRows.forEach((r) => lines.push({ desc: r.name, qty: r.hours, unit: 'hr', price: r.rate, total: r.hours * r.rate }));
    }
    MT.printDoc({
      title: 'Estimate',
      meta: [['Number', e.number || 'Draft'], ['Date', u.fmtDate(e.date)], ['Valid until', u.fmtDate(u.addDays(e.date, u.num(e.validDays)))]],
      parties: [
        { heading: 'Prepared for', lines: [c.name, c.company, c.phone, c.email] },
        { heading: 'Job site', lines: [e.jobAddress], bold: e.title },
      ],
      lines,
      extraRows: [t.surcharge ? ['Site difficulty adjustment', t.surcharge] : null, t.disposal ? ['Disposal & dump fees', t.disposal] : null].filter(Boolean),
      totals: [['Subtotal', t.subtotal], t.discount ? ['Discount', -t.discount] : null, t.tax ? ['Sales tax (' + e.taxRate + '%)', t.tax] : null, ['Total', t.total, true]].filter(Boolean),
      notes: e.notes,
      signature: true,
      footer: s.settings.estimateFooter || '',
    });
  }

  /* ================= Saved list ================= */
  function renderList(host, root) {
    const s = store.state;
    const q = view.q.toLowerCase();
    const rows = s.estimates
      .filter((e) => !view.filter || e.status === view.filter)
      .filter((e) => !q || (e.number + ' ' + e.title + ' ' + store.customerName(e.customerId)).toLowerCase().includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    host.innerHTML = `
      <div class="toolbar">
        <input type="search" class="input" id="el-q" placeholder="Search estimates" value="${u.esc(view.q)}" aria-label="Search estimates">
        <select class="input" id="el-f" aria-label="Status">${u.options(Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k] })), view.filter, 'All statuses')}</select>
        <span class="spacer"></span>
        <button class="btn primary" id="el-new">New estimate</button>
      </div>
      <section class="panel flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Number</th><th>Customer</th><th>Job</th><th>Date</th><th class="num">Total</th><th class="num">Margin</th><th>Status</th></tr></thead>
        <tbody>${rows.map((e) => {
          const t = calc.estimate(e, s);
          return `<tr class="click" data-id="${e.id}"><td><b>${u.esc(e.number)}</b></td><td>${u.esc(store.customerName(e.customerId))}</td><td>${u.esc(e.title)}</td><td>${u.fmtDate(e.date)}</td><td class="num">${u.money(t.total)}</td><td class="num">${u.pct(t.margin)}</td><td>${ui.badge(STATUS[e.status], STATUS_KIND[e.status])}</td></tr>`;
        }).join('') || `<tr><td colspan="7">${ui.empty(view.q || view.filter ? 'No estimates match your search.' : 'No estimates yet. Start one with New estimate.')}</td></tr>`}</tbody>
      </table></div></section>`;
    const qi = u.qs('#el-q', host);
    qi.addEventListener('input', u.debounce(() => { view.q = qi.value; renderList(host, root); const n = u.qs('#el-q', host); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    u.qs('#el-f', host).addEventListener('change', (ev) => { view.filter = ev.target.value; renderList(host, root); });
    u.qs('#el-new', host).addEventListener('click', () => { view.draft = blank(); view.isNew = true; view.mode = 'build'; view.render(root); });
    u.qsa('tr[data-id]', host).forEach((tr) => tr.addEventListener('click', () => { load({ id: tr.dataset.id }); view.render(root); }));
  }

  /** Starts a new estimate prefilled from another tool (e.g. the job pricing calculator). */
  view.startWith = function (preset) {
    view.draft = blank(preset);
    view.isNew = true;
    view.mode = 'build';
  };

  /** Called by the app when the underlying data changes (e.g., estimate deleted elsewhere). */
  view.onDataReplaced = function () { view.draft = null; view.isNew = true; };

  MT.views.estimator = view;
})();
