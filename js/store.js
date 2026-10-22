/* Mammoth CRM — data store, business calculations, and GitHub sync */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;
  const KEY = 'mammothcrm.data.v1';
  const SYNC_KEY = 'mammothcrm.github.v1'; // kept separate so the token is never exported or synced
  const RESTORE_KEY = 'mammothcrm.restore.v1';

  const STAGES = [
    { id: 'lead', name: 'New Lead', prob: 0.1 },
    { id: 'contacted', name: 'Site Visit', prob: 0.25 },
    { id: 'estimate', name: 'Estimate Sent', prob: 0.5 },
    { id: 'negotiating', name: 'Negotiating', prob: 0.7 },
    { id: 'won', name: 'Won', prob: 1 },
    { id: 'lost', name: 'Lost', prob: 0 },
  ];
  const OPEN_STAGES = ['lead', 'contacted', 'estimate', 'negotiating'];
  const SOURCES = ['Google', 'Referral', 'Repeat Customer', 'Facebook', 'Yard Sign', 'Nextdoor', 'Storm Canvass', 'Website', 'Contractor partner', 'Other'];
  // Marketing channel: where an online lead actually came from. Kept separate from "source" so existing reports don't change.
  const CHANNELS = [
    { id: 'organic', label: 'Google search (organic)' },
    { id: 'maps', label: 'Google Maps / Business Profile' },
    { id: 'ads', label: 'Google Ads / Local Services Ads' },
    { id: 'social', label: 'Social media' },
    { id: 'referral-site', label: 'Another website (Yelp, Angi, BBB…)' },
    { id: 'direct', label: 'Typed our web address' },
    { id: 'offline', label: 'Offline (word of mouth, truck, sign)' },
  ];
  const COMPLEXITY = [
    { value: 0, label: 'Standard: open access, nothing to protect' },
    { value: 0.1, label: 'Moderate: backyard or limited access (+10%)' },
    { value: 0.2, label: 'Difficult: near structures, rigging needed (+20%)' },
    { value: 0.35, label: 'Hazard: power lines or storm-damaged (+35%)' },
  ];

  const listeners = [];
  const store = {
    STAGES, OPEN_STAGES, SOURCES, CHANNELS, COMPLEXITY,
    state: null,

    load() {
      let data = null;
      try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
      const needsUpgrade = !!data && (!Array.isArray(data.jobFolders) || !data.financialsV1 || !data.opsV1 || !data.books || !(data.overhead && Array.isArray(data.overhead.addons)));
      this.state = data && data.version ? migrate(data) : MT.seed();
      if (!data || needsUpgrade) this.save(true);
      return this.state;
    },
    save(silent) {
      this.state.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
      } catch (e) {
        MT.ui.toast('Could not save — browser storage is full or blocked.', 'err');
      }
      if (!silent) listeners.forEach((fn) => fn());
      MT.sync && MT.sync.onLocalSave();
    },
    replace(data) {
      this.state = migrate(data);
      this.save();
    },
    // Photos and videos are left in device storage on purpose, so "Undo" can bring their folders back.
    resetDemo() {
      this.state = MT.seed();
      this.save();
    },
    /** Removes only the sample data. Your own records are kept; see removeSamples(). Returns how many of yours were kept. */
    clearAll() {
      const s = this.state;
      removeSamples(s);
      if (!s.estimates.length) s.nextEstimateNo = 1001;
      if (!s.invoices.length) s.nextInvoiceNo = 1001;
      const di = MT.defaultIntegrations();
      if (s.integrations.google.sample) s.integrations.google = di.google;
      if (s.integrations.yelp.sample) s.integrations.yelp = di.yelp;
      s.settings.company.yardGeo = s.settings.company.yardGeo && s.settings.company.yardGeo.sample ? null : s.settings.company.yardGeo;
      s.demo = false;
      this.save();
      return { customers: s.customers.length, deals: s.deals.length, estimates: s.estimates.length, invoices: s.invoices.length, folders: s.jobFolders.length };
    },
    /* ---------- restore point: a full copy saved before anything big is removed or replaced ---------- */
    saveRestorePoint(label) {
      try { localStorage.setItem(RESTORE_KEY, JSON.stringify({ at: new Date().toISOString(), label, data: this.state })); return true; }
      catch (e) { return false; }
    },
    restorePoint() {
      try { const r = JSON.parse(localStorage.getItem(RESTORE_KEY) || 'null'); return r && r.data && r.data.version ? r : null; }
      catch (e) { return null; }
    },
    undoToRestorePoint() {
      const r = this.restorePoint();
      if (!r) return false;
      this.replace(r.data);
      try { localStorage.removeItem(RESTORE_KEY); } catch (e) { /* ignore */ }
      return true;
    },
    onChange(fn) { listeners.push(fn); },

    /* ---------- lookups ---------- */
    customer(id) { return this.state.customers.find((c) => c.id === id); },
    deal(id) { return this.state.deals.find((d) => d.id === id); },
    estimate(id) { return this.state.estimates.find((e) => e.id === id); },
    stage(id) { return STAGES.find((s) => s.id === id) || STAGES[0]; },
    customerName(id) { const c = this.customer(id); return c ? c.name : 'Unknown customer'; },
    invoice(id) { return this.state.invoices.find((x) => x.id === id); },
    crewMember(id) { return this.state.crew.find((x) => x.id === id); },
    invoicesFor(dealId) { return this.state.invoices.filter((x) => x.dealId === dealId && x.status !== 'void'); },

    log(type, text, refs) {
      this.state.activities.unshift(Object.assign({ id: u.uid('act'), ts: new Date().toISOString(), type, text }, refs || {}));
      if (this.state.activities.length > 500) this.state.activities.length = 500;
    },

    upsert(collection, obj) {
      const list = this.state[collection];
      const i = list.findIndex((x) => x.id === obj.id);
      if (i >= 0) list[i] = obj; else list.unshift(obj);
      return obj;
    },
    remove(collection, id) {
      this.state[collection] = this.state[collection].filter((x) => x.id !== id);
    },

    /** Moves a deal to a stage, maintaining closedAt/probability bookkeeping. */
    setStage(deal, stageId) {
      const prev = deal.stage;
      if (prev === stageId) return;
      deal.stage = stageId;
      if (stageId === 'won' || stageId === 'lost') deal.closedAt = deal.closedAt && (prev === 'won' || prev === 'lost') ? deal.closedAt : u.todayISO();
      else deal.closedAt = '';
      this.log('stage', 'Moved "' + deal.title + '" to ' + this.stage(stageId).name, { customerId: deal.customerId, dealId: deal.id });
    },
  };
  MT.store = store;
  store.defaultPartners = () => defaultPartners();

  /* ---------- sample data removal ----------
     The demo data uses short ids ("c4", "d12", "jf3"). Everything created in the app gets an id with an
     underscore ("c_lk2x9a…"). So sample records can be removed without touching anything you entered.
     A sample client or job that your own work points to (an estimate, invoice, deal, or photo folder) is kept too. */
  const isSample = (x) => !!x && typeof x.id === 'string' && x.id.indexOf('_') < 0;
  const SAMPLE_EVENTS = ['Crew safety meeting', 'Bucket truck annual inspection'];
  function removeSamples(s) {
    const mine = (list) => (list || []).filter((x) => !isSample(x));
    const hasOwnMedia = (f) => (f.media || []).some((m) => !m.sample);
    const keepDeal = new Set(), keepCust = new Set();
    mine(s.deals).concat(mine(s.estimates), mine(s.invoices), mine(s.jobFolders), (s.jobFolders || []).filter((f) => isSample(f) && hasOwnMedia(f)))
      .forEach((r) => { if (r.customerId) keepCust.add(r.customerId); if (r.dealId) keepDeal.add(r.dealId); });
    // A sample job you attached your own files to is kept.
    s.deals.forEach((d) => { if (isSample(d) && (d.files || []).length) keepDeal.add(d.id); });
    s.deals.forEach((d) => { if (keepDeal.has(d.id) && d.customerId) keepCust.add(d.customerId); });

    s.deals = s.deals.filter((d) => !isSample(d) || keepDeal.has(d.id));
    s.customers = s.customers.filter((c) => !isSample(c) || keepCust.has(c.id));
    s.estimates = mine(s.estimates);
    s.invoices = mine(s.invoices);
    s.jobFolders = (s.jobFolders || []).filter((f) => !isSample(f) || hasOwnMedia(f));
    s.crew = s.crew.filter((c) => !isSample(c) || c.role === 'Owner');

    const custIds = new Set(s.customers.map((c) => c.id)), dealIds = new Set(s.deals.map((d) => d.id));
    const crewIds = new Set(s.crew.map((c) => c.id)), estIds = new Set(s.estimates.map((e) => e.id)), invIds = new Set(s.invoices.map((i) => i.id));
    s.jobFolders.forEach((f) => {
      f.media = (f.media || []).filter((m) => !m.sample);
      if (f.dealId && !dealIds.has(f.dealId)) f.dealId = '';
      if (f.customerId && !custIds.has(f.customerId)) f.customerId = '';
    });
    s.deals.forEach((d) => {
      d.crewIds = (d.crewIds || []).filter((id) => crewIds.has(id));
      if (d.estimateId && !estIds.has(d.estimateId)) d.estimateId = '';
      (d.payments || []).forEach((p) => { if (p.invoiceId && !invIds.has(p.invoiceId)) p.invoiceId = ''; });
    });
    s.timeEntries = (s.timeEntries || []).filter((t) => crewIds.has(t.crewId) && (!t.dealId || dealIds.has(t.dealId)));
    s.events = (s.events || []).filter((e) => (!e.dealId || dealIds.has(e.dealId)) && (!e.customerId || custIds.has(e.customerId)) && !(!e.dealId && !e.customerId && SAMPLE_EVENTS.includes(e.title)));
    s.activities = mine(s.activities).filter((a) => (!a.dealId || dealIds.has(a.dealId)) && (!a.customerId || custIds.has(a.customerId)));

    const b = s.books || {};
    const sampleAccts = new Set((b.accounts || []).filter(isSample).map((a) => a.id));
    s.books = {
      accounts: (b.accounts || []).filter((a) => !sampleAccts.has(a.id)),
      txns: (b.txns || []).filter((t) => !sampleAccts.has(t.accountId)),
      rules: b.rules || [],
      imports: (b.imports || []).filter((i) => !sampleAccts.has(i.accountId)),
    };
  }

  function migrate(data) {
    const base = MT.seed();
    ['customers', 'deals', 'estimates', 'activities', 'templates'].forEach((k) => { if (!Array.isArray(data[k])) data[k] = []; });
    // Job Cam was added later: demo data gets sample folders, real data starts empty.
    if (!Array.isArray(data.jobFolders)) data.jobFolders = data.demo ? base.jobFolders.filter((f) => data.customers.some((c) => c.id === f.customerId)) : [];
    data.jobFolders.forEach((f) => {
      if (!Array.isArray(f.media)) f.media = [];
      if (f.dealId && !data.deals.some((d) => d.id === f.dealId)) f.dealId = '';
    });
    // Payments and job costs were added later. Demo data gets realistic sample history; real data starts unpaid.
    if (!data.financialsV1) {
      data.deals.forEach((d) => { if (!Array.isArray(d.payments)) d.payments = []; if (d.jobCost == null) d.jobCost = ''; if (!d.costSource) d.costSource = ''; });
      if (data.demo) MT.seedFinancials(data.deals);
      data.templates.forEach((t) => { if (t.id === 't7') t.body = String(t.body).replace('balance of {{deal.value}}', 'balance of {{deal.balance}}'); });
      data.financialsV1 = true;
    }
    data.settings = Object.assign({}, base.settings, data.settings || {});
    data.settings.company = Object.assign({}, base.settings.company, (data.settings || {}).company || {});
    if (!Array.isArray(data.settings.priceBook)) data.settings.priceBook = base.settings.priceBook;
    const hadHistory = !!(data.overhead && Array.isArray(data.overhead.history));
    data.overhead = Object.assign({}, base.overhead, data.overhead || {});
    if (!Array.isArray(data.overhead.addons)) data.overhead.addons = MT.defaultAddons();
    if (!hadHistory) data.overhead.history = data.demo ? base.overhead.history : [];
    if (!Array.isArray(data.overhead.expenses)) data.overhead.expenses = base.overhead.expenses;
    if (!Array.isArray(data.overhead.equipment)) data.overhead.equipment = base.overhead.equipment;
    data.goals = Object.assign({}, base.goals, data.goals || {});
    if (!data.nextEstimateNo) data.nextEstimateNo = 1001;
    // Operations (crew, invoices, time tracking, calendar) were added later.
    if (!data.opsV1) {
      ['invoices', 'timeEntries', 'events', 'crew'].forEach((k) => { if (!Array.isArray(data[k])) data[k] = []; });
      data.deals.forEach((d) => {
        if (!Array.isArray(d.crewIds)) d.crewIds = [];
        if (!Array.isArray(d.expenses)) d.expenses = [];
        if (d.startTime == null) d.startTime = '';
        if (!d.days) d.days = 1;
      });
      if (data.demo) MT.seedOps(data);
      else if (!data.crew.length) data.crew = [{ id: 'cr_owner', name: data.settings.company.owner || 'Owner', role: 'Owner', wage: 0, phone: '', color: '#24563a', active: true }];
      data.opsV1 = true;
    }
    ['invoices', 'timeEntries', 'events', 'crew'].forEach((k) => { if (!Array.isArray(data[k])) data[k] = []; });
    if (!data.nextInvoiceNo) data.nextInvoiceNo = 1001;
    // Bookkeeping was added later.
    if (!data.books) { if (data.demo) MT.seedBooks(data); else data.books = { accounts: [], txns: [], rules: [], imports: [] }; }
    data.settings.branding = Object.assign({}, base.settings.branding, (data.settings || {}).branding || {});
    // Untouched default branding switches to the Mammoth logo and navy. Custom choices are never changed.
    const bb = data.settings.branding;
    if (bb.preset === 'forest' && !bb.logo && bb.primary === '#24563a') Object.assign(bb, { logo: 'icons/logo-navy.png', primary: '#02133b', accent: '#a6a6a6', sidebar: '#02133b', preset: 'mammoth' });
    const bi = MT.defaultIntegrations();
    data.integrations = data.integrations || {};
    Object.keys(bi).forEach((k) => { data.integrations[k] = Object.assign({}, bi[k], data.integrations[k] || {}); });
    if (!data.integrations.website.key) data.integrations.website.key = bi.website.key;
    // Partner finder was added later.
    const bp = defaultPartners();
    data.partners = Object.assign({}, bp, data.partners || {});
    if (!Array.isArray(data.partners.list)) data.partners.list = [];
    if (!Array.isArray(data.partners.categories) || !data.partners.categories.length) data.partners.categories = bp.categories;
    return data;
  }

  /** Partner finder: complementary business categories and the contractor-rate outreach messages. */
  function defaultPartners() {
    return {
      rate: 10,
      radius: 25,
      categories: [
        { id: 'landscapers', name: 'Landscapers', query: 'landscaping company' },
        { id: 'fence', name: 'Fence companies', query: 'fence contractor' },
        { id: 'pools', name: 'Pool builders', query: 'swimming pool builder' },
        { id: 'builders', name: 'Home builders', query: 'home builder' },
        { id: 'developers', name: 'Developers', query: 'real estate developer' },
        { id: 'concrete', name: 'Concrete companies', query: 'concrete contractor' },
      ],
      list: [],
      emailSubject: 'Tree work for {{business}} jobs: a contractor rate from {{company.name}}',
      email: 'Hi {{contact}},\n\nI\'m {{owner}} with {{company.name}}. We handle tree removal, trimming, stump grinding, crane work, and lot clearing across Lake County.\n\nWhen your jobs need trees cleared or trimmed first, we\'d like to be your go-to crew. Contractors who work with us get {{rate}}% off our standard pricing, priority scheduling, and fast estimates.\n\nWould a quick call next week work?\n\n{{owner}}\n{{company.name}} · {{company.phone}}\n{{company.address}}\n\nNot interested? Reply "no thanks" and I won\'t email again.',
      text: 'Hi {{contact}}, it\'s {{owner}} from {{company.name}}. We clear and trim trees for contractors around Lake County and offer {{rate}}% off plus priority scheduling. Open to a quick call? {{company.phone}}',
    };
  }

  /* ================= Calculations ================= */
  const calc = {};

  calc.overhead = function (state) {
    const o = state.overhead;
    const monthlyOf = (e) => (e.frequency === 'annual' ? u.num(e.amount) / 12 : e.frequency === 'weekly' ? (u.num(e.amount) * 52) / 12 : u.num(e.amount));
    const monthly = u.sum(o.expenses, monthlyOf);
    const byCat = {};
    o.expenses.forEach((e) => { byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + monthlyOf(e); });
    const paidCrewHours = u.num(o.crews) * u.num(o.hoursPerDay) * u.num(o.daysPerMonth);
    const billableHours = paidCrewHours * (u.num(o.utilization) / 100);
    const laborPerCrewHour = u.num(o.crewSize) * u.num(o.avgWage) * (1 + u.num(o.laborBurden) / 100);
    const laborMonthly = paidCrewHours * laborPerCrewHour;
    const totalMonthlyCost = monthly + laborMonthly;
    const ohPerHour = billableHours ? monthly / billableHours : 0;
    const laborPerBillable = billableHours ? laborMonthly / billableHours : 0;
    const breakEvenRate = ohPerHour + laborPerBillable;
    const margin = Math.min(u.num(o.targetProfit), 90) / 100;
    const recommendedRate = breakEvenRate / (1 - margin);
    return {
      monthly,
      annual: monthly * 12,
      byCategory: Object.keys(byCat).map((k) => ({ label: k, value: byCat[k] })).sort((a, b) => b.value - a.value),
      paidCrewHours,
      billableHours,
      laborPerCrewHour,
      laborMonthly,
      totalMonthlyCost,
      ohPerHour,
      breakEvenRate,
      recommendedRate,
      recommendedRateRounded: Math.ceil(recommendedRate / 5) * 5,
      crewDayRate: recommendedRate * u.num(o.hoursPerDay),
      breakEvenRevenueMonthly: totalMonthlyCost,
      targetRevenueMonthly: totalMonthlyCost / (1 - margin),
      monthlyOf,
    };
  };

  /** Totals for an estimate. Cost side uses the fully loaded break-even crew rate from Overhead. */
  calc.estimate = function (est, state) {
    const oh = calc.overhead(state);
    const services = u.sum(est.items || [], (i) => u.num(i.qty) * u.num(i.price));
    const crewHours = u.num(est.crewHours);
    const crewRate = u.num(est.crewRate);
    const equipRows = (est.equipment || []).map((r) => {
      const eq = state.overhead.equipment.find((e) => e.id === r.equipmentId) || { name: 'Equipment', rate: 0, cost: 0 };
      return { name: eq.name, hours: u.num(r.hours), rate: u.num(eq.rate), cost: u.num(eq.cost) };
    });
    const tm = !!est.billTM;
    const labor = tm ? crewHours * crewRate : 0;
    const equipment = tm ? u.sum(equipRows, (r) => r.hours * r.rate) : 0;
    const disposal = u.num(est.disposal);
    const base = services + labor + equipment;
    const surcharge = base * u.num(est.complexity);
    const subtotal = base + surcharge + disposal;
    const discount = Math.min(u.num(est.discount), subtotal);
    const taxable = subtotal - discount;
    const tax = taxable * (u.num(est.taxRate) / 100);
    const total = taxable + tax;
    const laborCost = crewHours * oh.breakEvenRate;
    const equipCost = u.sum(equipRows, (r) => r.hours * r.cost);
    // Add-on lines (cranes, subs, rentals, permits) carry their own cost per unit.
    const addonCost = u.sum(est.items || [], (i) => u.num(i.qty) * u.num(i.cost));
    const cost = laborCost + equipCost + disposal + addonCost;
    const revenue = taxable; // tax is pass-through
    const profit = revenue - cost;
    return {
      services, labor, equipment, equipRows, disposal, surcharge, subtotal, discount, taxable, tax, total,
      laborCost, equipCost, addonCost, cost, profit, margin: revenue ? profit / revenue : 0,
      effectiveRate: crewHours ? (revenue - disposal) / crewHours : 0,
    };
  };

  /** Deposit asked for to book an estimate's job: a percent of the total or a fixed amount (whole dollars, never above the total). */
  calc.deposit = function (est, state) {
    const total = calc.estimate(est, state).total;
    const v = u.num(est.deposit);
    if (!(v > 0) || !(total > 0)) return { amount: 0, balance: total, total };
    const amount = Math.min(total, Math.round(est.depositType === 'amt' ? v : (total * Math.min(v, 100)) / 100));
    return { amount, balance: total - amount, total };
  };

  calc.addonPrice = (a) => u.num(a.cost) * (1 + u.num(a.markup) / 100);
  calc.addonUnitLabel = (unit) => ({ flat: 'job', hour: 'hour', day: 'day', load: 'load', each: 'each' }[unit] || unit || 'each');

  calc.wonInYear = function (state, year) {
    return state.deals.filter((d) => d.stage === 'won' && d.closedAt && u.parseISO(d.closedAt).getFullYear() === year);
  };

  calc.revenueByMonth = function (state, year) {
    const m = new Array(12).fill(0);
    calc.wonInYear(state, year).forEach((d) => { m[u.parseISO(d.closedAt).getMonth()] += u.num(d.value); });
    return m;
  };

  calc.pipeline = function (state) {
    const open = state.deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const byStage = OPEN_STAGES.map((id) => {
      const ds = open.filter((d) => d.stage === id);
      return { id, name: store.stage(id).name, count: ds.length, value: u.sum(ds, (d) => d.value), weighted: u.sum(ds, (d) => d.value * dealProb(d)) };
    });
    return { open, byStage, value: u.sum(open, (d) => d.value), weighted: u.sum(open, (d) => d.value * dealProb(d)) };
  };

  function dealProb(d) {
    return d.probability != null && d.probability !== '' ? u.num(d.probability) / 100 : store.stage(d.stage).prob;
  }
  calc.dealProb = dealProb;

  calc.winRate = function (state, days) {
    const since = u.addDays(u.todayISO(), -days);
    const closed = state.deals.filter((d) => (d.stage === 'won' || d.stage === 'lost') && d.closedAt >= since);
    const won = closed.filter((d) => d.stage === 'won');
    return { rate: closed.length ? won.length / closed.length : 0, won: won.length, closed: closed.length, avg: won.length ? u.sum(won, (d) => d.value) / won.length : 0 };
  };

  calc.goal = function (state) {
    const g = state.goals;
    const year = u.num(g.year) || new Date().getFullYear();
    const actual = calc.revenueByMonth(state, year);
    const targets = (g.monthly && g.monthly.length === 12 ? g.monthly : new Array(12).fill(u.num(g.annual) / 12)).map(u.num);
    const now = new Date();
    const isCurrent = now.getFullYear() === year;
    const curMonth = isCurrent ? now.getMonth() : year < now.getFullYear() ? 11 : -1;
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthFrac = isCurrent ? now.getDate() / dim : 1;
    let paceTarget = 0;
    for (let i = 0; i <= curMonth; i++) paceTarget += i === curMonth && isCurrent ? targets[i] * monthFrac : targets[i];
    const ytd = u.sum(actual);
    const annual = u.sum(targets);
    const pipe = calc.pipeline(state);
    const remainingMonths = isCurrent ? 12 - now.getMonth() : 0;
    return {
      year, actual, targets, ytd, annual, paceTarget,
      pctOfGoal: annual ? ytd / annual : 0,
      paceDelta: ytd - paceTarget,
      remaining: Math.max(0, annual - ytd),
      neededPerMonth: remainingMonths ? Math.max(0, annual - ytd) / remainingMonths : 0,
      forecast: ytd + pipe.weighted,
      curMonth,
      monthActual: curMonth >= 0 ? actual[curMonth] : 0,
      monthTarget: curMonth >= 0 ? targets[curMonth] : 0,
    };
  };

  calc.lifetimeValue = function (state, customerId) {
    return u.sum(state.deals.filter((d) => d.customerId === customerId && d.stage === 'won'), (d) => d.value);
  };

  /* ---------- Payments & job profit ---------- */
  calc.paid = (d) => u.sum(d.payments || [], (p) => p.amount);
  calc.balance = (d) => (d.stage === 'won' ? Math.max(0, u.num(d.value) - calc.paid(d)) : 0);
  /** The job's cost if known (actual or from its estimate), else null. */
  calc.dealCost = function (d, state) {
    if (d.jobCost !== '' && d.jobCost != null) return u.num(d.jobCost);
    const st = state || store.state;
    const e = d.estimateId && st.estimates.find((x) => x.id === d.estimateId);
    return e ? calc.estimate(e, st).cost : null;
  };
  calc.jobDate = (d) => d.scheduledDate || d.closedAt;

  const inRange = (iso, from, to) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;

  /** All dashboard KPIs for a date window [from, to] (inclusive ISO dates). */
  calc.period = function (state, from, to) {
    const today = u.todayISO();
    const won = state.deals.filter((d) => d.stage === 'won' && inRange(d.closedAt, from, to));
    const lost = state.deals.filter((d) => d.stage === 'lost' && inRange(d.closedAt, from, to));
    const payments = [];
    state.deals.forEach((d) => (d.payments || []).forEach((p) => { if (inRange(p.date, from, to)) payments.push({ deal: d, p }); }));
    const allWon = state.deals.filter((d) => d.stage === 'won');
    const owing = allWon.filter((d) => calc.balance(d) > 0);
    const overdue = owing.filter((d) => calc.jobDate(d) && u.daysBetween(calc.jobDate(d), today) > 14);
    const ests = state.estimates.filter((e) => inRange(e.date, from, to));
    const jobs = won.map((d) => {
      const cost = calc.dealCost(d, state);
      return { d, revenue: u.num(d.value), cost, profit: cost == null ? null : u.num(d.value) - cost };
    });
    const costed = jobs.filter((j) => j.cost != null);
    const profit = u.sum(costed, (j) => j.profit);
    const costedRevenue = u.sum(costed, (j) => j.revenue);
    return {
      from, to,
      paid: u.sum(payments, (x) => x.p.amount),
      paymentCount: payments.length,
      payments,
      booked: u.sum(won, (d) => d.value),
      wonCount: won.length,
      lostCount: lost.length,
      closeRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
      outstanding: u.sum(won, (d) => calc.balance(d)),
      outstandingCount: won.filter((d) => calc.balance(d) > 0).length,
      owedAll: u.sum(owing, (d) => calc.balance(d)),
      owing,
      overdue,
      overdueTotal: u.sum(overdue, (d) => calc.balance(d)),
      estCount: ests.length,
      estValue: u.sum(ests, (e) => calc.estimate(e, state).total),
      estSent: ests.filter((e) => e.status !== 'draft').length,
      estAccepted: ests.filter((e) => e.status === 'accepted').length,
      jobs,
      costed,
      missingCost: jobs.length - costed.length,
      profit,
      avgProfit: costed.length ? profit / costed.length : 0,
      margin: costedRevenue ? profit / costedRevenue : 0,
    };
  };

  /* ---------- Invoices ---------- */
  calc.invoiceTotals = function (inv) {
    const subtotal = u.sum(inv.items || [], (i) => u.num(i.qty) * u.num(i.price));
    const discount = Math.min(u.num(inv.discount), subtotal);
    const taxable = subtotal - discount;
    const tax = taxable * (u.num(inv.taxRate) / 100);
    return { subtotal, discount, taxable, tax, total: Math.round((taxable + tax) * 100) / 100 };
  };
  calc.invoicePayments = function (inv) {
    const d = store.deal(inv.dealId);
    return d ? (d.payments || []).filter((p) => p.invoiceId === inv.id) : [];
  };
  calc.invoicePaid = (inv) => u.sum(calc.invoicePayments(inv), (p) => p.amount);
  calc.invoiceBalance = (inv) => (inv.status === 'void' ? 0 : Math.max(0, Math.round((calc.invoiceTotals(inv).total - calc.invoicePaid(inv)) * 100) / 100));
  /** Display status: draft, sent, partial, overdue, paid, void. */
  calc.invoiceStatus = function (inv) {
    if (inv.status === 'void') return 'void';
    const total = calc.invoiceTotals(inv).total;
    const paid = calc.invoicePaid(inv);
    if (total > 0 && paid >= total - 0.005) return 'paid';
    if (inv.status === 'draft') return 'draft';
    if (inv.dueDate && inv.dueDate < u.todayISO()) return 'overdue';
    return paid > 0 ? 'partial' : 'sent';
  };
  calc.INVOICE_STATUS = {
    draft: { name: 'Draft', kind: '' }, sent: { name: 'Sent', kind: 'info' }, partial: { name: 'Partly paid', kind: 'warn' },
    overdue: { name: 'Overdue', kind: 'bad' }, paid: { name: 'Paid', kind: 'good' }, void: { name: 'Void', kind: '' },
  };

  /* ---------- Time tracking ---------- */
  const mins = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return isFinite(h) ? h * 60 + (m || 0) : null; };
  calc.mins = mins;
  calc.nowHHMM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  /** Hours worked on a time entry; an open entry (still clocked in) counts up to now. */
  calc.entryHours = function (e) {
    const a = mins(e.start);
    let b = e.end ? mins(e.end) : e.date === u.todayISO() ? mins(calc.nowHHMM()) : null;
    if (a == null || b == null) return 0;
    if (b < a) b += 24 * 60;
    return Math.max(0, (b - a - u.num(e.breakMin)) / 60);
  };
  calc.entryCost = function (e, state) {
    state = state || store.state;
    const c = state.crew.find((x) => x.id === e.crewId);
    return calc.entryHours(e) * u.num(c && c.wage) * (1 + u.num(state.overhead.laborBurden) / 100);
  };
  /** Actual costs recorded against a job: tracked labor, overhead share, expenses, and estimated equipment. */
  calc.jobActuals = function (d, state) {
    const entries = state.timeEntries.filter((e) => e.dealId === d.id);
    const oh = calc.overhead(state);
    const personHours = u.sum(entries, calc.entryHours);
    const labor = u.sum(entries, (e) => calc.entryCost(e, state));
    const crewHours = personHours / Math.max(1, u.num(state.overhead.crewSize));
    const overheadShare = crewHours * oh.ohPerHour;
    const expenses = u.sum(d.expenses || [], (x) => x.amount);
    const est = d.estimateId && state.estimates.find((x) => x.id === d.estimateId);
    const equipment = est ? calc.estimate(est, state).equipCost : 0;
    return { entries, personHours, crewHours, labor, overheadShare, expenses, equipment, tracked: entries.length > 0, open: entries.some((e) => !e.end), total: labor + overheadShare + expenses + equipment };
  };

  /* ---------- Lead attribution ---------- */
  /** Works out a lead's marketing channel from what the website form captured (landing page, referrer, UTM tags, click IDs). */
  calc.classifyChannel = function (a, siteHost) {
    a = a || {};
    const host = (url) => { const m = String(url || '').toLowerCase().match(/^https?:\/\/([^/?#]+)/); return m ? m[1].replace(/^www\./, '') : ''; };
    const src = String(a.utm_source || '').toLowerCase(), med = String(a.utm_medium || '').toLowerCase(), camp = String(a.utm_campaign || '').toLowerCase();
    const ref = String(a.referrer || '').toLowerCase(), refHost = host(ref);
    const own = String(siteHost || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (a.gclid || a.gbraid || a.wbraid || /^(cpc|ppc|paid|paidsearch|paid_search|lsa)$/.test(med)) return 'ads';
    if (/gbp|gmb|business.?profile|google.?maps/.test(camp + ' ' + src)) return 'maps';
    if (/google\.[a-z.]+\/maps|maps\.google\./.test(ref)) return 'maps';
    if (med === 'organic' || /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave)\.[a-z.]+$/.test(refHost)) return 'organic';
    if (/facebook|instagram|nextdoor|tiktok|youtube|twitter|linkedin|pinterest|(^|\.)x\.com/.test(refHost + ' ' + src)) return 'social';
    if (refHost && refHost !== own) return 'referral-site';
    if (src || med) return 'referral-site';
    return refHost === own && own ? '' : a.landing ? 'direct' : '';
  };

  /* ---------- Distance ---------- */
  calc.milesBetween = function (a, b) {
    if (!a || !b) return 0;
    const R = 3958.8, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  /** Jobs and visits on a given day (multi-day jobs appear on each day they run). */
  calc.dayItems = function (state, iso) {
    const items = [];
    state.deals.forEach((d) => {
      if (d.stage !== 'won' || !d.scheduledDate) return;
      const days = Math.max(1, u.num(d.days) || 1);
      const off = u.daysBetween(d.scheduledDate, iso);
      if (off >= 0 && off < days) items.push({ kind: 'job', id: d.id, deal: d, customerId: d.customerId, title: d.title, start: d.startTime || '', dayN: off + 1, days, crewIds: d.crewIds || [] });
    });
    state.events.forEach((e) => {
      if (e.date === iso) items.push({ kind: e.type || 'other', id: e.id, event: e, customerId: e.customerId, title: e.title, start: e.start || '', crewIds: e.crewIds || [] });
    });
    return items.sort((a, b) => (a.start || '99') < (b.start || '99') ? -1 : 1);
  };

  MT.calc = calc;

  /* ================= GitHub sync =================
     Saves the CRM data as a JSON file in a (private) GitHub repository using the
     GitHub REST "contents" API. The token lives only in this browser. */
  const sync = {
    cfg() {
      // Defaults point at the business's private data repository, so a new device only needs an access key.
      const def = { owner: 'MammothTree', repo: 'mammoth-crm-data', branch: 'main', path: 'data/crm-data.json', token: '', auto: true, mediaAuto: true, sha: '', lastSync: '' };
      try { return Object.assign(def, JSON.parse(localStorage.getItem(SYNC_KEY) || '{}')); }
      catch (e) { return def; }
    },
    setCfg(c) { localStorage.setItem(SYNC_KEY, JSON.stringify(c)); },
    ready() { const c = this.cfg(); return !!(c.owner && c.repo && c.token && c.path); },
    url(c) {
      return 'https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) + '/contents/' + c.path.split('/').map(encodeURIComponent).join('/');
    },
    headers(c, raw) {
      return { Authorization: 'Bearer ' + c.token, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    },
    async remoteMeta(c) {
      const r = await fetch(this.url(c) + '?ref=' + encodeURIComponent(c.branch), { headers: this.headers(c), cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(await errText(r));
      const j = await r.json();
      return { sha: j.sha };
    },
    async test() {
      const c = this.cfg();
      const r = await fetch('https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo), { headers: this.headers(c), cache: 'no-store' });
      if (!r.ok) throw new Error(await errText(r));
      const j = await r.json();
      return { private: j.private, fullName: j.full_name, canPush: !!(j.permissions && j.permissions.push) };
    },
    /** Every write to GitHub goes through one queue (each write is a commit; parallel commits collide), with retries for brief conflicts. */
    queue: Promise.resolve(),
    serial(fn) {
      const run = async () => {
        for (let i = 0; ; i++) {
          try { return await fn(); } catch (e) {
            if (i < 3 && !e.conflict && /\(409\)|\(422\)/.test(e.message)) { await new Promise((r) => setTimeout(r, 800 * (i + 1))); continue; }
            throw e;
          }
        }
      };
      const p = sync.queue.then(run, run);
      sync.queue = p.catch(() => {});
      return p;
    },
    push(force) { return sync.serial(() => sync.pushNow(force)); },
    async pushNow(force) {
      const c = this.cfg();
      const meta = await this.remoteMeta(c);
      if (meta && c.sha && meta.sha !== c.sha && !force) {
        const e = new Error('The copy on GitHub changed since your last sync (another device?). Pull first, or force-push to overwrite it.');
        e.conflict = true;
        throw e;
      }
      const body = {
        message: 'CRM data update ' + new Date().toISOString(),
        content: b64encode(JSON.stringify(store.state, null, 2)),
        branch: c.branch,
      };
      if (meta) body.sha = meta.sha;
      const r = await fetch(this.url(c), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers(c)), body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await errText(r));
      const j = await r.json();
      c.sha = j.content.sha;
      c.lastSync = new Date().toISOString();
      c.dirty = false;
      this.setCfg(c);
      return c;
    },
    async pull() {
      const c = this.cfg();
      const meta = await this.remoteMeta(c);
      if (!meta) throw new Error('No data file found at ' + c.path + ' on branch ' + c.branch + '. Push first to create it.');
      const r = await fetch(this.url(c) + '?ref=' + encodeURIComponent(c.branch), { headers: this.headers(c, true), cache: 'no-store' });
      if (!r.ok) throw new Error(await errText(r));
      const data = JSON.parse(await r.text());
      if (!data || !data.version) throw new Error('The file on GitHub is not valid CRM data.');
      c.sha = meta.sha;
      c.lastSync = new Date().toISOString();
      c.dirty = false;
      this.setCfg(c);
      this.suspend = true;
      store.replace(data);
      this.suspend = false;
      return c;
    },
    /** Called on every save: marks this device as having unsent changes, then pushes a few seconds later. */
    onLocalSave() {
      if (sync.suspend || !sync.ready()) return;
      const c = sync.cfg();
      if (!c.dirty) { c.dirty = true; sync.setCfg(c); }
      sync.pushSoon();
    },
    pushSoon: u.debounce(function () {
      const c = sync.cfg();
      if (!c.auto || !sync.ready() || sync.busy) return;
      sync.busy = true;
      sync.push(false).then(() => sync.status('Synced to GitHub ' + new Date().toLocaleTimeString()), (e) => {
        if (e.conflict) sync.status('Another device changed the data. Open Integrations → GitHub to pull the newer copy.', true);
        else sync.status('Sync failed: ' + e.message, true);
      }).finally(() => { sync.busy = false; });
    }, 4000),
    /** On opening the app: take newer data from GitHub, or send this device's unsent changes. */
    async autoSync() {
      if (!sync.ready()) return 'off';
      const c = sync.cfg();
      let meta;
      try { meta = await sync.remoteMeta(c); } catch (e) { return 'offline'; }
      if (!meta) { if (c.auto) { await sync.push(true); return 'pushed'; } return 'empty'; }
      if (meta.sha === c.sha) { if (c.dirty && c.auto) { await sync.push(false); return 'pushed'; } return 'same'; }
      if (!c.dirty) { await sync.pull(); MT.ui.toast('Updated with the latest data from GitHub'); return 'pulled'; }
      sync.status('This device and GitHub both have changes. Open Integrations → GitHub to choose which to keep.', true);
      return 'conflict';
    },
    /* ---------- files (job cam photos and videos) in the data repository ---------- */
    fileUrl(c, path) { return 'https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/'); },
    putFile(path, blob, message) { return sync.serial(() => sync.putFileNow(path, blob, message)); },
    async putFileNow(path, blob, message) {
      const c = this.cfg();
      const content = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(blob); });
      let sha;
      const head = await fetch(this.fileUrl(c, path) + '?ref=' + encodeURIComponent(c.branch), { headers: this.headers(c), cache: 'no-store' });
      if (head.ok) sha = (await head.json()).sha;
      const r = await fetch(this.fileUrl(c, path), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers(c)), body: JSON.stringify({ message: message || 'Job photo ' + path, content, branch: c.branch, sha }) });
      if (!r.ok) throw new Error(await errText(r));
      const j = await r.json();
      return { path, sha: j.content.sha };
    },
    async getFile(path) {
      const c = this.cfg();
      const r = await fetch(this.fileUrl(c, path) + '?ref=' + encodeURIComponent(c.branch), { headers: this.headers(c, true), cache: 'no-store' });
      if (!r.ok) throw new Error(await errText(r));
      return await r.blob();
    },
    deleteFile(path, sha) { return sync.serial(() => sync.deleteFileNow(path, sha)); },
    async deleteFileNow(path, sha) {
      const c = this.cfg();
      if (!sha) { const h = await fetch(this.fileUrl(c, path) + '?ref=' + encodeURIComponent(c.branch), { headers: this.headers(c), cache: 'no-store' }); if (!h.ok) return; sha = (await h.json()).sha; }
      await fetch(this.fileUrl(c, path), { method: 'DELETE', headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers(c)), body: JSON.stringify({ message: 'Remove ' + path, sha, branch: c.branch }) });
    },
    async repoSizeMB() {
      const c = this.cfg();
      const r = await fetch('https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo), { headers: this.headers(c), cache: 'no-store' });
      if (!r.ok) return null;
      return (await r.json()).size / 1024;
    },
    status(msg, err) {
      const el = document.getElementById('sync-status');
      if (el) { el.textContent = msg; el.className = 'sync-status ' + (err ? 'err' : 'ok'); }
      if (err) MT.ui.toast(msg, 'err');
    },
  };
  MT.sync = sync;

  async function errText(r) {
    let msg = r.status + ' ' + r.statusText;
    try { const j = await r.json(); if (j.message) msg = j.message + ' (' + r.status + ')'; } catch (e) { /* ignore */ }
    if (r.status === 401) msg = 'GitHub rejected the token (401). Check that it is correct and not expired.';
    if (r.status === 404) msg = 'Repository or file not found (404). Check owner/repo names and that the token has access to this repo.';
    return msg;
  }

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
})();
