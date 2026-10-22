/* Mammoth CRM — the Square payments connector: a Google Apps Script the owner pastes into script.google.com.
   It keeps the Square access token on Google's servers (Script properties → SQUARE_TOKEN), creates Square payment links
   for exact amounts, and reports which ones were paid. The CRM only ever talks to this script, never to Square. */
(function () {
  'use strict';

  /* The source below is copied out as text (Function.toString) and shown on the Integrations page. */
  function connectorCode() {
// ==== START ====
/* Mammoth CRM — connector for Square payments and for estimates & invoices shared with customers.
   - Customer pages: each estimate or invoice you send gets a private web page (this web app + ?d=…) where the customer can
     view it, approve it, ask for changes, or pay. Opens and replies are logged in a Google Sheet it creates for you.
   - Email: estimates and invoices are emailed from your Google account, with the PDF attached.
   - Square (optional): add SQUARE_TOKEN under Project Settings → Script properties (your Square production access token).
     Optional: SQUARE_ENV = sandbox (testing), SQUARE_VERSION = a Square API version date.
   Then Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone. */
var KEY = '__KEY__';

/* Run this once from the editor (select "authorize", then Run) to give the script its permissions. */
function authorize() {
  book_();
  Logger.log('Emails left today: ' + MailApp.getRemainingDailyQuota());
  var c = cfg_();
  if (c.token) Logger.log(JSON.stringify(status_(c)));
  else Logger.log('No SQUARE_TOKEN yet: sending and customer pages work; Square pay links need the token.');
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.d && !p.key) return page_(String(p.d), p.me === '1');
  return handle_(p);
}
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  var p = (e && e.parameter) || {};
  Object.keys(body).forEach(function (k) { p[k] = body[k]; });
  return handle_(p);
}

function handle_(p) {
  if (p.key !== KEY) return out_({ error: 'bad key' });
  try {
    var c = cfg_();
    if (p.action === 'status') return out_(statusAll_(c));
    if (p.action === 'publish') return out_(publish_(p));
    if (p.action === 'email') return out_(email_(p));
    if (p.action === 'events') return out_(events_(p));
    if (!c.token) return out_({ error: 'no token' });
    if (p.action === 'link') return out_(link_(c, p));
    if (p.action === 'check') return out_(check_(c, p));
    if (p.action === 'payments') return out_(recent_(c, p));
    if (p.action === 'cancel') return out_(cancel_(c, p));
    return out_({ error: 'unknown action' });
  } catch (err) {
    return out_({ error: String(err && err.message || err) });
  }
}

function cfg_() {
  var pr = PropertiesService.getScriptProperties();
  var env = String(pr.getProperty('SQUARE_ENV') || 'production').toLowerCase();
  return {
    token: String(pr.getProperty('SQUARE_TOKEN') || '').trim(),
    env: env,
    base: env === 'sandbox' ? 'https://connect.squareupsandbox.com/v2' : 'https://connect.squareup.com/v2',
    version: String(pr.getProperty('SQUARE_VERSION') || '').trim(),
  };
}

function headers_(c) {
  var h = { Authorization: 'Bearer ' + c.token, Accept: 'application/json' };
  if (c.version) h['Square-Version'] = c.version;
  return h;
}

function api_(c, method, path, body) {
  var o = { method: method, headers: headers_(c), muteHttpExceptions: true };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var r = UrlFetchApp.fetch(c.base + path, o);
  var text = r.getContentText() || '{}';
  var j = {};
  try { j = JSON.parse(text); } catch (err) { j = {}; }
  if (r.getResponseCode() >= 300) {
    var e = (j.errors && j.errors[0]) || {};
    throw new Error('Square ' + r.getResponseCode() + ': ' + (e.code || '') + ' ' + (e.detail || text.slice(0, 200)));
  }
  return j;
}

function status_(c) {
  var j = api_(c, 'get', '/locations');
  return {
    ok: true, version: 1, env: c.env,
    locations: (j.locations || []).map(function (l) { return { id: l.id, name: l.name || l.business_name || l.id, status: l.status, currency: l.currency || 'USD' }; }),
  };
}

function statusAll_(c) {
  var st = { ok: true, version: 2, square: false, env: c.env, locations: [], email: true, quota: MailApp.getRemainingDailyQuota() };
  if (c.token) {
    try { var sq = status_(c); st.square = true; st.locations = sq.locations; }
    catch (err) { st.squareError = String(err && err.message || err); }
  }
  return st;
}

function firstLocation_(c) {
  var locs = status_(c).locations.filter(function (l) { return l.status === 'ACTIVE'; });
  if (!locs.length) throw new Error('No active Square location found.');
  return locs[0];
}

/* Creates a Square payment link for an exact amount (in cents). */
function link_(c, p) {
  var amount = Math.round(Number(p.amount) || 0);
  if (amount < 100) throw new Error('The amount must be at least $1.00.');
  var loc = p.location ? { id: p.location, currency: p.currency || 'USD' } : firstLocation_(c);
  var body = {
    idempotency_key: Utilities.getUuid(),
    quick_pay: { name: String(p.name || 'Payment').slice(0, 255), price_money: { amount: amount, currency: loc.currency || 'USD' }, location_id: loc.id },
  };
  if (p.note) body.payment_note = String(p.note).slice(0, 500);
  if (p.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(p.email))) body.pre_populated_data = { buyer_email: String(p.email) };
  var j = api_(c, 'post', '/online-checkout/payment-links', body);
  var l = j.payment_link || {};
  return { id: l.id, url: l.url || l.long_url, orderId: l.order_id, locationId: loc.id, amount: amount };
}

function cancel_(c, p) {
  if (!p.id) throw new Error('Missing link id.');
  api_(c, 'delete', '/online-checkout/payment-links/' + encodeURIComponent(p.id));
  return { ok: true };
}

/* Completed payments since a date, newest first (up to 1,000). */
function payments_(c, since) {
  var out = [], cursor = '', pages = 0;
  do {
    var q = '?sort_order=DESC&limit=100' + (since ? '&begin_time=' + encodeURIComponent(since) : '') + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    var j = api_(c, 'get', '/payments' + q);
    (j.payments || []).forEach(function (x) { if (x.status === 'COMPLETED') out.push(x); });
    cursor = j.cursor || '';
    pages++;
  } while (cursor && pages < 10);
  return out;
}

function slim_(x) {
  var card = x.card_details && x.card_details.card;
  return {
    id: x.id, orderId: x.order_id || '', at: x.created_at,
    amount: (x.amount_money && x.amount_money.amount || 0) / 100,
    tip: (x.tip_money && x.tip_money.amount || 0) / 100,
    refunded: (x.refunded_money && x.refunded_money.amount || 0) / 100,
    customerId: x.customer_id || '', email: x.buyer_email_address || '', note: x.note || '', receipt: x.receipt_number || '',
    source: x.source_type || '', card: card ? (card.card_brand || '') + ' ' + (card.last_4 || '') : '',
  };
}

/* Which of the CRM's payment links (by order id) have been paid. */
function check_(c, p) {
  var ids = String(p.orders || '').split(',').filter(String);
  if (!ids.length) return { payments: [] };
  var want = {};
  ids.forEach(function (id) { want[id] = true; });
  var list = payments_(c, p.since || '').filter(function (x) { return x.order_id && want[x.order_id]; });
  return { payments: list.map(slim_) };
}

/* All recent Square payments (card reader, invoices, links), with customer names where Square has them. */
function recent_(c, p) {
  var days = Math.min(Math.max(Number(p.days) || 30, 1), 120);
  var since = new Date(Date.now() - days * 86400000).toISOString();
  var list = payments_(c, since).map(slim_);
  var ids = [];
  list.forEach(function (x) { if (x.customerId && ids.indexOf(x.customerId) < 0) ids.push(x.customerId); });
  ids = ids.slice(0, 60);
  var names = {};
  if (ids.length) {
    var reqs = ids.map(function (id) { return { url: c.base + '/customers/' + encodeURIComponent(id), method: 'get', headers: headers_(c), muteHttpExceptions: true }; });
    UrlFetchApp.fetchAll(reqs).forEach(function (r, i) {
      try {
        var cu = JSON.parse(r.getContentText()).customer || {};
        names[ids[i]] = [cu.given_name, cu.family_name].filter(String).join(' ') || cu.company_name || cu.email_address || '';
      } catch (err) { /* skip */ }
    });
  }
  list.forEach(function (x) { x.name = names[x.customerId] || ''; });
  return { payments: list };
}

/* ---------- Estimates & invoices shared with customers ---------- */
var TABS = { docs: ['token', 'type', 'number', 'updated', 'chunks', 'data'], events: ['at', 'token', 'type', 'name', 'note'] };
var CHUNK = 45000; // a sheet cell holds 50,000 characters

function book_() {
  var pr = PropertiesService.getScriptProperties();
  var id = pr.getProperty('DOCS_BOOK'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('Mammoth CRM - estimates & invoices sent to customers'); pr.setProperty('DOCS_BOOK', ss.getId()); }
  Object.keys(TABS).forEach(function (n) { if (!ss.getSheetByName(n)) { var sh = ss.insertSheet(n); sh.appendRow(TABS[n]); } });
  var extra = ss.getSheetByName('Sheet1');
  if (extra && ss.getSheets().length > 2) ss.deleteSheet(extra);
  return ss;
}
/* Text cells start with "x" so the sheet never treats saved text as a formula or number. */
function cell_(v) { return 'x' + String(v == null ? '' : v); }
function uncell_(v) { v = String(v == null ? '' : v); return v.charAt(0) === 'x' ? v.slice(1) : v; }
function newToken_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
function validToken_(t) { return /^[A-Za-z0-9]{20,64}$/.test(String(t || '')); }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function findRow_(sh, token) {
  var n = sh.getLastRow();
  if (n < 2) return 0;
  var vals = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (uncell_(vals[i][0]) === token) return i + 2;
  return 0;
}

/* Saves (or updates) a document the customer can open. The link stays the same when you send an updated copy. */
function publish_(p) {
  var doc = typeof p.doc === 'string' ? JSON.parse(p.doc) : (p.doc || {});
  var token = validToken_(p.token) ? String(p.token) : newToken_();
  var json = JSON.stringify(doc), parts = [];
  for (var i = 0; i < json.length; i += CHUNK) parts.push(cell_(json.slice(i, i + CHUNK)));
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = book_().getSheetByName('docs');
    var row = findRow_(sh, token) || sh.getLastRow() + 1;
    var values = [cell_(token), cell_(doc.type), cell_(doc.number), new Date().toISOString(), parts.length].concat(parts);
    sh.getRange(row, 1, 1, values.length).setValues([values]);
    var last = sh.getLastColumn();
    if (last > values.length) sh.getRange(row, values.length + 1, 1, last - values.length).clearContent();
  } finally { lock.releaseLock(); }
  return { token: token };
}

function readDoc_(token) {
  if (!validToken_(token)) return null;
  var sh = book_().getSheetByName('docs');
  var row = findRow_(sh, token);
  if (!row) return null;
  var n = Number(sh.getRange(row, 5).getValue()) || 0;
  if (!n) return null;
  var parts = sh.getRange(row, 6, 1, n).getValues()[0].map(uncell_);
  try { return JSON.parse(parts.join('')); } catch (err) { return null; }
}

function logEvent_(token, type, name, note) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { book_().getSheetByName('events').appendRow([new Date().toISOString(), cell_(token), cell_(type), cell_(name), cell_(note)]); }
  finally { lock.releaseLock(); }
}

function eventsFor_(token) {
  var sh = book_().getSheetByName('events'), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 5).getValues().filter(function (r) { return uncell_(r[1]) === token; })
    .map(function (r) { return { at: String(r[0]), type: uncell_(r[2]), name: uncell_(r[3]), note: uncell_(r[4]) }; });
}

/* Opens, approvals, change requests, and questions since a time (for the CRM to pick up). */
function events_(p) {
  var since = String(p.since || '');
  var sh = book_().getSheetByName('events'), n = sh.getLastRow();
  if (n < 2) return { events: [] };
  var start = Math.max(2, n - 2000);
  var rows = sh.getRange(start, 1, n - start + 1, 5).getValues();
  var out = [];
  rows.forEach(function (r) {
    var at = String(r[0]);
    if (since && at <= since) return;
    out.push({ at: at, token: uncell_(r[1]), type: uncell_(r[2]), name: uncell_(r[3]), note: uncell_(r[4]) });
  });
  return { events: out.slice(-500) };
}

/* Emails a document from your Google account, with the PDF attached when the CRM sends one. */
function email_(p) {
  var to = String(p.to || '').trim();
  if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(to)) throw new Error('That email address doesn\'t look right: ' + to);
  var body = String(p.body || '');
  var html = '<div style="font:15px/1.5 Arial,sans-serif;color:#222;max-width:560px">' + esc_(body).replace(/\n/g, '<br>');
  if (p.url) html += '<p style="margin:22px 0"><a href="' + esc_(p.url) + '" style="background:' + esc_(p.color || '#24563a') + ';color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">' + esc_(p.button || 'View online') + '</a></p>';
  html += '</div>';
  var msg = { to: to, subject: String(p.subject || 'Your estimate').slice(0, 250), body: body, htmlBody: html, name: String(p.fromName || '').slice(0, 80) };
  if (p.replyTo && /@/.test(p.replyTo)) msg.replyTo = String(p.replyTo);
  if (p.pdf) msg.attachments = [Utilities.newBlob(Utilities.base64Decode(String(p.pdf)), 'application/pdf', String(p.filename || 'document.pdf'))];
  MailApp.sendEmail(msg);
  if (validToken_(p.token)) logEvent_(String(p.token), 'emailed', '', to);
  return { ok: true, to: to, at: new Date().toISOString(), quota: MailApp.getRemainingDailyQuota() };
}

/* Called from the customer's page (google.script.run). kind: approve | changes | question. */
function customerAction(token, kind, name, note) {
  token = String(token || '');
  var doc = readDoc_(token);
  if (!doc) throw new Error('This link is no longer available.');
  if (['approve', 'changes', 'question'].indexOf(kind) < 0) throw new Error('Unknown request.');
  name = String(name || '').trim().slice(0, 120);
  note = String(note || '').trim().slice(0, 4000);
  if (kind === 'approve' && (!name || doc.type !== 'estimate')) throw new Error('Please type your full name to approve.');
  if (kind !== 'approve' && !note) throw new Error('Please write your note first.');
  if (kind === 'approve' && eventsFor_(token).some(function (e) { return e.type === 'approve'; })) return { ok: true, already: true };
  logEvent_(token, kind, name, note);
  if (doc.notify && /@/.test(doc.notify)) {
    var what = kind === 'approve' ? 'approved' : kind === 'changes' ? 'asked for changes to' : 'sent a question about';
    try {
      MailApp.sendEmail(doc.notify, (doc.customer || 'Your customer') + ' ' + what + ' ' + (doc.type === 'invoice' ? 'invoice ' : 'estimate ') + (doc.number || ''),
        (doc.customer || 'Your customer') + ' ' + what + ' ' + (doc.type || 'estimate') + ' ' + (doc.number || '') + (doc.title ? ' (' + doc.title + ')' : '') + '.\n\n' + (name ? 'Name: ' + name + '\n' : '') + (note ? 'Note:\n' + note + '\n' : '') + '\nIt is also in the CRM.');
    } catch (err) { /* the event is logged either way */ }
  }
  return { ok: true };
}

/* The customer's page. */
function page_(token, me) {
  var doc = readDoc_(token);
  if (!doc) return HtmlService.createHtmlOutput('<p style="font:16px Arial,sans-serif;padding:40px;color:#333">This link is no longer available. Please contact us for an updated copy.</p>').setTitle('Not available');
  if (!me) logEvent_(token, 'view', '', ''); // your own look from the CRM (&me=1) isn't counted as the customer opening it
  var evs = eventsFor_(token);
  var approved = null, notes = [];
  evs.forEach(function (e) { if (e.type === 'approve' && !approved) approved = e; if (e.type === 'changes' || e.type === 'question') notes.push(e); });
  var color = esc_(doc.color || '#24563a');
  var isEst = doc.type === 'estimate';
  var fmt = function (iso) { try { return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'MMM d, yyyy'); } catch (err) { return ''; } };
  var panel = '';
  if (isEst && approved) {
    panel += '<div class="ok">Approved by <b>' + esc_(approved.name) + '</b> on ' + esc_(fmt(approved.at)) + '. Thank you! We\'ll be in touch to schedule.</div>';
    if (doc.payUrl && doc.deposit) panel += '<a class="btn" target="_top" href="' + esc_(doc.payUrl) + '">' + esc_(doc.payLabel || 'Pay the deposit online') + '</a>';
  } else if (isEst) {
    panel += '<h2>Ready to go ahead?</h2><p>Type your full name to approve this estimate' + (doc.deposit ? ' (deposit ' + esc_(doc.deposit) + ')' : '') + '.</p>'
      + '<input id="nm" placeholder="Your full name" autocomplete="name"><label class="chk"><input type="checkbox" id="ag"> I approve the work and price in this estimate' + (doc.terms ? ' and the terms above' : '') + '.</label>'
      + '<button class="btn" onclick="act(\'approve\')">Approve estimate</button>';
    if (doc.payUrl && doc.deposit) panel += '<p class="small">After approving, you can pay the deposit online.</p>';
    panel += '<h2 style="margin-top:26px">Want something changed?</h2><p>Tell us what to add, remove, or adjust, and we\'ll send an updated estimate.</p>'
      + '<textarea id="nt" rows="4" placeholder="For example: please also quote grinding the second stump, or skip the hedge trimming."></textarea>'
      + '<button class="btn ghost" onclick="act(\'changes\')">Send my changes</button>';
  } else {
    if (doc.payUrl && doc.balanceDue) panel += '<h2>Balance due: ' + esc_(doc.balanceDue) + '</h2><a class="btn" target="_top" href="' + esc_(doc.payUrl) + '">' + esc_(doc.payLabel || 'Pay online') + '</a>';
    else if (!doc.balanceDue) panel += '<div class="ok">This invoice is paid. Thank you!</div>';
    panel += '<h2 style="margin-top:24px">Questions about this invoice?</h2><textarea id="nt" rows="3" placeholder="Write your question here."></textarea><button class="btn ghost" onclick="act(\'question\')">Send question</button>';
  }
  if (notes.length) panel += '<div class="sent"><b>Your notes so far</b>' + notes.map(function (n) { return '<p>' + esc_(fmt(n.at)) + ': ' + esc_(n.note) + '</p>'; }).join('') + '</div>';
  panel += '<p class="small">Questions? Call ' + esc_(doc.phone || '') + (doc.email ? ' or email ' + esc_(doc.email) : '') + '.</p>';
  var html = '<!doctype html><html><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<style>' + (doc.css || '') + '\nbody{margin:0;background:#eef1ec;font-family:Arial,sans-serif;color:#222}.wrap{max-width:820px;margin:0 auto;padding:16px}.paper{background:#fff;border-radius:10px;box-shadow:0 2px 14px rgba(0,0,0,.08);overflow:hidden}'
    + '.panel{background:#fff;border-radius:10px;margin-top:16px;padding:20px;box-shadow:0 2px 14px rgba(0,0,0,.06)}.panel h2{font-size:18px;margin:0 0 6px}.panel p{margin:6px 0 10px}'
    + '.panel input#nm,.panel textarea{width:100%;box-sizing:border-box;font:16px Arial,sans-serif;padding:11px;border:1px solid #bbb;border-radius:6px;margin:4px 0 10px}'
    + '.chk{display:flex;gap:8px;align-items:flex-start;font-size:15px;margin:4px 0 12px}.btn{display:inline-block;background:' + color + ';color:#fff;border:0;border-radius:6px;padding:12px 22px;font:bold 16px Arial,sans-serif;text-decoration:none;cursor:pointer}'
    + '.btn.ghost{background:#fff;color:' + color + ';border:2px solid ' + color + '}.ok{background:#e7f4ea;border:1px solid #9ccfa8;padding:12px 14px;border-radius:6px;margin-bottom:12px}.sent{background:#f5f5f2;padding:10px 14px;border-radius:6px;margin-top:16px}.small{font-size:13px;color:#666}#msg{margin-top:10px;font-weight:bold}</style>'
    + '<title>' + esc_((isEst ? 'Estimate ' : 'Invoice ') + (doc.number || '') + ' · ' + (doc.company || '')) + '</title></head><body><div class="wrap">'
    + '<div class="paper"><div class="doc-sheet" style="--pr-color:' + color + '">' + (doc.html || '') + '</div></div>'
    + '<div class="panel">' + panel + '<div id="msg"></div></div></div>'
    + '<script>var T=' + JSON.stringify(token) + ';function v(id){var e=document.getElementById(id);return e?e.value:"";}'
    + 'function act(k){var m=document.getElementById("msg");if(k==="approve"&&!document.getElementById("ag").checked){m.textContent="Please tick the box to approve.";return;}'
    + 'm.textContent="Sending…";google.script.run.withSuccessHandler(function(){m.textContent=k==="approve"?"Approved. Thank you! Reloading…":"Sent. Thank you, we\'ll get back to you soon.";if(k==="approve")setTimeout(function(){location.reload();},1200);var t=document.getElementById("nt");if(t&&k!=="approve")t.value="";})'
    + '.withFailureHandler(function(e){m.textContent=(e&&e.message)||"Something went wrong. Please call us.";}).customerAction(T,k,v("nm"),v("nt"));}</script>'
    + '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle((isEst ? 'Estimate ' : 'Invoice ') + (doc.number || '')).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// ==== END ====
  }

  window.MT = window.MT || {};
  MT.payConnector = {
    VERSION: 1,
    code(key) {
      const src = connectorCode.toString();
      const a = src.indexOf('// ==== START ====') + '// ==== START ===='.length;
      const b = src.indexOf('// ==== END ====');
      return src.slice(a, b).trim().replace('__KEY__', key) + '\n';
    },
  };
})();
