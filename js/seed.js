/* Mammoth CRM — demo data. Dates are generated relative to today so the demo always looks current. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Adds realistic payment history and job costs to demo won deals. Deterministic per deal id. */
  MT.seedFinancials = function (deals) {
    const today = u.todayISO();
    const METHODS = ['Check', 'Card', 'Zelle', 'Check', 'Cash', 'ACH'];
    deals.forEach((d) => {
      if (!Array.isArray(d.payments)) d.payments = [];
      if (d.stage !== 'won' || d.payments.length) return;
      let h = 0;
      for (let i = 0; i < d.id.length; i++) h = (h * 31 + d.id.charCodeAt(i)) | 0;
      const r = rng(h);
      const jobDate = d.scheduledDate || d.closedAt;
      const done = jobDate <= today;
      // Job cost: most jobs earn 15–42%; a few run long and lose money.
      const margin = r() < 0.07 ? -0.05 - r() * 0.1 : 0.15 + r() * 0.27;
      d.jobCost = Math.round(u.num(d.value) * (1 - margin));
      d.costSource = done ? 'actual' : 'estimate';
      const method = METHODS[Math.floor(r() * METHODS.length)];
      const pay = (amount, date) => { if (date <= today && amount > 0) d.payments.push({ id: u.uid('pay'), amount: Math.round(amount), date, method }); };
      if (u.num(d.value) >= 3000 && r() < 0.45) pay(u.num(d.value) * 0.25, d.closedAt); // deposit
      const deposit = u.sum(d.payments, (p) => p.amount);
      const age = done ? u.daysBetween(jobDate, today) : -1;
      if (age > 21) {
        if (age > 75 || r() > 0.1) pay(u.num(d.value) - deposit, u.addDays(jobDate, Math.floor(r() * 18)));
      } else if (age >= 0) {
        if (r() < 0.5) pay(u.num(d.value) - deposit, u.addDays(jobDate, Math.floor(r() * (age + 1))));
      }
    });
  };

  /** Starter list of job-specific add-ons: rentals, subcontractors, permits. */
  MT.defaultAddons = function () {
    return [
      ['Crane service with operator', 'Subcontractor', 'hour', 240, 20],
      ['Crane mobilization (setup & travel)', 'Subcontractor', 'flat', 450, 15],
      ['Climbing subcontractor', 'Subcontractor', 'day', 650, 25],
      ['Traffic control / flaggers', 'Subcontractor', 'hour', 85, 15],
      ['Aerial lift rental (70 ft)', 'Equipment rental', 'day', 650, 20],
      ['Mini loader rental', 'Equipment rental', 'day', 325, 20],
      ['Ground protection mats rental', 'Equipment rental', 'day', 120, 25],
      ['Tree removal permit', 'Permit or fee', 'flat', 75, 0],
      ['Utility line-clearance coordination', 'Permit or fee', 'flat', 150, 10],
      ['Extra dump / landfill load', 'Disposal', 'load', 85, 10],
      ['Lawn repair (topsoil & seed)', 'Materials', 'flat', 180, 30],
    ].map((a, i) => ({ id: 'ad' + (i + 1), name: a[0], category: a[1], unit: a[2], cost: a[3], markup: a[4] }));
  };

  MT.seed = function () {
    const r = rng(20261015);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const between = (a, b) => a + Math.floor(r() * (b - a + 1));
    const today = u.todayISO();
    const year = new Date().getFullYear();
    const jan1 = year + '-01-01';
    const dayOfYear = u.daysBetween(jan1, today);

    /* ---------- Price book ---------- */
    const priceBook = [
      { id: 'pb1', name: 'Tree removal, small (under 30 ft)', unit: 'tree', price: 450 },
      { id: 'pb2', name: 'Tree removal, medium (30–60 ft)', unit: 'tree', price: 1250 },
      { id: 'pb3', name: 'Tree removal, large (60 ft+)', unit: 'tree', price: 2800 },
      { id: 'pb4', name: 'Crown thinning / structural pruning', unit: 'tree', price: 425 },
      { id: 'pb5', name: 'Deadwood removal', unit: 'tree', price: 300 },
      { id: 'pb6', name: 'Crown raising / clearance prune', unit: 'tree', price: 225 },
      { id: 'pb7', name: 'Stump grinding (per inch diameter)', unit: 'inch', price: 4.5 },
      { id: 'pb8', name: 'Stump grinding minimum', unit: 'stump', price: 150 },
      { id: 'pb9', name: 'Cabling & bracing', unit: 'system', price: 475 },
      { id: 'pb10', name: 'Emergency storm response', unit: 'hour', price: 325 },
      { id: 'pb11', name: 'Lot / brush clearing', unit: 'acre', price: 3200 },
      { id: 'pb12', name: 'Hedge & shrub trimming', unit: 'hour', price: 95 },
      { id: 'pb13', name: 'Plant health care treatment', unit: 'tree', price: 185 },
      { id: 'pb14', name: 'Arborist report / assessment', unit: 'report', price: 250 },
      { id: 'pb15', name: 'Firewood (split, delivered)', unit: 'cord', price: 325 },
    ];

    /* ---------- Overhead ---------- */
    const expenses = [
      ['General liability insurance', 'Insurance', 14400, 'annual'],
      ["Workers' comp (admin portion)", 'Insurance', 3600, 'annual'],
      ['Commercial auto insurance', 'Insurance', 780, 'monthly'],
      ['Bucket truck loan', 'Vehicles & equipment', 1650, 'monthly'],
      ['Chip truck payment', 'Vehicles & equipment', 890, 'monthly'],
      ['Chipper loan', 'Vehicles & equipment', 720, 'monthly'],
      ['Stump grinder loan', 'Vehicles & equipment', 410, 'monthly'],
      ['Shop / yard rent', 'Facilities', 1800, 'monthly'],
      ['Utilities', 'Facilities', 260, 'monthly'],
      ['Office manager salary', 'Office & admin', 3900, 'monthly'],
      ['Accounting & bookkeeping', 'Office & admin', 350, 'monthly'],
      ['Software & CRM subscriptions', 'Office & admin', 180, 'monthly'],
      ['Phones & internet', 'Office & admin', 240, 'monthly'],
      ['Google Ads & local SEO', 'Marketing', 1200, 'monthly'],
      ['Yard signs, truck wraps, print', 'Marketing', 2400, 'annual'],
      ['ISA certification & training', 'Licensing & training', 1800, 'annual'],
      ['Business license & permits', 'Licensing & training', 650, 'annual'],
      ['Small tools & PPE replacement', 'Shop & small tools', 425, 'monthly'],
    ].map((e, i) => ({ id: 'ox' + i, name: e[0], category: e[1], amount: e[2], frequency: e[3] }));

    const equipment = [
      ['Bucket truck (60 ft)', 95, 32],
      ['Chipper (12 in)', 55, 18],
      ['Stump grinder', 75, 22],
      ['Crane (subcontract)', 285, 240],
      ['Mini skid steer', 65, 20],
      ['Dump trailer', 25, 8],
    ].map((e, i) => ({ id: 'eq' + i, name: e[0], rate: e[1], cost: e[2] }));

    /* ---------- Customers ---------- */
    const firsts = ['Dana', 'Marcus', 'Elena', 'Ray', 'Priya', 'Tom', 'Kristen', 'Luis', 'Janet', 'Owen', 'Hannah', 'Derek', 'Maya', 'Carl', 'Beth', 'Andre', 'Sofia', 'Glen', 'Nora', 'Victor', 'Ruth', 'Sam', 'Lena', 'Frank', 'Tasha', 'Wes'];
    const lasts = ['Whitaker', 'Bell', 'Ortiz', 'Hollis', 'Raman', 'Becker', 'Lund', 'Navarro', 'Pruitt', 'Garrison', 'Kowalski', 'Freeman', 'Delgado', 'Stroud', 'Ames', 'Coleman', 'Marchetti', 'Haskins', 'Ibsen', 'Petrov', 'Calloway', 'Dunn', 'Albright', 'Moreno', 'Vance', 'Thornton'];
    const streets = ['Oak Hollow Dr', 'Ridgeview Ln', 'Cedar Bluff Rd', 'Maple Ct', 'Pine Hill Ave', 'Elm St', 'Birch Run Way', 'Hickory Trl', 'Willow Bend', 'Sycamore Pl', 'Aspen Ridge Rd', 'Chestnut Ave'];
    const cities = ['Fairview', 'Oak Ridge', 'Cedar Falls', 'Millbrook', 'Westfield', 'Pine Grove'];
    const companies = { 3: 'Hollis Property Management', 9: 'Garrison HOA', 14: 'Ames Family Farm', 19: 'Petrov Commercial Realty', 23: 'Moreno Builders' };
    const customers = firsts.map((f, i) => {
      const last = lasts[i];
      const created = u.addDays(jan1, -between(0, 400));
      return {
        id: 'c' + (i + 1),
        name: f + ' ' + last,
        company: companies[i] || '',
        phone: '(555) ' + between(200, 989) + '-' + String(between(1000, 9999)),
        email: (f + '.' + last).toLowerCase() + '@' + pick(['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com']),
        address: between(100, 9899) + ' ' + pick(streets),
        city: pick(cities),
        source: pick(MT.store.SOURCES.slice(0, 8)),
        type: companies[i] ? 'Commercial' : 'Residential',
        notes: i % 4 === 0 ? 'Gate code 4412. Dog in backyard — call before arrival.' : i % 5 === 0 ? 'Prefers text messages. Large oaks near the house.' : '',
        createdAt: created < u.addDays(today, -30) ? created : u.addDays(today, -30),
      };
    });

    /* ---------- Deals ---------- */
    const jobTitles = [
      'Remove dead oak near driveway', 'Prune 3 maples in front yard', 'Storm cleanup — fallen pine', 'Stump grinding (6 stumps)',
      'Hazard removal over garage', 'Crown thin on two large oaks', 'Lot clearing for new build', 'Cabling on split-trunk elm',
      'Remove 4 leaning pines', 'Clearance prune over roofline', 'Ash removal (EAB damage)', 'Hedge row trimming & haul',
      'Line clearance — service drop', 'Annual HOA common-area pruning', 'Remove cottonwood by fence', 'Deadwood removal on sycamore',
    ];
    const deals = [];
    let dn = 0;
    const mkDeal = (o) => { dn++; const d = Object.assign({ id: 'd' + dn, probability: '', notes: '', estimateId: '', scheduledDate: '', closedAt: '', lostReason: '' }, o); deals.push(d); return d; };
    const jobValue = () => {
      const x = r();
      return x < 0.35 ? u.round(between(450, 1800), 25) : x < 0.8 ? u.round(between(1800, 6500), 25) : u.round(between(6500, 16500), 50);
    };

    // Closed deals, spread over the year with tree-service seasonality.
    const season = [0.45, 0.5, 0.9, 1.25, 1.35, 1.2, 1.05, 1.0, 1.1, 1.2, 0.85, 0.55];
    // Two seasons of history (last year + this year) so period comparisons have data.
    const histStart = u.daysBetween(jan1, (year - 1) + '-01-01');
    for (let doy = histStart + 3; doy <= dayOfYear - 2; doy += 1) {
      const date = u.addDays(jan1, doy);
      const m = u.parseISO(date).getMonth();
      if (r() < 0.52 * season[m]) {
        const won = r() < 0.72;
        const c = pick(customers);
        const created = u.addDays(date, -between(5, 30));
        mkDeal({
          customerId: c.id,
          title: pick(jobTitles),
          value: jobValue(),
          stage: won ? 'won' : 'lost',
          source: c.source,
          createdAt: created,
          expectedClose: date,
          closedAt: date,
          scheduledDate: won ? u.addDays(date, between(3, 14)) : '',
          lostReason: won ? '' : pick(['Price too high', 'Went with another company', 'Decided to wait', 'No response']),
        });
      }
    }
    // Upcoming scheduled jobs (won recently, work still ahead).
    for (let i = 0; i < 6; i++) {
      const c = customers[(i * 5 + 2) % customers.length];
      const closed = u.addDays(today, -between(1, 9));
      mkDeal({ customerId: c.id, title: jobTitles[(i * 3) % jobTitles.length], value: jobValue(), stage: 'won', source: c.source, createdAt: u.addDays(closed, -12), expectedClose: closed, closedAt: closed, scheduledDate: i <= 1 ? today : u.addDays(today, between(1, 21)) });
    }
    // Open pipeline.
    const openPlan = [['lead', 6], ['contacted', 5], ['estimate', 6], ['negotiating', 3]];
    openPlan.forEach(([stage, n]) => {
      for (let i = 0; i < n; i++) {
        const c = customers[between(0, customers.length - 1)];
        const created = u.addDays(today, -between(1, 26));
        mkDeal({
          customerId: c.id,
          title: pick(jobTitles),
          value: jobValue(),
          stage,
          source: c.source,
          createdAt: created,
          expectedClose: u.addDays(today, between(-4, 30)),
          notes: stage === 'negotiating' ? 'Customer asked about splitting the job into two visits.' : '',
        });
      }
    });

    deals.forEach((d) => { d.payments = []; d.jobCost = ''; d.costSource = ''; });
    MT.seedFinancials(deals);

    /* ---------- Estimates for deals at/after the estimate stage ---------- */
    const estimates = [];
    let estNo = 1001;
    const detailedWon = deals.filter((d) => d.stage === 'won').slice(-3);
    // Simple one-line estimates behind past jobs, so estimate counts and history look real.
    deals.filter((d) => (d.stage === 'won' || d.stage === 'lost') && !detailedWon.includes(d) && r() < 0.9)
      .map((d) => ({ d, date: u.addDays(d.closedAt, -between(2, 9)) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach(({ d, date }, i) => {
        const c = customers.find((x) => x.id === d.customerId);
        const e = {
          id: 'eh' + (i + 1), number: 'EST-' + estNo++, customerId: d.customerId, dealId: d.id, title: d.title,
          jobAddress: c.address + ', ' + c.city, date, validDays: 30, status: d.stage === 'won' ? 'accepted' : 'declined',
          items: [{ desc: d.title, qty: 1, unit: 'job', price: d.value }], billTM: false,
          crewHours: Math.max(2, Math.round(d.value / 235)), crewRate: 0, equipment: [], disposal: 0, complexity: 0, discount: 0, taxRate: 0,
          notes: '', sentAt: date,
        };
        estimates.push(e);
        d.estimateId = e.id;
      });
    const estDeals = deals.filter((d) => d.stage === 'estimate' || d.stage === 'negotiating').concat(detailedWon);
    estDeals.forEach((d, i) => {
      const c = customers.find((x) => x.id === d.customerId);
      const big = d.value > 4000;
      const items = big
        ? [{ desc: priceBook[2].name, qty: 1, unit: 'tree', price: 2800 }, { desc: priceBook[1].name, qty: 1, unit: 'tree', price: 1250 }, { desc: priceBook[6].name, qty: 52, unit: 'inch', price: 4.5 }]
        : [{ desc: priceBook[3].name, qty: 2, unit: 'tree', price: 425 }, { desc: priceBook[4].name, qty: 1, unit: 'tree', price: 300 }];
      const status = d.stage === 'won' ? 'accepted' : 'sent';
      const date = d.stage === 'won' ? u.addDays(d.closedAt, -6) : u.addDays(today, -between(1, 10));
      const e = {
        id: 'e' + (i + 1),
        number: 'EST-' + estNo++,
        customerId: d.customerId,
        dealId: d.id,
        title: d.title,
        jobAddress: c.address + ', ' + c.city,
        date,
        validDays: 30,
        status,
        items,
        billTM: false,
        crewHours: big ? 10 : 4,
        crewRate: 0,
        equipment: big ? [{ equipmentId: 'eq0', hours: 6 }, { equipmentId: 'eq1', hours: 6 }, { equipmentId: 'eq2', hours: 2 }] : [{ equipmentId: 'eq1', hours: 3 }],
        disposal: big ? 180 : 60,
        complexity: big ? 0.2 : 0.1,
        discount: 0,
        taxRate: 0,
        notes: 'All debris chipped and hauled. Lawn protected with mats where equipment crosses turf.',
        sentAt: status === 'sent' ? date : '',
      };
      estimates.push(e);
      d.estimateId = e.id;
    });

    /* ---------- Activity log ---------- */
    const activities = [];
    deals.slice().sort((a, b) => (a.closedAt || a.createdAt) < (b.closedAt || b.createdAt) ? 1 : -1).slice(0, 40).forEach((d) => {
      const c = customers.find((x) => x.id === d.customerId);
      const when = d.closedAt || d.createdAt;
      const text = d.stage === 'won' ? 'Won "' + d.title + '" with ' + c.name : d.stage === 'lost' ? 'Lost "' + d.title + '" (' + d.lostReason + ')' : 'New lead from ' + c.name + ': ' + d.title;
      activities.push({ id: 'a' + d.id, ts: when + 'T' + String(between(8, 17)).padStart(2, '0') + ':' + String(between(0, 59)).padStart(2, '0') + ':00', type: d.stage === 'won' ? 'won' : d.stage === 'lost' ? 'lost' : 'lead', text, customerId: c.id, dealId: d.id });
    });

    /* ---------- Templates ---------- */
    const templates = [
      {
        id: 't1', name: 'Estimate follow-up', category: 'Email', subject: 'Your tree service estimate {{estimate.number}}',
        body: 'Hi {{customer.firstName}},\n\nThanks again for having us out to {{customer.address}}. I wanted to follow up on estimate {{estimate.number}} for {{estimate.total}}.\n\nIf you have any questions about the scope, or want to adjust anything, just reply here or call me at {{company.phone}}. We\'re currently booking about two weeks out.\n\nThanks,\n{{owner.name}}\n{{company.name}}',
      },
      {
        id: 't2', name: 'Appointment confirmation', category: 'Text message', subject: '',
        body: 'Hi {{customer.firstName}}, this is {{owner.name}} with {{company.name}}. Confirming your estimate visit at {{customer.address}}. Reply YES to confirm or call {{company.phone}} to reschedule.',
      },
      {
        id: 't3', name: 'Job scheduled', category: 'Email', subject: 'Your tree work is scheduled',
        body: 'Hi {{customer.firstName}},\n\nGreat news — your job "{{deal.title}}" is on the schedule for {{deal.scheduledDate}}. Our crew will arrive between 7:30 and 8:30 AM.\n\nBefore we arrive:\n- Please move vehicles away from the work area.\n- Keep pets indoors.\n- Unlock any gates we will need to pass through.\n\nSee you then,\n{{owner.name}}\n{{company.name}} | {{company.phone}}',
      },
      {
        id: 't4', name: 'Thank you & review request', category: 'Email', subject: 'Thank you from {{company.name}}',
        body: 'Hi {{customer.firstName}},\n\nThank you for choosing {{company.name}}. We hope you\'re happy with how everything turned out.\n\nIf you have a minute, a quick Google review helps a small local business like ours more than you know:\n{{company.reviewLink}}\n\nThanks again,\n{{owner.name}}',
      },
      {
        id: 't5', name: 'Storm damage outreach', category: 'Text message', subject: '',
        body: 'Hi {{customer.firstName}}, {{owner.name}} from {{company.name}} here. After this week\'s storm we\'re checking on past customers. If you have any broken limbs or hanging branches, we can get out quickly — call or text {{company.phone}}.',
      },
      {
        id: 't6', name: 'Seasonal pruning reminder', category: 'Email', subject: 'Dormant-season pruning is the best time for your trees',
        body: 'Hi {{customer.firstName}},\n\nLate winter is the ideal window to prune most hardwoods — less stress on the tree and better visibility of structure. We\'d love to take another look at the trees at {{customer.address}}.\n\nReply to book a free walk-through.\n\n{{owner.name}}\n{{company.name}}',
      },
      {
        id: 't7', name: 'Payment reminder', category: 'Email', subject: 'Invoice reminder for {{deal.title}}',
        body: 'Hi {{customer.firstName}},\n\nA friendly reminder that the balance of {{deal.balance}} for "{{deal.title}}" is now due. You can pay by check, card, or Zelle.\n\nQuestions? Call {{company.phone}}.\n\nThank you,\n{{company.name}}',
      },
      {
        id: 't8', name: 'Standard terms & conditions', category: 'Contract', subject: '',
        body: 'Terms & Conditions — {{company.name}}\n\n1. Estimate is valid for 30 days from {{today}}.\n2. Price includes cleanup and removal of all debris unless noted.\n3. Stump grinding includes grindings left in hole unless haul-away is listed.\n4. Customer is responsible for identifying property lines and private underground utilities (sprinkler lines, invisible fences, septic).\n5. {{company.name}} is not responsible for lawn rutting where equipment access is required; mats are used where practical.\n6. Payment is due upon completion. A 1.5% monthly fee applies to balances over 30 days.\n7. {{company.name}} carries general liability and workers\' compensation insurance. Certificates available on request.\n\nCustomer signature: ______________________   Date: __________',
      },
    ];

    /* ---------- Job Cam folders (sample illustrations, no real files) ---------- */
    let mseed = 1;
    const shots = (scene, n, captions, layout) => Array.from({ length: n }, (_, i) => ({
      id: 'sm' + mseed, kind: 'image', name: scene + '-' + (i + 1) + '.jpg', mime: 'image/svg+xml', size: 0, w: 1200, h: 900, duration: 0,
      hasThumb: false, tag: scene, caption: (captions && captions[i]) || '', addedAt: '', sample: { scene, seed: mseed++, layout },
    }));
    const pastWon = deals.filter((d) => d.stage === 'won' && d.scheduledDate && d.scheduledDate < today).slice(-2);
    const upcomingWon = deals.filter((d) => d.stage === 'won' && d.scheduledDate >= today);
    const plan = [
      [pastWon[1], 'completed', [['before', 3, ['Dead oak leaning toward driveway', 'Decay at the base']], ['during', 2, ['Rigging the top section']], ['after', 3, ['Cleanup done, stump ground']]], 'Customer signed off. Asked about pruning the maples next spring.', -2],
      [pastWon[0], 'completed', [['before', 2], ['after', 2]], '', -9],
      [upcomingWon[0], 'inprogress', [['before', 2, ['Limbs over roofline']], ['during', 2]], 'Day 1 of 2. Bucket truck staged on street.', 0],
      [upcomingWon[1], 'approved', [['before', 3, ['Front yard view', 'Access through side gate']]], 'Approved by customer. Scheduled.', -1],
      [deals.find((d) => d.stage === 'negotiating'), 'pending', [['before', 2, ['Split trunk, needs cabling']]], 'Waiting on customer approval of estimate.', -3],
      [deals.find((d) => d.stage === 'estimate'), 'pending', [['before', 1]], '', -5],
      [deals.filter((d) => d.stage === 'lost').slice(-1)[0], 'disapproved', [['before', 2]], 'Customer declined. Price too high.', -12],
    ];
    const jobFolders = plan.filter((p) => p[0]).map((p, i) => {
      const d = p[0];
      const c = customers.find((x) => x.id === d.customerId);
      const when = u.addDays(today, p[4]) + 'T1' + i + ':15:00';
      const mediaList = [];
      p[2].forEach(([scene, n, caps]) => shots(scene, n, caps, i + 3).forEach((m) => { m.addedAt = when; mediaList.push(m); }));
      mediaList.reverse();
      return { id: 'jf' + (i + 1), name: d.title, customerId: d.customerId, dealId: d.id, address: c.address + ', ' + c.city, status: p[1], notes: p[3], media: mediaList, createdAt: when, updatedAt: when };
    });

    /* ---------- Sales goal (seasonal split) ---------- */
    const annual = 600000;
    const wsum = u.sum(season);
    const monthly = season.map((w) => u.round((annual * w) / wsum, 100));
    monthly[11] += annual - u.sum(monthly);

    const state = {
      version: 1,
      demo: true,
      financialsV1: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        company: { name: 'Mammoth Tree Service', shortName: 'Mammoth', tagline: 'Tree Service CRM', owner: 'Owner', phone: '(555) 410-8733', email: 'info@mammoth-tree.com', address: '', yardAddress: '', website: 'mammoth-tree.com', license: '' },
        branding: { logo: '', primary: '#24563a', accent: '#e2a400', sidebar: '#2e2620', headings: 'wide', preset: 'forest' },
        taxRate: 0,
        estimateValidDays: 30,
        estimateFooter: 'Thank you for the opportunity to earn your business. Fully insured. ISA Certified Arborist on staff.',
        paymentTermsDays: 15,
        invoiceNotes: 'Payment is due within 15 days. We accept check, card, Zelle, and ACH. Thank you for your business!',
        fuelPrice: 3.89,
        truckMpg: 9,
        avgMph: 28,
        lockMinutes: 15,
        priceBook,
      },
      integrations: MT.defaultIntegrations(),
      overhead: {
        crews: 2,
        crewSize: 3,
        avgWage: 24,
        laborBurden: 32,
        hoursPerDay: 8,
        daysPerMonth: 21,
        utilization: 75,
        targetProfit: 20,
        expenses,
        equipment,
        addons: MT.defaultAddons(),
        history: [
          { date: (year - 1) + '-03-01', rate: 215, breakEven: 168, monthly: 13650, note: 'Starting rate' },
          { date: year + '-01-06', rate: 225, breakEven: 176, monthly: 14100, note: 'Insurance renewal' },
          { date: u.addDays(today, -40), rate: 235, breakEven: 185, monthly: 14710, note: 'Added chip truck payment' },
        ],
      },
      goals: { year, annual, monthly },
      customers,
      deals,
      estimates,
      activities,
      templates,
      jobFolders,
      nextEstimateNo: estNo,
      invoices: [],
      timeEntries: [],
      events: [],
      crew: [],
      nextInvoiceNo: 1001,
    };
    MT.seedOps(state);
    state.opsV1 = true;
    MT.seedBooks(state);
    return state;
  };

  /** Sample bank activity for the demo: ~5 months of a business checking account. */
  MT.seedBooks = function (state) {
    const r = rng(99173);
    const between = (a, b) => a + Math.floor(r() * (b - a + 1));
    const today = u.todayISO();
    const start = u.addDays(today, -150);
    const acct = { id: 'ba1', name: 'Business checking ••4821' };
    const tx = [];
    const add = (date, desc, amount, category) => { if (date >= start && date <= today) tx.push({ id: u.uid('bt'), accountId: acct.id, date, desc, memo: '', amount: Math.round(amount * 100) / 100, category, source: 'import', hash: '' }); };
    // Deposits: customer payments recorded in the CRM, batched by day
    const byDay = {};
    state.deals.forEach((d) => (d.payments || []).forEach((p) => { if (p.date >= start && p.date <= today) (byDay[p.date] = byDay[p.date] || []).push(p); }));
    Object.keys(byDay).forEach((day) => {
      const sq = byDay[day].filter((p) => p.method === 'Card' || p.method === 'Square'), other = byDay[day].filter((p) => !sq.includes(p));
      if (sq.length) { const amt = u.sum(sq, (p) => p.amount); add(u.addDays(day, 1), 'SQ *SQUARE INC DEPOSIT', amt * 0.971, 'Job income'); add(u.addDays(day, 1), 'SQUARE FEES', -amt * 0.029, 'Bank & card fees'); }
      if (other.length) add(day, other.some((p) => p.method === 'Zelle') ? 'ZELLE FROM CUSTOMER' : 'MOBILE DEPOSIT', u.sum(other, (p) => p.amount), 'Job income');
    });
    // Recurring and weekly costs
    for (let d = start; d <= today; d = u.addDays(d, 1)) {
      const dt = u.parseISO(d), dow = dt.getDay(), dom = dt.getDate();
      if (dow === 1 || dow === 4) add(d, ['SHELL OIL 57442', 'SPEEDWAY 0412', 'BP#8841 FUEL', 'CHEVRON 00921'][between(0, 3)], -between(140, 290), 'Fuel');
      if (dow === 5 && r() < 0.5) add(d, 'GUSTO PAYROLL ' + dt.toISOString().slice(5, 10).replace('-', ''), -between(9800, 12400), 'Payroll');
      if (dow === 5 && r() < 0.5) add(d, 'EFTPS IRS USATAXPYMT', -between(1900, 2600), 'Payroll taxes');
      if (dow === 3 && r() < 0.7) add(d, 'CITY GREEN WASTE TRANSFER STATION', -between(65, 260), 'Dump & disposal fees');
      if (dow === 2 && r() < 0.45) add(d, ['THE HOME DEPOT #3812', 'LOWES #01944', 'TRACTOR SUPPLY #221'][between(0, 2)], -between(40, 380), 'Materials & supplies');
      if (dow === 6 && r() < 0.15) add(d, 'BAILEYS ONLINE ORDER', -between(120, 640), 'Small tools & safety gear');
      if (r() < 0.04) add(d, 'MCDONALDS F2234', -between(18, 60), 'Meals');
      if (dom === 1) { add(d, 'YARD RENT - ACH', -1800, 'Rent & utilities'); add(d, 'BUCKET TRUCK LOAN PMT', -1650, 'Vehicle & equipment loans'); add(d, 'CHIPPER FINANCE ACH', -720, 'Vehicle & equipment loans'); }
      if (dom === 3) add(d, 'PROGRESSIVE COMMERCIAL AUTO', -780, 'Insurance');
      if (dom === 5) { add(d, 'GOOGLE *ADS4410', -1200, 'Marketing & advertising'); add(d, 'VERIZON WIRELESS', -240, 'Phone & internet'); }
      if (dom === 8) add(d, 'INTUIT *QUICKBOOKS', -90, 'Office & software');
      if (dom === 12) add(d, 'SUNBELT RENTALS #422', -between(325, 650), 'Equipment rental');
      if (dom === 15) add(d, 'OWNER TRANSFER TO PERSONAL', -between(3000, 4500), 'Owner draw');
      if (dom === 20) add(d, 'CRANE SERVICE CO INV ' + between(1000, 9999), -between(960, 1900), 'Subcontractors');
      if (dom === 25) add(d, 'MONTHLY SERVICE FEE', -25, 'Bank & card fees');
      if (dom === 18 && r() < 0.6) add(d, 'TRUCK SHOP REPAIR ' + between(100, 999), -between(280, 1400), 'Equipment repairs & maintenance');
    }
    // A few left for you to categorize
    add(u.addDays(today, -3), 'POS PURCHASE NAPA AUTO PARTS 2231', -86.42, 'Uncategorized');
    add(u.addDays(today, -6), 'CHECK #1043', -450, 'Uncategorized');
    add(u.addDays(today, -9), 'AMAZON MKTPLACE PMTS', -63.19, 'Uncategorized');
    tx.forEach((t) => { t.hash = [t.accountId, t.date, Math.round(t.amount * 100), t.desc.toLowerCase()].join('|'); });
    state.books = { accounts: [acct], txns: tx, rules: [{ id: 'rl1', match: 'crane service', category: 'Subcontractors' }], imports: [{ date: new Date(Date.now() - 2 * 86400000).toISOString(), file: 'sample-checking.qfx', added: tx.length, dup: 0, accountId: acct.id }], sample: true };
    return state;
  };

  MT.defaultIntegrations = function () {
    return {
      google: { placeId: '', name: '', address: '', rating: 0, count: 0, reviews: [], fetchedAt: '', history: [], mapsUrl: '', reviewUrl: '' },
      yelp: { url: '', rating: 0, count: 0, history: [] },
      website: { scriptUrl: '', key: Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10), lastRow: 1, lastPull: '', imported: 0, autoCheck: true },
      square: { seenIds: [], lastImport: '', imported: 0 },
    };
  };

  /**
   * Adds the operations layer to demo data: crew, locations, crew assignments, invoices,
   * time entries, job expenses, calendar events, and sample review stats.
   * Works on fresh seeds and on older demo data being upgraded.
   */
  MT.seedOps = function (state) {
    const r = rng(77231);
    const between = (a, b) => a + Math.floor(r() * (b - a + 1));
    const today = u.todayISO();
    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
    ['invoices', 'timeEntries', 'events', 'crew'].forEach((k) => { if (!Array.isArray(state[k])) state[k] = []; });

    // Crew
    if (!state.crew.length) {
      state.crew = [
        ['Owner', 'Owner', 0, '#24563a'],
        ['Mike Torres', 'Crew lead', 31, '#2c5f86'],
        ['Jake Russo', 'Climber', 28, '#8a5a2b'],
        ['Luis Ortega', 'Groundsman', 21, '#6250d6'],
        ['Tyler Brooks', 'Crew lead', 30, '#b0352e'],
        ['Sam Patel', 'Climber', 27, '#1baf7a'],
        ['Chris Dunn', 'Groundsman', 20, '#c98500'],
        ['Ana Ruiz', 'Office', 22, '#e87ba4'],
      ].map((c, i) => ({ id: 'cr' + i, name: c[0], role: c[1], wage: c[2], phone: '(555) 3' + String(10 + i) + '-' + String(4000 + i * 37), color: c[3], active: true }));
      state.crew[0].name = (state.settings && state.settings.company && state.settings.company.owner) || 'Owner';
    }
    const crewA = ['cr1', 'cr2', 'cr3'], crewB = ['cr4', 'cr5', 'cr6'];

    // Sample locations around the yard (relative positions for the route planner; not real addresses).
    const yard = { lat: 39.9612, lon: -82.9988 };
    state.settings.company.yardGeo = state.settings.company.yardGeo || Object.assign({ sample: true }, yard);
    state.customers.forEach((c) => {
      if (c.geo) return;
      const h = hash(c.id + c.name);
      const ang = (h % 360) * Math.PI / 180, dist = 0.03 + ((h >> 3) % 100) / 100 * 0.18;
      c.geo = { lat: yard.lat + Math.sin(ang) * dist, lon: yard.lon + Math.cos(ang) * dist * 1.3, sample: true };
    });

    // Crew assignment, start times, and length for won jobs
    state.deals.forEach((d, i) => {
      if (!Array.isArray(d.crewIds)) d.crewIds = [];
      if (!Array.isArray(d.expenses)) d.expenses = [];
      if (d.startTime == null) d.startTime = '';
      if (!d.days) d.days = 1;
      if (d.stage === 'won' && d.scheduledDate) {
        if (!d.crewIds.length) d.crewIds = (i % 2 ? crewA : crewB).slice();
        if (!d.startTime) d.startTime = d.scheduledDate >= today ? ['07:30', '07:30', '08:00', '12:30'][i % 4] : '07:30';
        if (u.num(d.value) > 9000) d.days = 2;
      }
    });

    // Invoices for finished jobs; existing payments are applied to them.
    if (!state.invoices.length) {
      let n = state.nextInvoiceNo || 1001;
      const terms = (state.settings && state.settings.paymentTermsDays) || 15;
      state.deals.filter((d) => d.stage === 'won' && (d.scheduledDate || d.closedAt) <= today)
        .sort((a, b) => ((a.scheduledDate || a.closedAt) < (b.scheduledDate || b.closedAt) ? -1 : 1))
        .forEach((d) => {
          const date = d.scheduledDate || d.closedAt;
          const est = d.estimateId && state.estimates.find((e) => e.id === d.estimateId);
          const items = est && est.items.length > 1 && !est.billTM ? est.items.map((x) => ({ desc: x.desc, qty: x.qty, unit: x.unit, price: x.price })) : [{ desc: d.title, qty: 1, unit: 'job', price: u.num(d.value) }];
          const sub = u.sum(items, (x) => u.num(x.qty) * u.num(x.price));
          if (Math.abs(sub - u.num(d.value)) > 0.5) { items.length = 0; items.push({ desc: d.title, qty: 1, unit: 'job', price: u.num(d.value) }); }
          const inv = { id: 'inv' + n, number: 'INV-' + n, dealId: d.id, customerId: d.customerId, date, dueDate: u.addDays(date, terms), status: 'sent', sentAt: date, items, discount: 0, taxRate: 0, notes: (state.settings && state.settings.invoiceNotes) || '' };
          n++;
          state.invoices.push(inv);
          (d.payments || []).forEach((p) => { p.invoiceId = inv.id; });
        });
      state.nextInvoiceNo = n;
    }

    // Time entries and expenses for jobs in the last six weeks (and today's job, crew still on the clock).
    if (!state.timeEntries.length) {
      const nowH = new Date().getHours() + new Date().getMinutes() / 60;
      const stillWorking = nowH >= 7.5 && nowH < 16.5;
      state.deals.filter((d) => d.stage === 'won' && d.scheduledDate && d.scheduledDate <= today && u.daysBetween(d.scheduledDate, today) <= 42).forEach((d) => {
        const crewHours = Math.max(3, (u.num(d.value) / 235) * (0.8 + r() * 0.5));
        const days = Math.max(1, u.num(d.days) || 1);
        for (let k = 0; k < days; k++) {
          const date = u.addDays(d.scheduledDate, k);
          if (date > today) break;
          const hrs = Math.min(10, crewHours / days);
          const startM = 7 * 60 + 30;
          const endM = Math.round((startM + hrs * 60 + 30) / 15) * 15;
          d.crewIds.forEach((cid) => {
            state.timeEntries.push({
              id: u.uid('te'), crewId: cid, dealId: d.id, kind: 'job', date, start: '07:30',
              end: date === today && stillWorking ? '' : String(Math.floor(endM / 60)).padStart(2, '0') + ':' + String(endM % 60).padStart(2, '0'),
              breakMin: date === today && stillWorking ? 0 : 30, note: '',
            });
          });
        }
        if (!d.expenses.length) {
          const loads = Math.max(1, Math.round(u.num(d.value) / 2500));
          d.expenses.push({ id: u.uid('ex'), date: d.scheduledDate, category: 'Dump fees', desc: loads + ' load' + (loads > 1 ? 's' : '') + ' at green waste site', amount: loads * 65 });
          if (u.num(d.value) > 9000) d.expenses.push({ id: u.uid('ex'), date: d.scheduledDate, category: 'Subcontractor', desc: 'Crane service, 4 hrs', amount: 960 });
          if (r() < 0.3) d.expenses.push({ id: u.uid('ex'), date: d.scheduledDate, category: 'Materials', desc: 'Bar oil, chain, rigging rope', amount: between(40, 140) });
        }
      });
      // Most finished jobs already use their tracked cost; a few are left for you to review.
      state.deals.filter((d) => state.timeEntries.some((e) => e.dealId === d.id && e.end)).forEach((d) => {
        if (r() < 0.8) { d.jobCost = Math.round(MT.calc.jobActuals(d, state).total); d.costSource = 'tracked'; }
      });
      // Weekly shop time for crew leads
      for (let w = 0; w < 6; w++) {
        const dt = u.parseISO(today); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7) - 7 * w); // Monday
        const date = u.isoDate(dt);
        if (date >= today) continue;
        ['cr1', 'cr4'].forEach((cid) => state.timeEntries.push({ id: u.uid('te'), crewId: cid, dealId: '', kind: 'shop', date, start: '06:30', end: '07:30', breakMin: 0, note: 'Truck checks & sharpening' }));
      }
    }

    // Calendar: estimate visits for open leads, plus shop events.
    if (!state.events.length) {
      state.deals.filter((d) => d.stage === 'contacted' || (d.stage === 'lead' && r() < 0.5)).forEach((d, i) => {
        state.events.push({ id: u.uid('ev'), type: 'visit', title: 'Estimate visit: ' + d.title, date: i < 4 ? today : u.addDays(today, 1 + (i % 9)), start: i < 4 ? ['09:00', '13:30', '10:30', '15:00'][i] : ['09:00', '10:30', '13:00', '14:30', '16:00'][i % 5], end: '', customerId: d.customerId, dealId: d.id, crewIds: ['cr0'], notes: '' });
      });
      for (let w = 0; w < 4; w++) {
        const dt = u.parseISO(today); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7) + 7 * w);
        state.events.push({ id: u.uid('ev'), type: 'other', title: 'Crew safety meeting', date: u.isoDate(dt), start: '06:45', end: '07:15', customerId: '', dealId: '', crewIds: [], notes: 'Tailgate talk: rigging, PPE, drop zones.' });
      }
      state.events.push({ id: u.uid('ev'), type: 'other', title: 'Bucket truck annual inspection', date: u.addDays(today, 6), start: '08:00', end: '', customerId: '', dealId: '', crewIds: ['cr1'], notes: '' });
    }

    // Sample review stats so the Integrations page shows what tracking looks like.
    state.integrations = state.integrations || MT.defaultIntegrations();
    const g = state.integrations.google = Object.assign(MT.defaultIntegrations().google, state.integrations.google || {});
    if (!g.history.length && state.demo !== false) {
      g.sample = true; g.name = 'Mammoth Tree Service (sample)'; g.rating = 4.8; g.count = 132; g.fetchedAt = new Date().toISOString();
      g.history = [[-300, 4.7, 88], [-210, 4.7, 101], [-120, 4.8, 115], [-60, 4.8, 124], [0, 4.8, 132]].map((x) => ({ date: u.addDays(today, x[0]), rating: x[1], count: x[2] }));
      g.reviews = [
        { author: 'Dana W.', rating: 5, when: '2 weeks ago', text: 'Crew showed up on time, took down a huge dead oak next to our house without a scratch on anything. Cleanup was spotless.' },
        { author: 'Marcus B.', rating: 5, when: '1 month ago', text: 'Fair price and they explained exactly what they would prune and why. Will use again.' },
        { author: 'Priya R.', rating: 4, when: '2 months ago', text: 'Great work on our maples. Scheduling took a little longer than hoped during storm season.' },
      ];
    }
    const y = state.integrations.yelp = Object.assign(MT.defaultIntegrations().yelp, state.integrations.yelp || {});
    if (!y.history.length && state.demo !== false) {
      y.sample = true; y.rating = 4.5; y.count = 41;
      y.history = [[-240, 4.5, 33], [-90, 4.5, 38], [0, 4.5, 41]].map((x) => ({ date: u.addDays(today, x[0]), rating: x[1], count: x[2] }));
    }
    return state;
  };
})();
