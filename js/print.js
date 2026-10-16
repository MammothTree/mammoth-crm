/* Mammoth CRM — printable documents (estimates, invoices) */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;

  /**
   * opts: { title, meta: [[label, value]], parties: [{heading, lines:[] , bold}], lines: [{desc, qty, unit, price, total}],
   *         extraRows: [[desc, amount]], totals: [[label, amount, grand?]], notes, footer, signature, stamp }
   */
  MT.printDoc = function (opts) {
    const s = MT.store.state;
    const co = s.settings.company;
    const br = s.settings.branding || {};
    const color = br.primary || '#24563a';
    const pr = document.getElementById('print-root');
    pr.style.setProperty('--pr-color', color);
    pr.innerHTML = `
      <div class="pr-head">
        <div class="pr-from">
          ${br.logo ? `<img class="pr-logo" src="${br.logo}" alt="">` : ''}
          <div><div class="pr-brand">${u.esc(co.name)}</div>
          <div class="pr-co">${[co.address, co.phone, co.email, co.website].filter(Boolean).map(u.esc).join('<br>')}${co.license ? '<br>License ' + u.esc(co.license) : ''}</div></div>
        </div>
        <div class="pr-meta"><h1>${u.esc(opts.title)}</h1><table>
          ${opts.meta.map((m) => `<tr><td>${u.esc(m[0])}</td><td>${u.esc(m[1])}</td></tr>`).join('')}</table>
          ${opts.stamp ? `<div class="pr-stamp">${u.esc(opts.stamp)}</div>` : ''}</div>
      </div>
      <div class="pr-parties">${opts.parties.map((p) => `<div><h4>${u.esc(p.heading)}</h4>${p.lines.filter(Boolean).map(u.esc).join('<br>')}${p.bold ? '<br><b>' + u.esc(p.bold) + '</b>' : ''}</div>`).join('')}</div>
      <table class="pr-items"><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>
        ${opts.lines.map((l) => `<tr><td>${u.esc(l.desc)}</td><td>${u.esc(l.qty)} ${u.esc(l.unit || '')}</td><td>${u.money(l.price, true)}</td><td>${u.money(l.total, true)}</td></tr>`).join('')}
        ${(opts.extraRows || []).map((x) => `<tr><td>${u.esc(x[0])}</td><td></td><td></td><td>${u.money(x[1], true)}</td></tr>`).join('')}
      </tbody></table>
      <table class="pr-totals">${opts.totals.map((t) => `<tr class="${t[2] ? 'grand' : ''}"><td>${u.esc(t[0])}</td><td>${typeof t[1] === 'number' ? u.money(t[1], true) : u.esc(t[1])}</td></tr>`).join('')}</table>
      ${opts.notes ? `<div class="pr-notes"><h4>Notes</h4><p>${u.esc(opts.notes).replace(/\n/g, '<br>')}</p></div>` : ''}
      ${opts.signature ? '<div class="pr-sign"><div>Accepted by ______________________________</div><div>Date ______________</div></div>' : ''}
      <p class="pr-foot">${u.esc(opts.footer || '')}</p>`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  };
})();
