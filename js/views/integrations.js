/* Mammoth CRM — Integrations: website leads, Square, Google & Yelp reviews, GitHub sync */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, sync = MT.sync;
  const SECRET_KEY = 'mammothcrm.secrets.v1'; // API keys stay in this browser, never in backups or sync

  const secrets = {
    get() { try { return JSON.parse(localStorage.getItem(SECRET_KEY) || '{}'); } catch (e) { return {}; } },
    set(k, v) { const s = secrets.get(); s[k] = v; localStorage.setItem(SECRET_KEY, JSON.stringify(s)); },
  };

  const view = { title: 'Integrations', open: '' };

  /* ================= CSV ================= */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const nonEmpty = rows.filter((r) => r.some((c) => c.trim()));
    if (!nonEmpty.length) return { headers: [], rows: [] };
    const headers = nonEmpty[0].map((h) => h.trim());
    return { headers, rows: nonEmpty.slice(1).map((r) => { const o = {}; headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; }) };
  }
  const pickCol = (headers, names) => { const lc = headers.map((h) => h.toLowerCase()); for (const n of names) { const i = lc.indexOf(n.toLowerCase()); if (i >= 0) return headers[i]; } return null; };
  const money = (v) => u.num(String(v || '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  function toISO(v) {
    v = String(v || '').trim();
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
    const d = new Date(v);
    return isNaN(d) ? '' : u.isoDate(d);
  }
  const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  function findCustomer(s, { email, phone, name }) {
    const em = String(email || '').toLowerCase();
    return s.customers.find((c) => (em && c.email && c.email.toLowerCase() === em) || (digits(phone).length === 10 && digits(c.phone) === digits(phone)) || (name && c.name.toLowerCase() === String(name).toLowerCase()));
  }
  view.parseCSV = parseCSV;

  /* ================= Website leads (Google Sheets connector) ================= */
  function appsScript(key) {
    return `// Mammoth CRM website lead form: paste into Extensions > Apps Script of a Google Sheet
const KEY = '${key}';
const SHEET = 'Leads';
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(['Received', 'Name', 'Phone', 'Email', 'Address', 'Service', 'Message']); }
  // Columns H-M record where the visitor came from (added later; older sheets get them automatically).
  if (sh.getLastColumn() < 13) sh.getRange(1, 8, 1, 6).setValues([['Landing page', 'Referrer', 'UTM source', 'UTM medium', 'UTM campaign', 'Click ID']]);
  return sh;
}
function doPost(e) {
  const p = e.parameter || {};
  if (p.website) return out_({ ok: true }); // spam trap
  sheet_().appendRow([new Date(), p.name || '', p.phone || '', p.email || '', p.address || '', p.service || '', p.message || '', p.landing || '', p.referrer || '', p.utm_source || '', p.utm_medium || '', p.utm_campaign || '', p.gclid || '']);
  return out_({ ok: true });
}
function doGet(e) {
  const p = e.parameter || {};
  if (p.key !== KEY) return out_({ error: 'bad key' });
  const since = Number(p.since || 1);
  const values = sheet_().getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (i + 1 <= since) continue;
    const v = values[i];
    rows.push({ row: i + 1, received: v[0], name: v[1], phone: String(v[2]), email: v[3], address: v[4], service: v[5], message: v[6], landing: v[7] || '', referrer: v[8] || '', utm_source: v[9] || '', utm_medium: v[10] || '', utm_campaign: v[11] || '', gclid: v[12] || '' });
  }
  return out_({ rows: rows });
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }`;
  }
  function formSnippet(url, co) {
    const color = (store.state.settings.branding || {}).primary || '#24563a';
    return `<!-- ${co.name} request form: paste into your website -->
<form id="mt-lead" style="max-width:480px;display:grid;gap:10px;font-family:inherit">
  <input name="name" placeholder="Your name" required style="padding:10px;border:1px solid #bbb;border-radius:6px">
  <input name="phone" type="tel" placeholder="Phone" required style="padding:10px;border:1px solid #bbb;border-radius:6px">
  <input name="email" type="email" placeholder="Email" style="padding:10px;border:1px solid #bbb;border-radius:6px">
  <input name="address" placeholder="Property address" style="padding:10px;border:1px solid #bbb;border-radius:6px">
  <select name="service" style="padding:10px;border:1px solid #bbb;border-radius:6px">
    <option>Tree removal</option><option>Tree trimming / pruning</option><option>Stump grinding</option><option>Storm or emergency</option><option>Other</option>
  </select>
  <textarea name="message" rows="4" placeholder="Tell us about the trees" style="padding:10px;border:1px solid #bbb;border-radius:6px"></textarea>
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <input type="hidden" name="landing"><input type="hidden" name="referrer"><input type="hidden" name="utm_source"><input type="hidden" name="utm_medium"><input type="hidden" name="utm_campaign"><input type="hidden" name="gclid">
  <button type="submit" style="padding:12px;border:0;border-radius:6px;background:${color};color:#fff;font-weight:600">Request a free estimate</button>
  <p id="mt-lead-msg" role="status"></p>
</form>
<script>
(function () {
  // Remembers where this visitor first arrived from, so the CRM can credit Google search, Maps, or ads.
  var K = 'mt-first-touch', t = null;
  try { t = JSON.parse(localStorage.getItem(K) || 'null'); } catch (x) {}
  if (!t) {
    var q = new URLSearchParams(location.search), r = document.referrer;
    t = { landing: location.href.split('#')[0], referrer: r && r.indexOf(location.host) < 0 ? r : '', utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '', utm_campaign: q.get('utm_campaign') || '', gclid: q.get('gclid') || q.get('gbraid') || q.get('wbraid') || '' };
    try { localStorage.setItem(K, JSON.stringify(t)); } catch (x) {}
  }
  var f = document.getElementById('mt-lead');
  Object.keys(t).forEach(function (k) { if (f.elements[k]) f.elements[k].value = t[k]; });
})();
document.getElementById('mt-lead').addEventListener('submit', function (e) {
  e.preventDefault();
  var f = e.target, msg = document.getElementById('mt-lead-msg');
  f.querySelector('button').disabled = true;
  fetch('${url || 'PASTE-YOUR-WEB-APP-URL-HERE'}', { method: 'POST', mode: 'no-cors', body: new URLSearchParams(new FormData(f)) })
    .then(function () { f.reset(); msg.textContent = 'Thanks! We will call you within one business day.'; })
    .catch(function () { msg.textContent = 'Sorry, that did not send. Please call ${co.phone}.'; })
    .finally(function () { f.querySelector('button').disabled = false; });
});
</script>`;
  }
  /** Pulls new rows from the lead sheet. Returns the number of new leads. */
  async function pullLeads(silent) {
    const s = store.state;
    const w = s.integrations.website;
    if (!w.scriptUrl || !w.key) { if (!silent) ui.toast('Paste your web app URL first.', 'err'); return 0; }
    const sep = w.scriptUrl.includes('?') ? '&' : '?';
    const r = await fetch(w.scriptUrl + sep + 'key=' + encodeURIComponent(w.key) + '&since=' + (w.lastRow || 1), { cache: 'no-store' });
    const j = await r.json();
    if (j.error) throw new Error(j.error === 'bad key' ? 'The sheet rejected the key. Re-copy the Apps Script code from this page and deploy a new version.' : j.error);
    let n = 0;
    (j.rows || []).forEach((row) => {
      if (row.row <= (w.lastRow || 1)) return;
      w.lastRow = Math.max(w.lastRow || 1, row.row);
      if (!row.name && !row.phone && !row.email) return;
      const attribution = { landing: row.landing || '', referrer: row.referrer || '', utm_source: row.utm_source || '', utm_medium: row.utm_medium || '', utm_campaign: row.utm_campaign || '', gclid: row.gclid || '' };
      const channel = MT.calc.classifyChannel(attribution, s.settings.company.website);
      const source = ['organic', 'maps', 'ads'].includes(channel) ? 'Google' : 'Website';
      let c = findCustomer(s, row);
      if (!c) {
        const parts = String(row.address || '').split(',');
        c = { id: u.uid('c'), name: row.name || 'Website visitor', company: '', phone: row.phone || '', email: row.email || '', address: (parts[0] || '').trim(), city: parts.slice(1).join(',').trim(), source, type: 'Residential', notes: '', createdAt: u.todayISO() };
        s.customers.unshift(c);
      }
      const date = toISO(row.received) || u.todayISO();
      const d = { id: u.uid('d'), customerId: c.id, title: row.service || 'Website request', value: 0, stage: 'lead', source, channel, attribution, probability: '', createdAt: date, expectedClose: u.addDays(date, 14), scheduledDate: '', closedAt: '', notes: row.message || '', estimateId: '', lostReason: '', payments: [], jobCost: '', costSource: '', crewIds: [], expenses: [], startTime: '', days: 1 };
      s.deals.unshift(d);
      store.log('lead', 'New website lead from ' + c.name + ': ' + d.title, { customerId: c.id, dealId: d.id });
      n++;
    });
    w.lastPull = new Date().toISOString();
    w.imported = (w.imported || 0) + n;
    store.save(!n);
    if (n) ui.toast(n === 1 ? 'New website lead from ' + store.customerName(s.deals[0].customerId) : n + ' new website leads');
    else if (!silent) ui.toast('No new website leads');
    return n;
  }
  view.autoPull = function () {
    const w = store.state && store.state.integrations && store.state.integrations.website;
    if (!w || !w.scriptUrl || !w.autoCheck || (MT.lock && MT.lock.isLocked())) return;
    pullLeads(true).catch(() => { /* silent in the background */ });
  };

  /* ================= Google reviews (Maps JavaScript API, Places library) ================= */
  let mapsLoading = null;
  function loadMaps(key) {
    if (window.google && google.maps && google.maps.importLibrary) return Promise.resolve();
    if (mapsLoading) return mapsLoading;
    mapsLoading = new Promise((res, rej) => {
      window.__mtMapsReady = () => res();
      window.gm_authFailure = () => { mapsLoading = null; rej(new Error('Google rejected the API key. Check it, and make sure "Places API (New)" and "Maps JavaScript API" are enabled for it.')); };
      const sc = document.createElement('script');
      sc.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&loading=async&callback=__mtMapsReady';
      sc.async = true;
      sc.onerror = () => { mapsLoading = null; rej(new Error('Could not reach Google. Check your internet connection.')); };
      document.head.appendChild(sc);
      setTimeout(() => rej(new Error('Google took too long to respond.')), 15000);
    });
    return mapsLoading;
  }
  async function googleSearch(q) {
    const key = secrets.get().googleKey;
    if (!key) throw new Error('Add your Google API key first.');
    await loadMaps(key);
    const { Place } = await google.maps.importLibrary('places');
    const { places } = await Place.searchByText({ textQuery: q, fields: ['id', 'displayName', 'formattedAddress', 'rating', 'userRatingCount'], maxResultCount: 5 });
    return places || [];
  }
  async function googleRefresh() {
    const s = store.state;
    const g = s.integrations.google;
    const key = secrets.get().googleKey;
    if (!key || !g.placeId) throw new Error('Connect your Google business first.');
    await loadMaps(key);
    const { Place } = await google.maps.importLibrary('places');
    const place = new Place({ id: g.placeId });
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'rating', 'userRatingCount', 'reviews', 'googleMapsURI'] });
    Object.assign(g, {
      sample: false, name: place.displayName || g.name, address: place.formattedAddress || '', rating: place.rating || 0, count: place.userRatingCount || 0,
      mapsUrl: place.googleMapsURI || '', reviewUrl: 'https://search.google.com/local/writereview?placeid=' + encodeURIComponent(g.placeId), fetchedAt: new Date().toISOString(),
      reviews: (place.reviews || []).map((r) => ({ author: (r.authorAttribution && r.authorAttribution.displayName) || 'Google user', rating: r.rating || 0, when: r.relativePublishTimeDescription || '', text: typeof r.text === 'string' ? r.text : (r.text && r.text.text) || '' })),
    });
    const today = u.todayISO();
    g.history = (g.history || []).filter((h) => h.date !== today);
    g.history.push({ date: today, rating: g.rating, count: g.count });
    if (!s.settings.company.reviewLink) s.settings.company.reviewLink = g.reviewUrl;
    store.save();
  }

  /* ================= Square CSV import ================= */
  function squareImport(text, fileName) {
    const s = store.state;
    const { headers, rows } = parseCSV(text);
    if (!rows.length) { ui.toast('That file has no rows.', 'err'); return; }
    const isCustomers = !!pickCol(headers, ['Square Customer ID', 'Email Address']) && !!pickCol(headers, ['First Name', 'Last Name']);
    const amountCol = pickCol(headers, ['Total Collected', 'Net Total', 'Gross Sales', 'Total', 'Amount', 'Net Sales']);
    if (isCustomers) return importCustomers(headers, rows);
    if (amountCol) return importPayments(headers, rows, amountCol);
    ui.toast('This does not look like a Square customers or transactions export (' + fileName + ').', 'err');

    function importCustomers(h, list) {
      const col = (n) => pickCol(h, n);
      const F = { first: col(['First Name']), last: col(['Last Name']), email: col(['Email Address', 'Email']), phone: col(['Phone Number', 'Phone']), company: col(['Company Name', 'Company']), street: col(['Street Address 1', 'Address Line 1', 'Address']), city: col(['City', 'Locality']), memo: col(['Memo', 'Note']), sqid: col(['Square Customer ID', 'Reference ID']) };
      const parsed = list.map((r) => ({ name: [r[F.first], r[F.last]].filter(Boolean).join(' ').trim() || r[F.company] || '', email: r[F.email] || '', phone: r[F.phone] || '', company: r[F.company] || '', address: r[F.street] || '', city: r[F.city] || '', notes: r[F.memo] || '', sqid: r[F.sqid] || '' })).filter((x) => x.name || x.email || x.phone);
      const fresh = parsed.filter((x) => !findCustomer(s, x));
      ui.modal({
        title: 'Import Square customers', size: 'sm',
        body: `<p>${parsed.length} customers in the file. <b>${fresh.length} are new</b>; ${parsed.length - fresh.length} already match a client by email, phone, or name and will be skipped.</p>`,
        actions: [{ label: 'Cancel' }, fresh.length ? { label: 'Import ' + fresh.length + ' clients', kind: 'primary', onClick: () => {
          fresh.forEach((x) => s.customers.unshift({ id: u.uid('c'), name: x.name, company: x.company, phone: x.phone, email: x.email, address: x.address, city: x.city, source: 'Other', type: x.company ? 'Commercial' : 'Residential', notes: x.notes, squareId: x.sqid, createdAt: u.todayISO() }));
          s.integrations.square.lastImport = new Date().toISOString();
          store.log('customer', 'Imported ' + fresh.length + ' clients from Square');
          store.save();
          ui.toast(fresh.length + ' clients imported');
        } } : null].filter(Boolean),
      });
    }

    function importPayments(h, list, amtCol) {
      const sq = s.integrations.square;
      const col = (n) => pickCol(h, n);
      const F = { date: col(['Date', 'Transaction Date', 'Created At', 'Payment Date']), id: col(['Payment ID', 'Transaction ID', 'ID', 'Receipt Number']), name: col(['Customer Name', 'Customer', 'Buyer Name']), desc: col(['Description', 'Item', 'Notes', 'Details']) };
      const payments = list.map((r) => ({ date: toISO(r[F.date]), amount: money(r[amtCol]), id: r[F.id] || (r[F.date] + '|' + r[amtCol] + '|' + (r[F.name] || '')), name: r[F.name] || '', desc: r[F.desc] || '' }))
        .filter((x) => x.amount > 0 && x.date && !sq.seenIds.includes(x.id));
      if (!payments.length) { ui.toast('No new payments in this file. Everything was already imported.', 'err'); return; }
      matchSquarePayments(payments);
    }
  }

  /** Lets you apply Square payments ({id, date, amount, name, desc}) to unpaid jobs. Used by CSV import and the live connector. */
  function matchSquarePayments(payments) {
    const s = store.state;
    const sq = s.integrations.square;
    if (!sq.seenIds) sq.seenIds = [];
    const owing = s.deals.filter((d) => d.stage === 'won' && MT.calc.balance(d) > 0);
    const opts = (x) => {
      const c = x.name && s.customers.find((cc) => cc.name.toLowerCase() === x.name.toLowerCase());
      const mine = c ? owing.filter((d) => d.customerId === c.id).sort((a, b) => Math.abs(MT.calc.balance(a) - x.amount) - Math.abs(MT.calc.balance(b) - x.amount)) : [];
      const others = owing.filter((d) => !mine.includes(d)).slice(0, 40);
      return { best: mine[0] && Math.abs(MT.calc.balance(mine[0]) - x.amount) < 1 ? mine[0].id : mine[0] ? mine[0].id : '', html: (mine.length ? '<optgroup label="This client">' + mine.map((d) => `<option value="${d.id}">${u.esc(d.title)} (${u.money(MT.calc.balance(d))} owed)</option>`).join('') + '</optgroup>' : '') + '<optgroup label="Other unpaid jobs">' + others.map((d) => `<option value="${d.id}">${u.esc(store.customerName(d.customerId) + ': ' + d.title)} (${u.money(MT.calc.balance(d))} owed)</option>`).join('') + '</optgroup>' };
    };
    ui.modal({
      title: 'Match Square payments to jobs', size: 'lg',
      body: `<p class="hint">${payments.length} new payments. Each one is matched to an unpaid job for the same client where possible. Change any match, or leave it on "Don't import".</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Customer</th><th class="num">Amount</th><th>Apply to job</th></tr></thead><tbody>
        ${payments.map((x, i) => { const o = opts(x); return `<tr><td class="nowrap">${u.fmtDate(x.date)}</td><td>${u.esc(x.name || 'No name')}<div class="row-sub">${u.esc(x.desc)}</div></td><td class="num">${u.money(x.amount, true)}</td><td><select class="input" data-pi="${i}"><option value="">Don't import</option>${o.html.replace('value="' + o.best + '"', 'value="' + o.best + '" selected')}</select></td></tr>`; }).join('')}
        </tbody></table></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Import matched payments', kind: 'primary', onClick: (b) => {
        let n = 0, total = 0;
        u.qsa('[data-pi]', b).forEach((sel) => {
          const x = payments[+sel.dataset.pi];
          sq.seenIds.push(x.id);
          if (!sel.value) return;
          const d = store.deal(sel.value);
          const inv = store.invoicesFor(d.id).find((v) => MT.calc.invoiceBalance(v) > 0);
          d.payments = d.payments || [];
          d.payments.push({ id: u.uid('pay'), amount: x.amount, date: x.date, method: 'Square', invoiceId: inv ? inv.id : '', squareId: x.id });
          n++; total += x.amount;
        });
        sq.lastImport = new Date().toISOString();
        sq.imported = (sq.imported || 0) + n;
        if (n) store.log('payment', 'Imported ' + n + ' Square payments (' + u.money(total) + ')');
        store.save();
        ui.toast(n ? n + ' payments imported (' + u.money(total) + ')' : 'Nothing imported');
      } }],
    });
  }
  view.squareImport = squareImport;
  view.matchSquarePayments = matchSquarePayments;

  /* ================= Render ================= */
  function stars(r) { const full = Math.round(r * 2) / 2; return '<span class="stars" aria-label="' + r + ' out of 5">' + [1, 2, 3, 4, 5].map((i) => `<i class="${full >= i ? 'on' : full >= i - 0.5 ? 'half' : ''}"></i>`).join('') + '</span>'; }
  function trend(hist) {
    if (!hist || hist.length < 2) return '';
    const first = hist[0], last = hist[hist.length - 1];
    const d = last.count - first.count;
    return `<span class="trend">${d >= 0 ? '+' : ''}${d} reviews since ${u.fmtDate(first.date, { month: 'short', year: 'numeric' })}</span>`;
  }

  view.render = function (root) {
    const s = store.state;
    const I = s.integrations;
    const w = I.website, g = I.google, y = I.yelp, sq = I.square;
    const pc = MT.pay.cfg();
    const gkey = secrets.get().googleKey || '';
    const gh = sync.cfg();
    if (!w.key) { w.key = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); store.save(true); }
    const card = (id, title, status, kind, desc, body) => `
      <section class="panel integ ${view.open === id ? 'open' : ''}" data-card="${id}">
        <button class="integ-head" data-toggle="${id}" aria-expanded="${view.open === id}">
          <span class="integ-icon i-${id}" aria-hidden="true"></span>
          <span class="grow"><b>${title}</b><span class="row-sub">${desc}</span></span>
          ${ui.badge(status, kind)}
        </button>
        <div class="integ-body" ${view.open === id ? '' : 'hidden'}>${body}</div>
      </section>`;

    root.innerHTML = `
      <p class="hint">Connect the services you already use. Keys and tokens are stored only in this browser. They are never included in backups or GitHub sync.</p>
      <div class="integ-list">
      ${card('website', 'Website request form', w.scriptUrl ? 'Connected' : 'Not set up', w.scriptUrl ? 'good' : '', 'Visitors fill out a form on your website, and it becomes a lead here automatically.', `
        <ol class="steps">
          <li>In Google Drive, create a blank Google Sheet named "Website leads". Open <b>Extensions → Apps Script</b>.</li>
          <li>Delete what's there, paste this code, and save. <button class="btn ghost sm" data-copy="script">Copy code</button>
            <pre class="code" id="cp-script">${u.esc(appsScript(w.key))}</pre></li>
          <li>Select <b>Deploy → New deployment → Web app</b>. Set "Execute as" to <b>Me</b> and "Who has access" to <b>Anyone</b>. Deploy, approve access, and copy the Web app URL.</li>
          <li>Paste the URL here:
            <div class="input-with-btn"><input class="input" id="ws-url" value="${u.esc(w.scriptUrl)}" placeholder="https://script.google.com/macros/s/…/exec"><button class="btn primary sm" id="ws-save">Save</button></div></li>
          <li>Add this form to your website, for example in a "Contact" page's HTML block. <button class="btn ghost sm" data-copy="form">Copy form</button>
            <pre class="code" id="cp-form">${u.esc(formSnippet(w.scriptUrl, s.settings.company))}</pre></li>
        </ol>
        <div class="btn-row"><button class="btn primary" id="ws-pull" ${w.scriptUrl ? '' : 'disabled'}>Check for new leads now</button>
          <label class="check"><input type="checkbox" id="ws-auto" ${w.autoCheck ? 'checked' : ''}><span>Check automatically every 10 minutes while the CRM is open</span></label></div>
        <p class="hint">${w.lastPull ? 'Last checked ' + new Date(w.lastPull).toLocaleString() + '. ' : ''}${w.imported ? w.imported + ' leads imported so far.' : ''} New leads land in Leads. The form also records where the visitor came from, so leads from Google search, Google Maps, or ads are labeled automatically.</p>
        <p class="hint">Note: website builders on budget plans (including Squarespace Basic) don't run custom scripts, so this form only works there on a plan with code blocks. On Squarespace Basic, use Squarespace's own form with a "How did you find us?" question, and pick the channel on each lead. See the SEO tab → Setup → Lead tracking.</p>`)}

      ${card('square', 'Square', pc.url ? (pc.lastError ? 'Needs attention' : 'Online payments on') : sq.lastImport ? 'Imported ' + u.fmtShort(sq.lastImport.slice(0, 10)) : 'Not connected', pc.url ? (pc.lastError ? 'warn' : 'good') : sq.lastImport ? 'good' : 'info', 'Customers pay deposits and invoices online by card, and the CRM marks them paid on its own.', `
        <h4>Online payments (automatic)</h4>
        <p>A free Google Apps Script keeps your Square access key on Google's servers. It's never stored in the CRM or on GitHub. The CRM uses it to:</p>
        <ul class="bullets"><li>Create a Square pay link for the exact deposit or invoice balance (in <b>Request the deposit</b>, on each invoice, and in payment reminders).</li><li>Check every 2 minutes while the CRM is open, and record each online payment on the right job and invoice.</li><li>Bring in your other Square payments (card reader, tap to pay) for you to match to jobs.</li></ul>
        <ol class="steps">
          <li>Get your Square key: open the <a href="https://developer.squareup.com/apps" target="_blank" rel="noopener">Square Developer dashboard</a> and sign in with your normal Square account. Select <b>+ Create an application</b> and name it "Mammoth CRM". Open it, switch the toggle at the top to <b>Production</b>, and under <b>Credentials</b> copy the <b>Production Access token</b>.</li>
          <li>Go to <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com → New project</a>. Name it "Mammoth Square". Delete what's there, paste this code, and save. <button class="btn ghost sm" data-copy="paycode">Copy code</button>
            <pre class="code" id="cp-paycode">${u.esc(MT.payConnector.code(pc.key))}</pre></li>
          <li>Select <b>Project Settings</b> (gear icon) → <b>Script properties</b> → <b>Add script property</b>. Property: <code>SQUARE_TOKEN</code>. Value: the token from step 1. Save.</li>
          <li>Back in the Editor, choose <b>authorize</b> in the function menu and select <b>Run</b>. Allow access. If Google says the app isn't verified, select Advanced → Go to Mammoth Square. It's your own script.</li>
          <li>Select <b>Deploy → New deployment → Web app</b>. Set "Execute as" to <b>Me</b> and "Who has access" to <b>Anyone</b>. Deploy and copy the Web app URL.</li>
          <li>Paste the URL here and test it:
            <div class="input-with-btn"><input class="input" id="pc-url" value="${u.esc(pc.url)}" placeholder="https://script.google.com/macros/s/…/exec"><button class="btn primary sm" id="pc-save">Save &amp; test</button></div></li>
        </ol>
        ${pc.locations && pc.locations.length > 1 ? `<label class="field"><span>Square location for payments</span><select class="input" id="pc-loc">${u.options(pc.locations.map((l) => ({ value: l.id, label: l.name + (l.status !== 'ACTIVE' ? ' (inactive)' : '') })), pc.locationId)}</select></label>` : ''}
        ${pc.url ? `<p class="hint">${pc.env === 'sandbox' ? '<b>Sandbox (test mode):</b> no real money moves. ' : ''}${pc.locations && pc.locations.length ? 'Connected to ' + u.esc((pc.locations.find((l) => l.id === pc.locationId) || pc.locations[0]).name) + '. ' : ''}${pc.lastCheck ? 'Last checked ' + new Date(pc.lastCheck).toLocaleString() + '. ' : ''}${MT.pay.openLinks().length} pay ${MT.pay.openLinks().length === 1 ? 'link is' : 'links are'} waiting for payment.</p>
          ${pc.lastError ? `<p class="hint neg">${u.esc(pc.lastError)}</p>` : ''}
          <div class="btn-row"><button class="btn ghost" id="pc-check">Check for payments now</button><button class="btn ghost" id="pc-recent">Bring in other Square payments (last 30 days)</button><button class="btn danger-ghost" id="pc-off">Disconnect</button></div>` : ''}
        <p class="hint">Square charges its normal online card fee on each payment. Customers pay on Square's secure checkout page and never see your CRM. When you change the code above (after a CRM update), paste it again and use Deploy → Manage deployments → Edit → New version. The web address stays the same.</p>

        <h4 style="margin-top:18px">Import from a file</h4>
        <p>Without the connector, you can import Square's exports. It takes about a minute:</p>
        <ul class="bullets">
          <li><b>Customers:</b> Square Dashboard → Customers → Export customers (CSV).</li>
          <li><b>Payments:</b> Square Dashboard → Transactions → choose dates → Export → Transactions CSV.</li>
        </ul>
        <div class="btn-row"><label class="btn primary file-btn">Import a Square CSV<input type="file" accept=".csv,text/csv" id="sq-file" hidden></label><span class="hint">${sq.imported ? sq.imported + ' payments imported so far. ' : ''}Payments you've already imported are skipped automatically.</span></div>`)}

      ${card('google', 'Google reviews', g.placeId ? 'Connected' : g.sample ? 'Sample data' : 'Not set up', g.placeId ? 'good' : g.sample ? 'warn' : '', 'Track your Google rating and review count, and show your latest reviews.', `
        ${g.rating ? `<div class="review-stat"><div class="rs-big">${g.rating.toFixed(1)}</div><div>${stars(g.rating)}<div><b>${g.count}</b> Google reviews ${trend(g.history)}</div><div class="row-sub">${u.esc(g.name || '')}${g.fetchedAt ? ', updated ' + u.fmtDate(g.fetchedAt.slice(0, 10)) : ''}</div></div></div>
          <ul class="reviews">${(g.reviews || []).slice(0, 5).map((r) => `<li><div class="rv-top">${stars(r.rating)}<b>${u.esc(r.author)}</b><span class="row-sub">${u.esc(r.when)}</span></div><p>${u.esc(r.text)}</p></li>`).join('')}</ul>` : ''}
        <ol class="steps">
          <li>In the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud console</a>, create a project, turn on <b>Maps JavaScript API</b> and <b>Places API (New)</b>, and create an API key. Google requires a billing account. Review lookups like this normally stay within Google's free monthly allowance.</li>
          <li>Paste the key: <div class="input-with-btn"><input class="input" type="password" id="g-key" value="${u.esc(gkey)}" placeholder="AIza…" autocomplete="off"><button class="btn ghost sm" id="g-key-save">Save key</button></div>
            <small class="hint">If you limit the key to websites, add your GitHub Pages address. When you open the CRM as a file on this computer, limit the key by API (Places and Maps JavaScript) instead.</small></li>
          <li>Find your business: <div class="input-with-btn"><input class="input" id="g-q" value="${u.esc(s.settings.company.name + (s.settings.company.address ? ' ' + s.settings.company.address : ''))}"><button class="btn ghost sm" id="g-find">Search Google</button></div><div id="g-results"></div></li>
        </ol>
        <div class="btn-row"><button class="btn primary" id="g-refresh" ${g.placeId ? '' : 'disabled'}>Refresh reviews</button>${g.reviewUrl ? `<button class="btn ghost" data-copytext="${u.esc(g.reviewUrl)}">Copy "leave a review" link</button>` : ''}</div>
        <p class="hint">Your review link is used by the "Thank you &amp; review request" template, as the merge field {{company.reviewLink}}.</p>`)}

      ${card('yelp', 'Yelp', y.url ? 'Tracking' : y.sample ? 'Sample data' : 'Not set up', y.url ? 'good' : y.sample ? 'warn' : '', 'Keep an eye on your Yelp rating and review count.', `
        ${y.rating ? `<div class="review-stat"><div class="rs-big">${Number(y.rating).toFixed(1)}</div><div>${stars(y.rating)}<div><b>${y.count}</b> Yelp reviews ${trend(y.history)}</div></div></div>` : ''}
        <p>Yelp only allows its review data to be read from a server, so live sync waits for the cloud connector. For now, paste your Yelp page and record your rating when it changes. Note: Yelp's rules don't allow asking customers for reviews, so review requests use your Google link.</p>
        <div class="form-grid">
          <label class="field span-2"><span>Your Yelp page</span><input class="input" id="y-url" value="${u.esc(y.url)}" placeholder="https://www.yelp.com/biz/…"></label>
          <label class="field"><span>Current rating</span><input class="input" type="number" min="0" max="5" step="0.5" id="y-rating" value="${u.esc(y.rating || '')}"></label>
          <label class="field"><span>Number of reviews</span><input class="input" type="number" min="0" step="1" id="y-count" value="${u.esc(y.count || '')}"></label>
        </div>
        <div class="btn-row"><button class="btn primary" id="y-save">Save Yelp stats</button>${y.url ? `<a class="btn ghost" href="${u.esc(y.url)}" target="_blank" rel="noopener">Open Yelp page</a>` : ''}</div>`)}

      ${card('github', 'GitHub backup & sync', gh.lastSync ? 'Connected' : 'Not set up on this device', gh.lastSync ? 'good' : 'warn', 'Your CRM data and job photos in your private GitHub repository, the same on every device.', `
        <p>Data goes to your private repository <a href="https://github.com/${u.esc(gh.owner)}/${u.esc(gh.repo)}" target="_blank" rel="noopener"><b>${u.esc(gh.owner)}/${u.esc(gh.repo)}</b></a>. Each computer or phone needs an access key once:</p>
        <ol class="steps">
          <li><a class="btn ghost sm" href="https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('Mammoth CRM')}&description=${encodeURIComponent('Sync for the Mammoth CRM app')}&target_name=${encodeURIComponent(gh.owner)}&expires_in=366&contents=write" target="_blank" rel="noopener">Create an access key on GitHub</a> (signed in as ${u.esc(gh.owner)}).</li>
          <li>Under <b>Repository access</b>, choose <b>Only select repositories</b> → <b>${u.esc(gh.repo)}</b>. Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>. Select <b>Generate token</b> and copy it.</li>
          <li>Paste it here: <div class="input-with-btn"><input class="input" type="password" id="gh-key" value="${u.esc(gh.token)}" placeholder="github_pat_…" autocomplete="off"><button class="btn primary sm" id="gh-connect">${gh.token ? 'Reconnect' : 'Connect this device'}</button></div>
            <small class="hint">One key can be used on all your devices. Keep it private: anyone with it can read your CRM data.</small></li>
        </ol>
        <label class="check"><input type="checkbox" id="gh-auto" ${gh.auto ? 'checked' : ''}><span>Sync automatically: send changes a few seconds after saving, and get the latest whenever the app opens</span></label>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="gh-media" ${gh.mediaAuto ? 'checked' : ''}><span>Back up job cam photos and videos (up to 50 MB each) so every device can see them</span></label>
        <p class="hint" id="gh-usage">${gh.token ? 'Checking storage…' : ''}</p>
        <div class="btn-row"><button class="btn ghost" id="gh-pull" ${gh.token ? '' : 'disabled'}>Get latest from GitHub</button><button class="btn ghost" id="gh-push" ${gh.token ? '' : 'disabled'}>Send this device's data</button>${gh.token ? '<button class="btn danger-ghost" id="gh-forget">Disconnect this device</button>' : ''}</div>
        <p id="sync-status" class="sync-status">${gh.lastSync ? 'Last synced ' + u.esc(new Date(gh.lastSync).toLocaleString()) : ''}</p>
        <details class="adv"><summary>Advanced</summary><div class="form-grid" id="st-gh" style="margin-top:10px">
          <label class="field"><span>GitHub account</span><input class="input" name="owner" value="${u.esc(gh.owner)}" autocomplete="off"></label>
          <label class="field"><span>Private data repository</span><input class="input" name="repo" value="${u.esc(gh.repo)}" autocomplete="off"></label>
          <label class="field"><span>Branch</span><input class="input" name="branch" value="${u.esc(gh.branch)}"></label>
          <label class="field"><span>File path</span><input class="input" name="path" value="${u.esc(gh.path)}"></label>
        </div><div class="btn-row"><button class="btn ghost sm" id="gh-save">Save advanced settings</button></div></details>`)}

      ${card('connector', 'Live sync connector', 'Planned', '', 'Yelp reviews and instant website leads.', `
        <p>Yelp only shares its data with a server, not with a CRM running in your browser. A small free connector could hold a Yelp key and pass new data to the CRM.</p>
        <ul class="bullets"><li>Yelp: rating and review count update daily.</li><li>Website: leads arrive instantly instead of every 10 minutes.</li></ul>
        <p class="hint">Square payments already connect through the Square card above. Ask Claude to set this up when you're ready.</p>`)}
      </div>`;

    // expand/collapse
    u.qsa('[data-toggle]', root).forEach((b) => b.addEventListener('click', () => { view.open = view.open === b.dataset.toggle ? '' : b.dataset.toggle; view.render(root); }));
    const copy = (text, label) => u.copyText(text).then(() => ui.toast(label + ' copied'));
    u.qsa('[data-copy]', root).forEach((b) => b.addEventListener('click', () => copy(u.qs('#cp-' + b.dataset.copy, root).textContent, b.dataset.copy === 'form' ? 'Form' : 'Code')));
    u.qsa('[data-copytext]', root).forEach((b) => b.addEventListener('click', () => copy(b.dataset.copytext, 'Review link')));

    // website
    const on = (id, ev, fn) => { const el = u.qs(id, root); if (el) el.addEventListener(ev, fn); };
    on('#ws-save', 'click', () => {
      const url = u.qs('#ws-url', root).value.trim();
      if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { ui.toast('That doesn\'t look like an Apps Script web app URL. It should start with https://script.google.com/', 'err'); return; }
      w.scriptUrl = url; store.save(true); view.render(root); ui.toast(url ? 'Web app URL saved' : 'Website form disconnected');
    });
    on('#ws-pull', 'click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Checking…';
      try { await pullLeads(false); } catch (err) { ui.toast('Could not reach your lead sheet: ' + err.message, 'err'); }
      view.render(root);
    });
    on('#ws-auto', 'change', (e) => { w.autoCheck = e.target.checked; store.save(true); });

    // square
    on('#sq-file', 'change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => squareImport(rd.result, f.name);
      rd.readAsText(f);
      e.target.value = '';
    });
    on('#pc-save', 'click', async (e) => {
      const url = u.qs('#pc-url', root).value.trim();
      if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { ui.toast('That doesn\'t look like an Apps Script web app URL. It should start with https://script.google.com/', 'err'); return; }
      pc.url = url; pc.lastError = ''; store.save(true);
      if (!url) { view.render(root); return; }
      e.target.disabled = true; e.target.textContent = 'Testing…';
      try {
        const st = await MT.pay.test();
        ui.toast('Square connected' + (st.env === 'sandbox' ? ' (sandbox test mode)' : '') + ': ' + ((st.locations || []).map((l) => l.name).join(', ') || 'no locations found'));
      } catch (err) { pc.lastError = err.message; store.save(true); ui.toast(err.message, 'err'); }
      view.render(root);
    });
    on('#pc-loc', 'change', (e) => { pc.locationId = e.target.value; store.save(true); ui.toast('New pay links will use this location'); });
    on('#pc-check', 'click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Checking…';
      try { const n = await MT.pay.check(); if (!n) ui.toast(MT.pay.openLinks().length ? 'No new online payments yet' : 'No pay links are waiting for payment'); }
      catch (err) { ui.toast(err.message, 'err'); }
      view.render(root);
    });
    on('#pc-recent', 'click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Getting payments…';
      try {
        const list = await MT.pay.recent(30);
        if (list.length) matchSquarePayments(list); else ui.toast('No new Square payments in the last 30 days. Everything is already in the CRM.');
      } catch (err) { ui.toast(err.message, 'err'); }
      e.target.disabled = false; e.target.textContent = 'Bring in other Square payments (last 30 days)';
    });
    on('#pc-off', 'click', () => ui.confirm('Disconnect Square?', 'New pay links stop being created and payments are no longer checked. Links already sent still work in Square. Payments already recorded stay.', 'Disconnect', () => { pc.url = ''; pc.lastError = ''; store.save(true); view.render(root); }));

    // google
    on('#g-key-save', 'click', () => { secrets.set('googleKey', u.qs('#g-key', root).value.trim()); ui.toast('Google key saved in this browser'); });
    on('#g-find', 'click', async (e) => {
      const host = u.qs('#g-results', root);
      secrets.set('googleKey', u.qs('#g-key', root).value.trim());
      e.target.disabled = true; host.innerHTML = '<p class="hint">Searching…</p>';
      try {
        const places = await googleSearch(u.qs('#g-q', root).value.trim());
        host.innerHTML = places.length ? '<ul class="list compact">' + places.map((p) => `<li class="list-row" data-place="${u.esc(p.id)}" data-name="${u.esc(p.displayName || '')}"><div class="grow"><div class="row-title">${u.esc(p.displayName || '')}</div><div class="row-sub">${u.esc(p.formattedAddress || '')}</div></div><span class="row-sub">${p.rating ? p.rating + ' ★, ' + (p.userRatingCount || 0) : ''}</span><span class="link">This is us</span></li>`).join('') + '</ul>' : '<p class="hint">No matches. Try your business name and city.</p>';
        u.qsa('[data-place]', host).forEach((li) => li.addEventListener('click', async () => {
          Object.assign(g, { placeId: li.dataset.place, name: li.dataset.name, history: g.sample ? [] : g.history, sample: false });
          store.save(true);
          try { await googleRefresh(); ui.toast('Google reviews connected'); } catch (err) { ui.toast(err.message, 'err'); }
          view.render(root);
        }));
      } catch (err) { host.innerHTML = '<p class="hint neg">' + u.esc(err.message) + '</p>'; }
      e.target.disabled = false;
    });
    on('#g-refresh', 'click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Refreshing…';
      try { await googleRefresh(); ui.toast('Reviews updated'); } catch (err) { ui.toast(err.message, 'err'); }
      view.render(root);
    });

    // yelp
    on('#y-save', 'click', () => {
      const rating = u.num(u.qs('#y-rating', root).value), count = u.num(u.qs('#y-count', root).value);
      if (y.sample) { y.history = []; y.sample = false; }
      y.url = u.qs('#y-url', root).value.trim();
      if (rating) {
        y.rating = rating; y.count = count;
        const today = u.todayISO();
        y.history = (y.history || []).filter((h) => h.date !== today).concat([{ date: today, rating, count }]);
      }
      store.save(true); view.render(root); ui.toast('Yelp stats saved');
    });

    // github
    const ghRead = () => {
      const c = sync.cfg();
      const adv = u.qs('#st-gh', root) ? u.formData(u.qs('#st-gh', root)) : {};
      const changedTarget = ['owner', 'repo', 'path', 'branch'].some((k) => adv[k] !== undefined && adv[k] !== c[k]);
      Object.assign(c, adv, { token: (u.qs('#gh-key', root).value || '').trim(), auto: u.qs('#gh-auto', root).checked, mediaAuto: u.qs('#gh-media', root).checked });
      c.branch = c.branch || 'main'; c.path = (c.path || 'data/crm-data.json').replace(/^\/+/, '');
      if (changedTarget) { c.sha = ''; c.lastSync = ''; }
      sync.setCfg(c);
      return c;
    };
    const busy = (btn, p) => { btn.disabled = true; const t = btn.textContent; btn.textContent = 'Working…'; return p.finally(() => { btn.disabled = false; btn.textContent = t; }); };
    on('#gh-save', 'click', () => { ghRead(); ui.toast('Saved'); view.render(root); });
    on('#gh-auto', 'change', () => { ghRead(); });
    on('#gh-media', 'change', () => { ghRead(); });
    on('#gh-connect', 'click', (ev) => {
      const c = ghRead();
      if (!c.token) { ui.toast('Paste the access key first.', 'err'); return; }
      busy(ev.target, (async () => {
        let r;
        try { r = await sync.test(); } catch (e) { sync.status(e.message, true); return; }
        if (!r.canPush) { sync.status('That key can see ' + r.fullName + ' but cannot save to it. Set Contents to "Read and write".', true); return; }
        if (!r.private) sync.status('Warning: ' + r.fullName + ' is PUBLIC. Make it private on GitHub before syncing client data.', true);
        const meta = await sync.remoteMeta(c).catch(() => null);
        const finish = (msg) => { ui.toast(msg); view.render(root); if (c.mediaAuto) MT.media.backupAll(); };
        if (!meta) { await sync.push(true); finish('Connected. This device\'s data is now on GitHub.'); return; }
        if (c.sha === meta.sha) { finish('Connected'); return; }
        if (store.state.demo) { await sync.pull(); MT.views.estimator.onDataReplaced(); finish('Connected. Loaded your data from GitHub.'); return; }
        ui.modal({
          title: 'Which data should this device use?', size: 'sm',
          body: '<p>GitHub already has CRM data, and this device has its own. Choose which copy to keep. The other one is replaced.</p><p class="hint">Not sure? Download a backup of this device first (Settings → Backups).</p>',
          actions: [
            { label: 'Keep GitHub\'s copy', kind: 'primary', onClick: () => { sync.pull().then(() => { MT.views.estimator.onDataReplaced(); finish('Loaded your data from GitHub'); }, (e) => sync.status(e.message, true)); } },
            { label: 'Keep this device\'s copy', kind: 'ghost', onClick: () => { sync.push(true).then(() => finish('This device\'s data is now on GitHub'), (e) => sync.status(e.message, true)); } },
          ],
        });
      })());
    });
    const doPull = () => sync.pull().then(() => { MT.views.estimator.onDataReplaced(); ui.toast('Loaded the latest data from GitHub'); }, (e) => sync.status(e.message, true));
    on('#gh-push', 'click', (ev) => {
      ghRead();
      busy(ev.target, sync.push(false).then(() => { sync.status('Sent to GitHub ' + new Date().toLocaleTimeString()); ui.toast('Sent to GitHub'); }, (e) => {
        if (e.conflict) {
          ui.modal({ title: 'GitHub has newer data', size: 'sm', body: '<p>' + u.esc(e.message) + '</p>', actions: [
            { label: 'Cancel' },
            { label: 'Get latest instead', kind: 'ghost', onClick: () => doPull() },
            { label: 'Overwrite GitHub', kind: 'danger', onClick: () => { sync.push(true).then(() => ui.toast('Sent to GitHub'), (er) => sync.status(er.message, true)); } },
          ] });
        } else sync.status(e.message, true);
      }));
    });
    on('#gh-pull', 'click', () => { ghRead(); ui.confirm('Get the latest from GitHub?', 'This replaces the data on this device with the copy on GitHub.', 'Get latest', () => { doPull(); }); });
    on('#gh-forget', 'click', () => ui.confirm('Disconnect this device?', 'The access key is removed from this device. Your data stays here and on GitHub.', 'Disconnect', () => { const c = sync.cfg(); c.token = ''; c.sha = ''; c.lastSync = ''; c.dirty = false; sync.setCfg(c); view.render(root); }));
    if (sync.ready() && u.qs('#gh-usage', root)) {
      sync.repoSizeMB().then((mb) => {
        const el = u.qs('#gh-usage', root); if (!el) return;
        const st = MT.media.backupStats();
        el.textContent = (mb == null ? '' : 'Using about ' + (mb < 1 ? '<1' : Math.round(mb)) + ' MB on GitHub (keep it under about 5,000 MB). ') + (st.total ? st.done + ' of ' + st.total + ' photos and videos backed up.' : '');
      });
    }
  };

  view.pullLeads = pullLeads;
  view.secrets = secrets;
  view.loadMaps = loadMaps;
  MT.views.integrations = view;
})();
