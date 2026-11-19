/* Mammoth CRM — Google review requests.
   After a job is paid, ask the customer for a Google review by email (sent from your Google account through the connector)
   or by text. Each request is remembered on the job (deal.reviewAsked) so nobody is asked twice.
   Yelp's rules don't allow asking customers for reviews, so requests only ever point to Google. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const WINDOW_DAYS = 45;

  const reviews = {
    /** Your "leave a review" link: the one you pasted, or the one found through Google Places. */
    link() {
      const s = store.state;
      return String(s.settings.company.reviewLink || (s.integrations && s.integrations.google && s.integrations.google.reviewUrl) || '').trim();
    },

    /** Paid jobs from the last few weeks that haven't been asked yet (newest first). */
    ready() {
      const s = store.state;
      const cutoff = u.addDays(u.todayISO(), -WINDOW_DAYS);
      const seen = new Set();
      const out = [];
      s.invoices.filter((inv) => inv.status !== 'void' && calc.invoiceStatus(inv) === 'paid').forEach((inv) => {
        const d = store.deal(inv.dealId);
        if (!d || d.reviewAsked || seen.has(d.id)) return;
        const pays = calc.invoicePayments(inv);
        const last = pays.reduce((m, p) => (p.date > m ? p.date : m), '');
        if (!last || last < cutoff) return;
        seen.add(d.id);
        out.push({ deal: d, invoice: inv, paidOn: last });
      });
      return out.sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1));
    },

    /** The message, from your "review request" template when you have one. */
    message(deal) {
      const s = store.state, co = s.settings.company;
      const c = store.customer(deal.customerId) || {};
      const tpl = (s.templates || []).find((t) => /reviewLink/.test(t.body || '') && (t.category || 'Email') === 'Email') || (s.templates || []).find((t) => /reviewLink/.test(t.body || ''));
      const fields = {
        'customer.firstName': u.firstName(c.name) || 'there', 'customer.name': c.name || '', 'deal.title': deal.title || '',
        'company.name': co.name || '', 'company.phone': co.phone || '', 'company.reviewLink': reviews.link(), 'owner.name': co.owner || '',
      };
      const fill = (t) => String(t || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => (k in fields ? fields[k] : ''));
      const body = tpl ? fill(tpl.body)
        : `Hi ${fields['customer.firstName']},\n\nThank you for choosing ${co.name}. We hope you're happy with how everything turned out.\n\nIf you have a minute, a quick Google review helps a small local business like ours more than you know:\n${reviews.link()}\n\nThanks again,\n${co.owner}\n${co.name}`;
      return {
        subject: tpl && tpl.subject ? fill(tpl.subject) : 'Thank you from ' + co.name,
        body,
        sms: `Hi ${fields['customer.firstName']}, it's ${co.owner} with ${co.name}. Thanks again for choosing us! If you have a minute, a quick Google review would mean a lot: ${reviews.link()}`,
      };
    },

    mark(deal, via, to, confirmed) {
      const d = store.deal(deal.id) || deal;
      d.reviewAsked = { at: new Date().toISOString(), via, to: to || '', confirmed: !!confirmed };
      if (via !== 'skip') store.log('message', 'Asked ' + store.customerName(d.customerId) + ' for a Google review by ' + (via === 'email' ? 'email' : 'text') + (to ? ' (' + to + ')' : '') + (confirmed ? '' : ', you confirmed'), { customerId: d.customerId, dealId: d.id });
      store.save();
    },

    /** Request window: email (or text) the customer your Google review link. */
    open(dealId, done) {
      const deal = store.deal(dealId);
      if (!deal) return;
      if (!reviews.link()) {
        ui.modal({ title: 'Add your Google review link first', size: 'sm', body: '<p>Paste your "leave a review" link once in Integrations → Google reviews. It takes a minute and needs no API key.</p>',
          actions: [{ label: 'Later' }, { label: 'Go to Integrations', kind: 'primary', onClick: () => { MT.views.integrations.open = 'google'; MT.app.go('integrations'); } }] });
        return;
      }
      const c = store.customer(deal.customerId) || {};
      const co = store.state.settings.company;
      const live = MT.docs && MT.docs.ready();
      const m = reviews.message(deal);
      ui.modal({
        title: 'Ask ' + (u.firstName(c.name) || 'the customer') + ' for a Google review',
        body: `${deal.reviewAsked && deal.reviewAsked.via !== 'skip' ? `<p class="hint">Already asked ${u.fmtDate(deal.reviewAsked.at.slice(0, 10))} by ${deal.reviewAsked.via === 'email' ? 'email' : 'text'}.</p>` : ''}
          <div class="form-grid">
            <label class="field"><span>Email</span><input class="input" type="email" id="rv-to" value="${u.esc(c.email || '')}"></label>
            <label class="field"><span>Mobile</span><input class="input" type="tel" id="rv-tel" value="${u.esc(c.phone || '')}"></label>
            <label class="field span-2"><span>Subject</span><input class="input" id="rv-subj" value="${u.esc(m.subject)}"></label>
            <label class="field span-2"><span>Email message</span><textarea class="input" rows="7" id="rv-body">${u.esc(m.body)}</textarea></label>
            <label class="field span-2"><span>Text message</span><textarea class="input" rows="3" id="rv-sms">${u.esc(m.sms)}</textarea></label>
          </div>
          <p class="hint">${live ? 'Email goes out from your Gmail' + (MT.mail.from() ? ' (' + u.esc(MT.mail.from()) + ')' : '') + ' with a "Leave a Google review" button.' : 'Email opens Gmail with the message ready. Set up the connector in Integrations to send straight from the CRM.'} Yelp doesn't allow asking customers for reviews, so this only links to Google.</p>
          <p class="hint" id="rv-status"></p>`,
        actions: [
          { label: 'Don\'t ask', kind: 'ghost', left: true, onClick: () => { reviews.mark(deal, 'skip', '', true); if (done) done(); } },
          { label: 'Send by text', kind: 'ghost', keepOpen: true, onClick: (b, close) => {
            const tel = u.qs('#rv-tel', b).value.trim();
            window.location.href = 'sms:' + encodeURIComponent(tel) + '?&body=' + encodeURIComponent(u.qs('#rv-sms', b).value);
            close();
            setTimeout(() => ui.modal({ title: 'Did the text go out?', size: 'sm', body: '<p>Tap Yes once you\'ve sent it, so the CRM won\'t suggest asking again.</p>',
              actions: [{ label: 'Not sent' }, { label: 'Yes, it went out', kind: 'primary', onClick: () => { reviews.mark(deal, 'sms', tel, false); ui.toast('Review request recorded'); if (done) done(); } }] }), 600);
          } },
          { label: live ? 'Send with Gmail' : 'Open in Gmail', kind: 'primary', keepOpen: true, onClick: async (b, close) => {
            const to = u.qs('#rv-to', b).value.trim();
            if (!MT.mail.valid(to)) { ui.toast('Enter the customer\'s email address.', 'err'); return; }
            const subject = u.qs('#rv-subj', b).value.trim(), body = u.qs('#rv-body', b).value;
            if (!c.email) { c.email = to; store.save(true); }
            if (!live) {
              MT.mail.openGmail({ to, subject, body });
              close();
              setTimeout(() => ui.modal({ title: 'Did the email go out?', size: 'sm', body: '<p>Tap Yes once you\'ve sent it, so the CRM won\'t suggest asking again.</p>',
                actions: [{ label: 'Not sent' }, { label: 'Yes, it went out', kind: 'primary', onClick: () => { reviews.mark(deal, 'email', to, false); ui.toast('Review request recorded'); if (done) done(); } }] }), 600);
              return;
            }
            const st = u.qs('#rv-status', b);
            st.textContent = 'Sending…';
            try {
              await MT.mail.send({ to, subject, body, url: reviews.link(), button: 'Leave a Google review' });
              reviews.mark(deal, 'email', to, true);
              close();
              ui.toast('Review request emailed to ' + to);
              if (done) done();
            } catch (e) { st.textContent = ''; ui.toast('Not sent: ' + e.message, 'err'); }
          } },
        ],
      });
    },

    /** Panel for the Invoices page: recent paid jobs to ask. */
    panelHTML() {
      const list = reviews.ready();
      if (!list.length) return '';
      return `<section class="panel ready-panel"><div class="panel-head"><h3>Ask for a Google review</h3><span class="hint">Paid in the last ${WINDOW_DAYS} days</span></div>
        <ul class="list compact">${list.slice(0, 6).map((x) => `<li class="list-row" data-review="${x.deal.id}"><div class="grow"><div class="row-title">${u.esc(store.customerName(x.deal.customerId))}</div><div class="row-sub">${u.esc(x.deal.title)}, paid ${u.fmtDate(x.paidOn)}</div></div><span class="link">Ask for review</span></li>`).join('')}</ul></section>`;
    },
  };

  MT.reviews = reviews;
})();
