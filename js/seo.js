/* Mammoth CRM — SEO autopilot: settings, connector client, change approvals, and sync.
   SEO data is kept apart from the CRM data on purpose: its own browser storage and its own file
   (data/seo.json) in the private GitHub repository, so it can never crowd out or damage client data. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui;
  const KEY = 'mammothcrm.seo.v1';          // settings, approvals, history (synced to GitHub)
  const DATA_KEY = 'mammothcrm.seodata.v1'; // latest connector results (can always be pulled again, so not synced)
  const REMOTE_PATH = 'data/seo.json';

  const TOWNS = [
    ['Mundelein', true], ['Grayslake', true], ['Lake Bluff', true], ['Lake Forest', true], ['Long Grove', true], ['Gurnee', true], ['Libertyville', true],
    ['Kildeer', false], ['Deer Park', false], ['Barrington', false], ['Mettawa', false], ['Lincolnshire', false], ['Wauconda', false],
    ['Hawthorn Woods', false], ['North Barrington', false], ['Lake Zurich', false], ['Volo', false],
  ];
  const SERVICES = [
    { id: 'removal', name: 'Tree removal', slug: 'tree-removal', terms: ['tree removal', 'remove tree', 'removing tree', 'tree cutting', 'cut down tree', 'tree take down'], value: 3 },
    { id: 'trimming', name: 'Tree trimming & pruning', slug: 'tree-trimming', terms: ['tree trimming', 'tree pruning', 'trim tree', 'prune tree', 'pruning', 'trimming'], value: 2 },
    { id: 'stump', name: 'Stump grinding', slug: 'stump-grinding', terms: ['stump grinding', 'stump removal', 'stump grinder', 'stump'], value: 2 },
    { id: 'crane', name: 'Crane tree removal', slug: 'crane-tree-removal', terms: ['crane tree', 'crane service', 'crane removal', 'crane'], value: 3 },
    { id: 'emergency', name: 'Emergency & storm tree service', slug: 'emergency-tree-service', terms: ['emergency tree', 'storm damage', 'fallen tree', 'storm cleanup', 'tree fell', 'emergency'], value: 3 },
    { id: 'clearing', name: 'Land clearing', slug: 'land-clearing', terms: ['land clearing', 'lot clearing', 'brush clearing', 'brush removal', 'clearing'], value: 3 },
    { id: 'phc', name: 'Plant health care', slug: 'plant-health-care', terms: ['plant health', 'tree health', 'tree disease', 'fertiliz', 'tree treatment', 'ash borer', 'tree injection'], value: 2 },
  ];
  const CHECKLIST = [
    { id: 'sq-business', group: 'Squarespace', text: 'Settings → Business information is filled in (name, phone, email, service area)' },
    { id: 'sq-gsc', group: 'Squarespace', text: 'Google Search Console is connected to the website' },
    { id: 'sq-ga4', group: 'Squarespace', text: 'Google Analytics is connected to the website' },
    { id: 'sq-formq', group: 'Squarespace', text: 'The contact form asks "How did you find us?" (Google search, Google Maps, referral, sign…)' },
    { id: 'gbp-verified', group: 'Google Business Profile', text: 'Business Profile is claimed and verified' },
    { id: 'gbp-category', group: 'Google Business Profile', text: 'Primary category is "Tree service"; extra categories cover your other services' },
    { id: 'gbp-services', group: 'Google Business Profile', text: 'Every service is listed, each with a short description' },
    { id: 'gbp-areas', group: 'Google Business Profile', text: 'Service areas list your towns (start with the top seven)' },
    { id: 'gbp-utm', group: 'Google Business Profile', text: 'The Profile\'s website link uses your tracking link (copy it on the Setup tab)' },
    { id: 'gbp-photos', group: 'Google Business Profile', text: 'New job photos are posted at least every two weeks (use Job cam)' },
    { id: 'reviews', group: 'Reviews & listings', text: 'Every finished job gets a Google review request (Templates → review request)' },
    { id: 'nap', group: 'Reviews & listings', text: 'Same business name, phone, and service area on Yelp, BBB, Angi, Nextdoor, and Facebook' },
  ];

  function defaults() {
    return {
      version: 1,
      updatedAt: '',
      settings: {
        site: 'https://www.mammoth-tree.com',
        plan: 'basic',
        titleSuffix: ' — Mammoth Tree Service',
        towns: TOWNS.map(([name, top]) => ({ name, state: 'IL', top })),
        services: SERVICES.map((s) => Object.assign({}, s)),
        facts: { business: 'Mammoth Tree Service', phone: '(224) 762-2565', email: 'info@mammoth-tree.com', region: 'Lake County, IL', area: 'Northern Illinois and Southern Wisconsin', isa: true, insured: '', years: '', license: '', emergency: '', extra: '' },
        model: { leadRate: 3, closeRate: '', avgJob: '' },
        connector: { url: '', key: Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10), lastPull: '', lastError: '', status: null },
        automation: { mode: 'suggest', maxDrafts: 2 },
      },
      issueState: {},
      checklist: {},
      changes: [],
      history: [],
      snapshots: [],
      aiLog: [],
      seenCrawl: '',
    };
  }

  const listeners = [];
  const seo = {
    TOWNS, SERVICES, CHECKLIST,
    state: null,
    data: null, // { status, crawl, search, analytics, index, archive }

    load() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
      this.state = migrate(s);
      try { this.data = JSON.parse(localStorage.getItem(DATA_KEY) || 'null'); } catch (e) { this.data = null; }
      return this.state;
    },
    save(silent) {
      this.state.updatedAt = new Date().toISOString();
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { ui.toast('Could not save SEO settings — browser storage is full.', 'err'); }
      seo.cache = null;
      pushSoon();
      if (!silent) listeners.forEach((fn) => fn());
    },
    setData(d) {
      this.data = d;
      seo.cache = null;
      // The results can be large. If the browser is short on room they stay in memory and are pulled again next time.
      try { localStorage.setItem(DATA_KEY, JSON.stringify(d)); } catch (e) { try { localStorage.removeItem(DATA_KEY); } catch (e2) { /* ignore */ } }
    },
    onChange(fn) { listeners.push(fn); },
    log(kind, text, extra) {
      this.state.history.unshift(Object.assign({ id: u.uid('sh'), at: new Date().toISOString(), kind, text }, extra || {}));
      if (this.state.history.length > 400) this.state.history.length = 400;
    },
    town(name) { return this.state.settings.towns.find((t) => t.name.toLowerCase() === String(name).toLowerCase()); },
    service(id) { return this.state.settings.services.find((s) => s.id === id); },
    /** Cached analysis of the latest results; cleared whenever settings or data change. */
    analysis() {
      const crmStamp = (MT.store.state && MT.store.state.updatedAt) || '';
      if (!seo.cache || seo.cacheStamp !== crmStamp) { seo.cache = MT.seoAudit.analyze(seo.state, seo.data || {}, MT.store.state); seo.cacheStamp = crmStamp; }
      return seo.cache;
    },
  };
  MT.seo = seo;

  function migrate(s) {
    const base = defaults();
    if (!s || !s.version) return base;
    s.settings = Object.assign({}, base.settings, s.settings || {});
    ['facts', 'model', 'connector', 'automation'].forEach((k) => { s.settings[k] = Object.assign({}, base.settings[k], s.settings[k] || {}); });
    if (!Array.isArray(s.settings.towns) || !s.settings.towns.length) s.settings.towns = base.settings.towns;
    if (!Array.isArray(s.settings.services) || !s.settings.services.length) s.settings.services = base.settings.services;
    ['changes', 'history', 'snapshots', 'aiLog'].forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
    ['issueState', 'checklist'].forEach((k) => { if (!s[k] || typeof s[k] !== 'object') s[k] = {}; });
    return s;
  }

  /* ================= Connector client ================= */
  const conn = {
    ready() { const c = seo.state.settings.connector; return !!(c.url && c.key); },
    async get(action, params) {
      const c = seo.state.settings.connector;
      const q = new URLSearchParams(Object.assign({ key: c.key, action }, params || {}));
      let r;
      try { r = await fetch(c.url + (c.url.includes('?') ? '&' : '?') + q.toString(), { cache: 'no-store' }); }
      catch (e) { throw new Error('Could not reach the SEO connector. Check your internet connection and the web app address.'); }
      return conn.parse(r);
    },
    /** POST for large requests (AI prompts). Plain text avoids a browser pre-check that Apps Script cannot answer. */
    async post(action, body) {
      const c = seo.state.settings.connector;
      let r;
      try { r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key: c.key, action }, body || {})) }); }
      catch (e) { throw new Error('Could not reach the SEO connector.'); }
      return conn.parse(r);
    },
    async parse(r) {
      let j;
      try { j = await r.json(); } catch (e) { throw new Error('The connector did not send back data. In Apps Script, check the deployment: "Execute as: Me" and "Who has access: Anyone".'); }
      if (j && j.error) throw new Error(friendly(j.error));
      return j;
    },
  };
  function friendly(msg) {
    msg = String(msg);
    if (msg === 'bad key') return 'The connector rejected the key. Copy the connector code from Setup again (it contains your key), paste it into Apps Script, and deploy a new version.';
    if (/has not been used in project|is disabled|SERVICE_DISABLED|API has not been used/i.test(msg)) return 'A Google API is turned off in your Google Cloud project. Google says: ' + msg;
    if (/insufficient authentication scopes|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(msg)) return 'The connector needs permission again. In Apps Script, run "authorize" once more, then deploy a new version. (' + msg + ')';
    if (/User does not have sufficient permission|does not have permission/i.test(msg)) return 'Your Google account can\'t see that Search Console or Analytics property. Pick another one, or ask its owner to add you. (' + msg + ')';
    return msg;
  }
  seo.conn = conn;

  /** Pulls the latest results from the connector, then updates history, verifies published changes, and records a weekly snapshot. */
  seo.pull = async function (silent) {
    if (!conn.ready()) { if (!silent) ui.toast('Set up the SEO connector first (Setup tab).', 'err'); return false; }
    const c = seo.state.settings.connector;
    try {
      const d = await conn.get('latest');
      c.status = d.status || null;
      c.lastPull = new Date().toISOString();
      c.lastError = '';
      seo.setData(d);
      afterPull(d);
      seo.save(silent);
      return true;
    } catch (e) {
      c.lastError = e.message;
      seo.save(true);
      if (!silent) ui.toast(e.message, 'err');
      return false;
    }
  };

  /** Runs connector steps one at a time (each gets Google's full time limit), reporting progress. */
  seo.run = async function (parts, onStep) {
    const errors = [];
    for (const part of parts) {
      if (onStep) onStep(part);
      try {
        const r = await conn.get('run', { part });
        Object.keys(r.errors || {}).forEach((k) => errors.push(k + ': ' + friendly(r.errors[k])));
      } catch (e) { errors.push(part + ': ' + e.message); }
    }
    await seo.pull(true);
    return errors;
  };

  function afterPull(d) {
    const st = seo.state;
    const crawl = d.crawl;
    if (crawl && crawl.at && crawl.at !== st.seenCrawl) {
      detectSiteChanges(d.archive || []);
      verifyChanges(crawl);
      st.seenCrawl = crawl.at;
      seo.cache = null;
      const a = seo.analysis();
      const snap = { at: crawl.at, pages: a.pages.length, high: a.counts.high, medium: a.counts.medium, low: a.counts.low, score: a.score, clicks: a.search ? a.search.clicks : null, impressions: a.search ? a.search.impressions : null, position: a.search ? a.search.position : null, indexed: a.index ? a.index.indexed : null };
      st.snapshots = st.snapshots.filter((x) => x.at !== snap.at).concat([snap]).slice(-52);
      seo.log('audit', 'Site audit: ' + a.pages.length + ' pages checked, ' + a.counts.high + ' high, ' + a.counts.medium + ' medium, ' + a.counts.low + ' low priority issues');
      if (MT.seoAI) MT.seoAI.autopilot().catch(() => { /* drafts are optional */ });
    }
  }

  /** Compares the two latest crawl snapshots and logs what changed on the website. */
  function detectSiteChanges(archive) {
    if (archive.length < 2) return;
    const prev = archive[archive.length - 2], cur = archive[archive.length - 1];
    const pm = {};
    prev.pages.forEach((p) => { pm[p.url] = p; });
    const cm = {};
    cur.pages.forEach((p) => { cm[p.url] = p; });
    const fields = [['title', 'Title'], ['description', 'Description'], ['h1', 'Main heading'], ['canonical', 'Canonical'], ['robots', 'Robots tag'], ['status', 'Status']];
    cur.pages.forEach((p) => {
      const o = pm[p.url];
      if (!o) { if (p.status === 200) seo.log('site', 'New page found: ' + path(p.url), { url: p.url }); return; }
      fields.forEach(([k, label]) => {
        if (String(o[k] || '') !== String(p[k] || '')) seo.log('site', label + ' changed on ' + path(p.url), { url: p.url, field: k, before: o[k], after: p[k] });
      });
      if (o.hash && p.hash && o.hash !== p.hash && Math.abs((p.words || 0) - (o.words || 0)) >= 25) seo.log('site', 'Page text changed on ' + path(p.url) + ' (' + o.words + ' → ' + p.words + ' words)', { url: p.url });
    });
    prev.pages.forEach((p) => { if (!cm[p.url] && p.status === 200) seo.log('site', 'Page no longer found: ' + path(p.url), { url: p.url }); });
  }

  const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  /** Marks published changes as verified when the crawl shows them live. */
  function verifyChanges(crawl) {
    const byUrl = {};
    (crawl.pages || []).forEach((p) => { byUrl[p.url] = p; });
    seo.state.changes.filter((c) => c.status === 'published').forEach((c) => {
      const p = byUrl[c.url];
      let ok = false;
      if (c.kind === 'title') ok = !!p && squash(p.title).includes(squash(c.after));
      else if (c.kind === 'description') ok = !!p && squash(p.description) === squash(c.after);
      else if (c.kind === 'h1') ok = !!p && (p.h1 || []).some((h) => squash(h) === squash(c.after));
      else if (c.kind === 'page') ok = !!p && p.status === 200;
      else if (c.kind === 'redirect') ok = !!byUrl[c.url] && byUrl[c.url].redirect === c.after;
      else if (c.kind === 'schema') ok = (crawl.pages || []).some((x) => (x.schema || []).some((t) => /LocalBusiness|HomeAndConstruction|ProfessionalService/i.test(t)));
      if (ok) setStatus(c, 'verified', 'Seen live on the website in the audit of ' + u.fmtDate(crawl.at.slice(0, 10)));
    });
  }
  function path(url) { return String(url || '').replace(/^https?:\/\/[^/]+/i, '') || '/'; }
  seo.path = path;

  /* ================= Publishing adapters =================
     Each website platform gets an adapter that reports what it can do and how a change goes live.
     Squarespace has no content API, so every change is published by hand from copy-ready text.
     A platform with a real API (for example WordPress) can add publish() later without touching anything else. */
  const ADAPTERS = {
    squarespace: {
      id: 'squarespace',
      name: 'Squarespace',
      detect(crawl) { return !!crawl && (crawl.pages || []).some((p) => /squarespace/i.test(p.generator || '')); },
      capabilities(plan) {
        const core = plan && plan !== 'basic';
        return {
          directPublish: false,
          contentApi: false,
          pageSeoFields: true,
          urlMappings: true,
          businessInfo: true,
          codeInjection: core,
          notes: [
            'Squarespace has no public API for editing pages, blog posts, or SEO fields. Its developer APIs only cover commerce (products, orders, inventory). So the CRM never edits your site. It prepares the text and you paste it in.',
            core ? 'Your plan allows custom code, so structured-data code can be added in page settings.' : 'Your Basic plan can\'t run custom code (code injection or code blocks with scripts). Structured data comes from Squarespace\'s Business information, and anything needing code is marked "Core plan".',
          ],
        };
      },
      steps(change) {
        const page = '<b>' + u.esc(path(change.url)) + '</b>';
        const open = 'In Squarespace, open <b>Pages</b>, hover over ' + page + ' and select the gear icon (<b>Page settings</b>).';
        switch (change.kind) {
          case 'title': return [open, 'Open the <b>SEO</b> tab and replace <b>SEO title</b> with the new title.', 'Select <b>Save</b>. If Marketing → SEO → Search appearance adds your site name to page titles, don\'t add it again.'];
          case 'description': return [open, 'Open the <b>SEO</b> tab and replace <b>SEO description</b> with the new description.', 'Select <b>Save</b>.'];
          case 'h1': return ['Open ' + page + ' and select <b>Edit</b>.', 'Click into the main heading at the top of the page, replace its text, and make sure the text style is <b>Heading 1</b>. Other headings on the page should be Heading 2 or smaller.', 'Select <b>Save</b>.'];
          case 'redirect': return ['Open ' + page + '\'s Page settings → <b>General</b> and change the <b>URL slug</b> to <b>' + u.esc(path(change.after)) + '</b>. Save.', 'Go to <b>Settings → Developer tools → URL mappings</b> (older menus: Settings → Advanced → URL mappings).', 'Add this line, then Save: <code>' + u.esc(path(change.url) + ' -> ' + path(change.after) + ' 301') + '</code>', 'Update any links in your navigation or text that point to the old address.'];
          case 'page': return ['In <b>Pages</b>, select <b>+</b> → <b>Blank page</b> (or duplicate a similar page). Name it and set its <b>URL slug</b> to <b>' + u.esc(path(change.url)) + '</b> in Page settings → General.', 'Add the headings and text from the draft below. Use Heading 1 once for the main heading, Heading 2 for sections. Add 3 to 6 of your own job photos with descriptive alt text.', 'In Page settings → <b>SEO</b>, paste the SEO title and description from the draft.', 'Link to the new page from your Services page and at least one related page, then <b>Save</b>.'];
          case 'schema': return change.needs === 'core'
            ? ['Requires the Core plan or higher. Open <b>Page settings</b> for your home page → <b>Advanced</b> → <b>Page header code injection</b>.', 'Paste the code from the draft and select <b>Save</b>.']
            : ['Go to <b>Settings → Business information</b>.', 'Fill in your business name, phone, email, and location exactly as in the draft. Squarespace uses this for its built-in business details markup.', 'Select <b>Save</b>.'];
          case 'alt': return ['Open ' + page + ' and select <b>Edit</b>.', 'Click each image, select the pencil, and fill in <b>Alt text</b> (Content tab) with a short description such as "Crew removing a dead oak in Mundelein".', 'Select <b>Save</b>.'];
          default: return ['Open ' + page + ', select <b>Edit</b>, and make the change described below.', 'Select <b>Save</b>.'];
        }
      },
      publish() { return { mode: 'manual' }; },
    },
    generic: {
      id: 'generic',
      name: 'Website',
      detect() { return true; },
      capabilities() { return { directPublish: false, contentApi: false, pageSeoFields: true, urlMappings: false, businessInfo: false, codeInjection: false, notes: ['This website platform isn\'t recognized, so changes are published by hand.'] }; },
      steps() { return ['Open the page in your website editor and make the change described below.', 'Save and publish.']; },
      publish() { return { mode: 'manual' }; },
    },
  };
  seo.publisher = {
    adapter() {
      const crawl = seo.data && seo.data.crawl;
      if (!crawl || ADAPTERS.squarespace.detect(crawl)) return ADAPTERS.squarespace; // the site is known to be Squarespace
      return ADAPTERS.generic;
    },
    /** Checks what the website platform supports, every time, instead of assuming. */
    capabilities() {
      const ad = this.adapter();
      const crawl = seo.data && seo.data.crawl;
      return Object.assign({ platform: ad.name, detected: !!crawl && ad.detect(crawl), checkedAt: crawl ? crawl.at : '' }, ad.capabilities(seo.state.settings.plan));
    },
    steps(change) { return this.adapter().steps(change); },
  };

  /* ================= Change approvals =================
     draft → approved (by you) → published (you pasted it in) → verified (the next audit saw it live).
     Nothing is ever published without your approval, and a before-copy is kept for rollback. */
  const STATUS = {
    draft: { name: 'Needs approval', kind: 'warn' },
    approved: { name: 'Approved, ready to publish', kind: 'info' },
    published: { name: 'Published, checking', kind: 'info' },
    verified: { name: 'Live', kind: 'good' },
    rejected: { name: 'Rejected', kind: '' },
    rolledback: { name: 'Rolled back', kind: '' },
  };
  seo.STATUS = STATUS;
  function setStatus(c, status, note) {
    c.status = status;
    c[status + 'At'] = new Date().toISOString();
    c.trail = (c.trail || []).concat([{ at: new Date().toISOString(), status, note: note || '' }]);
    seo.log('change', STATUS[status].name + ': ' + c.label, { changeId: c.id, url: c.url });
  }
  seo.changes = {
    /** Adds a draft. Duplicates of an open change for the same page and field are refused. */
    create(c) {
      const open = seo.state.changes.find((x) => x.url === c.url && x.kind === c.kind && ['draft', 'approved', 'published'].includes(x.status));
      if (open) { ui.toast('There\'s already an open change for this. Review it on the Approvals tab.', 'err'); return null; }
      const ch = Object.assign({ id: u.uid('chg'), created: new Date().toISOString(), status: 'draft', source: 'template', before: '', after: '', label: '', reason: '', trail: [] }, c);
      ch.trail = [{ at: ch.created, status: 'draft', note: 'Created from ' + (ch.source === 'ai' ? 'an AI draft' : ch.source === 'manual' ? 'your edit' : 'a template') }];
      seo.state.changes.unshift(ch);
      seo.log('change', 'Draft created: ' + ch.label, { changeId: ch.id, url: ch.url });
      return ch;
    },
    get(id) { return seo.state.changes.find((x) => x.id === id); },
    approve(id) { const c = this.get(id); if (c && c.status === 'draft') { setStatus(c, 'approved', 'Approved by you'); seo.save(); } },
    reject(id) { const c = this.get(id); if (c && ['draft', 'approved'].includes(c.status)) { setStatus(c, 'rejected'); seo.save(); } },
    published(id) { const c = this.get(id); if (c && c.status === 'approved') { setStatus(c, 'published', 'You marked it as published. The next audit will check it.'); seo.save(); } },
    /** Rollback creates a new draft that puts the saved before-copy back. It still needs your approval. */
    rollback(id) {
      const c = this.get(id);
      if (!c || !['published', 'verified'].includes(c.status)) return null;
      if (!c.before && c.kind !== 'page') { ui.toast('There was no earlier text saved for this change, so it can\'t be rolled back automatically.', 'err'); return null; }
      const r = this.create({ kind: c.kind, url: c.url, field: c.field, before: c.after, after: c.before, label: 'Undo: ' + c.label, reason: 'Rolls back the change made ' + u.fmtDate((c.publishedAt || c.created).slice(0, 10)), source: 'manual', rollbackOf: c.id, needs: c.needs });
      if (!r) return null;
      if (c.kind === 'page') r.body = 'Unpublish or delete the page ' + path(c.url) + ' (Page settings → General → "Disable page"), and add a URL mapping from it to the most related page so visitors aren\'t sent to a missing page.';
      c.status = 'rolledback';
      c.trail.push({ at: new Date().toISOString(), status: 'rolledback', note: 'Rollback draft created' });
      seo.save();
      return r;
    },
    remove(id) { seo.state.changes = seo.state.changes.filter((x) => x.id !== id); seo.save(); },
  };

  /* ================= GitHub sync of data/seo.json ================= */
  const pushSoon = u.debounce(() => {
    if (!MT.sync || !MT.sync.ready() || !MT.sync.cfg().auto || seo.pulling) return;
    const blob = new Blob([JSON.stringify(seo.state, null, 1)], { type: 'application/json' });
    MT.sync.putFile(REMOTE_PATH, blob, 'SEO settings update ' + new Date().toISOString()).catch(() => { /* retried on the next save */ });
  }, 5000);
  async function pullRemote() {
    if (!MT.sync || !MT.sync.ready()) return;
    try {
      const blob = await MT.sync.getFile(REMOTE_PATH);
      const remote = JSON.parse(await blob.text());
      if (remote && remote.version && (remote.updatedAt || '') > (seo.state.updatedAt || '')) {
        seo.pulling = true;
        seo.state = migrate(remote);
        try { localStorage.setItem(KEY, JSON.stringify(seo.state)); } catch (e) { /* ignore */ }
        seo.cache = null;
        seo.pulling = false;
        listeners.forEach((fn) => fn());
      }
    } catch (e) { /* first time there is no file yet */ }
  }

  /** On app start: load, take newer settings from GitHub, and refresh results that are more than 12 hours old. */
  seo.startup = function () {
    seo.load();
    seo.onChange(() => { if (MT.app && MT.app.route === 'seo') MT.app.render(); });
    setTimeout(async () => {
      await pullRemote();
      const c = seo.state.settings.connector;
      if (conn.ready() && navigator.onLine !== false && (!c.lastPull || Date.now() - new Date(c.lastPull).getTime() > 12 * 3600 * 1000)) seo.pull(true);
    }, 6000);
  };

  seo.backup = function () {
    u.download('mammoth-seo-' + u.todayISO() + '.json', JSON.stringify(seo.state, null, 2));
  };

  seo.load();
})();
