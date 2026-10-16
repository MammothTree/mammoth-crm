/* Mammoth CRM — Customers */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;

  const view = { title: 'Clients', q: '', type: '', sort: 'name' };

  view.render = function (root) {
    const s = store.state;
    const q = view.q.toLowerCase();
    const rows = s.customers
      .filter((c) => !view.type || c.type === view.type)
      .filter((c) => !q || [c.name, c.company, c.phone, c.email, c.address, c.city].join(' ').toLowerCase().includes(q))
      .map((c) => {
        const deals = s.deals.filter((d) => d.customerId === c.id);
        const last = deals.map((d) => d.closedAt || d.createdAt).sort().pop() || c.createdAt;
        return { c, ltv: calc.lifetimeValue(s, c.id), open: deals.filter((d) => store.OPEN_STAGES.includes(d.stage)).length, jobs: deals.filter((d) => d.stage === 'won').length, last };
      })
      .sort((a, b) => view.sort === 'ltv' ? b.ltv - a.ltv : view.sort === 'recent' ? (a.last < b.last ? 1 : -1) : a.c.name.localeCompare(b.c.name));

    root.innerHTML = `
      <div class="toolbar">
        <input type="search" class="input" id="cu-q" placeholder="Search name, phone, email, or address" value="${u.esc(view.q)}" aria-label="Search customers">
        <select class="input" id="cu-type" aria-label="Customer type">${u.options(['Residential', 'Commercial'], view.type, 'All clients')}</select>
        <select class="input" id="cu-sort" aria-label="Sort">${u.options([{ value: 'name', label: 'Sort by name' }, { value: 'ltv', label: 'Sort by lifetime value' }, { value: 'recent', label: 'Sort by recent activity' }], view.sort)}</select>
        <span class="spacer"></span>
        <button class="btn ghost" id="cu-import">Import clients</button>
        <button class="btn primary" id="cu-new">Add client</button>
      </div>
      <section class="panel flush"><div class="table-wrap"><table class="table">
        <thead><tr><th>Client</th><th>Phone</th><th>Address</th><th>Source</th><th class="num">Jobs</th><th class="num">Open deals</th><th class="num">Lifetime value</th><th>Last activity</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr class="click" data-id="${r.c.id}">
            <td><div class="who"><span class="avatar" aria-hidden="true">${u.esc(u.initials(r.c.name))}</span><div><b>${u.esc(r.c.name)}</b>${r.c.company ? '<div class="row-sub">' + u.esc(r.c.company) + '</div>' : ''}</div></div></td>
            <td class="nowrap">${u.esc(r.c.phone)}</td>
            <td>${u.esc(r.c.address)}${r.c.city ? ', ' + u.esc(r.c.city) : ''}</td>
            <td>${u.esc(r.c.source || '—')}</td>
            <td class="num">${r.jobs}</td>
            <td class="num">${r.open || ''}</td>
            <td class="num">${u.money(r.ltv)}</td>
            <td class="nowrap">${u.fmtDate(r.last)}</td>
          </tr>`).join('') || `<tr><td colspan="8">${ui.empty(view.q ? 'No clients match "' + view.q + '".' : 'No clients yet. Add your first one to start tracking jobs.')}</td></tr>`}
        </tbody></table></div></section>
      <p class="hint">${rows.length} of ${s.customers.length} clients</p>`;

    const qi = u.qs('#cu-q', root);
    qi.addEventListener('input', u.debounce(() => { view.q = qi.value; view.render(root); const n = u.qs('#cu-q', root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    u.qs('#cu-type', root).addEventListener('change', (e) => { view.type = e.target.value; view.render(root); });
    u.qs('#cu-sort', root).addEventListener('change', (e) => { view.sort = e.target.value; view.render(root); });
    u.qs('#cu-new', root).addEventListener('click', () => view.edit(null));
    u.qs('#cu-import', root).addEventListener('click', () => MT.clientImport.open());
    u.qsa('tr[data-id]', root).forEach((tr) => tr.addEventListener('click', () => view.detail(tr.dataset.id)));
  };

  /** Add/edit form. onSaved(customer) is called after save. */
  view.edit = function (id, onSaved) {
    const existing = id ? store.customer(id) : null;
    const c = existing ? Object.assign({}, existing) : { id: u.uid('c'), name: '', company: '', phone: '', email: '', address: '', city: '', source: '', type: 'Residential', notes: '', createdAt: u.todayISO() };
    ui.modal({
      title: existing ? 'Edit client' : 'Add client',
      body: `<div class="form-grid">
        <label class="field"><span>Full name</span><input class="input" name="name" value="${u.esc(c.name)}" autocomplete="off"></label>
        <label class="field"><span>Company (optional)</span><input class="input" name="company" value="${u.esc(c.company)}"></label>
        <label class="field"><span>Phone</span><input class="input" type="tel" name="phone" value="${u.esc(c.phone)}"></label>
        <label class="field"><span>Email</span><input class="input" type="email" name="email" value="${u.esc(c.email)}"></label>
        <label class="field"><span>Street address</span><input class="input" name="address" value="${u.esc(c.address)}"></label>
        <label class="field"><span>City</span><input class="input" name="city" value="${u.esc(c.city)}"></label>
        <label class="field"><span>Client type</span><select class="input" name="type">${u.options(['Residential', 'Commercial'], c.type)}</select></label>
        <label class="field"><span>How they found you</span><select class="input" name="source">${u.options(store.SOURCES, c.source, 'Unknown')}</select></label>
        <label class="field span-2"><span>Notes (gate codes, pets, access)</span><textarea class="input" rows="3" name="notes">${u.esc(c.notes)}</textarea></label>
      </div>`,
      actions: [
        { label: 'Cancel' },
        { label: existing ? 'Save client' : 'Add client', kind: 'primary', onClick: (b) => {
          const f = u.formData(b);
          if (!f.name) { ui.toast('Enter the client\'s name.', 'err'); return false; }
          if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) { ui.toast('That email address doesn\'t look right.', 'err'); return false; }
          const obj = Object.assign(existing || c, f);
          if (!existing) { store.state.customers.unshift(obj); store.log('customer', 'Added client ' + obj.name, { customerId: obj.id }); }
          store.save();
          ui.toast(existing ? 'Client saved' : 'Client added');
          if (onSaved) onSaved(obj);
        } },
      ],
    });
  };

  view.detail = function (id) {
    const s = store.state;
    const c = store.customer(id);
    if (!c) return;
    const deals = s.deals.filter((d) => d.customerId === id).sort((a, b) => ((a.closedAt || a.createdAt) < (b.closedAt || b.createdAt) ? 1 : -1));
    const ests = s.estimates.filter((e) => e.customerId === id);
    const acts = s.activities.filter((a) => a.customerId === id).slice(0, 10);
    const invs = s.invoices.filter((x) => x.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
    const stageKind = { won: 'good', lost: 'bad' };
    ui.modal({
      title: c.name,
      size: 'lg',
      body: `
        <div class="cust-head">
          <span class="avatar lg" aria-hidden="true">${u.esc(u.initials(c.name))}</span>
          <div class="grow">
            ${c.company ? '<div><b>' + u.esc(c.company) + '</b></div>' : ''}
            <div>${u.esc(c.address)}${c.city ? ', ' + u.esc(c.city) : ''}</div>
            <div class="contact-line">${c.phone ? '<a href="tel:' + u.esc(c.phone.replace(/[^\d+]/g, '')) + '">' + u.esc(c.phone) + '</a>' : ''}${c.email ? '<a href="mailto:' + u.esc(c.email) + '">' + u.esc(c.email) + '</a>' : ''}</div>
          </div>
          <div class="cust-ltv"><div class="stat-label">Lifetime value</div><div class="stat-value sm">${u.money(calc.lifetimeValue(s, id))}</div></div>
        </div>
        ${c.notes ? '<div class="note">' + u.esc(c.notes) + '</div>' : ''}
        <div class="btn-row">
          <button class="btn ghost sm" data-go="deal">New deal</button>
          <button class="btn ghost sm" data-go="estimate">New estimate</button>
          <button class="btn ghost sm" data-go="template">Send a template</button>
          <button class="btn ghost sm" data-go="jobcam">Job photos</button>
          <button class="btn ghost sm" data-go="edit">Edit details</button>
        </div>
        <h4 class="sub-h">Deals & jobs</h4>
        ${deals.length ? '<ul class="list compact">' + deals.map((d) => `<li class="list-row" data-deal="${d.id}"><div class="grow"><div class="row-title">${u.esc(d.title)}</div><div class="row-sub">${d.closedAt ? 'Closed ' + u.fmtDate(d.closedAt) : 'Opened ' + u.fmtDate(d.createdAt)}</div></div>${ui.badge(store.stage(d.stage).name, stageKind[d.stage] || 'info')}<div class="amt">${u.money(d.value)}</div></li>`).join('') + '</ul>' : ui.empty('No deals yet.')}
        <h4 class="sub-h">Estimates</h4>
        ${ests.length ? '<ul class="list compact">' + ests.map((e) => `<li class="list-row" data-est="${e.id}"><div class="grow"><div class="row-title">${u.esc(e.number)}: ${u.esc(e.title)}</div><div class="row-sub">${u.fmtDate(e.date)}</div></div>${ui.badge(e.status, e.status === 'accepted' ? 'good' : e.status === 'declined' ? 'bad' : 'info')}<div class="amt">${u.money(calc.estimate(e, s).total)}</div></li>`).join('') + '</ul>' : ui.empty('No estimates yet.')}
        <h4 class="sub-h">Invoices</h4>
        ${invs.length ? '<ul class="list compact">' + invs.map((x) => { const st = calc.invoiceStatus(x); return `<li class="list-row" data-inv="${x.id}"><div class="grow"><div class="row-title">${u.esc(x.number)}</div><div class="row-sub">Issued ${u.fmtDate(x.date)}, due ${u.fmtDate(x.dueDate)}</div></div>${ui.badge(calc.INVOICE_STATUS[st].name, calc.INVOICE_STATUS[st].kind)}<div class="amt">${u.money(calc.invoiceTotals(x).total)}</div></li>`; }).join('') + '</ul>' : ui.empty('No invoices yet.')}
        <h4 class="sub-h">Activity</h4>
        <div class="add-note"><input class="input" id="cu-note" placeholder="Log a call, visit, or note"><button class="btn ghost sm" id="cu-note-add">Log it</button></div>
        <ul class="feed">${acts.map((a) => `<li class="feed-${u.esc(a.type)}"><span class="feed-dot" aria-hidden="true"></span><div><div>${u.esc(a.text)}</div><time>${u.fmtDate(a.ts.slice(0, 10))}</time></div></li>`).join('')}</ul>`,
      onMount(b, close) {
        u.qsa('[data-deal]', b).forEach((n) => n.addEventListener('click', () => { close(); MT.views.pipeline.openDeal(n.dataset.deal); }));
        u.qsa('[data-est]', b).forEach((n) => n.addEventListener('click', () => { close(); MT.app.go('estimator', { id: n.dataset.est }); }));
        u.qsa('[data-inv]', b).forEach((n) => n.addEventListener('click', () => { close(); MT.app.go('invoices', { id: n.dataset.inv }); }));
        u.qsa('[data-go]', b).forEach((n) => n.addEventListener('click', () => {
          close();
          const g = n.dataset.go;
          if (g === 'deal') MT.views.pipeline.openDeal(null, { customerId: id, source: c.source });
          if (g === 'estimate') MT.app.go('estimator', { customerId: id });
          if (g === 'template') MT.app.go('templates', { customerId: id });
          if (g === 'jobcam') MT.app.go('jobcam', { customerId: id });
          if (g === 'edit') view.edit(id);
        }));
        const add = () => {
          const inp = u.qs('#cu-note', b);
          if (!inp.value.trim()) return;
          store.log('note', inp.value.trim(), { customerId: id });
          store.save();
          close();
          view.detail(id);
        };
        u.qs('#cu-note-add', b).addEventListener('click', add);
        u.qs('#cu-note', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      },
      actions: [
        { label: 'Delete client', kind: 'danger-ghost', left: true, onClick: () => {
          ui.confirm('Delete ' + c.name + '?', 'This also deletes their ' + deals.length + ' deals and ' + ests.length + ' estimates. This cannot be undone.', 'Delete client', () => {
            store.remove('customers', id);
            s.deals = s.deals.filter((d) => d.customerId !== id);
            s.estimates = s.estimates.filter((e) => e.customerId !== id);
            store.save();
            ui.toast('Client deleted');
          });
        } },
        { label: 'Close', kind: 'primary' },
      ],
    });
  };

  MT.views.customers = view;
})();
