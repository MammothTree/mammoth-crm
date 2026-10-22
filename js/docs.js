/* Mammoth CRM — preview, send, and track estimates and invoices.
   Preview shows the document exactly as the PDF. Sending by email goes out from the owner's Google account through the
   connector (js/pay-connector.js) with the PDF attached and a link to the customer's own page, where they can view, approve,
   ask for changes, or pay. Texts open the phone's messages app with that link. Opens and replies come back to the CRM. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  const CHECK_EVERY = 2 * 60000;
  const TRACK_DAYS = 90;
  const LABEL = { estimate: 'Estimate', invoice: 'Invoice' };

  const fmtWhen = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  const list = (type) => (type === 'invoice' ? store.state.invoices : store.state.estimates);
  const find = (type, id) => list(type).find((x) => x.id === id) || null;

  function injectCSS() {
    if (document.getElementById('doc-css')) return;
    const st = document.createElement('style');
    st.id = 'doc-css';
    st.textContent = MT.DOC_CSS;
    document.head.appendChild(st);
  }

  let libP = null;
  function loadPdfLib() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (libP) return libP;
    libP = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = PDF_LIB;
      sc.onload = () => (window.html2pdf ? res(window.html2pdf) : rej(new Error('PDF maker did not load.')));
      sc.onerror = () => { libP = null; rej(new Error('Making a PDF needs an internet connection.')); };
      document.head.appendChild(sc);
    });
    return libP;
  }

  const docs = {
    builders: {},
    /** The connector is set up, so emails go out for real and customers get their own page. */
    ready() { return !!(MT.pay && MT.pay.connected() && MT.pay.cfg().docs !== false); },

    info(type, rec) {
      const b = docs.builders[type];
      if (!b) throw new Error('No document builder for ' + type);
      return b(rec);
    },

    /** Makes a Square link first when one is needed (deposit or balance), so the document carries it. */
    async prepare(type, rec) {
      let info = docs.info(type, rec);
      if (info.needsLink && MT.pay.ready()) {
        const d = store.deal(info.dealId);
        if (d) { try { await MT.pay.link(d, info.needsLink); if (type === 'invoice') { const l = MT.pay.findLink(d, 'invoice', info.needsLink.amount, rec.id); if (l) rec.payLink = l.url; } } catch (e) { ui.toast('Square pay link not added: ' + e.message, 'err'); } }
        info = docs.info(type, rec);
      }
      return info;
    },

    /** PDF of the document as a Blob (null when it can't be made, e.g. offline). */
    async pdf(opts, filename) {
      try {
        const h2p = await loadPdfLib();
        injectCSS();
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:-10000px;top:0;width:780px;background:#fff';
        box.innerHTML = `<div class="doc-sheet" style="--pr-color:${u.esc(MT.docColor())}">${MT.docHTML(opts)}</div>`;
        document.body.appendChild(box);
        try {
          return await h2p().set({ margin: [8, 6, 10, 6], filename, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } })
            .from(box.firstElementChild).outputPdf('blob');
        } finally { box.remove(); }
      } catch (e) { return null; }
    },
    toBase64(blob) {
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
    },
    filename(type, rec) { return (LABEL[type] + ' ' + (rec.number || '') + ' - ' + (store.state.settings.company.name || 'Mammoth Tree Service')).replace(/[\\/:*?"<>|]+/g, '') + '.pdf'; },

    /** Puts the document on the customer's page (same link every time) and returns the link. */
    async publish(type, rec, info) {
      const s = store.state, co = s.settings.company;
      const cust = store.customer(rec.customerId) || {};
      const doc = {
        type, number: rec.number, title: info.title, customer: cust.name || '', company: co.name, phone: co.phone, email: co.email, notify: co.email,
        color: MT.docColor(), html: docs.absoluteLogo(MT.docHTML(info.opts)), css: MT.DOC_CSS,
        deposit: info.deposit ? u.money(info.deposit, true) : '', balanceDue: info.balance > 0.005 ? u.money(info.balance, true) : '',
        payUrl: info.payUrl || '', payLabel: info.payLabel || '', terms: !!(info.opts && info.opts.notes),
      };
      const r = await MT.pay.post('publish', { token: rec.share && rec.share.token, doc });
      if (!r || !r.token) throw new Error('The connector didn\'t return a link.');
      const c = MT.pay.cfg();
      rec.share = { token: r.token, url: c.url + (c.url.includes('?') ? '&' : '?') + 'd=' + r.token, at: new Date().toISOString() };
      store.save(true);
      return rec.share.url;
    },

    /** The customer's page lives on Google's site, so a logo saved as an app file (icons/…) needs its full web address. */
    absoluteLogo(html) {
      const logo = (store.state.settings.branding || {}).logo || '';
      if (!logo || /^(data:|https?:)/i.test(logo)) return html;
      const base = /^https?:/.test(location.href) ? location.href : 'https://mammothtree.github.io/mammoth-crm/';
      let abs = logo;
      try { abs = new URL(logo, base).href; } catch (e) { return html; }
      return html.split('src="' + u.esc(logo) + '"').join('src="' + u.esc(abs) + '"');
    },

    /** Records that it went out: status Sent, the deal moves along, and the activity log says how and to whom. */
    markSent(type, rec, via, to, confirmed) {
      rec.sends = (rec.sends || []).concat({ via, to: to || '', at: new Date().toISOString(), confirmed: !!confirmed });
      if (rec.status === 'draft') { rec.status = 'sent'; rec.sentAt = u.todayISO(); }
      if (type === 'estimate') {
        rec.changesRequested = '';
        const d = rec.dealId && store.deal(rec.dealId);
        if (d && (d.stage === 'lead' || d.stage === 'contacted')) store.setStage(d, 'estimate');
      }
      store.log(type === 'estimate' ? 'estimate' : 'invoice', LABEL[type] + ' ' + rec.number + (via === 'email' ? ' emailed to ' : ' texted to ') + (to || store.customerName(rec.customerId)) + (confirmed ? '' : ' (you confirmed)'), { customerId: rec.customerId, dealId: rec.dealId });
      docs.refreshDraft(type, rec);
      store.save();
    },
    /** Keeps an open editor in step with changes made here (so saving the editor doesn't undo them). */
    refreshDraft(type, rec) {
      const v = type === 'estimate' ? MT.views.estimator : MT.views.invoices;
      if (v && v.draft && v.draft.id === rec.id) ['status', 'sentAt', 'share', 'sends', 'track', 'changesRequested', 'payLink', 'approvedBy'].forEach((k) => { if (rec[k] !== undefined) v.draft[k] = JSON.parse(JSON.stringify(rec[k])); });
    },
    /** Fields this module owns; editors copy them from the saved record before saving. */
    keep(rec, stored) {
      if (!stored) return;
      ['share', 'sends', 'track', 'changesRequested', 'approvedBy'].forEach((k) => { if (stored[k] !== undefined) rec[k] = stored[k]; });
      if (stored.status === 'accepted' && stored.track && stored.track.approvedAt && rec.status === 'sent') rec.status = 'accepted';
    },

    /* ---------------- Preview ---------------- */
    async open(type, id) {
      const rec = find(type, id);
      if (!rec) { ui.toast('Save it first.', 'err'); return; }
      injectCSS();
      const info = docs.info(type, rec);
      const live = docs.ready();
      ui.modal({
        title: LABEL[type] + ' ' + rec.number + ' preview',
        size: 'lg',
        body: `<div class="doc-preview"><div class="doc-sheet" style="--pr-color:${u.esc(MT.docColor())}">${MT.docHTML(info.opts)}</div></div>
          <div class="doc-sendinfo">${docs.trackHTML(type, rec) || ''}
          <p class="hint">${live ? 'Email goes out from your Google account with the PDF attached and a link where the customer can ' + (type === 'estimate' ? 'approve, ask for changes, or pay the deposit' : 'pay online or ask a question') + '. You\'ll see here when they open it.' : 'To email straight from the CRM, show the customer an approval page, and see when they open it, set up the connector in Integrations → Square &amp; online estimates. Until then, Send opens your email or messages app.'}</p></div>`,
        actions: [
          { label: 'Print / save PDF', kind: 'ghost', left: true, keepOpen: true, onClick: () => MT.printDoc(info.opts) },
          { label: 'Download PDF', kind: 'ghost', keepOpen: true, onClick: async (b) => {
            ui.toast('Making the PDF…');
            const blob = await docs.pdf(info.opts, docs.filename(type, rec));
            if (!blob) { ui.toast('Couldn\'t make a PDF here. Use Print / save PDF instead.', 'err'); return; }
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = docs.filename(type, rec); document.body.appendChild(a); a.click(); a.remove();
          } },
          live ? { label: 'Copy customer link', kind: 'ghost', keepOpen: true, onClick: async () => {
            try { const fresh = await docs.prepare(type, rec); const url = await docs.publish(type, rec, fresh); u.copyText(url).then(() => ui.toast('Customer link copied')); }
            catch (e) { ui.toast(e.message, 'err'); }
          } } : null,
          live && rec.share ? { label: 'See customer page', kind: 'ghost', keepOpen: true, onClick: () => { window.open(rec.share.url + '&me=1', '_blank', 'noopener'); } } : null,
          { label: 'Send by text', kind: 'ghost', onClick: () => { setTimeout(() => docs.textForm(type, rec.id), 0); } },
          { label: 'Send by email', kind: 'primary', onClick: () => { setTimeout(() => docs.emailForm(type, rec.id), 0); } },
        ].filter(Boolean),
      });
    },

    messages(type, rec, info, url) {
      const s = store.state, co = s.settings.company;
      const c = store.customer(rec.customerId) || {};
      const first = u.firstName(c.name) || 'there';
      if (type === 'estimate') {
        return {
          subject: 'Your estimate from ' + co.name + ': ' + info.title,
          body: `Hi ${first},\n\nThank you for having us out. Your estimate for "${info.title}" is ready: ${u.money(info.total, true)}${info.deposit ? ' (deposit ' + u.money(info.deposit, true) + ' to schedule)' : ''}.\n\n${url ? 'You can view it, approve it, or ask for changes using the button below' + (info.deposit && info.payUrl ? ', and pay the deposit online' : '') + '. The PDF is attached too.' : 'The PDF is attached. Reply to this email to approve it or ask for changes.'}\n\nQuestions? Call ${co.phone}.\n\nThank you,\n${co.owner}\n${co.name}`,
          sms: `Hi ${first}, it's ${co.owner} with ${co.name}. Your estimate for "${info.title}" (${u.money(info.total, true)}) is ready.${url ? ' View and approve it here: ' + url : ''}`,
          button: 'View & approve estimate',
        };
      }
      return {
        subject: 'Invoice ' + rec.number + ' from ' + co.name,
        body: `Hi ${first},\n\nThank you for your business! Invoice ${rec.number} for "${info.title}" is attached. Balance due: ${u.money(info.balance, true)}${rec.dueDate ? ' by ' + u.fmtDate(rec.dueDate) : ''}.\n\n${url ? 'You can view it and pay online using the button below.' : info.payUrl ? 'Pay online here: ' + info.payUrl : ''}\n\nQuestions? Call ${co.phone}.\n\nThank you,\n${co.owner}\n${co.name}`,
        sms: `Hi ${first}, it's ${co.owner} with ${co.name}. Invoice ${rec.number} (${u.money(info.balance, true)} due) is ready.${url ? ' View and pay here: ' + url : info.payUrl ? ' Pay online: ' + info.payUrl : ''}`,
        button: info.balance > 0.005 ? 'View & pay invoice' : 'View invoice',
      };
    },

    /* ---------------- Email ---------------- */
    emailForm(type, id) {
      const rec = find(type, id);
      const c = store.customer(rec.customerId) || {};
      const co = store.state.settings.company;
      const live = docs.ready();
      const m = docs.messages(type, rec, docs.info(type, rec), live ? 'link' : '');
      ui.modal({
        title: 'Email ' + LABEL[type].toLowerCase() + ' ' + rec.number,
        body: `<div class="form-grid">
            <label class="field span-2"><span>To</span><input class="input" type="email" id="em-to" value="${u.esc(c.email || '')}" placeholder="customer@example.com"></label>
            <label class="field span-2"><span>Subject</span><input class="input" id="em-subj" value="${u.esc(m.subject)}"></label>
            <label class="field span-2"><span>Message</span><textarea class="input" rows="9" id="em-body">${u.esc(m.body)}</textarea></label>
            <label class="check span-2"><input type="checkbox" id="em-pdf" checked><span>Attach the PDF</span></label>
          </div>
          <p class="hint">${live ? 'Sends from your Google account' + (co.email ? '; replies go to ' + u.esc(co.email) : '') + '. A button to the customer\'s page is added below your message.' : 'Opens your email app with this message. On a phone the PDF is attached for you; on a computer it downloads so you can attach it.'}</p>
          <p class="hint" id="em-status"></p>`,
        actions: [
          { label: 'Cancel' },
          { label: live ? 'Send email' : 'Open in email app', kind: 'primary', keepOpen: true, onClick: async (b, close) => {
            const to = u.qs('#em-to', b).value.trim();
            if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(to)) { ui.toast('Enter the customer\'s email address.', 'err'); return; }
            const stEl = u.qs('#em-status', b);
            const btn = u.qsa('.modal-foot .btn', b.closest('.modal') || document).pop();
            if (btn) btn.disabled = true;
            const say = (t) => { stEl.textContent = t; };
            try {
              if (c && !c.email) { c.email = to; store.save(true); }
              const info = await docs.prepare(type, rec);
              const attach = u.qs('#em-pdf', b).checked;
              const subject = u.qs('#em-subj', b).value.trim(), body = u.qs('#em-body', b).value;
              if (live) {
                say('Putting it on the customer\'s page…');
                const url = await docs.publish(type, rec, info);
                let pdf = '';
                if (attach) { say('Making the PDF…'); const blob = await docs.pdf(info.opts, docs.filename(type, rec)); if (blob) pdf = await docs.toBase64(blob); }
                say('Sending…');
                const r = await MT.pay.post('email', { to, subject, body, url, button: docs.messages(type, rec, info, url).button, color: MT.docColor(), fromName: co.name, replyTo: co.email, pdf, filename: docs.filename(type, rec), token: rec.share.token });
                docs.markSent(type, rec, 'email', r.to || to, true);
                close();
                ui.toast('Sent by email to ' + to + (attach && !pdf ? ' (without the PDF; the link has everything)' : ''));
              } else {
                const blob = attach ? await docs.pdf(info.opts, docs.filename(type, rec)) : null;
                const file = blob ? new File([blob], docs.filename(type, rec), { type: 'application/pdf' }) : null;
                if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                  await navigator.share({ files: [file], title: subject, text: body });
                } else {
                  if (file) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); }
                  window.location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
                }
                close();
                docs.confirmSent(type, rec, 'email', to);
              }
            } catch (e) {
              if (e && e.name === 'AbortError') { if (btn) btn.disabled = false; say(''); return; }
              say(''); if (btn) btn.disabled = false;
              ui.toast('Not sent: ' + (e.message || e), 'err');
            }
          } },
        ],
      });
    },

    /* ---------------- Text ---------------- */
    textForm(type, id) {
      const rec = find(type, id);
      const c = store.customer(rec.customerId) || {};
      const live = docs.ready();
      const info0 = docs.info(type, rec);
      const m = docs.messages(type, rec, info0, live ? '[link]' : '');
      ui.modal({
        title: 'Text ' + LABEL[type].toLowerCase() + ' ' + rec.number,
        body: `<div class="form-grid">
            <label class="field span-2"><span>To (mobile number)</span><input class="input" type="tel" id="tx-to" value="${u.esc(c.phone || '')}"></label>
            <label class="field span-2"><span>Message</span><textarea class="input" rows="5" id="tx-body">${u.esc(m.sms)}</textarea></label>
          </div>
          <p class="hint">${live ? '[link] becomes the customer\'s private page, where they can ' + (type === 'estimate' ? 'view, approve, or ask for changes' : 'view and pay') + '. Your messages app opens with the text ready. Tap send there.' : 'On a phone, the PDF is attached in your messages app. Set up the connector (Integrations) to send a view-and-approve link instead.'}</p>`,
        actions: [
          { label: 'Cancel' },
          { label: 'Open messages', kind: 'primary', keepOpen: true, onClick: async (b, close) => {
            const to = u.qs('#tx-to', b).value.trim();
            let body = u.qs('#tx-body', b).value;
            try {
              const info = await docs.prepare(type, rec);
              if (live) {
                const url = await docs.publish(type, rec, info);
                body = body.includes('[link]') ? body.replace('[link]', url) : body + ' ' + url;
                window.location.href = 'sms:' + encodeURIComponent(to) + '?&body=' + encodeURIComponent(body);
              } else {
                const blob = await docs.pdf(info.opts, docs.filename(type, rec));
                const file = blob ? new File([blob], docs.filename(type, rec), { type: 'application/pdf' }) : null;
                if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: body });
                else window.location.href = 'sms:' + encodeURIComponent(to) + '?&body=' + encodeURIComponent(body);
              }
              close();
              docs.confirmSent(type, rec, 'sms', to);
            } catch (e) {
              if (e && e.name === 'AbortError') return;
              ui.toast('Couldn\'t open messages: ' + (e.message || e), 'err');
            }
          } },
        ],
      });
    },

    /** Your email or messages app sends it, so the CRM asks you instead of guessing. */
    confirmSent(type, rec, via, to) {
      setTimeout(() => ui.modal({
        title: via === 'sms' ? 'Did the text go out?' : 'Did the email go out?',
        size: 'sm',
        body: `<p>Tap <b>Yes</b> once you've sent it to ${u.esc(to || store.customerName(rec.customerId))}. The ${LABEL[type].toLowerCase()} is then marked as sent${docs.ready() ? ', and you\'ll see here when they open it' : ''}.</p>`,
        actions: [{ label: 'Not sent' }, { label: 'Yes, it went out', kind: 'primary', onClick: () => { docs.markSent(type, rec, via, to, false); ui.toast(LABEL[type] + ' ' + rec.number + ' marked as sent by ' + (via === 'sms' ? 'text' : 'email')); } }],
      }), 600);
    },

    /* ---------------- Tracking ---------------- */
    trackHTML(type, rec) {
      if (!rec) return '';
      const t = rec.track || {};
      const rows = [];
      (rec.sends || []).forEach((x) => rows.push({ at: x.at, html: `${x.via === 'email' ? 'Emailed' : 'Texted'} to ${u.esc(x.to || 'customer')}${x.confirmed ? ' <span class="good-tx">sent</span>' : ' <span class="muted">(you confirmed)</span>'}` }));
      if (t.firstView) rows.push({ at: t.firstView, html: '<b>Opened by the customer</b>' });
      (t.notes || []).forEach((n) => rows.push({ at: n.at, html: `<b>${n.type === 'changes' ? 'Asked for changes' : 'Question'}</b>${n.name ? ' from ' + u.esc(n.name) : ''}: “${u.esc(n.note)}”` }));
      if (t.approvedAt) rows.push({ at: t.approvedAt, html: `<b class="good-tx">Approved online</b> by ${u.esc(t.approvedBy || 'the customer')} (typed name)` });
      if (!rows.length && !rec.share) return '';
      rows.sort((a, b) => (a.at < b.at ? -1 : 1));
      const sent = (rec.sends || []).length;
      const head = t.views ? `Opened ${t.views} ${t.views === 1 ? 'time' : 'times'}, last ${fmtWhen(t.lastView)}` : sent && rec.share ? 'Not opened yet' : '';
      return `<div class="doc-track">
        <h4>Sent &amp; customer activity ${head ? `<span class="${t.views ? 'good-tx' : 'muted'}">${head}</span>` : ''}</h4>
        ${rec.changesRequested ? '<p class="doc-alert">The customer asked for changes. Update the ' + LABEL[type].toLowerCase() + ' and send it again: the same link shows the new version.</p>' : ''}
        <ul>${rows.map((r) => `<li><span class="muted">${fmtWhen(r.at)}</span> ${r.html}</li>`).join('')}</ul>
      </div>`;
    },
    /** Short status for lists. */
    badge(rec) {
      const t = rec && rec.track;
      if (!t) return '';
      if (t.approvedAt) return '<span class="doc-flag good">Approved online</span>';
      if (rec.changesRequested) return '<span class="doc-flag warn">Changes requested</span>';
      if (t.views) return '<span class="doc-flag">Opened</span>';
      return '';
    },

    shared() {
      const cutoff = new Date(Date.now() - TRACK_DAYS * 86400000).toISOString();
      return store.state.estimates.map((r) => ({ type: 'estimate', r })).concat(store.state.invoices.map((r) => ({ type: 'invoice', r })))
        .filter((x) => x.r.share && x.r.share.token && x.r.share.at >= cutoff);
    },

    /** Picks up opens, approvals, and notes from the connector. Returns how many were applied. */
    async check(opts) {
      opts = opts || {};
      if (!docs.ready() || docs.checking) return 0;
      const mine = docs.shared();
      if (!mine.length) return 0;
      const c = MT.pay.cfg();
      docs.checking = true;
      let n = 0;
      try {
        const r = await MT.pay.get('events', { since: c.lastEvent || '' });
        const byToken = {};
        mine.forEach((x) => { byToken[x.r.share.token] = x; });
        (r.events || []).forEach((ev) => {
          if (c.lastEvent && ev.at <= c.lastEvent) return;
          const hit = byToken[ev.token];
          if (!hit) return;
          if (docs.apply(hit.type, hit.r, ev)) n++;
        });
        const last = (r.events || []).reduce((m, ev) => (ev.at > m ? ev.at : m), c.lastEvent || '');
        if (last) c.lastEvent = last;
        if (n) store.save(); else store.save(true);
      } catch (e) { if (!opts.silent) throw e; }
      finally { docs.checking = false; }
      return n;
    },

    apply(type, rec, ev) {
      const t = rec.track = rec.track || { views: 0, notes: [] };
      if (!t.notes) t.notes = [];
      const who = store.customerName(rec.customerId);
      const meta = { customerId: rec.customerId, dealId: rec.dealId };
      if (ev.type === 'view') {
        t.views = (t.views || 0) + 1;
        if (!t.firstView) { t.firstView = ev.at; store.log('note', who + ' opened ' + LABEL[type].toLowerCase() + ' ' + rec.number, meta); ui.toast(who + ' opened ' + LABEL[type].toLowerCase() + ' ' + rec.number); }
        t.lastView = ev.at;
      } else if (ev.type === 'approve' && type === 'estimate') {
        if (t.approvedAt) return false;
        t.approvedAt = ev.at; t.approvedBy = ev.name; rec.approvedBy = ev.name;
        rec.status = 'accepted'; rec.changesRequested = '';
        const d = rec.dealId && store.deal(rec.dealId);
        if (d) {
          if (d.stage !== 'won') store.setStage(d, 'won');
          if (d.jobCost === '' || d.jobCost == null) { d.jobCost = Math.round(calc.estimate(rec, store.state).cost); d.costSource = 'estimate'; }
        }
        store.log('won', 'Estimate ' + rec.number + ' approved online by ' + (ev.name || who), meta);
        ui.toast('Approved! ' + (ev.name || who) + ' approved estimate ' + rec.number);
      } else if (ev.type === 'changes' || ev.type === 'question') {
        t.notes.push({ type: ev.type, at: ev.at, name: ev.name, note: ev.note });
        if (ev.type === 'changes') rec.changesRequested = ev.at;
        store.log('note', who + (ev.type === 'changes' ? ' asked for changes to ' : ' asked about ') + LABEL[type].toLowerCase() + ' ' + rec.number + ': ' + ev.note, meta);
        ui.toast(who + (ev.type === 'changes' ? ' asked for changes to ' : ' sent a question about ') + rec.number);
      } else return false;
      docs.refreshDraft(type, rec);
      return true;
    },

    autoCheck() {
      if (!docs.ready() || navigator.onLine === false) return;
      if (MT.app.idle && !MT.app.idle()) return;
      if (docs.lastRun && Date.now() - docs.lastRun < CHECK_EVERY - 5000) return;
      if (!docs.shared().length) return;
      docs.lastRun = Date.now();
      docs.check({ silent: true }).then((n) => { if (n && ['estimator', 'invoices', 'pipeline', 'dashboard'].includes(MT.app.route)) MT.app.render(); }).catch(() => {});
    },
  };

  MT.docs = docs;
})();
