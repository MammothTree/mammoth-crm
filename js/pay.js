/* Mammoth CRM — Square online payments through the Square connector (js/pay-connector.js).
   The CRM asks the connector for a Square payment link for an exact amount (a deposit or an invoice balance), remembers it on
   the deal (deal.payLinks), and checks every couple of minutes whether it was paid. A paid link is recorded as a Square payment
   on the job and its invoice, so the invoice shows paid without anyone typing it in. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const CHECK_EVERY = 2 * 60000;
  const KEEP_CHECKING_DAYS = 120;

  const localDate = (iso) => { const d = new Date(iso); return isNaN(d) ? u.todayISO() : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  const pay = {
    cfg() {
      const sq = store.state.integrations.square;
      if (!sq.seenIds) sq.seenIds = [];
      if (!sq.connector) sq.connector = { url: '', key: '', locationId: '', locations: [], env: '', lastCheck: '', lastError: '' };
      const c = sq.connector;
      if (!c.key) { c.key = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12); store.save(true); }
      return c;
    },
    /** The connector is set up (sending and customer pages work). */
    connected() { const c = pay.cfg(); return !!(c.url && c.key); },
    /** Square pay links work (the connector has a working SQUARE_TOKEN). */
    ready() { const c = pay.cfg(); return !!(c.url && c.key && c.square !== false); },

    async get(action, params) {
      const c = pay.cfg();
      const q = new URLSearchParams(Object.assign({ key: c.key, action }, params || {}));
      let r;
      try { r = await fetch(c.url + (c.url.includes('?') ? '&' : '?') + q.toString(), { cache: 'no-store' }); }
      catch (e) { throw new Error('Could not reach the Square connector. Check your internet connection and the web app address.'); }
      return pay.parse(r);
    },
    async post(action, body) {
      const c = pay.cfg();
      let r;
      try { r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key: c.key, action }, body || {})) }); }
      catch (e) { throw new Error('Could not reach the Square connector.'); }
      return pay.parse(r);
    },
    async parse(r) {
      let j = null;
      try { j = await r.json(); } catch (e) { throw new Error('The Square connector sent back something unexpected. Make sure the web app is deployed with access for "Anyone".'); }
      if (j && j.error) throw new Error(pay.friendly(j.error));
      return j;
    },
    friendly(msg) {
      msg = String(msg);
      if (msg === 'bad key') return 'The connector rejected the key. Copy the connector code from Integrations → Square again (it contains your key), paste it into Apps Script, and deploy a new version.';
      if (msg === 'no token') return 'Add your Square access token in Apps Script: Project Settings → Script properties → SQUARE_TOKEN.';
      if (/Square 401/.test(msg)) return 'Square rejected the access token. Copy the Production access token from the Square Developer dashboard into SQUARE_TOKEN again.';
      if (/Square 403/.test(msg)) return 'Square says the token isn\'t allowed to do this. Use the Production access token for your own Square account.';
      return msg;
    },

    /** Checks the connection and loads the Square locations. */
    async test() {
      const c = pay.cfg();
      const st = await pay.get('status');
      c.locations = st.locations || [];
      c.env = st.env || '';
      c.version = st.version || 1;
      // Version 1 connectors only did Square; version 2 also sends documents and may run without a Square token.
      c.square = st.version >= 2 ? !!st.square : true;
      c.docs = st.version >= 2;
      const active = c.locations.filter((l) => l.status === 'ACTIVE');
      if (!c.locationId || !c.locations.some((l) => l.id === c.locationId)) c.locationId = (active[0] || c.locations[0] || {}).id || '';
      c.lastError = st.squareError ? pay.friendly(st.squareError) : '';
      store.save(true);
      return st;
    },

    /** Unpaid links that are still worth checking. */
    openLinks() {
      const cutoff = u.addDays(u.todayISO(), -KEEP_CHECKING_DAYS);
      const out = [];
      store.state.deals.forEach((d) => (d.payLinks || []).forEach((l) => { if (!l.paidAt && !l.canceled && l.orderId && (l.createdAt || '').slice(0, 10) >= cutoff) out.push({ d, l }); }));
      return out;
    },

    /** The unpaid link of a job for this purpose and amount, if there is one. */
    findLink(deal, purpose, amount, invoiceId) {
      return (deal.payLinks || []).find((l) => !l.paidAt && !l.canceled && l.purpose === purpose && Math.abs(l.amount - amount) < 0.005 && (!invoiceId || l.invoiceId === invoiceId)) || null;
    },

    /** Creates (or reuses) a Square payment link for an exact amount on a job. Returns the link record. */
    async link(deal, opts) {
      const amount = Math.round(u.num(opts.amount) * 100) / 100;
      if (!(amount >= 1)) throw new Error('The amount must be at least $1.00.');
      const existing = pay.findLink(deal, opts.purpose, amount, opts.invoiceId);
      if (existing) return existing;
      const c = pay.cfg();
      const cust = store.customer(deal.customerId) || {};
      const co = store.state.settings.company;
      const r = await pay.post('link', {
        amount: Math.round(amount * 100),
        name: (opts.name || deal.title || 'Tree service') + ' (' + (co.name || 'Mammoth Tree Service') + ')',
        note: [opts.ref, cust.name, deal.title].filter(Boolean).join(' · '),
        email: cust.email || '',
        location: c.locationId || '',
      });
      if (!r || !r.url) throw new Error('Square didn\'t return a payment link.');
      const live = store.deal(deal.id) || deal;
      const rec = { id: u.uid('pl'), linkId: r.id, url: r.url, orderId: r.orderId, amount, purpose: opts.purpose, invoiceId: opts.invoiceId || '', estimateId: opts.estimateId || '', createdAt: new Date().toISOString(), paid: 0, paidAt: '' };
      live.payLinks = (live.payLinks || []).concat(rec);
      store.log('message', 'Square pay link for ' + u.money(amount, true) + ' (' + (opts.purpose === 'deposit' ? 'deposit' : 'invoice') + ') created for "' + live.title + '"', { customerId: live.customerId, dealId: live.id });
      store.save(true);
      return rec;
    },

    /** Asks the connector which links were paid and records those payments. Returns how many were recorded. */
    async check(opts) {
      opts = opts || {};
      if (!pay.ready() || pay.checking) return 0;
      const open = pay.openLinks();
      const c = pay.cfg();
      if (!open.length) { c.lastCheck = new Date().toISOString(); return 0; }
      pay.checking = true;
      let added = 0;
      try {
        const since = open.reduce((m, x) => (x.l.createdAt < m ? x.l.createdAt : m), open[0].l.createdAt);
        const r = await pay.get('check', { orders: open.map((x) => x.l.orderId).join(','), since: new Date(new Date(since).getTime() - 3600000).toISOString() });
        const sq = store.state.integrations.square;
        (r.payments || []).forEach((p) => {
          const hit = open.find((x) => x.l.orderId === p.orderId);
          if (!hit || !(p.amount > 0)) return;
          const d = store.deal(hit.d.id) || hit.d;
          const l = (d.payLinks || []).find((x) => x.id === hit.l.id) || hit.l;
          d.payments = d.payments || [];
          if (d.payments.some((x) => x.squareId === p.id) || sq.seenIds.includes(p.id)) return;
          let invoiceId = l.invoiceId;
          if (!invoiceId) { const inv = store.invoicesFor(d.id).find((v) => calc.invoiceBalance(v) > 0); invoiceId = inv ? inv.id : ''; }
          d.payments.push({ id: u.uid('pay'), amount: p.amount, date: localDate(p.at), method: 'Square', invoiceId, squareId: p.id, deposit: l.purpose === 'deposit' || undefined, note: p.card ? 'Online, ' + p.card.trim() : 'Online' });
          sq.seenIds.push(p.id);
          l.paid = Math.round((u.num(l.paid) + p.amount) * 100) / 100;
          if (l.paid >= l.amount - 0.005) l.paidAt = p.at || new Date().toISOString();
          const inv = invoiceId && store.invoice(invoiceId);
          if (inv && inv.status === 'draft') inv.status = 'sent';
          if (l.purpose === 'deposit') {
            const est = l.estimateId && store.estimate(l.estimateId);
            if (est && est.status !== 'accepted') est.status = 'accepted';
            if (d.stage !== 'won') store.setStage(d, 'won');
          }
          store.log('payment', 'Square payment of ' + u.money(p.amount, true) + ' received online from ' + store.customerName(d.customerId) + (l.purpose === 'deposit' ? ' (deposit)' : '') + ' for "' + d.title + '"', { customerId: d.customerId, dealId: d.id });
          added++;
          ui.toast('Paid online: ' + u.money(p.amount, true) + ' from ' + store.customerName(d.customerId) + (l.purpose === 'deposit' ? ' (deposit)' : ''));
        });
        c.lastCheck = new Date().toISOString();
        c.lastError = '';
        if (added) store.save(); else store.save(true);
      } catch (e) {
        c.lastError = e.message;
        if (!opts.silent) throw e;
      } finally { pay.checking = false; }
      return added;
    },

    /** Called on a timer by the app: checks open links every couple of minutes while the CRM is open. */
    autoCheck() {
      if (!pay.ready() || navigator.onLine === false) return;
      if (MT.app.idle && !MT.app.idle()) return;
      if (pay.lastRun && Date.now() - pay.lastRun < CHECK_EVERY - 5000) return;
      if (!pay.openLinks().length) return;
      pay.lastRun = Date.now();
      pay.check({ silent: true }).catch(() => {});
    },

    /** Recent Square payments (card reader, Square invoices, links) not yet in the CRM, for the match dialog. */
    async recent(days) {
      const r = await pay.get('payments', { days: days || 30 });
      const sq = store.state.integrations.square;
      const recorded = new Set();
      store.state.deals.forEach((d) => (d.payments || []).forEach((p) => { if (p.squareId) recorded.add(p.squareId); }));
      return (r.payments || []).filter((p) => p.amount > 0 && !recorded.has(p.id) && !sq.seenIds.includes(p.id))
        .map((p) => ({ id: p.id, date: localDate(p.at), amount: p.amount, name: p.name || p.email || '', desc: [p.card, p.note, p.receipt ? 'Receipt ' + p.receipt : ''].filter(Boolean).join(' · ') }));
    },

    /** Stops a link (e.g. the deposit was paid by check instead), so it isn't paid twice. Turns it off in Square too. */
    cancel(deal, purpose, invoiceId) {
      (deal.payLinks || []).forEach((l) => {
        if (l.paidAt || l.canceled || (purpose && l.purpose !== purpose) || (invoiceId && l.invoiceId !== invoiceId)) return;
        l.canceled = new Date().toISOString();
        if (pay.ready() && l.linkId) pay.post('cancel', { id: l.linkId }).catch(() => {});
      });
    },

    /** The best pay-online address for a job: its Square link for this purpose, else the invoice's or the general link. */
    urlFor(deal, purpose, amount, invoiceId) {
      const l = deal && pay.findLink(deal, purpose, amount, invoiceId);
      return l ? l.url : '';
    },
  };

  MT.pay = pay;
})();
