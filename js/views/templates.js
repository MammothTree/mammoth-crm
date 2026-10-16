/* Mammoth CRM — Message & document templates */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;

  const CATEGORIES = ['Email', 'Text message', 'Contract', 'Other'];
  const FIELDS = [
    ['customer.firstName', 'First name'], ['customer.name', 'Full name'], ['customer.address', 'Address'], ['customer.phone', 'Customer phone'],
    ['deal.title', 'Job title'], ['deal.value', 'Deal value'], ['deal.balance', 'Balance due'], ['deal.scheduledDate', 'Job date'],
    ['estimate.number', 'Estimate #'], ['estimate.total', 'Estimate total'],
    ['company.name', 'Company name'], ['company.phone', 'Company phone'], ['company.reviewLink', 'Review link'], ['invoice.number', 'Invoice #'], ['invoice.balance', 'Invoice balance'], ['invoice.dueDate', 'Invoice due date'], ['owner.name', 'Your name'], ['today', 'Today\'s date'],
  ];

  const view = { title: 'Templates', selected: null, customerId: '', dealId: '', cat: '' };

  function context() {
    const s = store.state;
    const c = store.customer(view.customerId) || null;
    const d = (view.dealId && store.deal(view.dealId)) || (c && s.deals.filter((x) => x.customerId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]) || null;
    const e = d && d.estimateId ? store.estimate(d.estimateId) : c ? s.estimates.filter((x) => x.customerId === c.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
    const co = s.settings.company;
    const inv = d ? store.invoicesFor(d.id).slice(-1)[0] : c ? s.invoices.filter((x) => x.customerId === c.id && x.status !== 'void').sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
    return {
      'customer.firstName': c ? u.firstName(c.name) : '', 'customer.name': c ? c.name : '', 'customer.address': c ? c.address + (c.city ? ', ' + c.city : '') : '', 'customer.phone': c ? c.phone : '',
      'deal.title': d ? d.title : '', 'deal.value': d ? u.money(d.value) : '', 'deal.balance': d ? u.money(d.stage === 'won' ? calc.balance(d) : d.value, true) : '', 'deal.scheduledDate': d && d.scheduledDate ? u.fmtDate(d.scheduledDate, { weekday: 'long', month: 'long', day: 'numeric' }) : '',
      'estimate.number': e ? e.number : '', 'estimate.total': e ? u.money(calc.estimate(e, s).total, true) : '',
      'company.name': co.name, 'company.phone': co.phone,
      'company.reviewLink': co.reviewLink || (s.integrations && s.integrations.google && s.integrations.google.reviewUrl) || '',
      'invoice.number': inv ? inv.number : '', 'invoice.balance': inv ? u.money(calc.invoiceBalance(inv), true) : '', 'invoice.dueDate': inv ? u.fmtDate(inv.dueDate) : '', 'owner.name': co.owner, today: u.fmtDate(u.todayISO(), { month: 'long', day: 'numeric', year: 'numeric' }),
    };
  }

  function merge(text, ctx) {
    return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => (k in ctx ? (ctx[k] || '[' + k + ']') : m));
  }

  view.render = function (root) {
    const s = store.state;
    const p = MT.app.params;
    if (p.customerId) { view.customerId = p.customerId; view.dealId = ''; MT.app.params = {}; }
    const list = s.templates.filter((t) => !view.cat || t.category === view.cat);
    if (!view.selected || !s.templates.find((t) => t.id === view.selected)) view.selected = (list[0] || s.templates[0] || {}).id || null;
    const t = s.templates.find((x) => x.id === view.selected);
    const custs = s.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }));
    const deals = view.customerId ? s.deals.filter((d) => d.customerId === view.customerId).map((d) => ({ value: d.id, label: d.title })) : [];

    root.innerHTML = `
      <div class="tpl-layout">
        <aside class="panel tpl-list">
          <div class="toolbar tight">
            <select class="input" id="tp-cat" aria-label="Category">${u.options(CATEGORIES, view.cat, 'All templates')}</select>
            <button class="btn primary sm" id="tp-new">New</button>
          </div>
          <ul class="nav-list">${list.map((x) => `<li><button class="${x.id === view.selected ? 'on' : ''}" data-id="${x.id}"><span>${u.esc(x.name)}</span><small>${u.esc(x.category)}</small></button></li>`).join('') || '<li>' + ui.empty('No templates in this category.') + '</li>'}</ul>
        </aside>
        ${t ? `
        <section class="panel tpl-edit">
          <div class="form-grid">
            <label class="field"><span>Template name</span><input class="input" id="tp-name" value="${u.esc(t.name)}"></label>
            <label class="field"><span>Type</span><select class="input" id="tp-catsel">${u.options(CATEGORIES, t.category)}</select></label>
            <label class="field span-2 ${t.category === 'Email' ? '' : 'is-hidden'}" id="tp-subj-wrap"><span>Email subject</span><input class="input" id="tp-subj" value="${u.esc(t.subject)}"></label>
            <label class="field span-2"><span>Message</span><textarea class="input mono-ish" id="tp-body" rows="14">${u.esc(t.body)}</textarea></label>
          </div>
          <div class="chips" aria-label="Insert a merge field">
            <span class="chips-label">Insert:</span>${FIELDS.map((f) => `<button class="chip" data-field="${f[0]}" title="{{${f[0]}}}">${u.esc(f[1])}</button>`).join('')}
          </div>
          <div class="btn-row">
            <button class="btn danger-ghost" id="tp-del">Delete</button>
            <button class="btn ghost" id="tp-dup">Duplicate</button>
            <span class="spacer"></span>
            <button class="btn primary" id="tp-save">Save template</button>
          </div>
        </section>
        <section class="panel tpl-preview">
          <div class="panel-head"><h3>Preview</h3></div>
          <div class="form-grid one">
            <label class="field"><span>Fill in for customer</span><select class="input" id="tp-cust">${u.options(custs, view.customerId, 'Sample (no customer)')}</select></label>
            ${deals.length ? `<label class="field"><span>Deal</span><select class="input" id="tp-deal">${u.options(deals, view.dealId, 'Most recent deal')}</select></label>` : ''}
          </div>
          <div class="preview" id="tp-prev"></div>
          <div class="btn-row">
            <button class="btn primary" id="tp-copy">Copy message</button>
            <a class="btn ghost" id="tp-mail" href="#">Open in email</a>
            <a class="btn ghost" id="tp-sms" href="#">Open in texts</a>
          </div>
        </section>` : `<section class="panel tpl-edit">${ui.empty('Create a template to reuse emails, texts, and contract language.')}</section>`}
      </div>`;

    u.qs('#tp-cat', root).addEventListener('change', (e) => { view.cat = e.target.value; view.selected = null; view.render(root); });
    u.qs('#tp-new', root).addEventListener('click', () => {
      const n = { id: u.uid('t'), name: 'New template', category: view.cat || 'Email', subject: '', body: 'Hi {{customer.firstName}},\n\n\n\n{{owner.name}}\n{{company.name}}' };
      s.templates.unshift(n);
      view.selected = n.id;
      store.save();
    });
    u.qsa('.nav-list button[data-id]', root).forEach((b) => b.addEventListener('click', () => { view.selected = b.dataset.id; view.render(root); }));
    if (!t) return;

    const body = u.qs('#tp-body', root), subj = u.qs('#tp-subj', root);
    const prev = () => {
      const ctx = context();
      const c = store.customer(view.customerId);
      const subject = merge(subj.value, ctx), text = merge(body.value, ctx);
      const cat = u.qs('#tp-catsel', root).value;
      u.qs('#tp-prev', root).innerHTML = (cat === 'Email' ? '<div class="prev-subj">' + u.esc(subject) + '</div>' : '') +
        '<div class="prev-body">' + u.esc(text).replace(/\[([\w.]+)\]/g, '<mark title="No data for this field">[$1]</mark>') + '</div>';
      u.qs('#tp-mail', root).href = 'mailto:' + encodeURIComponent(c && c.email ? c.email : '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
      u.qs('#tp-sms', root).href = 'sms:' + (c && c.phone ? c.phone.replace(/[^\d+]/g, '') : '') + '?&body=' + encodeURIComponent(text);
      u.qs('#tp-subj-wrap', root).classList.toggle('is-hidden', cat !== 'Email');
      return { subject, text };
    };
    prev();
    [body, subj].forEach((n) => n.addEventListener('input', prev));
    u.qs('#tp-catsel', root).addEventListener('change', prev);
    u.qs('#tp-cust', root).addEventListener('change', (e) => { view.customerId = e.target.value; view.dealId = ''; view.render(root); });
    const ds = u.qs('#tp-deal', root);
    if (ds) ds.addEventListener('change', (e) => { view.dealId = e.target.value; prev(); });
    let lastFocus = body;
    [body, subj].forEach((n) => n.addEventListener('focus', () => { lastFocus = n; }));
    u.qsa('[data-field]', root).forEach((b) => b.addEventListener('click', () => {
      const tok = '{{' + b.dataset.field + '}}';
      const n = lastFocus;
      const a = n.selectionStart != null ? n.selectionStart : n.value.length, z = n.selectionEnd != null ? n.selectionEnd : n.value.length;
      n.value = n.value.slice(0, a) + tok + n.value.slice(z);
      n.focus();
      n.setSelectionRange(a + tok.length, a + tok.length);
      prev();
    }));
    u.qs('#tp-save', root).addEventListener('click', () => {
      t.name = u.qs('#tp-name', root).value.trim() || 'Untitled template';
      t.category = u.qs('#tp-catsel', root).value;
      t.subject = subj.value;
      t.body = body.value;
      store.save();
      ui.toast('Template saved');
    });
    u.qs('#tp-dup', root).addEventListener('click', () => {
      const n = Object.assign({}, t, { id: u.uid('t'), name: t.name + ' (copy)', subject: subj.value, body: body.value });
      s.templates.splice(s.templates.indexOf(t) + 1, 0, n);
      view.selected = n.id;
      store.save();
      ui.toast('Template duplicated');
    });
    u.qs('#tp-del', root).addEventListener('click', () => ui.confirm('Delete "' + t.name + '"?', 'This template will be removed permanently.', 'Delete template', () => {
      store.remove('templates', t.id);
      view.selected = null;
      store.save();
      ui.toast('Template deleted');
    }));
    u.qs('#tp-copy', root).addEventListener('click', () => {
      const r = prev();
      const cat = u.qs('#tp-catsel', root).value;
      u.copyText(cat === 'Email' && r.subject ? 'Subject: ' + r.subject + '\n\n' + r.text : r.text).then(() => {
        ui.toast('Copied to clipboard');
        if (view.customerId) { store.log('message', 'Used template "' + t.name + '"', { customerId: view.customerId }); store.save(true); }
      });
    });
  };

  MT.views.templates = view;
})();
