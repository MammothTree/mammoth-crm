/* Mammoth CRM — property history: every job we've done for a homeowner, year by year, what was done at each property,
   and what they've spent with us. Opens from the client card; it can be printed or emailed to the homeowner as a
   tree care record for their home. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;

  const addrOf = (c) => [c.address, c.city].filter(Boolean).join(', ');
  const norm = (a) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const history = {
    /** Won jobs for a client, newest first, with what was done, billed, paid, and photos. */
    jobs(customerId) {
      const s = store.state;
      const c = store.customer(customerId) || {};
      return s.deals.filter((d) => d.customerId === customerId && d.stage === 'won').map((d) => {
        const e = d.estimateId ? store.estimate(d.estimateId) : null;
        const invs = store.invoicesFor(d.id).filter((x) => x.status !== 'void');
        const items = invs.length ? [].concat(...invs.map((x) => x.items)) : e ? e.items : [];
        const work = [];
        items.forEach((x) => { const t = String(x.desc || '').trim(); if (t && !work.includes(t) && !/^crew time$/i.test(t)) work.push(t); });
        const billed = invs.length ? u.sum(invs, (x) => calc.invoiceTotals(x).total) : u.num(d.value);
        const paid = u.sum(d.payments || [], (p) => p.amount);
        const date = d.scheduledDate || d.closedAt || d.createdAt || '';
        const photos = u.sum((s.jobFolders || []).filter((f) => f.dealId === d.id), (f) => (f.media || []).length);
        return {
          deal: d, date, year: date.slice(0, 4), done: !d.scheduledDate || d.scheduledDate <= u.todayISO(),
          address: (e && e.jobAddress) || addrOf(c), work, billed, paid, invoices: invs.map((x) => x.number), photos,
          permit: d.permit && d.permit.status === 'approved' ? d.permit : null,
        };
      }).sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    /** Estimates they haven't gone ahead with yet (a reason to call back). */
    quotes(customerId) {
      return store.state.estimates.filter((e) => e.customerId === customerId && (e.status === 'sent' || e.status === 'declined'))
        .map((e) => ({ e, total: calc.estimate(e, store.state).total })).sort((a, b) => (a.e.date < b.e.date ? 1 : -1));
    },
    /** Jobs grouped by year: [{year, jobs, billed, paid}], newest year first. */
    byYear(jobs) {
      const m = {};
      jobs.forEach((j) => { const y = j.year || 'Undated'; (m[y] = m[y] || { year: y, jobs: [], billed: 0, paid: 0 }); m[y].jobs.push(j); m[y].billed += j.billed; m[y].paid += j.paid; });
      return Object.values(m).sort((a, b) => (a.year < b.year ? 1 : -1));
    },
    properties(jobs) {
      const seen = {};
      jobs.forEach((j) => { const k = norm(j.address); if (k && !seen[k]) seen[k] = j.address; });
      return Object.values(seen);
    },
    filter(jobs, address) { return address ? jobs.filter((j) => norm(j.address) === norm(address)) : jobs; },

    /** The homeowner's copy (for print, PDF, and email). Amounts are what they paid. */
    docOpts(customerId, address) {
      const s = store.state, co = s.settings.company;
      const c = store.customer(customerId) || {};
      const jobs = history.filter(history.jobs(customerId), address).filter((j) => j.done);
      const years = history.byYear(jobs);
      const total = u.sum(jobs, (j) => j.paid);
      const first = years.length ? years[years.length - 1].year : '';
      const body = years.length ? `<div class="pr-sumrow"><span><b>${jobs.length}</b> ${jobs.length === 1 ? 'visit' : 'visits'}${first ? ' since ' + u.esc(first) : ''}</span><span>Total paid <b>${u.money(total, true)}</b></span></div>` +
        years.map((y) => `<div class="pr-hy">${u.esc(y.year)}<span>${u.money(y.paid, true)}</span></div>
          <table class="pr-hist"><tbody>${y.jobs.map((j) => `<tr><td>${u.fmtDate(j.date)}</td><td><b>${u.esc(j.deal.title)}</b>${j.work.length ? '<div class="pr-work">' + j.work.map(u.esc).join(' · ') + '</div>' : ''}${!address && j.address ? '<div class="pr-work">' + u.esc(j.address) + '</div>' : ''}${j.permit ? '<div class="pr-work">Permit' + (j.permit.town ? ' (' + u.esc(j.permit.town) + ')' : '') + (j.permit.number ? ' #' + u.esc(j.permit.number) : '') + '</div>' : ''}</td><td>${u.money(j.paid, true)}</td></tr>`).join('')}</tbody></table>`).join('')
        : '<p>No completed work on record yet.</p>';
      return {
        title: 'Property history',
        meta: [['Property', address || addrOf(c) || ''], ['Prepared', u.fmtDate(u.todayISO())]],
        parties: [{ heading: 'Homeowner', lines: [c.name, c.company, address || addrOf(c), c.phone, c.email] }, { heading: 'Your tree care team', lines: [co.name, co.phone, co.email] }],
        bodyHTML: body,
        notes: 'A record of the tree work done at your property. Keep it with your home records: it\'s useful for insurance, for selling the home, and for planning future care. Questions about any of it? Call ' + (co.phone || 'us') + '.',
        footer: s.settings.estimateFooter || '',
      };
    },
    filename(customerId) { return ('Property history - ' + (store.customerName(customerId) || 'client') + ' - ' + (store.state.settings.company.name || '')).replace(/[\\/:*?"<>|]+/g, '') + '.pdf'; },

    /** Owner's view: totals, spending by year, every job, and open quotes, with print and email to the homeowner. */
    open(customerId, address) {
      const c = store.customer(customerId);
      if (!c) return;
      const all = history.jobs(customerId);
      const props = history.properties(all);
      const jobs = history.filter(all, address);
      const years = history.byYear(jobs);
      const quotes = history.quotes(customerId);
      const total = u.sum(jobs, (j) => j.paid), billed = u.sum(jobs, (j) => j.billed);
      const thisYear = years.find((y) => y.year === u.todayISO().slice(0, 4));
      const maxY = Math.max(1, ...years.map((y) => y.paid));
      const first = years.length ? years[years.length - 1].year : '';
      const span = first ? Math.max(1, +u.todayISO().slice(0, 4) - +first + 1) : 1;
      ui.modal({
        title: 'Property history: ' + c.name,
        size: 'lg',
        body: `${props.length > 1 ? `<div class="chips"><span class="chips-label">Property:</span><button class="chip ${!address ? 'on' : ''}" data-prop="">All (${props.length})</button>${props.map((p) => `<button class="chip ${norm(p) === norm(address) ? 'on' : ''}" data-prop="${u.esc(p)}">${u.esc(p)}</button>`).join('')}</div>` : `<p class="hint">${u.esc(props[0] || addrOf(c) || 'No address on file')}</p>`}
          <section class="kpis hist-kpis">
            <article class="kpi"><h3 class="kpi-label">Spent with us</h3><div class="kpi-value">${u.money(total)}</div><div class="kpi-sub">${billed - total > 0.5 ? u.money(billed - total) + ' still owed' : 'All paid'}</div></article>
            <article class="kpi"><h3 class="kpi-label">Jobs</h3><div class="kpi-value">${jobs.length}</div><div class="kpi-sub">${first ? 'Client since ' + first : 'No jobs yet'}</div></article>
            <article class="kpi"><h3 class="kpi-label">This year</h3><div class="kpi-value">${u.money(thisYear ? thisYear.paid : 0)}</div><div class="kpi-sub">${thisYear ? thisYear.jobs.length + (thisYear.jobs.length === 1 ? ' job' : ' jobs') : 'Nothing yet this year'}</div></article>
            <article class="kpi"><h3 class="kpi-label">Average per year</h3><div class="kpi-value">${u.money(total / span)}</div><div class="kpi-sub">Over ${span} ${span === 1 ? 'year' : 'years'}</div></article>
          </section>
          ${years.length ? `<h4 class="sub-h">Spent by year</h4><div class="hist-bars">${years.slice().reverse().map((y) => `<div class="hist-bar"><span class="hist-y">${u.esc(y.year)}</span><span class="hist-track"><i style="width:${Math.max(2, (y.paid / maxY) * 100)}%"></i></span><b>${u.money(y.paid)}</b></div>`).join('')}</div>` : ''}
          ${years.map((y) => `<h4 class="sub-h hist-year"><span>${u.esc(y.year)}</span><span>${u.money(y.paid)} paid${y.billed - y.paid > 0.5 ? ' · ' + u.money(y.billed - y.paid) + ' owed' : ''}</span></h4>
            <ul class="list compact">${y.jobs.map((j) => `<li class="list-row" data-hdeal="${j.deal.id}"><div class="grow"><div class="row-title">${u.esc(j.deal.title)}${j.done ? '' : ' ' + ui.badge('Scheduled', 'info')}</div>
              <div class="row-sub">${u.fmtDate(j.date)}${j.work.length ? ' · ' + u.esc(j.work.slice(0, 4).join(', ')) + (j.work.length > 4 ? '…' : '') : ''}${props.length > 1 && !address ? ' · ' + u.esc(j.address) : ''}${j.invoices.length ? ' · ' + u.esc(j.invoices.join(', ')) : ''}${j.permit ? ' · permit' + (j.permit.number ? ' #' + u.esc(j.permit.number) : '') : ''}</div></div>
              ${j.photos ? `<button class="btn ghost sm" data-hphotos="${j.deal.id}">${j.photos} ${j.photos === 1 ? 'photo' : 'photos'}</button>` : ''}<div class="amt">${u.money(j.paid)}${j.billed - j.paid > 0.5 ? '<div class="row-sub owed">' + u.money(j.billed - j.paid) + ' due</div>' : ''}</div></li>`).join('')}</ul>`).join('') || ui.empty('No jobs done for ' + c.name + ' yet.')}
          ${quotes.length ? `<h4 class="sub-h">Quoted, not done yet</h4><p class="hint">Good reasons to follow up, for example before next season.</p>
            <ul class="list compact">${quotes.map((q) => `<li class="list-row" data-hest="${q.e.id}"><div class="grow"><div class="row-title">${u.esc(q.e.number)}: ${u.esc(q.e.title)}</div><div class="row-sub">${u.fmtDate(q.e.date)} · ${q.e.status === 'declined' ? 'Declined' : 'Waiting on the customer'}</div></div><div class="amt">${u.money(q.total)}</div></li>`).join('')}</ul>` : ''}`,
        onMount(b, close) {
          u.qsa('[data-prop]', b).forEach((n) => n.addEventListener('click', () => { close(); history.open(customerId, n.dataset.prop); }));
          u.qsa('[data-hdeal]', b).forEach((n) => n.addEventListener('click', (e) => { if (e.target.closest('[data-hphotos]')) return; close(); MT.views.pipeline.openDeal(n.dataset.hdeal); }));
          u.qsa('[data-hphotos]', b).forEach((n) => n.addEventListener('click', () => { close(); MT.views.jobcam.openFolderForDeal(n.dataset.hphotos); }));
          u.qsa('[data-hest]', b).forEach((n) => n.addEventListener('click', () => { close(); MT.app.go('estimator', { id: n.dataset.hest }); }));
        },
        actions: [
          { label: 'Print / save PDF', kind: 'ghost', left: true, keepOpen: true, onClick: () => MT.printDoc(history.docOpts(customerId, address)) },
          { label: 'Close', kind: 'ghost' },
          { label: 'Email to homeowner', kind: 'primary', keepOpen: true, onClick: () => history.email(customerId, address) },
        ],
      });
    },

    email(customerId, address) {
      const c = store.customer(customerId) || {};
      const co = store.state.settings.company;
      MT.mail.compose({
        title: 'Email the property history',
        to: c.email || '',
        subject: 'Your property\'s tree care history from ' + co.name,
        body: `Hi ${u.firstName(c.name) || 'there'},\n\nThank you for trusting us with your trees. Attached is a record of all the work we've done at ${address || addrOf(c) || 'your property'}, year by year. It's handy to keep with your home records.\n\nIf you'd like us to take a look at anything this season, just reply or call ${co.phone}.\n\nThank you,\n${co.owner}\n${co.name}`,
        attach: { filename: history.filename(customerId), make: () => MT.docs.pdf(history.docOpts(customerId, address), history.filename(customerId)) },
        log: 'Property history', meta: { customerId },
      });
    },
  };

  MT.history = history;
})();
