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
    const pr = document.getElementById('print-root');
    pr.style.setProperty('--pr-color', MT.docColor());
    pr.innerHTML = MT.docHTML(opts);
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  };

  MT.docColor = () => ((MT.store.state.settings.branding || {}).primary || '#24563a');

  /** Styles for the document on screen (preview), in the PDF, and on the customer's page. Matches the print styles. */
  MT.DOC_CSS = `
.doc-sheet { --pr-color: #24563a; background: #fff; color: #1a1a1a; font: 11pt/1.45 Archivo, "Segoe UI", Arial, sans-serif; padding: 28px 30px; max-width: 780px; margin: 0 auto; box-sizing: border-box; }
.doc-sheet * { box-sizing: border-box; }
.doc-sheet h1, .doc-sheet h4 { margin: 0; }
.doc-sheet table { border-collapse: collapse; }
.doc-sheet .pr-head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid var(--pr-color); padding-bottom: 14px; }
.doc-sheet .pr-from { display: flex; gap: 14px; align-items: flex-start; }
.doc-sheet .pr-logo { max-width: 90px; max-height: 70px; object-fit: contain; }
.doc-sheet .pr-stamp { margin-top: 10px; display: inline-block; border: 3px solid var(--pr-color); color: var(--pr-color); font-weight: 800; font-size: 16pt; padding: 2px 14px; transform: rotate(-6deg); text-transform: uppercase; }
.doc-sheet .pr-brand { font-size: 22pt; font-weight: 800; color: var(--pr-color); letter-spacing: -0.02em; line-height: 1.1; }
.doc-sheet .pr-co { font-size: 9.5pt; color: #444; margin-top: 4px; }
.doc-sheet .pr-meta { text-align: right; }
.doc-sheet .pr-meta h1 { font-size: 18pt; margin-bottom: 6px; }
.doc-sheet .pr-meta table { margin-left: auto; }
.doc-sheet .pr-meta td { padding: 1px 0 1px 14px; font-size: 10pt; }
.doc-sheet .pr-meta td:first-child { color: #666; }
.doc-sheet .pr-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 18px 0; font-size: 10.5pt; }
.doc-sheet .pr-parties h4, .doc-sheet .pr-notes h4 { font-size: 9pt; color: #666; margin-bottom: 4px; text-transform: none; }
.doc-sheet .pr-items { width: 100%; margin-top: 8px; }
.doc-sheet .pr-items th { text-align: left; font-size: 9pt; color: #555; border-bottom: 1.5px solid #333; padding: 6px 4px; }
.doc-sheet .pr-items td { padding: 7px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
.doc-sheet .pr-items th:not(:first-child), .doc-sheet .pr-items td:not(:first-child) { text-align: right; white-space: nowrap; }
.doc-sheet .pr-totals { margin: 12px 0 0 auto; min-width: 260px; }
.doc-sheet .pr-totals td { padding: 4px; text-align: right; }
.doc-sheet .pr-totals td:first-child { color: #555; padding-right: 30px; }
.doc-sheet .pr-totals .grand td { font-size: 14pt; font-weight: 800; color: #111; border-top: 2px solid var(--pr-color); padding-top: 8px; }
.doc-sheet .pr-notes { margin-top: 22px; font-size: 10pt; }
.doc-sheet .pr-notes p { margin: 0; }
.doc-sheet .pr-pay { margin-top: 18px; padding: 10px 14px; border: 1.5px solid var(--pr-color); border-radius: 6px; font-size: 10pt; display: flex; flex-direction: column; gap: 2px; }
.doc-sheet .pr-pay b { color: var(--pr-color); font-size: 11pt; }
.doc-sheet .pr-pay a { color: #111; word-break: break-all; }
.doc-sheet .pr-pay span { color: #555; font-size: 9pt; }
.doc-sheet .pr-sign { display: flex; justify-content: space-between; margin-top: 40px; font-size: 10pt; }
.doc-sheet .pr-foot { margin-top: 28px; font-size: 9pt; color: #666; text-align: center; }
@media (max-width: 600px) {
  .doc-sheet { padding: 18px 14px; font-size: 10pt; }
  .doc-sheet .pr-head { flex-direction: column; gap: 10px; }
  .doc-sheet .pr-meta { text-align: left; }
  .doc-sheet .pr-meta table { margin-left: 0; }
  .doc-sheet .pr-meta td { padding: 1px 14px 1px 0; }
  .doc-sheet .pr-parties { grid-template-columns: 1fr; gap: 10px; }
  .doc-sheet .pr-items th:nth-child(3), .doc-sheet .pr-items td:nth-child(3) { display: none; }
  .doc-sheet .pr-totals { min-width: 0; width: 100%; }
}`;

  /** The document body (shared by printing, preview, PDF, and the customer's page). */
  MT.docHTML = function (opts) {
    const s = MT.store.state;
    const co = s.settings.company;
    const br = s.settings.branding || {};
    return `
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
      ${opts.pay && opts.pay.url ? `<div class="pr-pay"><b>${u.esc(opts.pay.label || 'Pay online')}</b><a href="${u.esc(opts.pay.url)}">${u.esc(opts.pay.url)}</a>${opts.pay.note ? '<span>' + u.esc(opts.pay.note) + '</span>' : ''}</div>` : ''}
      ${opts.notes ? `<div class="pr-notes"><h4>Notes</h4><p>${u.esc(opts.notes).replace(/\n/g, '<br>')}</p></div>` : ''}
      ${opts.signature ? '<div class="pr-sign"><div>Accepted by ______________________________</div><div>Date ______________</div></div>' : ''}
      <p class="pr-foot">${u.esc(opts.footer || '')}</p>`;
  };
})();
