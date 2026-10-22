/* Mammoth CRM — the Square payments connector: a Google Apps Script the owner pastes into script.google.com.
   It keeps the Square access token on Google's servers (Script properties → SQUARE_TOKEN), creates Square payment links
   for exact amounts, and reports which ones were paid. The CRM only ever talks to this script, never to Square. */
(function () {
  'use strict';

  /* The source below is copied out as text (Function.toString) and shown on the Integrations page. */
  function connectorCode() {
// ==== START ====
/* Mammoth CRM — Square payments connector.
   Setup: Project Settings → Script properties → add SQUARE_TOKEN (your Square production access token).
   Optional: SQUARE_ENV = sandbox (for testing), SQUARE_VERSION = a Square API version date.
   Then Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone. */
var KEY = '__KEY__';

/* Run this once from the editor (select "authorize", then Run) to give the script permission to contact Square. */
function authorize() {
  var c = cfg_();
  if (!c.token) throw new Error('Add SQUARE_TOKEN under Project Settings → Script properties first.');
  Logger.log(JSON.stringify(status_(c)));
}

function doGet(e) { return handle_((e && e.parameter) || {}); }
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
    if (!c.token) return out_({ error: 'no token' });
    if (p.action === 'status') return out_(status_(c));
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
