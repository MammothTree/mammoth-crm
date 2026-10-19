/* Mammoth CRM — SEO connector: the Google Apps Script the owner pastes into a Google Sheet.
   It runs on Google's servers (free), so it can crawl the website, sign in to Search Console and
   Google Analytics, run the weekly audit on a schedule, and later hold the AI key.
   The script is kept here as real code so it stays readable. It never runs in the browser. */
(function () {
  'use strict';
  const MT = window.MT;
  const VERSION = 1;

  function connectorCode() {
// ==== START ====
// Mammoth CRM SEO connector. Paste into Extensions > Apps Script of a Google Sheet named "Mammoth SEO".
// It crawls your website, reads Search Console and Google Analytics, and stores the results in this sheet
// for the CRM to read. Nothing here can change your website.
var VERSION = 1;
var KEY = '__KEY__';
var MAX_PAGES = 150;
var UA = 'Mammoth-SEO-Audit/1 (website owner audit)';
var DEADLINE = 0;

/** Run this once from the editor (select "authorize", then Run) to approve access. */
function authorize() {
  cfg_();
  book_();
  ScriptApp.getOAuthToken();
  UrlFetchApp.fetch('https://www.google.com/', { muteHttpExceptions: true });
  return 'Authorized';
}

function doGet(e) { return handle_((e && e.parameter) || {}); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  var p = (e && e.parameter) || {};
  Object.keys(p).forEach(function (k) { if (body[k] === undefined) body[k] = p[k]; });
  return handle_(body);
}
function handle_(p) {
  if (p.key !== KEY) return out_({ error: 'bad key' });
  try {
    if (p.action === 'status') return out_(status_());
    if (p.action === 'config') return out_(setConfig_(p));
    if (p.action === 'sites') return out_({ sites: gscSites_() });
    if (p.action === 'properties') return out_({ properties: ga4Properties_() });
    if (p.action === 'latest') return out_(latest_());
    if (p.action === 'run') return out_(run_(p.part || 'all'));
    if (p.action === 'schedule') return out_(schedule_(String(p.on) === '1' || p.on === true));
    if (p.action === 'ai') return out_(ai_(p));
    return out_({ error: 'Unknown action' });
  } catch (err) {
    return out_({ error: String((err && err.message) || err) });
  }
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- settings (Project Settings > Script properties) ---------- */
function cfg_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  return {
    site: p.SITE || '', gsc: p.GSC_SITE || '', ga4: p.GA4_PROPERTY || '', email: p.NOTIFY_EMAIL || '',
    aiProvider: p.AI_PROVIDER || 'anthropic', aiKey: p.AI_KEY || '', aiModel: p.AI_MODEL || 'claude-opus-5-5', aiEffort: p.AI_EFFORT || 'medium',
  };
}
function setConfig_(p) {
  var props = PropertiesService.getScriptProperties();
  // The AI key is never accepted from the web. Add it yourself under Script properties as AI_KEY.
  var map = { site: 'SITE', gsc: 'GSC_SITE', ga4: 'GA4_PROPERTY', email: 'NOTIFY_EMAIL', aiModel: 'AI_MODEL', aiEffort: 'AI_EFFORT' };
  Object.keys(map).forEach(function (k) { if (p[k] !== undefined) props.setProperty(map[k], String(p[k]).trim()); });
  return status_();
}
function status_() {
  var c = cfg_();
  var scheduled = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'weekly_'; });
  return {
    ok: true, version: VERSION, site: c.site, gsc: c.gsc, ga4: c.ga4, email: c.email, scheduled: scheduled,
    ai: { provider: c.aiProvider, configured: !!c.aiKey, model: c.aiModel, effort: c.aiEffort },
    meta: load_('meta') || {},
  };
}

/* ---------- storage: JSON kept in hidden tabs of this sheet ---------- */
function book_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function save_(name, obj) {
  var ss = book_(), title = '_' + name;
  var sh = ss.getSheetByName(title) || ss.insertSheet(title);
  sh.clear();
  var text = JSON.stringify(obj), rows = [];
  // Each cell holds up to 50,000 characters. The "x" prefix keeps Sheets from reading a chunk as a number or formula.
  for (var i = 0; i < text.length; i += 40000) rows.push(['x' + text.slice(i, i + 40000)]);
  if (rows.length) sh.getRange(1, 1, rows.length, 1).setNumberFormat('@').setValues(rows);
}
function load_(name) {
  var sh = book_().getSheetByName('_' + name);
  if (!sh || !sh.getLastRow()) return null;
  var text = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]).slice(1); }).join('');
  try { return JSON.parse(text); } catch (err) { return null; }
}
function setMeta_(k, v) { var m = load_('meta') || {}; m[k] = v; save_('meta', m); }
function latest_() {
  return { status: status_(), crawl: load_('crawl'), search: load_('search'), analytics: load_('analytics'), index: load_('index'), archive: load_('archive') || [] };
}

/* ---------- runs ---------- */
function timeLeft_() { return DEADLINE ? DEADLINE - Date.now() : 330000; }
function run_(part) {
  DEADLINE = Date.now() + 330000; // Apps Script stops at 6 minutes.
  var steps = part === 'all' ? ['crawl', 'search', 'analytics', 'index'] : [part];
  var fns = { crawl: crawl_, search: search_, analytics: analytics_, index: index_ };
  var done = {}, errors = {}, c = cfg_();
  steps.forEach(function (s) {
    if (!fns[s]) { errors[s] = 'Unknown step'; return; }
    if (part === 'all' && ((s === 'search' || s === 'index') && !c.gsc || s === 'analytics' && !c.ga4)) return;
    try { done[s] = fns[s](); } catch (err) { errors[s] = String((err && err.message) || err); }
  });
  setMeta_('lastRun', { at: new Date().toISOString(), part: part, done: done, errors: errors });
  return { ok: true, done: done, errors: errors };
}
function weekly_() {
  var r = run_('all');
  var c = cfg_();
  if (c.email) {
    try { MailApp.sendEmail(c.email, 'Your weekly SEO audit is ready', summaryText_(r)); } catch (err) { /* email is optional */ }
  }
}
function summaryText_(r) {
  var lines = ['The weekly website audit finished.'];
  var crawl = load_('crawl'), search = load_('search');
  if (crawl) lines.push('Pages checked: ' + crawl.pages.length);
  if (search && search.daily) {
    var last = search.daily.slice(-28);
    lines.push('Google search clicks, last 28 days: ' + last.reduce(function (a, x) { return a + x[1]; }, 0));
  }
  Object.keys(r.errors).forEach(function (k) { lines.push('Problem with ' + k + ': ' + r.errors[k]); });
  lines.push('', 'Open the SEO tab in Mammoth CRM to see the issues and suggested fixes.');
  return lines.join('\n');
}
function schedule_(on) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'weekly_') ScriptApp.deleteTrigger(t); });
  if (on) ScriptApp.newTrigger('weekly_').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
  return status_();
}

/* ---------- Google APIs ---------- */
function gapi_(method, url, payload) {
  var opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (payload) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(payload); }
  var res = UrlFetchApp.fetch(url, opt), code = res.getResponseCode(), j = {};
  try { j = JSON.parse(res.getContentText() || '{}'); } catch (err) { j = {}; }
  if (code >= 300) throw new Error((j.error && j.error.message) || ('Google returned error ' + code));
  return j;
}
function gscSites_() {
  return (gapi_('get', 'https://www.googleapis.com/webmasters/v3/sites').siteEntry || []).map(function (s) { return { url: s.siteUrl, level: s.permissionLevel }; });
}
function ga4Properties_() {
  var out = [];
  (gapi_('get', 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200').accountSummaries || []).forEach(function (a) {
    (a.propertySummaries || []).forEach(function (p) { out.push({ id: String(p.property).replace('properties/', ''), name: p.displayName, account: a.displayName }); });
  });
  return out;
}
function ymd_(d) { return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); }
function daysAgo_(n) { var d = new Date(); d.setUTCDate(d.getUTCDate() - n); return ymd_(d); }

function search_() {
  var c = cfg_();
  if (!c.gsc) throw new Error('Choose your Search Console property first.');
  var q = function (body) { return gapi_('post', 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(c.gsc) + '/searchAnalytics/query', body).rows || []; };
  var slim = function (rows) { return rows.map(function (r) { return [r.keys, r.clicks, r.impressions, Math.round(r.ctr * 10000) / 10000, Math.round(r.position * 10) / 10]; }); };
  // Search Console data is about 3 days behind. Two matching 28-day windows allow week-over-week style comparisons.
  var end = daysAgo_(3), start = daysAgo_(30), prevEnd = daysAgo_(31), prevStart = daysAgo_(58);
  var data = {
    at: new Date().toISOString(), site: c.gsc, range: { start: start, end: end, prevStart: prevStart, prevEnd: prevEnd },
    daily: slim(q({ startDate: daysAgo_(93), endDate: end, dimensions: ['date'], rowLimit: 200 })),
    queries: slim(q({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 1000 })),
    prevQueries: slim(q({ startDate: prevStart, endDate: prevEnd, dimensions: ['query'], rowLimit: 1000 })),
    pages: slim(q({ startDate: start, endDate: end, dimensions: ['page'], rowLimit: 500 })),
    queryPages: slim(q({ startDate: start, endDate: end, dimensions: ['query', 'page'], rowLimit: 2500 })),
  };
  save_('search', data);
  setMeta_('searchAt', data.at);
  return { queries: data.queries.length };
}

function analytics_() {
  var c = cfg_();
  if (!c.ga4) throw new Error('Choose your Google Analytics property first.');
  var run = function (body) {
    var j = gapi_('post', 'https://analyticsdata.googleapis.com/v1beta/properties/' + encodeURIComponent(c.ga4) + ':runReport', body);
    return (j.rows || []).map(function (r) {
      return (r.dimensionValues || []).map(function (v) { return v.value; }).concat((r.metricValues || []).map(function (v) { return Number(v.value); }));
    });
  };
  var organic = { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: 'Organic Search' } } };
  var data = {
    at: new Date().toISOString(), property: c.ga4,
    daily: run({ dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }], dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }], limit: 5000 }),
    landing: run({ dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }], dimensionFilter: organic, limit: 200 }),
    events: run({ dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'keyEvents' }], dimensionFilter: organic, limit: 50 }),
  };
  save_('analytics', data);
  setMeta_('analyticsAt', data.at);
  return { days: data.daily.length };
}

function index_() {
  var c = cfg_();
  if (!c.gsc) throw new Error('Choose your Search Console property first.');
  var crawl = load_('crawl');
  if (!crawl) throw new Error('Run the site audit first.');
  var urls = crawl.pages.filter(function (p) { return p.status === 200 && p.title !== undefined && !/noindex/i.test((p.robots || '') + ' ' + (p.xRobots || '')); })
    .map(function (p) { return p.url; }).slice(0, 150);
  var prev = {};
  ((load_('index') || {}).results || []).forEach(function (r) { prev[r.url] = r; });
  var results = [], stopped = false;
  for (var i = 0; i < urls.length; i++) {
    if (stopped || timeLeft_() < 20000) { if (prev[urls[i]]) { prev[urls[i]].stale = true; results.push(prev[urls[i]]); } continue; }
    try {
      var j = gapi_('post', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: urls[i], siteUrl: c.gsc });
      var s = (j.inspectionResult && j.inspectionResult.indexStatusResult) || {};
      results.push({ url: urls[i], verdict: s.verdict || '', coverage: s.coverageState || '', state: s.indexingState || '', lastCrawl: s.lastCrawlTime || '', googleCanonical: s.googleCanonical || '', userCanonical: s.userCanonical || '', fetch: s.pageFetchState || '', robots: s.robotsTxtState || '' });
    } catch (err) {
      var msg = String((err && err.message) || err);
      results.push({ url: urls[i], error: msg });
      if (/quota|rate limit/i.test(msg)) stopped = true;
    }
  }
  var at = new Date().toISOString();
  save_('index', { at: at, site: c.gsc, results: results });
  setMeta_('indexAt', at);
  return { inspected: results.length };
}

/* ---------- website crawler ---------- */
function crawl_() {
  var c = cfg_();
  if (!c.site) throw new Error('Add your website address first.');
  var t0 = Date.now();
  var origin = c.site.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(origin)) origin = 'https://' + origin;
  var host = hostOf_(origin);
  var robots = get_(origin + '/robots.txt');
  var sm = get_(origin + '/sitemap.xml');
  var sitemap = [], m, re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  if (sm.code === 200) while ((m = re.exec(sm.text))) { var su = norm_(decode_(m[1])); if (su) sitemap.push(su); }
  var queue = [norm_(origin + '/')].concat(sitemap), seen = {}, pages = [];
  while (queue.length && pages.length < MAX_PAGES && Date.now() - t0 < 200000 && timeLeft_() > 60000) {
    var batch = [];
    while (queue.length && batch.length < 8) {
      var next = queue.shift();
      if (next && !seen[next] && crawlable_(next, host)) { seen[next] = 1; batch.push(next); }
    }
    if (!batch.length) continue;
    var b0 = Date.now();
    var res = UrlFetchApp.fetchAll(batch.map(function (u) { return { url: u, muteHttpExceptions: true, followRedirects: false, headers: { 'User-Agent': UA } }; }));
    var ms = Math.round((Date.now() - b0) / batch.length);
    res.forEach(function (r, i) {
      var url = batch[i], code = r.getResponseCode(), h = r.getAllHeaders();
      if (code >= 300 && code < 400) {
        var to = hdr_(h, 'location') ? norm_(abs_(hdr_(h, 'location'), url)) : '';
        pages.push({ url: url, status: code, redirect: to });
        if (to) queue.push(to);
        return;
      }
      var type = hdr_(h, 'content-type');
      if (code !== 200 || type.indexOf('html') < 0) { pages.push({ url: url, status: code, type: type.split(';')[0] }); return; }
      var page = extract_(r.getContentText(), url, host);
      page.status = code;
      page.ms = ms;
      page.xRobots = hdr_(h, 'x-robots-tag');
      page.inSitemap = sitemap.indexOf(url) >= 0;
      pages.push(page);
      page.links.forEach(function (l) { if (!seen[l.url]) queue.push(l.url); });
    });
    Utilities.sleep(250);
  }
  var crawl = {
    at: new Date().toISOString(), site: origin,
    robots: { status: robots.code, text: robots.code === 200 ? robots.text.slice(0, 3000) : '' },
    sitemap: { status: sm.code, urls: sitemap.slice(0, 500) },
    pages: pages,
    truncated: queue.some(function (u) { return u && !seen[u] && crawlable_(u, host); }),
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  save_('crawl', crawl);
  // Twelve weeks of page snapshots, used for change history and rollback text.
  var archive = load_('archive') || [];
  archive.push({ at: crawl.at, pages: pages.map(function (p) {
    return { url: p.url, status: p.status, redirect: p.redirect || '', title: p.title || '', description: p.description || '', h1: (p.h1 || []).join(' | '), canonical: p.canonical || '', robots: p.robots || '', words: p.words || 0, hash: p.hash || '' };
  }) });
  while (archive.length > 12) archive.shift();
  save_('archive', archive);
  setMeta_('crawlAt', crawl.at);
  return { pages: pages.length };
}
function get_(url) {
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': UA } });
    return { code: r.getResponseCode(), text: r.getContentText() };
  } catch (err) { return { code: 0, text: '' }; }
}
function hdr_(h, name) {
  for (var k in h) if (k.toLowerCase() === name) return String(h[k] || '');
  return '';
}
function hostOf_(u) { var m = String(u).match(/^https?:\/\/([^\/?#]+)/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; }
function norm_(u) {
  u = String(u || '').split('#')[0];
  var m = u.match(/^(https?):\/\/([^\/?]+)([^?]*)(\?.*)?$/i);
  if (!m) return '';
  var path = m[3] || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return m[1].toLowerCase() + '://' + m[2].toLowerCase() + path + (m[4] || '');
}
function abs_(href, base) {
  href = String(href || '').trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  var m = base.match(/^(https?:\/\/[^\/?#]+)([^?#]*)/i);
  var root = m[1], path = m[2] || '/';
  if (href.indexOf('//') === 0) return base.split(':')[0] + ':' + href;
  if (href.charAt(0) === '/') return root + href;
  if (href.charAt(0) === '?' || href.charAt(0) === '#' || !href) return root + path + (href.charAt(0) === '?' ? href : '');
  var parts = (path.replace(/[^\/]*$/, '') + href).split('/'), outp = [];
  parts.forEach(function (s) { if (s === '..') { if (outp.length > 1) outp.pop(); } else if (s !== '.') outp.push(s); });
  return root + outp.join('/');
}
function crawlable_(u, host) {
  if (hostOf_(u) !== host) return false;
  if (u.indexOf('?') >= 0) return false; // filters, pagination, and image sizes repeat other pages
  var path = u.replace(/^https?:\/\/[^\/]+/i, '');
  if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mov|css|js|ico|xml|txt|json)$/i.test(path)) return false;
  return !/^\/(cart|checkout|account|commerce|api|s|static|config|universal)(\/|$)/i.test(path);
}
function decode_(s) {
  var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™' };
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, k) {
    if (k.charAt(0) === '#') {
      var n = k.charAt(1).toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      try { return String.fromCodePoint(n); } catch (err) { return all; }
    }
    var v = named[k.toLowerCase()];
    return v === undefined ? all : v;
  });
}
function text_(s) {
  return decode_(String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li|h[1-6]|section|td)>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function attrs_(tag) {
  var out = {}, re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g, m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decode_(m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5]);
  return out;
}
function schemaTypes_(node, out, biz) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(function (n) { schemaTypes_(n, out, biz); }); return; }
  var t = node['@type'];
  [].concat(t || []).forEach(function (x) {
    out.push(String(x));
    if (/LocalBusiness|TreeService|HomeAndConstructionBusiness|ProfessionalService|Organization|Landscap/i.test(x)) {
      biz.push({ type: String(x), name: node.name || '', telephone: node.telephone || '', address: !!node.address, areaServed: !!node.areaServed, url: node.url || '' });
    }
  });
  if (node['@graph']) schemaTypes_(node['@graph'], out, biz);
}
function extract_(html, url, host) {
  var head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  var body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  var strip = function (s) { return s.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' '); };
  var bodyClean = strip(body);
  var main = (bodyClean.match(/<main[\s\S]*<\/main>/i) || [bodyClean])[0];
  var metas = {}, m;
  (head.match(/<meta\b[^>]*>/gi) || []).forEach(function (tag) {
    var a = attrs_(tag), k = (a.name || a.property || a['http-equiv'] || '').toLowerCase();
    if (k && metas[k] === undefined) metas[k] = a.content || '';
  });
  var canonical = '';
  (head.match(/<link\b[^>]*>/gi) || []).forEach(function (tag) {
    var a = attrs_(tag);
    if (!canonical && String(a.rel || '').toLowerCase() === 'canonical' && a.href) canonical = norm_(abs_(a.href, url));
  });
  var headings = [], hre = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((m = hre.exec(main)) && headings.length < 80) { var ht = text_(m[2]); if (ht) headings.push([Number(m[1]), ht.slice(0, 160)]); }
  var h1 = [], h1re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  while ((m = h1re.exec(bodyClean))) { var t1 = text_(m[1]); if (t1) h1.push(t1.slice(0, 160)); }
  var links = [], seenL = {}, external = 0, lre = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = lre.exec(bodyClean))) {
    var a = attrs_('<a ' + m[1] + '>');
    if (!a.href || /^(mailto:|tel:|sms:|javascript:|#)/i.test(a.href)) continue;
    var target = norm_(abs_(a.href, url));
    if (!target) continue;
    if (hostOf_(target) !== host) { external++; continue; }
    if (!seenL[target] && links.length < 300) { seenL[target] = 1; links.push({ url: target, text: text_(m[2]).slice(0, 80) }); }
  }
  var contextual = {}, cre = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = cre.exec(main))) {
    var ca = attrs_('<a ' + m[1] + '>');
    if (!ca.href || /^(mailto:|tel:|sms:|javascript:|#)/i.test(ca.href)) continue;
    var ct = norm_(abs_(ca.href, url));
    if (ct && hostOf_(ct) === host && ct !== url) contextual[ct] = contextual[ct] || text_(m[2]).slice(0, 80);
  }
  var imgs = main.match(/<img\b[^>]*>/gi) || [], noAlt = 0, badAlt = 0;
  imgs.forEach(function (tag) {
    var alt = attrs_(tag).alt;
    if (alt === undefined || !String(alt).trim()) noAlt++;
    else if (/\.(jpe?g|png|webp|gif|heic)$/i.test(alt) || /^(img|dsc|image|photo|pxl)[\s_-]?\d+/i.test(alt)) badAlt++;
  });
  var schema = [], business = [], sre = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = sre.exec(html))) { try { schemaTypes_(JSON.parse(m[1]), schema, business); } catch (err) { schema.push('INVALID'); } }
  var text = text_(main), words = text ? text.split(/\s+/).length : 0;
  var phones = {};
  (text_(bodyClean).match(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).forEach(function (p) { phones[p.replace(/\D/g, '').slice(-10)] = 1; });
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text).slice(0, 8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  return {
    url: url,
    title: text_((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ['', ''])[1]),
    description: metas.description || '',
    robots: metas.robots || '',
    canonical: canonical,
    lang: (html.match(/<html[^>]*\blang=["']?([\w-]+)/i) || ['', ''])[1],
    viewport: !!metas.viewport,
    ogImage: !!metas['og:image'],
    generator: metas.generator || (/squarespace/i.test(html) ? 'Squarespace' : ''),
    h1: h1, headings: headings,
    words: words, text: words > 1000 ? text.split(/\s+/).slice(0, 1000).join(' ') : text, hash: hash,
    images: imgs.length, noAlt: noAlt, badAlt: badAlt,
    links: links, contextual: Object.keys(contextual).slice(0, 100).map(function (k) { return [k, contextual[k]]; }), external: external,
    schema: schema, business: business, phones: Object.keys(phones).slice(0, 6), bytes: html.length,
  };
}

/* ---------- AI (optional; add AI_KEY under Script properties to turn it on) ---------- */
var AI_PROVIDERS = {
  anthropic: function (c, p) {
    var model = p.model || c.aiModel;
    var body = {
      model: model,
      max_tokens: Math.min(Number(p.maxTokens) || 8000, 16000),
      messages: [{ role: 'user', content: String(p.prompt || '') }],
      output_config: { effort: p.effort || c.aiEffort },
    };
    if (p.system) body.system = String(p.system);
    if (p.schema) body.output_config.format = { type: 'json_schema', schema: p.schema };
    var headers = { 'x-api-key': c.aiKey, 'anthropic-version': '2023-06-01' };
    // If a request is declined by a safety check, Anthropic retries it on a suitable fallback model.
    if (/^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/.test(model)) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', headers: headers, payload: JSON.stringify(body), muteHttpExceptions: true });
    var j = {};
    try { j = JSON.parse(res.getContentText() || '{}'); } catch (err) { j = {}; }
    if (res.getResponseCode() >= 300) return { error: (j.error && j.error.message) || ('The AI service returned error ' + res.getResponseCode()) };
    if (j.stop_reason === 'refusal') return { error: 'The AI declined this request.' };
    var text = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
    return { text: text, model: j.model, stop: j.stop_reason, usage: j.usage || {} };
  },
};
function ai_(p) {
  var c = cfg_();
  if (!c.aiKey) return { error: 'ai_not_configured' };
  var fn = AI_PROVIDERS[c.aiProvider];
  if (!fn) return { error: 'Unknown AI provider: ' + c.aiProvider };
  return fn(c, p);
}
// ==== END ====
  }

  const MANIFEST = {
    timeZone: 'America/Chicago',
    runtimeVersion: 'V8',
    exceptionLogging: 'STACKDRIVER',
    oauthScopes: [
      'https://www.googleapis.com/auth/spreadsheets.currentonly',
      'https://www.googleapis.com/auth/script.external_request',
      'https://www.googleapis.com/auth/script.scriptapp',
      'https://www.googleapis.com/auth/script.send_mail',
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/analytics.readonly',
    ],
    webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
  };

  MT.seoConnector = {
    VERSION,
    code(key) {
      const src = connectorCode.toString();
      const a = src.indexOf('// ==== START ====') + '// ==== START ===='.length;
      const b = src.indexOf('// ==== END ====');
      return src.slice(a, b).trim().replace('__KEY__', key) + '\n';
    },
    manifest() { return JSON.stringify(MANIFEST, null, 2) + '\n'; },
  };
})();
