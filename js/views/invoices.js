/* Mammoth CRM — Invoices */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const PAY_METHODS = ['Check', 'Card', 'Cash', 'Zelle', 'ACH', 'Square', 'Venmo', 'Financing', 'Other'];
  const FILTERS = [['all', 'All'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['draft', 'Drafts']];

  const view = { title: 'Invoices', filter: 'all', q: '', draft: null };
  const ST = (inv) => calc.INVOICE_STATUS[calc.invoiceStatus(inv)];
  const badge = (inv) => { const s = ST(inv); return ui.badge(s.name, s.kind); };

  /** Builds invoice lines from a job's estimate (or a single line for the job). */
  function linesForDeal(d) {
    const e = d.estimateId && store.estimate(d.estimateId);
    if (e) {
      const t = calc.estimate(e, store.state);
      const lines = e.items.map((x) => ({ desc: x.desc, qty: x.qty, unit: x.unit, price: u.num(x.price) }));
      if (e.billTM) {
        lines.push({ desc: 'Crew time', qty: u.num(e.crewHours), unit: 'crew-hr', price: u.num(e.crewRate) });
        t.equipRows.forEach((r) => lines.push({ desc: r.name, qty: r.hours, unit: 'hr', price: r.rate }));
      }
      if (t.surcharge) lines.push({ desc: 'Site difficulty adjustment', qty: 1, unit: 'job', price: Math.round(t.surcharge * 100) / 100 });
      if (t.disposal) lines.push({ desc: 'Disposal & dump fees', qty: 1, unit: 'job', price: t.disposal });
      const sum = u.sum(lines, (x) => u.num(x.qty) * u.num(x.price)) - u.num(e.discount);
      if (Math.abs(sum - u.num(d.value)) < 1) return { lines, discount: u.num(e.discount) };
    }
    return { lines: [{ desc: d.title, qty: 1, unit: 'job', price: u.num(d.value) }], discount: 0 };
  }

  function newForDeal(dealId) {
    const s = store.state;
    const d = store.deal(dealId);
    if (!d) return null;
    const terms = u.num(s.settings.paymentTermsDays) || 15;
    const { lines, discount } = linesForDeal(d);
    return { id: u.uid('inv'), number: '', dealId: d.id, customerId: d.customerId, date: u.todayISO(), dueDate: u.addDays(u.todayISO(), terms), status: 'draft', sentAt: '', items: lines, discount, taxRate: s.settings.taxRate || 0, notes: s.settings.invoiceNotes || '', isNew: true };
  }

  view.render = function (root) {
    const p = MT.app.params;
    if (p.id) { const inv = store.invoice(p.id); if (inv) view.draft = JSON.parse(JSON.stringify(inv)); MT.app.params = {}; }
    if (p.dealId) { const existing = store.invoicesFor(p.dealId)[0]; view.draft = existing ? JSON.parse(JSON.stringify(existing)) : newForDeal(p.dealId); MT.app.params = {}; }
    if (view.draft) renderEditor(root); else renderList(root);
  };

  /* ================= List ================= */
  function renderList(root) {
    const s = store.state;
    const today = u.todayISO();
    const q = view.q.toLowerCase();
    const all = s.invoices.filter((x) => x.status !== 'void' || view.filter === 'all');
    const live = s.invoices.filter((x) => x.status !== 'void' && x.status !== 'draft');
    const owed = live.filter((x) => calc.invoiceBalance(x) > 0);
    const overdue = owed.filter((x) => calc.invoiceStatus(x) === 'overdue');
    const since = u.addDays(today, -30);
    let collected = 0;
    s.invoices.forEach((x) => calc.invoicePayments(x).forEach((pmt) => { if (pmt.date >= since && pmt.date <= today) collected += u.num(pmt.amount); }));
    const ready = s.deals.filter((d) => d.stage === 'won' && (d.scheduledDate || d.closedAt) && (d.scheduledDate || d.closedAt) <= today && !store.invoicesFor(d.id).length);
    const rows = all.filter((x) => {
      const st = calc.invoiceStatus(x);
      if (view.filter === 'unpaid' && !['sent', 'partial', 'overdue'].includes(st)) return false;
      if (view.filter === 'overdue' && st !== 'overdue') return false;
      if (view.filter === 'paid' && st !== 'paid') return false;
      if (view.filter === 'draft' && st !== 'draft') return false;
      if (q) { const d = store.deal(x.dealId); if (!(x.number + ' ' + store.customerName(x.customerId) + ' ' + (d ? d.title : '')).toLowerCase().includes(q)) return false; }
      return true;
    }).sort((a, b) => (a.date === b.date ? (a.number < b.number ? 1 : -1) : a.date < b.date ? 1 : -1));
    const shown = rows.slice(0, 200);

    root.innerHTML = `
      <section class="kpis" aria-label="Invoice totals">
        <article class="kpi"><h3 class="kpi-label">Outstanding</h3><div class="kpi-value">${u.money(u.sum(owed, calc.invoiceBalance))}</div><div class="kpi-sub">${owed.length} unpaid ${owed.length === 1 ? 'invoice' : 'invoices'}</div></article>
        <article class="kpi"><h3 class="kpi-label">Overdue</h3><div class="kpi-value ${overdue.length ? 'neg' : ''}">${u.money(u.sum(overdue, calc.invoiceBalance))}</div><div class="kpi-sub">${overdue.length ? overdue.length + ' past the due date' : 'Nothing overdue'}</div></article>
        <article class="kpi"><h3 class="kpi-label">Collected, last 30 days</h3><div class="kpi-value">${u.money(collected)}</div><div class="kpi-sub">Payments applied to invoices</div></article>
        <article class="kpi"><h3 class="kpi-label">Ready to invoice</h3><div class="kpi-value">${ready.length}</div><div class="kpi-sub">${ready.length ? 'Finished jobs with no invoice' : 'Every finished job is invoiced'}</div></article>
      </section>
      ${ready.length ? `<section class="panel ready-panel"><div class="panel-head"><h3>Finished jobs to invoice</h3><button class="btn primary sm" id="inv-all">Create ${ready.length === 1 ? 'the invoice' : 'all ' + ready.length + ' as drafts'}</button></div>
        <ul class="list compact">${ready.slice(0, 6).map((d) => `<li class="list-row" data-ready="${d.id}"><div class="grow"><div class="row-title">${u.esc(d.title)}</div><div class="row-sub">${u.esc(store.customerName(d.customerId))}, job ${u.fmtDate(d.scheduledDate || d.closedAt)}</div></div><div class="amt">${u.money(d.value)}</div><span class="link">Invoice</span></li>`).join('')}</ul></section>` : ''}
      <div class="toolbar">
        <input type="search" class="input" id="inv-q" placeholder="Search number, client, or job" value="${u.esc(view.q)}" aria-label="Search invoices">
        <div class="seg" role="tablist">${FILTERS.map((f) => `<button role="tab" data-f="${f[0]}" class="${view.filter === f[0] ? 'on' : ''}" aria-selected="${view.filter === f[0]}">${f[1]}</button>`).join('')}</div>
        <span class="spacer"></span>
        <button class="btn primary" id="inv-new">New invoice</button>
      </div>
      <section class="panel flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Invoice</th><th>Client</th><th>Job</th><th>Issued</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead>
        <tbody>${shown.map((x) => {
          const d = store.deal(x.dealId);
          return `<tr class="click" data-id="${x.id}"><td><b>${u.esc(x.number || 'Draft')}</b></td><td>${u.esc(store.customerName(x.customerId))}</td><td>${u.esc(d ? d.title : '')}</td><td class="nowrap">${u.fmtDate(x.date)}</td><td class="nowrap">${u.fmtDate(x.dueDate)}</td><td class="num">${u.money(calc.invoiceTotals(x).total)}</td><td class="num">${calc.invoiceBalance(x) ? '<b>' + u.money(calc.invoiceBalance(x)) + '</b>' : '—'}</td><td>${badge(x)}</td></tr>`;
        }).join('') || `<tr><td colspan="8">${ui.empty(view.q || view.filter !== 'all' ? 'No invoices match.' : 'No invoices yet. Create one from a finished job.')}</td></tr>`}</tbody>
      </table></div></section>
      ${rows.length > shown.length ? `<p class="hint">Showing the latest ${shown.length} of ${rows.length}. Search to find older invoices.</p>` : ''}`;

    const qi = u.qs('#inv-q', root);
    qi.addEventListener('input', u.debounce(() => { view.q = qi.value; renderList(root); const n = u.qs('#inv-q', root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    u.qsa('[data-f]', root).forEach((b) => b.addEventListener('click', () => { view.filter = b.dataset.f; renderList(root); }));
    u.qsa('tr[data-id]', root).forEach((tr) => tr.addEventListener('click', () => { view.draft = JSON.parse(JSON.stringify(store.invoice(tr.dataset.id))); renderEditor(root); window.scrollTo(0, 0); }));
    u.qsa('[data-ready]', root).forEach((li) => li.addEventListener('click', () => { view.draft = newForDeal(li.dataset.ready); renderEditor(root); window.scrollTo(0, 0); }));
    const all2 = u.qs('#inv-all', root);
    if (all2) all2.addEventListener('click', () => {
      if (ready.length === 1) { view.draft = newForDeal(ready[0].id); renderEditor(root); return; }
      ready.forEach((d) => { const inv = newForDeal(d.id); delete inv.isNew; inv.number = 'INV-' + s.nextInvoiceNo++; inv.date = d.scheduledDate || d.closedAt; inv.dueDate = u.addDays(inv.date, u.num(s.settings.paymentTermsDays) || 15); assignDeposits(inv); s.invoices.push(inv); });
      store.log('invoice', 'Created ' + ready.length + ' draft invoices for finished jobs');
      store.save();
      ui.toast(ready.length + ' draft invoices created. Review and send each one.');
    });
    u.qs('#inv-new', root).addEventListener('click', () => pickJob(root));
  }

  function assignDeposits(inv) {
    const d = store.deal(inv.dealId);
    if (d) (d.payments || []).forEach((p) => { if (!p.invoiceId) p.invoiceId = inv.id; });
  }

  function pickJob(root) {
    const s = store.state;
    const jobs = s.deals.filter((d) => d.stage === 'won' && !store.invoicesFor(d.id).length).sort((a, b) => ((a.scheduledDate || a.closedAt) < (b.scheduledDate || b.closedAt) ? 1 : -1));
    const custs = s.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }));
    ui.modal({
      title: 'New invoice',
      body: `<label class="field"><span>Invoice a won job</span><select class="input" id="pk-job">${u.options(jobs.map((d) => ({ value: d.id, label: d.title + ', ' + store.customerName(d.customerId) + ' (' + u.money(d.value) + ')' })), '', jobs.length ? 'Choose a job' : 'No won jobs without an invoice')}</select></label>
        <p class="hint or-line">Or bill a client for new work</p>
        <div class="form-grid">
          <label class="field"><span>Client</span><select class="input" id="pk-cust">${u.options(custs, '', 'Choose a client')}</select></label>
          <label class="field"><span>What was the work?</span><input class="input" id="pk-title" placeholder="e.g. Emergency limb removal"></label>
        </div>`,
      actions: [{ label: 'Cancel' }, { label: 'Start invoice', kind: 'primary', onClick: (b) => {
        const jid = u.qs('#pk-job', b).value;
        if (jid) { view.draft = newForDeal(jid); renderEditor(root); return; }
        const cid = u.qs('#pk-cust', b).value, title = u.qs('#pk-title', b).value.trim();
        if (!cid || !title) { ui.toast('Choose a job, or pick a client and describe the work.', 'err'); return false; }
        const c = store.customer(cid);
        const d = { id: u.uid('d'), customerId: cid, title, value: 0, stage: 'won', source: c.source || '', probability: '', createdAt: u.todayISO(), expectedClose: u.todayISO(), closedAt: u.todayISO(), scheduledDate: u.todayISO(), notes: '', estimateId: '', lostReason: '', payments: [], jobCost: '', costSource: '', crewIds: [], expenses: [], startTime: '', days: 1 };
        s.deals.unshift(d);
        store.log('won', 'New job for ' + c.name + ': ' + title, { customerId: cid, dealId: d.id });
        store.save(true);
        view.draft = newForDeal(d.id);
        view.draft.items = [{ desc: title, qty: 1, unit: 'job', price: 0 }];
        renderEditor(root);
      } }],
    });
  }

  /* ================= Editor ================= */
  function renderEditor(root) {
    const s = store.state;
    const inv = view.draft;
    const d = store.deal(inv.dealId);
    const c = store.customer(inv.customerId) || {};
    const saved = !inv.isNew;
    const stored = saved && store.invoice(inv.id);
    root.innerHTML = `
      <div><button class="btn ghost sm" id="iv-back">All invoices</button></div>
      <div class="est-layout">
        <div class="est-form">
          <section class="panel">
            <div class="panel-head"><h3>${inv.number ? u.esc(inv.number) : 'New invoice'}</h3>${stored ? badge(stored) : ui.badge('Not saved yet', '')}</div>
            <div class="form-grid">
              <div class="field"><span>Bill to</span><div class="readonly-box"><b>${u.esc(c.name || '')}</b>${c.company ? '<br>' + u.esc(c.company) : ''}<br>${u.esc([c.address, c.city].filter(Boolean).join(', '))}<br>${u.esc(c.email || '')}</div></div>
              <div class="field"><span>Job</span><div class="readonly-box"><b>${u.esc(d ? d.title : '')}</b><br>${d && (d.scheduledDate || d.closedAt) ? 'Job date ' + u.fmtDate(d.scheduledDate || d.closedAt) : ''}${d ? '<br><a href="#" id="iv-deal">Open the deal</a>' : ''}</div></div>
              <label class="field"><span>Invoice date</span><input class="input" type="date" data-k="date" value="${u.esc(inv.date)}"></label>
              <label class="field"><span>Due date</span><input class="input" type="date" data-k="dueDate" value="${u.esc(inv.dueDate)}"></label>
            </div>
            <div class="chips"><span class="chips-label">Due in:</span>${[0, 7, 15, 30].map((n) => `<button class="chip" data-terms="${n}">${n ? n + ' days' : 'On receipt'}</button>`).join('')}</div>
          </section>

          <section class="panel">
            <div class="panel-head"><h3>Line items</h3></div>
            <div class="table-wrap"><table class="items">
              <thead><tr><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Price</th><th class="num">Amount</th><th></th></tr></thead>
              <tbody>${inv.items.map((it, i) => `<tr data-i="${i}">
                <td><input class="input" data-item="desc" value="${u.esc(it.desc)}" aria-label="Description"></td>
                <td class="num"><input class="input num" type="number" step="any" data-item="qty" value="${u.esc(it.qty)}" aria-label="Quantity"></td>
                <td><input class="input unit" data-item="unit" value="${u.esc(it.unit)}" aria-label="Unit"></td>
                <td class="num"><input class="input num" type="number" step="any" data-item="price" value="${u.esc(it.price)}" aria-label="Price"></td>
                <td class="num line-total">${u.money(u.num(it.qty) * u.num(it.price), true)}</td>
                <td><button class="icon-btn" data-del="${i}" aria-label="Remove line">&times;</button></td></tr>`).join('')}</tbody></table></div>
            <div class="btn-row">
              <select class="input" id="iv-pb" aria-label="Add from price book">${u.options(s.settings.priceBook.map((x) => ({ value: x.id, label: x.name + ', ' + u.money(x.price, x.price % 1 !== 0) + '/' + x.unit })), '', 'Add from price book')}</select>
              <button class="btn ghost" id="iv-line">Add custom line</button>
            </div>
            <div class="form-grid" style="margin-top:14px">
              <label class="field"><span>Discount ($)</span><input class="input" type="number" min="0" step="any" data-k="discount" value="${u.esc(inv.discount)}"></label>
              <label class="field"><span>Sales tax (%)</span><input class="input" type="number" min="0" step="0.01" data-k="taxRate" value="${u.esc(inv.taxRate)}"></label>
              <label class="field span-2"><span>Notes and payment terms</span><textarea class="input" rows="3" data-k="notes">${u.esc(inv.notes)}</textarea></label>
              <label class="field span-2"><span>Pay online link for this invoice</span><input class="input" type="url" data-k="payLink" value="${u.esc(inv.payLink || '')}" placeholder="${u.esc(s.settings.payLink || 'https://square.link/u/…')}"><small>${s.settings.payLink ? 'Leave blank to use your link from Settings. ' : 'Paste a Square payment link (or set one for everything in Settings → Defaults). '}It prints on the invoice and goes in payment reminders.</small></label>
            </div>
          </section>
        </div>
        <aside class="est-summary panel" id="iv-sum"></aside>
      </div>`;

    const sum = () => {
      const t = calc.invoiceTotals(inv);
      const pays = stored ? calc.invoicePayments(stored) : [];
      const paid = u.sum(pays, (x) => x.amount);
      const bal = Math.max(0, t.total - paid);
      const row = (l, v, cls) => `<div class="sum-row ${cls || ''}"><span>${l}</span><span>${v}</span></div>`;
      u.qs('#iv-sum', root).innerHTML = `
        <h3>Invoice total</h3>
        <div class="sum-total">${u.money(t.total, true)}</div>
        <div class="sum-lines">
          ${row('Subtotal', u.money(t.subtotal, true))}
          ${t.discount ? row('Discount', '−' + u.money(t.discount, true)) : ''}
          ${t.tax ? row('Sales tax', u.money(t.tax, true)) : ''}
          ${row('Paid', u.money(paid, true))}
          ${row('Balance due', u.money(bal, true), 'strong')}
        </div>
        <div class="sum-internal">
          <h4>Payments</h4>
          ${pays.length ? '<ul class="pay-list">' + pays.map((x) => `<li><span>${u.fmtDate(x.date)}</span><span>${u.esc(x.method)}</span><b>${u.money(x.amount, true)}</b><button class="icon-btn" data-delpay="${x.id}" aria-label="Remove payment">&times;</button></li>`).join('') + '</ul>' : '<p class="hint">No payments yet.</p>'}
          <div class="pay-add">
            <label class="field"><span>Amount</span><input class="input" type="number" min="0" step="0.01" id="iv-amt" placeholder="${bal.toFixed(2)}"></label>
            <label class="field"><span>Date</span><input class="input" type="date" id="iv-pdate" value="${u.todayISO()}"></label>
            <label class="field"><span>Method</span><select class="input" id="iv-meth">${u.options(PAY_METHODS, 'Check')}</select></label>
            <button class="btn ghost" id="iv-pay">Record payment</button>
            <button class="btn ghost" id="iv-full" ${bal ? '' : 'disabled'}>Paid in full</button>
          </div>
        </div>
        <div class="sum-actions">
          <button class="btn primary" id="iv-save">${saved ? 'Save changes' : 'Save invoice'}</button>
          ${!stored || stored.status === 'draft' ? '<button class="btn" id="iv-send">Mark as sent</button>' : ''}
          <button class="btn ghost" id="iv-print">Print or save PDF</button>
          ${stored && bal > 0 && stored.status !== 'draft' ? '<button class="btn ghost" id="iv-remind">Copy payment reminder</button>' : ''}
          ${stored && stored.status !== 'void' ? '<button class="btn danger-ghost" id="iv-void">Void invoice</button>' : ''}
          ${stored ? '<button class="btn danger-ghost" id="iv-del">Delete invoice</button>' : ''}
        </div>`;
      bindSummary();
    };

    function commit(status) {
      if (!inv.items.length) { ui.toast('Add at least one line item.', 'err'); return false; }
      if (!inv.number) inv.number = 'INV-' + s.nextInvoiceNo++;
      if (status) { inv.status = status; if (status === 'sent') inv.sentAt = u.todayISO(); }
      const wasNew = inv.isNew;
      delete inv.isNew;
      const obj = JSON.parse(JSON.stringify(inv));
      const i = s.invoices.findIndex((x) => x.id === obj.id);
      if (i >= 0) s.invoices[i] = obj; else s.invoices.push(obj);
      if (wasNew) assignDeposits(obj);
      // Keep the job's value in step when it has a single invoice.
      const deal = store.deal(obj.dealId);
      if (deal && store.invoicesFor(deal.id).length === 1) deal.value = Math.round(calc.invoiceTotals(obj).taxable * 100) / 100;
      if (wasNew) store.log('invoice', 'Created invoice ' + obj.number + ' for ' + store.customerName(obj.customerId) + ' (' + u.money(calc.invoiceTotals(obj).total) + ')', { customerId: obj.customerId, dealId: obj.dealId });
      if (status === 'sent') store.log('invoice', 'Sent invoice ' + obj.number + ' to ' + store.customerName(obj.customerId), { customerId: obj.customerId, dealId: obj.dealId });
      store.save();
      return true;
    }

    function bindSummary() {
      const q = (sel) => u.qs(sel, root);
      q('#iv-save').addEventListener('click', () => { if (commit()) ui.toast('Invoice ' + inv.number + ' saved'); });
      const send = q('#iv-send'); if (send) send.addEventListener('click', () => { if (commit('sent')) ui.toast('Invoice ' + inv.number + ' marked as sent'); });
      q('#iv-print').addEventListener('click', () => printInvoice(inv));
      const rem = q('#iv-remind'); if (rem) rem.addEventListener('click', () => reminder(store.invoice(inv.id)));
      const vd = q('#iv-void'); if (vd) vd.addEventListener('click', () => ui.confirm('Void ' + inv.number + '?', 'A voided invoice stays on record but no longer counts as owed.', 'Void invoice', () => { inv.status = 'void'; commit(); ui.toast('Invoice voided'); }));
      const del = q('#iv-del'); if (del) del.addEventListener('click', () => ui.confirm('Delete ' + inv.number + '?', 'The invoice is removed. Payments stay recorded on the job.', 'Delete invoice', () => {
        const deal = store.deal(inv.dealId);
        if (deal) (deal.payments || []).forEach((x) => { if (x.invoiceId === inv.id) x.invoiceId = ''; });
        store.remove('invoices', inv.id); view.draft = null; store.save(); ui.toast('Invoice deleted');
      }));
      const addPay = (amount) => {
        if (!(amount > 0)) { ui.toast('Enter the payment amount.', 'err'); return; }
        if (!store.invoice(inv.id) && !commit()) return;
        const deal = store.deal(inv.dealId);
        if (!deal) { ui.toast('This invoice is not linked to a job.', 'err'); return; }
        deal.payments = deal.payments || [];
        deal.payments.push({ id: u.uid('pay'), amount: Math.round(amount * 100) / 100, date: q('#iv-pdate').value || u.todayISO(), method: q('#iv-meth').value, invoiceId: inv.id });
        if (inv.status === 'draft') inv.status = 'sent';
        commit();
        store.log('payment', 'Received ' + u.money(amount, true) + ' from ' + store.customerName(inv.customerId) + ' on ' + inv.number, { customerId: inv.customerId, dealId: inv.dealId });
        store.save();
        ui.toast('Payment recorded');
      };
      q('#iv-pay').addEventListener('click', () => addPay(u.num(q('#iv-amt').value)));
      q('#iv-full').addEventListener('click', () => { const st = store.invoice(inv.id); addPay(st ? calc.invoiceBalance(st) : calc.invoiceTotals(inv).total); });
      u.qsa('[data-delpay]', root).forEach((bn) => bn.addEventListener('click', () => {
        const deal = store.deal(inv.dealId);
        if (!deal) return;
        deal.payments = deal.payments.filter((x) => x.id !== bn.dataset.delpay);
        store.save();
        ui.toast('Payment removed');
      }));
    }

    sum();
    u.qs('#iv-back', root).addEventListener('click', () => { view.draft = null; renderList(root); });
    const dl = u.qs('#iv-deal', root); if (dl) dl.addEventListener('click', (e) => { e.preventDefault(); MT.views.pipeline.openDeal(d.id); });
    u.qsa('[data-k]', root).forEach((inp) => inp.addEventListener('input', () => { inv[inp.dataset.k] = inp.type === 'number' ? u.num(inp.value) : inp.value; sum(); }));
    u.qsa('[data-terms]', root).forEach((b) => b.addEventListener('click', () => { inv.dueDate = u.addDays(inv.date || u.todayISO(), +b.dataset.terms); u.qs('[data-k=dueDate]', root).value = inv.dueDate; }));
    u.qsa('tr[data-i]', root).forEach((tr) => {
      const it = inv.items[+tr.dataset.i];
      u.qsa('[data-item]', tr).forEach((inp) => inp.addEventListener('input', () => {
        it[inp.dataset.item] = inp.type === 'number' ? u.num(inp.value) : inp.value;
        u.qs('.line-total', tr).textContent = u.money(u.num(it.qty) * u.num(it.price), true);
        sum();
      }));
    });
    u.qsa('[data-del]', root).forEach((b) => b.addEventListener('click', () => { inv.items.splice(+b.dataset.del, 1); renderEditor(root); }));
    u.qs('#iv-pb', root).addEventListener('change', (e) => { const x = s.settings.priceBook.find((y) => y.id === e.target.value); if (x) { inv.items.push({ desc: x.name, qty: 1, unit: x.unit, price: x.price }); renderEditor(root); } });
    u.qs('#iv-line', root).addEventListener('click', () => { inv.items.push({ desc: '', qty: 1, unit: 'job', price: 0 }); renderEditor(root); const l = u.qsa('[data-item=desc]', root).pop(); if (l) l.focus(); });
  }

  function printInvoice(inv) {
    const c = store.customer(inv.customerId) || {};
    const d = store.deal(inv.dealId);
    const t = calc.invoiceTotals(inv);
    const stored = store.invoice(inv.id);
    const paid = stored ? calc.invoicePaid(stored) : 0;
    const status = stored ? calc.invoiceStatus(stored) : 'draft';
    MT.printDoc({
      title: 'Invoice',
      meta: [['Invoice', inv.number || 'Draft'], ['Date', u.fmtDate(inv.date)], ['Due', u.fmtDate(inv.dueDate)]],
      stamp: status === 'paid' ? 'Paid' : status === 'void' ? 'Void' : '',
      parties: [
        { heading: 'Bill to', lines: [c.name, c.company, [c.address, c.city].filter(Boolean).join(', '), c.phone, c.email] },
        { heading: 'Job', lines: [d && d.scheduledDate ? 'Completed ' + u.fmtDate(d.scheduledDate) : ''], bold: d ? d.title : '' },
      ],
      lines: inv.items.map((x) => ({ desc: x.desc, qty: x.qty, unit: x.unit, price: u.num(x.price), total: u.num(x.qty) * u.num(x.price) })),
      totals: [['Subtotal', t.subtotal], t.discount ? ['Discount', -t.discount] : null, t.tax ? ['Sales tax (' + inv.taxRate + '%)', t.tax] : null, ['Total', t.total], paid ? ['Deposits & payments received', -paid] : null, ['Balance due', Math.max(0, t.total - paid), true]].filter(Boolean),
      pay: payLink(inv) && t.total - paid > 0.005 && status !== 'void' ? { url: payLink(inv), label: 'Pay online', note: 'Balance due ' + u.money(Math.max(0, t.total - paid), true) + ' by ' + u.fmtDate(inv.dueDate) + '.' } : null,
      notes: inv.notes,
      footer: store.state.settings.estimateFooter || '',
    });
  }

  const payLink = (inv) => String((inv && inv.payLink) || store.state.settings.payLink || '').trim();

  function reminder(inv) {
    const c = store.customer(inv.customerId) || {};
    const co = store.state.settings.company;
    const bal = calc.invoiceBalance(inv);
    const late = inv.dueDate < u.todayISO();
    const link = payLink(inv);
    const text = `Hi ${u.firstName(c.name)},\n\nA friendly reminder that invoice ${inv.number} for ${u.money(bal, true)} ${late ? 'was due on ' + u.fmtDate(inv.dueDate) : 'is due on ' + u.fmtDate(inv.dueDate)}. ${link ? 'You can pay securely online here:\n' + link + '\n\nOr pay by check, Zelle, or ACH.' : 'You can pay by check, card, Zelle, or ACH.'}\n\nIf you've already sent it, thank you, and please ignore this note. Questions? Call ${co.phone}.\n\nThank you,\n${co.owner}\n${co.name}`;
    ui.modal({
      title: 'Payment reminder',
      body: `<div class="preview"><div class="prev-subj">Invoice ${u.esc(inv.number)} reminder</div><div class="prev-body">${u.esc(text)}</div></div>`,
      actions: [
        { label: 'Close' },
        { label: 'Open in email', kind: 'ghost', keepOpen: true, onClick: () => { window.location.href = 'mailto:' + encodeURIComponent(c.email || '') + '?subject=' + encodeURIComponent('Invoice ' + inv.number + ' reminder') + '&body=' + encodeURIComponent(text); } },
        { label: 'Copy message', kind: 'primary', onClick: () => { u.copyText(text).then(() => ui.toast('Reminder copied')); store.log('message', 'Payment reminder for ' + inv.number, { customerId: inv.customerId, dealId: inv.dealId }); store.save(true); } },
      ],
    });
  }

  MT.views.invoices = view;
})();
