/* Mammoth CRM — data store, business calculations, and GitHub sync */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;
  const KEY = 'mammothcrm.data.v1';
  const SYNC_KEY = 'mammothcrm.github.v1'; // kept separate so the token is never exported or synced

  const STAGES = [
    { id: 'lead', name: 'New Lead', prob: 0.1 },
    { id: 'contacted', name: 'Site Visit', prob: 0.25 },
    { id: 'estimate', name: 'Estimate Sent', prob: 0.5 },
    { id: 'negotiating', name: 'Negotiating', prob: 0.7 },
    { id: 'won', name: 'Won', prob: 1 },
    { id: 'lost', name: 'Lost', prob: 0 },
  ];
  const OPEN_STAGES = ['lead', 'contacted', 'estimate', 'negotiating'];
  const SOURCES = ['Google', 'Referral', 'Repeat Customer', 'Facebook', 'Yard Sign', 'Nextdoor', 'Storm Canvass', 'Website', 'Other'];
  const COMPLEXITY = [
    { value: 0, label: 'Standard: open access, nothing to protect' },
    { value: 0.1, label: 'Moderate: backyard or limited access (+10%)' },
    { value: 0.2, label: 'Difficult: near structures, rigging needed (+20%)' },
    { value: 0.35, label: 'Hazard: power lines or storm-damaged (+35%)' },
  ];

  const listeners = [];
  const store = {
    STAGES, OPEN_STAGES, SOURCES, COMPLEXITY,
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
    resetDemo() {
      if (MT.media) MT.media.clear().catch(() => {});
      this.state = MT.seed();
      this.save();
    },
    clearAll() {
      const s = this.state;
      if (MT.media) MT.media.clear().catch(() => {});
      s.customers = []; s.deals = []; s.estimates = []; s.activities = []; s.jobFolders = [];
      s.invoices = []; s.timeEntries = []; s.events = [];
      s.books = { accounts: [], txns: [], rules: (s.books && s.books.rules) || [], imports: [] };
      s.nextEstimateNo = 1001; s.nextInvoiceNo = 1001;
      const di = MT.defaultIntegrations();
      if (s.integrations.google.sample) s.integrations.google = di.google;
      if (s.integrations.yelp.sample) s.integrations.yelp = di.yelp;
      if (s.demo) s.crew = s.crew.filter((c) => c.role === 'Owner');
      s.settings.company.yardGeo = s.settings.company.yardGeo && s.settings.company.yardGeo.sample ? null : s.settings.company.yardGeo;
      s.demo = false;
      this.save();
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
    const bi = MT.defaultIntegrations();
    data.integrations = data.integrations || {};
    Object.keys(bi).forEach((k) => { data.integrations[k] = Object.assign({}, bi[k], data.integrations[k] || {}); });
    if (!data.integrations.website.key) data.integrations.website.key = bi.website.key;
    return data;
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
