/* Mammoth CRM — email through Gmail.
   With the connector set up (Integrations → Square & online estimates), every email goes out from your Gmail right from the
   CRM. Without it, Gmail opens with the message filled in, never Outlook or another mail app. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;
  const enc = encodeURIComponent;
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const mail = {
    /** The connector is set up, so the CRM sends through Gmail itself. */
    direct() { return !!(MT.pay && MT.pay.connected()); },
    /** The Gmail address emails go out from (as the connector reports it), or the company email. */
    from() { const c = MT.pay ? MT.pay.cfg() : {}; return c.from || store.state.settings.company.email || ''; },
    /** Phones and tablets: the share menu (pick Gmail) can attach the PDF. On a computer, Windows' share menu offers Outlook, so it isn't used. */
    phone() { return IOS || /Android|Mobile/i.test(navigator.userAgent); },
    valid(to) { return /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(String(to || '').trim()); },

    /** Gmail's compose screen with the message filled in: the Gmail app on iPhone, Gmail in the browser elsewhere. */
    gmailUrl(o) {
      const to = o.to || '', subject = o.subject || '', body = o.body || '';
      if (IOS) return 'googlegmail://co?to=' + enc(to) + '&subject=' + enc(subject) + '&body=' + enc(body);
      const acct = store.state.settings.company.email || '';
      return 'https://mail.google.com/mail/?' + (acct ? 'authuser=' + enc(acct) + '&' : '') + 'view=cm&fs=1&tf=1&to=' + enc(to) + '&su=' + enc(subject) + '&body=' + enc(body);
    },
    /** A blank tab opened during the click, for when Gmail opens after something slow (like making the PDF). Browsers block tabs opened later. */
    tab() { if (IOS) return null; try { return window.open('', '_blank'); } catch (e) { return null; } },
    openGmail(o, tab) {
      const url = mail.gmailUrl(o);
      if (IOS) { if (tab) tab.close(); window.location.href = url; return; }
      if (tab && !tab.closed) { tab.location.href = url; return; }
      const w = window.open(url, '_blank');
      if (!w) window.location.href = url;
    },

    /** Sends through the connector from your Gmail. o: {to, subject, body, url, button, pdf, filename, token} */
    send(o) {
      const co = store.state.settings.company;
      return MT.pay.post('email', Object.assign({ color: MT.docColor(), fromName: co.name, replyTo: co.email }, o));
    },

    /** Email window for anything: sends from Gmail in the CRM, or opens Gmail with it filled in.
        o: {title, to, subject, body, url, button, log: 'what it was', meta: {customerId, dealId}, onSent(to, confirmed),
            attach: {filename, make: async () => Blob} for a PDF} */
    compose(o) {
      const live = mail.direct();
      const from = mail.from();
      ui.modal({
        title: o.title || 'Email',
        body: `<div class="form-grid">
            <label class="field span-2"><span>To</span><input class="input" type="email" id="ml-to" value="${u.esc(o.to || '')}" placeholder="name@example.com"></label>
            <label class="field span-2"><span>Subject</span><input class="input" id="ml-subj" value="${u.esc(o.subject || '')}"></label>
            <label class="field span-2"><span>Message</span><textarea class="input" rows="10" id="ml-body">${u.esc(o.body || '')}</textarea></label>
            ${o.attach ? `<label class="check span-2"><input type="checkbox" id="ml-pdf" checked><span>Attach ${u.esc(o.attach.filename)}${live ? '' : ' (it downloads so you can attach it in Gmail)'}</span></label>` : ''}
          </div>
          <p class="hint">${live ? 'Sends from your Gmail' + (from ? ' (' + u.esc(from) + ')' : '') + '. It shows in your Gmail Sent folder and replies come back to your inbox.' : 'Opens Gmail with this message ready to send. To send straight from the CRM, set up the connector in Integrations → Square &amp; online estimates.'}</p>
          <p class="hint" id="ml-status"></p>`,
        actions: [
          { label: 'Cancel' },
          { label: live ? 'Send with Gmail' : 'Open in Gmail', kind: 'primary', keepOpen: true, onClick: async (b, close) => {
            const to = u.qs('#ml-to', b).value.trim();
            if (!mail.valid(to)) { ui.toast('Enter a valid email address.', 'err'); return; }
            const subject = u.qs('#ml-subj', b).value.trim(), body = u.qs('#ml-body', b).value;
            const done = (confirmed) => {
              if (o.log) { store.log('message', o.log + ' emailed to ' + to + (confirmed ? '' : ' (opened in Gmail)'), o.meta || {}); store.save(true); }
              if (o.onSent) o.onSent(to, confirmed);
            };
            const attach = o.attach && u.qs('#ml-pdf', b).checked;
            const btn = u.qsa('.modal-foot .btn', b.closest('.modal')).pop();
            const st = u.qs('#ml-status', b);
            if (!live && !attach) { mail.openGmail({ to, subject, body }); close(); done(false); return; }
            const tab = live ? null : mail.tab(); // opened during the click so it isn't blocked
            btn.disabled = true;
            try {
              let blob = null;
              if (attach) { st.textContent = 'Making the PDF…'; blob = await o.attach.make(); if (!blob) throw new Error('Couldn\'t make the PDF here. Check your internet connection and try again.'); }
              if (!live) {
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.attach.filename; document.body.appendChild(a); a.click(); a.remove();
                mail.openGmail({ to, subject, body }, tab); close(); done(false); return;
              }
              st.textContent = 'Sending…';
              await mail.send({ to, subject, body, url: o.url || '', button: o.button || '', pdf: blob ? await MT.docs.toBase64(blob) : '', filename: attach ? o.attach.filename : '' });
              close();
              ui.toast('Sent from Gmail to ' + to);
              done(true);
            } catch (e) { if (tab && !tab.closed) tab.close(); btn.disabled = false; st.textContent = ''; ui.toast('Not sent: ' + e.message, 'err'); }
          } },
        ],
      });
    },
  };

  MT.mail = mail;
})();
