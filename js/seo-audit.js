/* Mammoth CRM — SEO audit engine. Turns the connector's raw results into issues, keyword positions,
   and opportunities ranked by business value. All rules live here (not in the Apps Script), so they
   improve with a normal app update and the connector never needs to be pasted again. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;

  const SETTINGS_SEO = 'In Squarespace: <b>Pages</b> → hover the page → gear icon (<b>Page settings</b>) → <b>SEO</b> tab.';
  const URL_MAP = '<b>Settings → Developer tools → URL mappings</b> (older menus: Settings → Advanced → URL mappings)';
  /* Each rule: severity, category, what it means, and how to fix it on Squarespace. needs: 'core' = Core plan or higher. */
  const RULES = {
    'http-error': { sev: 'high', cat: 'Technical', title: 'Page returns an error', why: 'Visitors and Google get an error page instead of your content.', fix: ['If the page moved, add a 301 redirect in ' + URL_MAP + '.', 'If it was deleted on purpose, remove links to it.'] },
    'broken-link': { sev: 'high', cat: 'Links', title: 'Links to a missing page', why: 'Broken links waste visitors and tell Google the site is poorly maintained.', fix: ['Open each listed page, find the link, and point it at a working page.', 'Or add a 301 redirect for the missing address in ' + URL_MAP + '.'] },
    'redirect-link': { sev: 'low', cat: 'Links', title: 'Links go through a redirect', why: 'Each redirect adds a delay and dilutes the link a little.', fix: ['Update the link to point straight at the final address.'] },
    noindex: { sev: 'high', cat: 'Indexing', title: 'Page is hidden from Google', why: 'A "noindex" tag tells Google not to show this page at all.', fix: [SETTINGS_SEO, 'Turn off <b>Hide page from search results</b> if this page should be found.'] },
    'not-indexed': { sev: 'high', cat: 'Indexing', title: 'Google has not indexed this page', why: 'Pages that aren\'t indexed can\'t rank for anything.', fix: ['Make sure the page has unique, useful text (300+ words for service pages) and is linked from your menu or another page.', 'In Google Search Console, paste the address into the top search bar and select <b>Request indexing</b>.'] },
    'canonical-mismatch': { sev: 'medium', cat: 'Indexing', title: 'Google picked a different main version', why: 'Google decided another address is the "real" version of this page, usually because the content is duplicated.', fix: ['Make the page\'s content unique, or redirect it to the version Google chose.'] },
    'title-missing': { sev: 'high', cat: 'Titles & descriptions', title: 'Missing page title', why: 'The title is the blue headline in Google results and one of the strongest ranking signals.', fix: [SETTINGS_SEO, 'Fill in <b>SEO title</b>.'], suggest: 'title' },
    'title-long': { sev: 'medium', cat: 'Titles & descriptions', title: 'Title is too long (Google cuts it off)', why: 'Google shows about 60 characters. The end of longer titles is hidden.', fix: [SETTINGS_SEO, 'Shorten <b>SEO title</b> to the service and town first.'], suggest: 'title' },
    'title-short': { sev: 'low', cat: 'Titles & descriptions', title: 'Title is very short', why: 'Short titles waste room you could use for the service and town.', fix: [SETTINGS_SEO, 'Expand <b>SEO title</b>, for example "Tree Removal in Libertyville, IL".'], suggest: 'title' },
    'title-dup': { sev: 'medium', cat: 'Titles & descriptions', title: 'Same title as another page', why: 'Google can\'t tell which page to show when titles match.', fix: [SETTINGS_SEO, 'Give each page its own <b>SEO title</b>.'], suggest: 'title' },
    'title-keyword': { sev: 'medium', cat: 'Titles & descriptions', title: 'Title doesn\'t say what you do', why: 'People search for "tree removal" or "tree service". The title should say it.', fix: [SETTINGS_SEO, 'Put the service in the <b>SEO title</b>, for example "Tree Service in Lake County, IL".'], suggest: 'title' },
    'desc-missing': { sev: 'medium', cat: 'Titles & descriptions', title: 'Missing description', why: 'Without one, Google picks random text from the page for the snippet under your title.', fix: [SETTINGS_SEO, 'Fill in <b>SEO description</b> (about 150 characters with the service, towns, and a call to action).'], suggest: 'description' },
    'desc-long': { sev: 'low', cat: 'Titles & descriptions', title: 'Description is too long', why: 'Google shows about 155 characters.', fix: [SETTINGS_SEO, 'Shorten <b>SEO description</b>.'], suggest: 'description' },
    'desc-short': { sev: 'low', cat: 'Titles & descriptions', title: 'Description is very short', why: 'A fuller description earns more clicks.', fix: [SETTINGS_SEO, 'Expand <b>SEO description</b> to about 150 characters.'], suggest: 'description' },
    'desc-dup': { sev: 'medium', cat: 'Titles & descriptions', title: 'Same description as another page', why: 'Duplicate descriptions make pages look interchangeable to Google.', fix: [SETTINGS_SEO, 'Write a unique <b>SEO description</b> for each page.'], suggest: 'description' },
    'h1-missing': { sev: 'high', cat: 'Headings', title: 'No main heading (H1)', why: 'The H1 tells Google and visitors what the page is about.', fix: ['Edit the page, click the top heading, and set its style to <b>Heading 1</b>.'], suggest: 'h1' },
    'h1-multiple': { sev: 'medium', cat: 'Headings', title: 'More than one main heading (H1)', why: 'One H1 per page keeps the topic clear.', fix: ['Edit the page and change the extra Heading 1 text blocks to <b>Heading 2</b>.'] },
    'h1-generic': { sev: 'medium', cat: 'Headings', title: 'Main heading doesn\'t name the service', why: 'A heading like "The Mammoth Difference" doesn\'t tell Google you\'re a tree service.', fix: ['Edit the page and change the Heading 1 to name the service and area, for example "Tree Removal & Tree Service in Lake County, IL".'], suggest: 'h1' },
    'heading-skip': { sev: 'low', cat: 'Headings', title: 'Headings skip a level', why: 'Going from Heading 2 straight to Heading 4 makes the outline harder to follow.', fix: ['Use Heading 2 for sections and Heading 3 inside them.'] },
    thin: { sev: 'medium', cat: 'Content', title: 'Thin content', why: 'Service and town pages with little text rarely rank. Aim for 600 to 1,200 useful words.', fix: ['Add sections on how you do the work, safety and insurance, what affects price, the towns you serve, photos of real jobs, and FAQs.'] },
    'duplicate-content': { sev: 'medium', cat: 'Content', title: 'Nearly the same text as another page', why: 'Pages with copied text compete with each other, and Google may ignore one of them.', fix: ['Rewrite one page so it covers its own topic, or combine them and redirect the old address.'] },
    'img-alt': { sev: 'low', cat: 'Content', title: 'Images without useful alt text', why: 'Alt text helps image search and accessibility. File names like IMG_1234.jpg don\'t count.', fix: ['Edit the page, click each image → pencil → <b>Alt text</b>, and describe the job ("Crane removing a dead ash in Gurnee").'] },
    'few-links': { sev: 'low', cat: 'Links', title: 'Few links from the page text', why: 'Links inside your text help Google understand which pages matter and help visitors find services.', fix: ['Link related services and your contact page from the page text.'] },
    orphan: { sev: 'medium', cat: 'Links', title: 'No other page links here', why: 'Google finds and values pages through links. A page nothing links to is hard to rank.', fix: ['Link to it from your menu, Services page, or a related page.'] },
    'slug-default': { sev: 'medium', cat: 'Technical', title: 'Address looks like a default Squarespace slug', why: 'Addresses like /faq-1-1 or /services-content look unfinished and waste a ranking signal.', fix: ['Page settings → General → change the <b>URL slug</b> (for example /faq or /tree-services).', 'Then add a 301 from the old address in ' + URL_MAP + '.'], suggest: 'redirect' },
    slow: { sev: 'low', cat: 'Technical', title: 'Page is heavy or slow', why: 'Slow pages lose visitors on phones, and speed is a ranking factor.', fix: ['Remove unused sections, video backgrounds, and very large images. Squarespace resizes images, but fewer images help most.'] },
    'nap-phone': { sev: 'medium', cat: 'Local', title: 'Phone number doesn\'t match your business phone', why: 'Google cross-checks your name, address, and phone across the web. Mismatches weaken local rankings.', fix: ['Use the same phone number everywhere on the site, in Business information, and in your Google Business Profile.'] },
    'local-signals': { sev: 'medium', cat: 'Local', title: 'Home page doesn\'t name the towns you serve', why: 'Naming your service area in the text helps you show up for "tree service + town" searches.', fix: ['Add a short "Areas we serve" section listing your top towns, and mention Lake County, IL in the opening text.'] },
    'towns-missing': { sev: 'low', cat: 'Local', title: 'Top towns never mentioned on the site', why: 'If a town isn\'t mentioned anywhere, you\'re unlikely to rank for it.', fix: ['Add an "Areas we serve" list to the home page or footer, and mention towns naturally where you\'ve done work.'] },
    'no-business-schema': { sev: 'high', cat: 'Local', title: 'No business details markup', why: 'Structured data tells Google your business type, phone, and service area. It supports map and rich results.', fix: ['Basic plan: fill in <b>Settings → Business information</b>. Squarespace adds its own markup from it.', 'Core plan or higher: you can also paste full TreeService markup (generated on the Opportunities tab) into code injection.'], suggest: 'schema' },
    'sitemap-missing': { sev: 'high', cat: 'Technical', title: 'Sitemap not found', why: 'The sitemap lists every page for Google. Squarespace creates it automatically at /sitemap.xml.', fix: ['Check that the site is published (not in trial or private mode).'] },
    'og-image': { sev: 'low', cat: 'Content', title: 'No social sharing image', why: 'Links shared on Facebook or texts show a blank preview.', fix: [SETTINGS_SEO.replace('SEO</b> tab', 'Social image</b> tab'), 'Upload a good job photo.'] },
  };
  const SEV_ORDER = { high: 0, medium: 1, low: 2 };

  /* ---------- text helpers ---------- */
  const lower = (s) => String(s || '').toLowerCase();
  const path = (url) => String(url || '').replace(/^https?:\/\/[^/]+/i, '') || '/';
  const words = (s) => lower(s).replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
  function hasPhrase(text, phrase) {
    const t = ' ' + lower(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
    return t.includes(' ' + lower(phrase).replace(/[^a-z0-9]+/g, ' ').trim());
  }
  /** Finds the town named in text. Longer names win, so "North Barrington" is not read as "Barrington". */
  function townIn(text, towns) {
    let t = ' ' + lower(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const sorted = towns.slice().sort((a, b) => b.name.length - a.name.length);
    for (const town of sorted) {
      const n = ' ' + lower(town.name) + ' ';
      if (t.includes(n)) return town;
      const compact = ' ' + lower(town.name).replace(/\s+/g, '') + ' '; // "deerpark"
      if (compact !== n && t.includes(compact)) return town;
    }
    return null;
  }
  function townsIn(text, towns) {
    let t = ' ' + lower(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const found = [];
    towns.slice().sort((a, b) => b.name.length - a.name.length).forEach((town) => {
      const n = ' ' + lower(town.name) + ' ';
      if (t.includes(n)) { found.push(town); t = t.split(n).join(' '); }
    });
    return found;
  }
  function serviceIn(text, services) {
    for (const s of services) if (s.terms.some((term) => hasPhrase(text, term))) return s;
    return null;
  }
  const TREE_WORDS = /\b(trees?|stumps?|arborists?|prun\w*|trim\w*|limbs?|branch\w*|brush|land clearing|lot clearing|cranes?|oaks?|maples?|ash trees?|ash borer|evergreens?|pines?|hedges?|storm\w*|forestry)\b/i;
  function shingles(text) {
    const w = words(text), set = new Set();
    for (let i = 0; i + 5 <= w.length; i++) set.add(w.slice(i, i + 5).join(' '));
    return set;
  }
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    const [s, l] = a.size < b.size ? [a, b] : [b, a];
    s.forEach((x) => { if (l.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
  }

  /* ---------- click-through by position (typical organic curve) ---------- */
  const CTR = [0, 0.28, 0.16, 0.11, 0.08, 0.06, 0.045, 0.035, 0.03, 0.025, 0.02];
  function ctrAt(pos) {
    if (!pos) return 0;
    if (pos <= 1) return CTR[1];
    if (pos <= 10) { const lo = Math.floor(pos), f = pos - lo; return CTR[lo] + (CTR[Math.min(10, lo + 1)] - CTR[lo]) * f; }
    return pos <= 20 ? 0.01 : 0.003;
  }
  function targetPos(pos) { return pos > 20 ? 10 : pos > 10 ? 5 : pos > 3 ? 3 : Math.max(1, Math.floor(pos) - 1 || 1); }

  function pageType(p, st) {
    const pth = lower(path(p.url));
    if (pth === '/') return 'home';
    if (/^\/(cart|shop|store|checkout|privacy|terms|thank|search|account|policies|legal|404)/.test(pth)) return 'utility';
    if (/^\/(blog|news|articles?|journal)(\/|$)/.test(pth)) return pth.split('/').length > 2 ? 'blog' : 'utility';
    if (/contact|estimate|quote/.test(pth)) return 'contact';
    const t = pth.replace(/[-/]/g, ' ') + ' ' + (p.title || '').replace(/[—|].*$/, '') + ' ' + (p.h1 || []).join(' ');
    if (townIn(t, st.settings.towns)) return 'location';
    if (serviceIn(t, st.settings.services) || /servic/.test(pth)) return 'service';
    if (/about|faq|team|review|gallery|work|project/.test(pth)) return 'info';
    return 'other';
  }

  /* ---------- business model: what a click is worth ---------- */
  function business(st, crm) {
    const m = st.settings.model;
    let avgJob = u.num(m.avgJob), closeRate = u.num(m.closeRate) / 100, avgSrc = 'your setting', closeSrc = 'your setting';
    if (crm && crm.deals) {
      const wr = MT.calc.winRate(crm, 365);
      if (!avgJob) {
        const won = crm.deals.filter((d) => d.stage === 'won' && u.num(d.value) > 0);
        avgJob = wr.avg || (won.length ? u.sum(won, (d) => d.value) / won.length : 0);
        avgSrc = crm.demo ? 'sample data in the CRM' : 'your won jobs';
      }
      if (!closeRate && wr.closed >= 3) { closeRate = wr.rate; closeSrc = crm.demo ? 'sample data in the CRM' : 'your last 12 months'; }
    }
    if (!avgJob) { avgJob = 1500; avgSrc = 'an assumption until you have won jobs'; }
    if (!closeRate) { closeRate = 0.4; closeSrc = 'an assumption until you have closed deals'; }
    const leadRate = (u.num(m.leadRate) || 3) / 100;
    return { avgJob, closeRate, leadRate, avgSrc, closeSrc, perClick: leadRate * closeRate * avgJob };
  }

  /* ================= Main analysis ================= */
  function analyze(st, data, crm) {
    const S = st.settings;
    const crawl = data.crawl || null;
    const biz = business(st, crm);
    const out = { hasCrawl: !!crawl, crawlAt: crawl ? crawl.at : '', biz, pages: [], issues: [], counts: { high: 0, medium: 0, low: 0 }, score: null, site: {}, search: null, analytics: null, index: null };
    const add = (rule, url, detail, extra) => {
      const r = RULES[rule];
      const key = rule + '|' + (url || 'site');
      const stt = st.issueState[key];
      let state = stt ? stt.status : 'open';
      // "Marked fixed" reopens if an audit run after that still finds the problem.
      if (state === 'fixed' && crawl && crawl.at > stt.at) state = 'open';
      out.issues.push(Object.assign({ key, rule, sev: r.sev, cat: r.cat, url: url || '', detail: detail || '', state }, extra || {}));
    };

    /* ----- crawl rules ----- */
    if (crawl) {
      const all = crawl.pages || [];
      const byUrl = {};
      all.forEach((p) => { byUrl[p.url] = p; });
      const html = all.filter((p) => p.status === 200 && p.title !== undefined);
      const indexable = html.filter((p) => !/noindex/i.test((p.robots || '') + ' ' + (p.xRobots || '')));
      const inlinks = {}, ctxIn = {};
      html.forEach((p) => {
        (p.links || []).forEach((l) => { if (l.url !== p.url) (inlinks[l.url] = inlinks[l.url] || []).push(p.url); });
        (p.contextual || []).forEach(([to]) => { (ctxIn[to] = ctxIn[to] || []).push(p.url); });
      });
      const sitemapSet = new Set((crawl.sitemap && crawl.sitemap.urls) || []);
      const phoneDigits = String(S.facts.phone || '').replace(/\D/g, '').slice(-10);
      const titleCount = {}, descCount = {};
      indexable.forEach((p) => {
        if (p.title) titleCount[lower(p.title)] = (titleCount[lower(p.title)] || 0) + 1;
        if (p.description) descCount[lower(p.description)] = (descCount[lower(p.description)] || 0) + 1;
      });

      out.site = {
        platform: all.some((p) => /squarespace/i.test(p.generator || '')) ? 'Squarespace' : 'Unknown',
        sitemap: crawl.sitemap ? crawl.sitemap.status : 0,
        sitemapCount: sitemapSet.size,
        robots: crawl.robots ? crawl.robots.status : 0,
        schema: Array.from(new Set([].concat.apply([], html.map((p) => p.schema || [])))),
        business: [].concat.apply([], html.map((p) => p.business || [])),
        truncated: !!crawl.truncated,
        seconds: crawl.seconds,
      };

      all.forEach((p) => {
        if (p.status >= 400 || p.status === 0) {
          add('http-error', p.url, 'Status ' + p.status + (inlinks[p.url] ? ', linked from ' + inlinks[p.url].length + ' page(s)' : ''));
          if (inlinks[p.url]) add('broken-link', p.url, 'Linked from: ' + inlinks[p.url].slice(0, 5).map(path).join(', '), { from: inlinks[p.url] });
        } else if (p.status >= 300 && p.status < 400 && inlinks[p.url]) {
          add('redirect-link', p.url, 'Redirects to ' + path(p.redirect) + '. Linked from: ' + inlinks[p.url].slice(0, 5).map(path).join(', '), { from: inlinks[p.url] });
        }
      });

      const shingleMap = {};
      html.forEach((p) => {
        const type = pageType(p, st);
        const issuesBefore = out.issues.length;
        const robotsTxt = (p.robots || '') + ' ' + (p.xRobots || '');
        const isUtility = type === 'utility';
        const isMoney = type === 'home' || type === 'service' || type === 'location';
        const titleCore = (p.title || '').replace(/\s+[—|–-]\s+[^—|–-]+$/, '');
        if (/noindex/i.test(robotsTxt)) { if (!isUtility && (sitemapSet.has(p.url) || inlinks[p.url])) add('noindex', p.url); }
        else {
          if (!p.title) add('title-missing', p.url);
          else {
            if (p.title.length > 60) add('title-long', p.url, p.title.length + ' characters: "' + p.title + '"');
            if (p.title.length < 25) add('title-short', p.url, '"' + p.title + '"');
            if (titleCount[lower(p.title)] > 1) add('title-dup', p.url, '"' + p.title + '"');
            // Check the page's own part: the site name Squarespace appends ("— Mammoth Tree Service") always contains "tree".
            if (isMoney && !TREE_WORDS.test(titleCore)) add('title-keyword', p.url, '"' + p.title + '"');
          }
          if (!isUtility) {
            if (!p.description) add('desc-missing', p.url);
            else {
              if (p.description.length > 160) add('desc-long', p.url, p.description.length + ' characters');
              if (p.description.length < 70) add('desc-short', p.url, '"' + p.description + '"');
              if (descCount[lower(p.description)] > 1) add('desc-dup', p.url);
            }
            if (!(p.h1 || []).length) add('h1-missing', p.url);
            else {
              if (p.h1.length > 1) add('h1-multiple', p.url, p.h1.map((h) => '"' + h + '"').join(', '));
              if (isMoney && !TREE_WORDS.test(p.h1.join(' '))) add('h1-generic', p.url, 'Current: "' + p.h1[0] + '"');
            }
            const hs = p.headings || [];
            for (let i = 1; i < hs.length; i++) if (hs[i][0] - hs[i - 1][0] > 1) { add('heading-skip', p.url, 'H' + hs[i - 1][0] + ' "' + hs[i - 1][1] + '" is followed by H' + hs[i][0] + ' "' + hs[i][1] + '"'); break; }
            const minWords = isMoney ? 300 : type === 'blog' ? 400 : 0;
            if (minWords && p.words < minWords) add('thin', p.url, p.words + ' words of main text (aim for ' + (isMoney ? '600+' : '800+') + ')');
            if ((p.noAlt || 0) + (p.badAlt || 0) > 0) add('img-alt', p.url, (p.noAlt || 0) + ' with no alt text, ' + (p.badAlt || 0) + ' with a file name as alt text, of ' + p.images + ' images');
            if ((type === 'service' || type === 'location') && (p.contextual || []).length < 2) add('few-links', p.url, (p.contextual || []).length + ' link(s) in the page text');
            if (!p.ogImage) add('og-image', p.url);
            if (p.words >= 80) shingleMap[p.url] = shingles(p.text);
          }
          if (p.url !== crawl.site + '/' && path(p.url) !== '/' && !inlinks[p.url] && sitemapSet.has(p.url)) add('orphan', p.url, 'Listed in the sitemap but no crawled page links to it');
          if (/(-\d+){1,}$|-content$|\/new-page|\/page-\d+|-copy$/i.test(path(p.url)) && !isUtility) add('slug-default', p.url, path(p.url));
          if ((p.bytes || 0) > 600000 || (p.ms || 0) > 2500) add('slow', p.url, Math.round((p.bytes || 0) / 1024) + ' KB of HTML' + (p.ms ? ', about ' + (p.ms / 1000).toFixed(1) + ' s to load' : ''));
          if (phoneDigits && (p.phones || []).length && !(p.phones || []).includes(phoneDigits)) add('nap-phone', p.url, 'Found ' + p.phones.map(fmtPhone).join(', ') + ', expected ' + S.facts.phone);
        }
        out.pages.push({
          url: p.url, path: path(p.url), type, title: p.title || '', titleCore, description: p.description || '', h1: p.h1 || [], words: p.words || 0, status: p.status,
          inlinks: (inlinks[p.url] || []).length, contextIn: (ctxIn[p.url] || []).length, contextual: p.contextual || [], links: p.links || [], headings: p.headings || [],
          images: p.images || 0, schema: p.schema || [], text: p.text || '', noindex: /noindex/i.test(robotsTxt), inSitemap: sitemapSet.has(p.url),
          town: type === 'location' ? (townIn(path(p.url).replace(/[-/]/g, ' ') + ' ' + titleCore + ' ' + (p.h1 || []).join(' '), S.towns) || {}).name : '',
          service: (serviceIn(path(p.url).replace(/[-/]/g, ' ') + ' ' + titleCore + ' ' + (p.h1 || []).join(' '), S.services) || {}).id || '',
          issueCount: out.issues.length - issuesBefore,
        });
      });
      // Near-duplicate text between pages
      const urls = Object.keys(shingleMap);
      for (let i = 0; i < urls.length; i++) for (let j = i + 1; j < urls.length; j++) {
        const sim = jaccard(shingleMap[urls[i]], shingleMap[urls[j]]);
        if (sim >= 0.7) add('duplicate-content', urls[j], Math.round(sim * 100) + '% the same as ' + path(urls[i]), { other: urls[i] });
      }
      // Site-level checks
      if (out.site.sitemap !== 200) add('sitemap-missing', '', 'The sitemap returned status ' + out.site.sitemap);
      if (!out.site.business.some((b) => /LocalBusiness|TreeService|HomeAndConstruction|ProfessionalService/i.test(b.type))) add('no-business-schema', '', out.site.schema.length ? 'Found only: ' + out.site.schema.join(', ') : 'No structured data found');
      const home = html.find((p) => path(p.url) === '/');
      if (home && !townIn((home.title || '') + ' ' + (home.h1 || []).join(' ') + ' ' + (home.text || ''), S.towns)) add('local-signals', home.url, /illinois|wisconsin|lake county/i.test(home.text || '') ? 'Only a broad region is mentioned, no towns' : 'No towns or region mentioned');
      const siteText = html.map((p) => p.text || '').join(' ');
      const mentioned = new Set(townsIn(siteText, S.towns).map((t) => t.name));
      const missingTop = S.towns.filter((t) => t.top && !mentioned.has(t.name));
      if (missingTop.length) add('towns-missing', '', missingTop.map((t) => t.name).join(', '));
      out.site.townsMentioned = Array.from(mentioned);

      out.issues.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
      out.issues.forEach((i) => { if (i.state === 'open') out.counts[i.sev]++; });
      out.score = Math.max(0, Math.round(100 - Math.min(100, out.counts.high * 6 + out.counts.medium * 2 + out.counts.low * 0.5)));
    }

    /* ----- Search Console ----- */
    const sc = data.search;
    if (sc && sc.daily) {
      const daily = sc.daily.map((r) => ({ date: r[0][0], clicks: r[1], impressions: r[2], ctr: r[3], position: r[4] })).sort((a, b) => (a.date < b.date ? -1 : 1));
      const last = daily.filter((d) => d.date >= sc.range.start && d.date <= sc.range.end);
      const prev = daily.filter((d) => d.date >= sc.range.prevStart && d.date <= sc.range.prevEnd);
      const tot = (rows) => { const c = u.sum(rows, (r) => r.clicks), i = u.sum(rows, (r) => r.impressions); return { clicks: c, impressions: i, ctr: i ? c / i : 0, position: i ? u.sum(rows, (r) => r.position * r.impressions) / i : null }; };
      const prevPos = {};
      (sc.prevQueries || []).forEach((r) => { prevPos[r[0][0]] = r[4]; });
      const queries = (sc.queries || []).map((r) => {
        const q = r[0][0], town = townIn(q, S.towns), service = serviceIn(q, S.services);
        const brand = /mammoth/i.test(q);
        const relevant = !brand && TREE_WORDS.test(q);
        const pos = r[4], target = targetPos(pos);
        const gain = relevant ? Math.max(0, r[2] * ctrAt(target) - r[1]) : 0;
        return { q, clicks: r[1], impressions: r[2], ctr: r[3], position: pos, prevPosition: prevPos[q] == null ? null : prevPos[q], town: town ? town.name : '', service: service ? service.id : '', brand, relevant, target, gainClicks: gain, value: gain * biz.perClick };
      });
      // Best position per town × service, from the searches that actually showed your site
      const matrix = {};
      queries.forEach((q) => {
        if (!q.relevant) return;
        const row = q.town || (/near me/i.test(q.q) ? 'near me' : '');
        if (!row) return;
        const col = q.service || 'general';
        const k = row + '|' + col;
        if (!matrix[k] || q.position < matrix[k].position) matrix[k] = { position: q.position, impressions: q.impressions, q: q.q };
      });
      const pageRows = (sc.pages || []).map((r) => ({ url: r[0][0], clicks: r[1], impressions: r[2], ctr: r[3], position: r[4] }));
      const queryPages = (sc.queryPages || []).map((r) => ({ q: r[0][0], url: r[0][1], clicks: r[1], impressions: r[2], position: r[4] }));
      // Weekly buckets (Monday start) for the trend chart
      const weeks = [];
      daily.forEach((d) => {
        const dt = u.parseISO(d.date); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
        const wk = u.isoDate(dt);
        let w = weeks[weeks.length - 1];
        if (!w || w.week !== wk) { w = { week: wk, clicks: 0, impressions: 0, days: 0 }; weeks.push(w); }
        w.clicks += d.clicks; w.impressions += d.impressions; w.days++;
      });
      out.search = Object.assign(tot(last), { prev: tot(prev), daily, weeks, queries, matrix, pages: pageRows, queryPages, range: sc.range, at: sc.at, site: sc.site });
    }

    /* ----- Google Analytics ----- */
    const ga = data.analytics;
    if (ga && ga.daily) {
      const toISO = (d) => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
      const rows = ga.daily.map((r) => ({ date: toISO(r[0]), channel: r[1], sessions: r[2], engaged: r[3], keyEvents: r[4] }));
      const end = u.addDays(u.todayISO(), -1), start = u.addDays(end, -27), pEnd = u.addDays(start, -1), pStart = u.addDays(pEnd, -27);
      const sum = (from, to, ch) => {
        const rs = rows.filter((r) => r.date >= from && r.date <= to && (!ch || r.channel === ch));
        return { sessions: u.sum(rs, (r) => r.sessions), keyEvents: u.sum(rs, (r) => r.keyEvents), engaged: u.sum(rs, (r) => r.engaged) };
      };
      const byChannel = {};
      rows.filter((r) => r.date >= start).forEach((r) => {
        const c = byChannel[r.channel] || (byChannel[r.channel] = { channel: r.channel, sessions: 0, keyEvents: 0 });
        c.sessions += r.sessions; c.keyEvents += r.keyEvents;
      });
      out.analytics = {
        organic: sum(start, end, 'Organic Search'), organicPrev: sum(pStart, pEnd, 'Organic Search'), all: sum(start, end), allPrev: sum(pStart, pEnd),
        byChannel: Object.values(byChannel).sort((a, b) => b.sessions - a.sessions),
        landing: (ga.landing || []).map((r) => ({ page: r[0], sessions: r[1], keyEvents: r[2] })),
        events: (ga.events || []).map((r) => ({ name: r[0], keyEvents: r[1] })).filter((e) => e.keyEvents > 0),
        at: ga.at,
      };
    }

    /* ----- URL inspection ----- */
    const ix = data.index;
    if (ix && ix.results) {
      const ok = ix.results.filter((r) => !r.error);
      const indexed = ok.filter((r) => r.verdict === 'PASS');
      const notIndexed = ok.filter((r) => r.verdict !== 'PASS');
      notIndexed.forEach((r) => { if (out.pages.some((p) => p.url === r.url && p.type !== 'utility')) add('not-indexed', r.url, r.coverage || r.verdict); });
      ok.forEach((r) => { if (r.googleCanonical && r.userCanonical && r.googleCanonical !== r.userCanonical) add('canonical-mismatch', r.url, 'Google chose ' + path(r.googleCanonical)); });
      out.index = { inspected: ok.length, indexed: indexed.length, notIndexed, errors: ix.results.filter((r) => r.error), at: ix.at, byUrl: Object.fromEntries(ix.results.map((r) => [r.url, r])) };
      if (crawl) {
        out.issues.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
        out.counts = { high: 0, medium: 0, low: 0 };
        out.issues.forEach((i) => { if (i.state === 'open') out.counts[i.sev]++; });
        out.score = Math.max(0, Math.round(100 - Math.min(100, out.counts.high * 6 + out.counts.medium * 2 + out.counts.low * 0.5)));
      }
    }

    out.groups = groupIssues(out.issues);
    out.opps = opportunities(st, out, crm);
    out.leads = leads(crm, st);
    return out;
  }

  function groupIssues(issues) {
    const g = {};
    issues.forEach((i) => { (g[i.rule] = g[i.rule] || { rule: i.rule, sev: i.sev, cat: i.cat, items: [] }).items.push(i); });
    return Object.values(g).sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || b.items.length - a.items.length);
  }

  /* ================= Opportunities ================= */
  function opportunities(st, a, crm) {
    const S = st.settings;
    const res = { queries: [], services: [], towns: [], links: [] };
    if (a.search) res.queries = a.search.queries.filter((q) => q.relevant && q.gainClicks >= 0.5).sort((x, y) => y.value - x.value).slice(0, 40);

    // Services: one strong page per service
    S.services.forEach((s) => {
      const page = a.pages.find((p) => p.service === s.id && p.type === 'service') || null;
      const qs = a.search ? a.search.queries.filter((q) => q.service === s.id && q.relevant) : [];
      const impressions = u.sum(qs, (q) => q.impressions);
      const value = u.sum(qs, (q) => q.value);
      const pageIssues = page ? a.issues.filter((i) => i.url === page.url && i.state === 'open').length : 0;
      res.services.push({ service: s, page, impressions, value, pageIssues, status: page ? (page.words < 300 || pageIssues >= 3 ? 'improve' : 'ok') : 'missing' });
    });
    res.services.sort((x, y) => ({ missing: 0, improve: 1, ok: 2 }[x.status] - { missing: 0, improve: 1, ok: 2 }[y.status]) || (y.service.value - x.service.value) || (y.value - x.value));

    // Towns: a page only where there is real local proof (prevents thin "doorway" pages)
    const recentLocation = st.changes.filter((c) => c.kind === 'page' && c.location && c.status !== 'rejected' && u.daysBetween(c.created.slice(0, 10), u.todayISO()) <= 30).length;
    S.towns.forEach((t) => {
      const proof = townProof(t, crm, S.towns);
      const page = a.pages.find((p) => p.type === 'location' && p.town === t.name) || null;
      const qs = a.search ? a.search.queries.filter((q) => q.town === t.name && q.relevant) : [];
      const eligible = proof.jobs >= 3 || (proof.jobs >= 1 && proof.photos >= 4);
      let status = page ? 'has-page' : eligible ? (recentLocation >= 2 ? 'wait' : 'ready') : 'needs-proof';
      res.towns.push({ town: t, proof, page, impressions: u.sum(qs, (q) => q.impressions), bestPosition: qs.length ? Math.min.apply(null, qs.map((q) => q.position)) : null, value: u.sum(qs, (q) => q.value), status, mentioned: (a.site.townsMentioned || []).includes(t.name) });
    });
    res.towns.sort((x, y) => (y.town.top - x.town.top) || (y.proof.jobs - x.proof.jobs) || (y.impressions - x.impressions));
    res.locationPagesThisMonth = recentLocation;

    // Internal links: pages that mention a service but don't link to its page
    const servicePages = res.services.filter((s) => s.page).map((s) => s.page);
    a.pages.filter((p) => p.type !== 'utility' && p.text).forEach((p) => {
      servicePages.forEach((sp) => {
        if (sp.url === p.url) return;
        const linked = (p.contextual || []).some(([to]) => to === sp.url);
        if (linked) return;
        const svc = S.services.find((s) => s.id === sp.service);
        const term = svc && svc.terms.find((t) => t.length > 5 && hasPhrase(p.text, t));
        if (term) res.links.push({ from: p, to: sp, term });
      });
    });
    res.links = res.links.slice(0, 40);
    return res;
  }

  /** Completed jobs and job photos in a town, from the CRM. */
  function townProof(town, crm, towns) {
    const out = { jobs: 0, revenue: 0, photos: 0, services: {} };
    if (!crm || !crm.customers) return out;
    const custIds = new Set(crm.customers.filter((c) => { const t = townIn((c.city || '') + ' ' + (c.address || ''), towns); return t && t.name === town.name; }).map((c) => c.id));
    crm.deals.filter((d) => d.stage === 'won' && custIds.has(d.customerId)).forEach((d) => { out.jobs++; out.revenue += u.num(d.value); out.services[d.title] = 1; });
    (crm.jobFolders || []).filter((f) => custIds.has(f.customerId)).forEach((f) => { out.photos += (f.media || []).length; });
    out.serviceList = Object.keys(out.services).slice(0, 8);
    out.demo = !!crm.demo;
    return out;
  }

  /* ================= Leads by marketing channel (from the CRM) ================= */
  function leads(crm) {
    if (!crm || !crm.deals) return null;
    const since = u.addDays(u.todayISO(), -90);
    const ds = crm.deals.filter((d) => (d.createdAt || '') >= since);
    const rows = {};
    MT.store.CHANNELS.forEach((c) => { rows[c.id] = { id: c.id, label: c.label, leads: 0, won: 0, revenue: 0 }; });
    rows.unknownGoogle = { id: 'unknownGoogle', label: 'Google (search or Maps not recorded)', leads: 0, won: 0, revenue: 0 };
    rows.unknown = { id: 'unknown', label: 'Not recorded', leads: 0, won: 0, revenue: 0 };
    ds.forEach((d) => {
      const k = d.channel && rows[d.channel] ? d.channel : d.source === 'Google' ? 'unknownGoogle' : 'unknown';
      rows[k].leads++;
      if (d.stage === 'won') { rows[k].won++; rows[k].revenue += u.num(d.value); }
    });
    const organic = ['organic', 'maps'].reduce((acc, k) => ({ leads: acc.leads + rows[k].leads, won: acc.won + rows[k].won, revenue: acc.revenue + rows[k].revenue }), { leads: 0, won: 0, revenue: 0 });
    return { since, rows: Object.values(rows).filter((r) => r.leads), organic, total: ds.length, demo: !!crm.demo };
  }

  function fmtPhone(d) { return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : d; }

  MT.seoAudit = { RULES, analyze, townIn, townsIn, serviceIn, ctrAt, pageType, business, path, fmtPhone, hasPhrase };
})();
