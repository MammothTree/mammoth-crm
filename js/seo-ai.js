/* Mammoth CRM — SEO content engine. Every task has two paths:
   - a template that works today, with [ADD: …] placeholders wherever a real fact is needed, and
   - an AI prompt that is used automatically once an AI key is added to the SEO connector.
   Both return the same shape, so screens, approvals, and automation never need rebuilding.
   Nothing here publishes anything: results always become drafts that need your approval. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui;

  const titleCase = (s) => String(s || '').replace(/\b([a-z])/g, (m, c) => c.toUpperCase()).replace(/\b(And|In|Of|The|For|&)\b/g, (m) => (m === '&' ? m : m.toLowerCase()));
  const clip = (s, n) => { s = String(s || '').trim(); if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, Math.max(c.lastIndexOf(' '), n - 12)).replace(/[,;:\s-]+$/, '') + '…'; };
  const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const listTowns = (towns, n) => { const t = towns.slice(0, n).map((x) => x.name); return t.length > 1 ? t.slice(0, -1).join(', ') + ' and ' + t[t.length - 1] : t.join(''); };

  function S() { return MT.seo.state.settings; }
  function topTowns() { return S().towns.filter((t) => t.top); }
  function region() { return S().facts.region || 'Lake County, IL'; }
  function budget() { return 60 - (S().titleSuffix || '').length; }
  function fitTitle(options) { const b = budget(); return options.find((o) => o.length <= b) || clip(options[options.length - 1], b); }

  /** Facts the AI may use. Anything not listed here must come back as an [ADD: …] placeholder. */
  function facts(extra) {
    const f = S().facts;
    const lines = [
      'Business name: ' + f.business,
      'Phone: ' + f.phone,
      'Email: ' + f.email,
      'Website: ' + S().site,
      'Main region: ' + region(),
      'Broader service area: ' + f.area,
      'Towns served (top priority first): ' + S().towns.map((t) => t.name + (t.top ? ' (top)' : '')).join(', '),
      'Services: ' + S().services.map((s) => s.name).join(', '),
      f.isa ? 'Certifications: ISA Certified Arborist on staff' : '',
      f.insured ? 'Insurance: ' + f.insured : '',
      f.years ? 'Years in business: ' + f.years : '',
      f.license ? 'License: ' + f.license : '',
      f.emergency ? 'Emergency service: ' + f.emergency : '',
      f.extra ? 'Other facts from the owner: ' + f.extra : '',
    ];
    return lines.concat(extra || []).filter(Boolean).join('\n');
  }
  function system() {
    const f = S().facts;
    return 'You write website copy and SEO metadata for ' + f.business + ', a local tree service in ' + region() + '. ' +
      'Use only the facts in the FACTS section. Never invent numbers, years, awards, certifications, prices, reviews, customer names, addresses, guarantees, or response times. ' +
      'When copy needs a fact that is not given, write a placeholder in the form [ADD: what is needed]. ' +
      'The business serves towns from its own base; never imply an office or address in a town. ' +
      'Write for homeowners in plain, confident language. Mention towns only where it reads naturally; never stuff keywords or list the same town repeatedly. ' +
      'Each page must be genuinely useful on its own and must not repeat another page with the town name swapped.';
  }

  /* ---------- JSON schemas for AI results ---------- */
  const STR = { type: 'string' };
  const META_SCHEMA = { type: 'object', properties: { value: STR, alternatives: { type: 'array', items: STR } }, required: ['value', 'alternatives'], additionalProperties: false };
  const PAGE_SCHEMA = {
    type: 'object',
    properties: {
      seoTitle: STR, seoDescription: STR, slug: STR, h1: STR,
      sections: { type: 'array', items: { type: 'object', properties: { heading: STR, text: STR }, required: ['heading', 'text'], additionalProperties: false } },
      faqs: { type: 'array', items: { type: 'object', properties: { question: STR, answer: STR }, required: ['question', 'answer'], additionalProperties: false } },
      photoIdeas: { type: 'array', items: STR },
    },
    required: ['seoTitle', 'seoDescription', 'slug', 'h1', 'sections', 'faqs', 'photoIdeas'],
    additionalProperties: false,
  };
  const SUMMARY_SCHEMA = { type: 'object', properties: { summary: STR, nextSteps: { type: 'array', items: STR } }, required: ['summary', 'nextSteps'], additionalProperties: false };

  /* ---------- service knowledge used by templates (general, not claims about the business) ---------- */
  const SIGNS = {
    removal: ['Dead or dying trees, or trees with large dead limbs', 'Storm damage, splits, or a new lean toward a house, garage, or power line', 'Roots lifting driveways, walks, or foundations', 'Trees crowding out others or blocking a project'],
    trimming: ['Branches over the roof, gutters, or driveway', 'Dead, crossing, or rubbing limbs', 'Low limbs blocking views, lawns, or walkways', 'Young trees that need shaping for a strong structure'],
    stump: ['Stumps that trip people or block mowing', 'New sprouts growing from an old stump', 'Making room for new plantings, patios, or lawn', 'Stumps attracting insects or decay'],
    crane: ['Large trees over houses, pools, or fences with no room to drop limbs', 'Backyards that bucket trucks can\'t reach', 'Hazardous or storm-damaged trees too risky to climb', 'Jobs where protecting the lawn and landscaping matters'],
    emergency: ['A tree or large limb down on a house, car, fence, or driveway', 'Split or hanging limbs after wind, ice, or snow', 'Trees leaning after a storm', 'Blocked driveways or roads'],
    clearing: ['Clearing lots for building, additions, or fencing', 'Removing brush, saplings, and invasive buckthorn or honeysuckle', 'Opening up overgrown fence lines and property edges', 'Preparing land for lawn or landscaping'],
    phc: ['Thinning canopies, early leaf drop, or discolored leaves', 'Signs of insects or disease, such as emerald ash borer', 'Stress from drought, construction, or soil compaction', 'Valuable trees you want to protect for the long term'],
  };
  const PRICE = ['The size and condition of the tree', 'How close it is to the house, wires, or other structures', 'Access for equipment (front yard, backyard, gates, slopes)', 'Whether you want stump grinding and full cleanup or haul-away', 'How many trees are done in one visit'];

  /* ================= Tasks ================= */
  const TASKS = {
    title: {
      label: 'Page title',
      schema: META_SCHEMA,
      template(ctx) {
        const p = ctx.page, s = ctx.service || (p && p.service && MT.seo.service(p.service)), t = ctx.town || (p && p.town && MT.seo.town(p.town));
        let opts;
        if (t) opts = ['Tree Service in ' + t.name + ', IL', 'Tree Removal ' + t.name + ' IL', t.name + ' Tree Service'];
        else if (s) opts = [titleCase(s.name) + ' in ' + region(), titleCase(s.name) + ', ' + region().replace(',', ''), titleCase(s.name)];
        else if (p && p.type === 'home') opts = ['Tree Service in ' + region(), 'Tree Removal & Trimming, ' + region().replace(',', ''), 'Tree Service ' + region().replace(',', '')];
        else opts = [p ? p.titleCore || 'Page' : 'Page'];
        const value = fitTitle(opts);
        return { value, alternatives: opts.filter((o) => o !== value && o.length <= budget()) };
      },
      prompt(ctx) {
        const p = ctx.page;
        return 'Write an SEO title for this page. Keep it under ' + budget() + ' characters, because Squarespace adds "' + (S().titleSuffix || '').trim() + '" after it. Lead with the service and place people search for. Give 3 alternatives.\n\n' +
          'PAGE: ' + p.path + ' (type: ' + p.type + ')\nCurrent title: ' + (p.title || '(none)') + '\nMain heading: ' + (p.h1[0] || '(none)') + '\nPage text excerpt: ' + clip(p.text, 1200) +
          (ctx.queries ? '\nSearches that already show this page: ' + ctx.queries.join('; ') : '') + '\n\nFACTS\n' + facts();
      },
    },
    description: {
      label: 'Page description',
      schema: META_SCHEMA,
      template(ctx) {
        const f = S().facts, p = ctx.page, s = ctx.service || (p && p.service && MT.seo.service(p.service)), t = ctx.town || (p && p.town && MT.seo.town(p.town));
        const who = f.isa ? 'ISA Certified Arborists' : 'Local tree experts';
        const place = t ? t.name + ', IL' : listTowns(topTowns(), 3) + ' & ' + region();
        const what = s ? s.name.toLowerCase() : 'tree removal, trimming, stump grinding & storm cleanup';
        const opts = [
          who + ' for ' + what + ' in ' + place + '. Call ' + f.phone + ' for a free estimate.',
          who + ' for ' + what + ' in ' + (t ? t.name + ', IL' : region()) + '. Call ' + f.phone + ' for a free estimate.',
          titleCase(what) + ' in ' + (t ? t.name : region()) + '. Free estimates: ' + f.phone + '.',
        ];
        const value = opts.find((o) => o.length <= 158) || clip(opts[opts.length - 1], 158);
        return { value, alternatives: opts.filter((o) => o !== value && o.length <= 158) };
      },
      prompt(ctx) {
        const p = ctx.page;
        return 'Write an SEO meta description for this page: 140 to 158 characters, naming the service and area and ending with a call to action. Give 3 alternatives.\n\n' +
          'PAGE: ' + p.path + ' (type: ' + p.type + ')\nTitle: ' + p.title + '\nCurrent description: ' + (p.description || '(none)') + '\nPage text excerpt: ' + clip(p.text, 1200) + '\n\nFACTS\n' + facts();
      },
    },
    h1: {
      label: 'Main heading',
      schema: META_SCHEMA,
      template(ctx) {
        const p = ctx.page, s = ctx.service || (p && p.service && MT.seo.service(p.service)), t = ctx.town || (p && p.town && MT.seo.town(p.town));
        const value = t ? 'Tree Service in ' + t.name + ', IL' : s ? titleCase(s.name) + ' in ' + region() : 'Tree Service & Tree Removal in ' + region();
        return { value, alternatives: [t ? 'Trusted Tree Care in ' + t.name : 'The Heavyweights in Tree Care, Serving ' + region()] };
      },
      prompt(ctx) {
        const p = ctx.page;
        return 'Write the main heading (H1) for this page: under 70 characters, naming the service and area in natural language. Give 3 alternatives.\n\nPAGE: ' + p.path + ' (type: ' + p.type + ')\nCurrent heading: ' + (p.h1[0] || '(none)') + '\nPage text excerpt: ' + clip(p.text, 1000) + '\n\nFACTS\n' + facts();
      },
    },
    redirect: {
      label: 'Cleaner page address',
      template(ctx) {
        const pth = ctx.page.path;
        let to = pth.replace(/(-\d+)+$/, '').replace(/-content$/, '').replace(/-copy$/, '');
        if (/^\/services?$/.test(to)) to = '/tree-services';
        if (to === pth || to === '/' || !to) to = '/' + slugify(ctx.page.titleCore || 'page');
        return { value: S().site.replace(/\/+$/, '') + to, alternatives: [] };
      },
    },
    servicePage: {
      label: 'Service page draft',
      schema: PAGE_SCHEMA,
      template(ctx) {
        const s = ctx.service, f = S().facts, name = titleCase(s.name), towns = topTowns();
        const others = S().services.filter((x) => x.id !== s.id).slice(0, 4);
        return {
          seoTitle: fitTitle([name + ' in ' + region(), name]),
          seoDescription: TASKS.description.template({ service: s }).value,
          slug: s.slug || slugify(s.name),
          h1: name + ' in ' + region(),
          sections: [
            { heading: '', text: f.business + ' provides ' + s.name.toLowerCase() + ' for homeowners and businesses across ' + region() + ', including ' + listTowns(towns, 7) + '. ' + (f.isa ? 'Our ISA Certified Arborists plan every job for safety first. ' : '') + '[ADD: one or two sentences on what makes your ' + s.name.toLowerCase() + ' different, such as equipment, crane access, or how you leave the yard.]' },
            { heading: 'When to call for ' + s.name.toLowerCase(), text: (SIGNS[s.id] || []).map((x) => '• ' + x).join('\n') + '\n[ADD: a real example from a recent job, with a photo.]' },
            { heading: 'How the job works', text: '1. Free estimate: [ADD: how estimates work and how fast you usually visit].\n2. The work: [ADD: your crew, equipment, and safety steps].\n3. Cleanup: [ADD: what you haul away and how you leave the property].' },
            { heading: 'Safety and insurance', text: (f.insured ? f.insured + '. ' : '[ADD: your insurance coverage, and that you can send a certificate on request.] ') + (f.isa ? 'Work is planned by an ISA Certified Arborist.' : '') },
            { heading: 'What affects the price', text: PRICE.map((x) => '• ' + x).join('\n') + '\nEvery estimate is free. Call ' + f.phone + ' or request one online.' },
            { heading: 'Areas we serve', text: 'We provide ' + s.name.toLowerCase() + ' in ' + listTowns(S().towns, S().towns.length) + ', and nearby communities.' },
            { heading: 'Related services', text: others.map((x) => '• ' + titleCase(x.name) + ' (link to /' + (x.slug || slugify(x.name)) + ')').join('\n') },
          ],
          faqs: [
            { question: 'How much does ' + s.name.toLowerCase() + ' cost?', answer: 'It depends on the factors above. [ADD: a typical range only if you are comfortable sharing one.] Estimates are free.' },
            { question: 'Do I need a permit?', answer: '[ADD: what you tell customers about village permits and parkway trees, and whether you handle permits.]' },
            { question: 'Are you insured?', answer: f.insured ? f.insured + '.' : '[ADD: your insurance details.]' },
          ],
          photoIdeas: ['Before and after of a ' + s.name.toLowerCase() + ' job in one of your top towns', 'Your crew and equipment on site', 'The finished, cleaned-up yard'],
        };
      },
      prompt(ctx) {
        const s = ctx.service;
        return 'Draft a complete service page for "' + s.name + '". About 800 to 1,100 words across 5 to 7 sections, plus 3 to 5 FAQs and photo ideas. ' +
          'Include a short "Areas we serve" section and links (as plain text like "link to /tree-removal") to related service pages and the contact page. The slug should be short, lowercase, and hyphenated.' +
          (ctx.queries && ctx.queries.length ? '\nSearches people already use to find this service: ' + ctx.queries.join('; ') : '') +
          (ctx.existing ? '\nCurrent page text to improve on (keep any true facts): ' + clip(ctx.existing, 2500) : '') +
          '\n\nFACTS\n' + facts(['Other service pages: ' + S().services.filter((x) => x.id !== s.id).map((x) => '/' + x.slug).join(', '), 'Contact page: /contact']);
      },
      maxTokens: 8000,
    },
    locationPage: {
      label: 'Town page draft',
      schema: PAGE_SCHEMA,
      template(ctx) {
        const t = ctx.town, pr = ctx.proof, f = S().facts;
        const real = pr && !pr.demo && pr.jobs > 0;
        return {
          seoTitle: fitTitle(['Tree Service in ' + t.name + ', IL', t.name + ' Tree Service']),
          seoDescription: TASKS.description.template({ town: t }).value,
          slug: 'tree-service-' + slugify(t.name) + '-il',
          h1: 'Tree Service in ' + t.name + ', IL',
          sections: [
            { heading: '', text: f.business + ' helps ' + t.name + ' homeowners with tree removal, trimming, stump grinding, and storm cleanup. ' + (real ? 'We\'ve completed ' + pr.jobs + ' ' + (pr.jobs === 1 ? 'job' : 'jobs') + ' in ' + t.name + ' so far. ' : '') + '[ADD: something specific to ' + t.name + ', such as common trees, neighborhoods you work in, or village rules you help with.]' },
            { heading: 'Recent work in ' + t.name, text: (real && pr.serviceList.length ? pr.serviceList.map((x) => '• ' + x).join('\n') + '\n' : '') + '[ADD: 2 or 3 short job stories with before and after photos from ' + t.name + '. Leave out customer names and house numbers.]' },
            { heading: 'Tree services in ' + t.name, text: S().services.map((x) => '• ' + titleCase(x.name) + ' (link to /' + x.slug + ')').join('\n') },
            { heading: 'Why ' + t.name + ' neighbors call us', text: (f.isa ? '• ISA Certified Arborist on staff\n' : '') + '• Free estimates\n[ADD: reviews from ' + t.name + ' customers, quoted with permission.]' },
          ],
          faqs: [
            { question: 'Do I need a permit to remove a tree in ' + t.name + '?', answer: '[ADD: what you know about ' + t.name + '\'s rules, or say you\'ll check for the customer.]' },
            { question: 'How soon can you come out?', answer: '[ADD: your usual scheduling for ' + t.name + '.]' },
          ],
          photoIdeas: ['A finished job in ' + t.name + ' (no house numbers visible)', 'Crew working with equipment in ' + t.name],
        };
      },
      prompt(ctx) {
        const t = ctx.town, pr = ctx.proof;
        return 'Draft a town page for tree service in ' + t.name + ', IL. 600 to 900 words. It must be useful on its own and specific to ' + t.name + ': build it around the real local work listed below. ' +
          'Do not repeat generic service-page text; link to service pages instead (as plain text like "link to /tree-removal"). Use [ADD: …] for local details you are not given.\n\n' +
          'LOCAL PROOF FROM THE CRM\nCompleted jobs in ' + t.name + ': ' + pr.jobs + '\nJob photos available: ' + pr.photos + '\nRecent job titles: ' + (pr.serviceList.join('; ') || 'none') +
          (ctx.queries && ctx.queries.length ? '\nSearches mentioning ' + t.name + ' that show the site: ' + ctx.queries.join('; ') : '') +
          '\n\nFACTS\n' + facts(['Service pages: ' + S().services.map((x) => '/' + x.slug).join(', ')]);
      },
      maxTokens: 8000,
    },
    schema: {
      label: 'Business details markup',
      template() {
        const f = S().facts;
        const json = {
          '@context': 'https://schema.org',
          '@type': 'HomeAndConstructionBusiness',
          name: f.business,
          url: S().site,
          telephone: f.phone,
          email: f.email,
          description: 'Tree removal, trimming, stump grinding, crane work, land clearing, and plant health care in ' + region() + '.',
          areaServed: S().towns.map((t) => ({ '@type': 'City', name: t.name + ', ' + t.state })),
          knowsAbout: S().services.map((s) => s.name),
          hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Tree services', itemListElement: S().services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name } })) },
        };
        return { value: '<script type="application/ld+json">\n' + JSON.stringify(json, null, 2) + '\n</script>', businessInfo: [['Business name', f.business], ['Contact phone number', f.phone], ['Contact email', f.email], ['Location / service area', region() + ' (' + listTowns(topTowns(), 7) + ')']] };
      },
    },
    auditSummary: {
      label: 'Audit summary',
      schema: SUMMARY_SCHEMA,
      template(ctx) {
        const a = ctx.analysis;
        const top = a.groups.filter((g) => g.items.some((i) => i.state === 'open')).slice(0, 5);
        return {
          summary: a.pages.length + ' pages checked. ' + a.counts.high + ' high, ' + a.counts.medium + ' medium, and ' + a.counts.low + ' low priority issues are open.',
          nextSteps: top.map((g) => MT.seoAudit.RULES[g.rule].title + ' (' + g.items.filter((i) => i.state === 'open').length + ')'),
        };
      },
      prompt(ctx) {
        const a = ctx.analysis;
        const groups = a.groups.slice(0, 15).map((g) => MT.seoAudit.RULES[g.rule].title + ' [' + g.sev + ']: ' + g.items.length + ' (' + g.items.slice(0, 3).map((i) => MT.seo.path(i.url) || 'site').join(', ') + ')').join('\n');
        return 'Summarize this website audit for the business owner in 3 or 4 plain sentences, then list the 5 most valuable next steps in order. Favor changes that win more local tree service customers.\n\nISSUES\n' + groups +
          (a.search ? '\n\nSEARCH (28 days): ' + a.search.clicks + ' clicks, ' + a.search.impressions + ' impressions, average position ' + (a.search.position || 0).toFixed(1) : '') + '\n\nFACTS\n' + facts();
      },
    },
  };

  /* ================= Runner ================= */
  const ai = {
    TASKS,
    /** True when the connector reports an AI key in its Script properties. */
    available() { const st = MT.seo.state.settings.connector.status; return !!(st && st.ai && st.ai.configured && MT.seo.conn.ready()); },
    async run(id, ctx, opts) {
      opts = opts || {};
      const task = TASKS[id];
      if (opts.ai !== false && task.prompt && ai.available()) {
        try {
          const r = await MT.seo.conn.post('ai', { prompt: task.prompt(ctx), system: system(), schema: task.schema, maxTokens: task.maxTokens || 3000 });
          const parsed = JSON.parse(r.text);
          logAI(id, r, true);
          return Object.assign(parsed, { source: 'ai', model: r.model });
        } catch (e) {
          logAI(id, null, false, e.message);
          if (opts.strict) throw e;
          if (!opts.quiet) ui.toast('The AI draft failed, so a template was used instead. ' + e.message, 'err');
        }
      }
      return Object.assign(task.template(ctx), { source: 'template' });
    },
    /** Plain text of a page draft, ready to copy into the website editor. */
    pageText(d) {
      const lines = ['SEO title: ' + d.seoTitle, 'SEO description: ' + d.seoDescription, 'URL slug: /' + String(d.slug || '').replace(/^\/+/, ''), '', 'H1: ' + d.h1, ''];
      (d.sections || []).forEach((s) => { if (s.heading) lines.push('H2: ' + s.heading); lines.push(s.text, ''); });
      if ((d.faqs || []).length) { lines.push('H2: Frequently asked questions'); d.faqs.forEach((q) => lines.push('Q: ' + q.question, 'A: ' + q.answer, '')); }
      if ((d.photoIdeas || []).length) lines.push('Photo ideas: ' + d.photoIdeas.join('; '));
      return lines.join('\n').trim();
    },
    /** Automation hook, run after each new weekly audit. "draft" mode prepares a few drafts; it never publishes. */
    async autopilot() {
      const st = MT.seo.state, mode = st.settings.automation.mode;
      if (mode !== 'draft') return 0;
      const a = MT.seo.analysis();
      const max = Math.max(0, u.num(st.settings.automation.maxDrafts) || 2);
      let made = 0;
      for (const g of a.groups) {
        const rule = MT.seoAudit.RULES[g.rule];
        if (!rule.suggest || !['title', 'description', 'h1'].includes(rule.suggest) || g.sev === 'low') continue;
        for (const issue of g.items) {
          if (made >= max) break;
          if (issue.state !== 'open') continue;
          const page = a.pages.find((p) => p.url === issue.url);
          if (!page || st.changes.some((c) => c.url === page.url && c.kind === rule.suggest && ['draft', 'approved', 'published'].includes(c.status))) continue;
          const res = await ai.run(rule.suggest, { page }, { quiet: true });
          if (ai.toChange(rule.suggest, res, { page, reason: rule.title + ' (found by the weekly audit)' })) made++;
        }
      }
      if (made) { MT.seo.log('auto', 'Autopilot prepared ' + made + ' draft' + (made === 1 ? '' : 's') + ' for your approval'); MT.seo.save(); }
      return made;
    },
    /** Turns a task result into a draft on the Approvals tab. */
    toChange(kind, res, ctx) {
      const page = ctx.page;
      const before = page ? (kind === 'title' ? page.titleCore || page.title : kind === 'description' ? page.description : kind === 'h1' ? page.h1[0] || '' : '') : '';
      const labels = { title: 'New title', description: 'New description', h1: 'New main heading', redirect: 'Cleaner address' };
      if (labels[kind]) {
        return MT.seo.changes.create({ kind, url: page.url, before, after: res.value, alternatives: res.alternatives || [], label: labels[kind] + ' for ' + page.path, reason: ctx.reason || '', source: res.source, model: res.model || '' });
      }
      if (kind === 'page') {
        return MT.seo.changes.create({ kind: 'page', url: S().site.replace(/\/+$/, '') + '/' + String(res.slug).replace(/^\/+/, ''), before: '', after: res.slug, draft: res, body: ai.pageText(res), label: ctx.label, reason: ctx.reason || '', source: res.source, model: res.model || '', location: !!ctx.town, town: ctx.town ? ctx.town.name : '' });
      }
      if (kind === 'schema') {
        const core = S().plan !== 'basic';
        return MT.seo.changes.create({ kind: 'schema', url: S().site.replace(/\/+$/, '') + '/', before: '', after: res.value, businessInfo: res.businessInfo, needs: core ? 'core' : 'basic', label: core ? 'Add business details markup' : 'Fill in Squarespace Business information', reason: ctx.reason || '', source: res.source });
      }
      return null;
    },
  };
  function logAI(task, r, ok, err) {
    const st = MT.seo.state;
    st.aiLog.unshift({ at: new Date().toISOString(), task, ok, model: r ? r.model : '', input: r && r.usage ? r.usage.input_tokens : 0, output: r && r.usage ? r.usage.output_tokens : 0, error: err || '' });
    if (st.aiLog.length > 100) st.aiLog.length = 100;
  }

  MT.seoAI = ai;
})();
