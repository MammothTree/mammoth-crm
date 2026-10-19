/* Mammoth CRM — SEO autopilot tab: dashboard, site audit, opportunities, approvals, history, and setup. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui;
  const TAB_KEY = 'mammothcrm.seotab';
  const TABS = [['overview', 'Dashboard'], ['audit', 'Site audit'], ['opps', 'Opportunities'], ['approvals', 'Approvals'], ['history', 'History'], ['setup', 'Setup']];
  const SHORT = { removal: 'Removal', trimming: 'Trimming', stump: 'Stumps', crane: 'Crane', emergency: 'Storm', clearing: 'Clearing', phc: 'Plant health', general: 'Tree service' };
  const STEP_NAMES = { crawl: 'Checking every page of your website (up to 3 minutes)…', search: 'Reading Search Console…', analytics: 'Reading Google Analytics…', index: 'Asking Google which pages are indexed (can take a few minutes)…' };

  let tab = 'overview';
  try { tab = localStorage.getItem(TAB_KEY) || 'overview'; } catch (e) { /* ignore */ }
  const view = { title: 'SEO autopilot', tab, filter: { sev: '', cat: '', show: 'open' }, busy: '', histKind: '' };
  MT.views = MT.views || {};
  MT.views.seo = view;

  /* ---------- small helpers ---------- */
  const n0 = (v) => Math.round(u.num(v)).toLocaleString('en-US');
  const rerender = () => MT.app.render();
  const seo = () => MT.seo;
  const S = () => MT.seo.state.settings;
  const conn = () => MT.seo.conn;
  const ext = (url, text) => `<a href="${u.esc(url)}" target="_blank" rel="noopener">${u.esc(text || url)}</a>`;
  function posBadge(pos) {
    if (pos == null) return '<span class="muted">—</span>';
    const kind = pos <= 3 ? 'good' : pos <= 10 ? 'info' : pos <= 20 ? 'warn' : 'bad';
    return '<span class="badge ' + kind + '">' + (pos < 10 ? pos.toFixed(1) : Math.round(pos)) + '</span>';
  }
  function delta(cur, prev, opts) {
    opts = opts || {};
    if (cur == null || prev == null) return '<div class="kpi-delta flat">No earlier data to compare</div>';
    let diff, text;
    if (opts.abs) {
      diff = cur - prev;
      if (Math.abs(diff) < 0.05) return '<div class="kpi-delta flat">Same as the 28 days before</div>';
      text = (diff > 0 ? '+' : '−') + Math.abs(diff).toFixed(1) + ' vs the 28 days before';
    } else {
      if (!prev) return '<div class="kpi-delta flat">' + (cur ? 'Nothing in the 28 days before' : 'None yet') + '</div>';
      diff = (cur - prev) / Math.abs(prev);
      if (Math.abs(diff) < 0.005) return '<div class="kpi-delta flat">Same as the 28 days before</div>';
      text = (diff > 0 ? '+' : '−') + Math.abs(diff * 100).toFixed(0) + '% vs the 28 days before';
    }
    const good = opts.lowerIsBetter ? diff < 0 : diff > 0;
    const p = diff > 0 ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6';
    return '<div class="kpi-delta ' + (good ? 'up' : 'down') + '"><svg class="kpi-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="' + p + '"/></svg>' + u.esc(text) + '</div>';
  }
  const kpi = (label, value, sub, d) => `<article class="kpi"><h3 class="kpi-label">${label}</h3><div class="kpi-value">${value}</div><div class="kpi-sub">${sub || ''}</div>${d || ''}</article>`;
  function sourceBadge(src) { return src === 'ai' ? ui.badge('AI draft', 'info') : src === 'manual' ? ui.badge('Your edit') : ui.badge('Template'); }
  function lastAuditText() {
    const d = seo().data, st = S().connector.status;
    const at = d && d.crawl ? d.crawl.at : '';
    return at ? 'Last audit ' + u.fmtDate(at.slice(0, 10)) + (st && st.scheduled ? ', runs again every Monday' : '') : 'No audit yet';
  }

  /* ================= Render ================= */
  view.render = function (root) {
    if (!TABS.some((t) => t[0] === view.tab)) view.tab = 'overview';
    const ready = conn().ready();
    const pending = seo().state.changes.filter((c) => c.status === 'draft' || c.status === 'approved').length;
    root.innerHTML = `
      <div class="seo-head">
        <div class="seg seo-tabs" role="tablist">${TABS.map(([id, label]) => `<button role="tab" data-tab="${id}" class="${view.tab === id ? 'on' : ''}" aria-selected="${view.tab === id}">${label}${id === 'approvals' && pending ? ' <span class="seo-count">' + pending + '</span>' : ''}</button>`).join('')}</div>
        <div class="seo-run">
          ${view.busy ? `<span class="seo-busy" id="seo-busy" role="status"><span class="spinner" aria-hidden="true"></span>${u.esc(view.busy)}</span>`
            : `<span class="hint">${u.esc(lastAuditText())}</span>${ready ? '<button class="btn ghost sm" id="seo-refresh">Refresh</button><button class="btn primary sm" id="seo-runall">Run audit now</button>' : ''}`}
        </div>
      </div>
      <div id="seo-host" class="stack"></div>`;
    u.qsa('[data-tab]', root).forEach((b) => b.addEventListener('click', () => { view.tab = b.dataset.tab; try { localStorage.setItem(TAB_KEY, view.tab); } catch (e) { /* ignore */ } rerender(); }));
    const on = (sel, fn) => { const el = u.qs(sel, root); if (el) el.addEventListener('click', fn); };
    on('#seo-runall', () => runAudit(['crawl', 'search', 'analytics', 'index']));
    on('#seo-refresh', async (e) => { e.target.disabled = true; if (await seo().pull(false)) ui.toast('Latest results loaded'); rerender(); });
    const host = u.qs('#seo-host', root);
    const a = seo().analysis();
    ({ overview: renderOverview, audit: renderAudit, opps: renderOpps, approvals: renderApprovals, history: renderHistory, setup: renderSetup })[view.tab](host, a);
  };

  async function runAudit(parts) {
    if (view.busy) return;
    const st = S().connector.status || {};
    parts = parts.filter((p) => ((p !== 'search' && p !== 'index') || st.gsc) && (p !== 'analytics' || st.ga4));
    view.busy = 'Starting…';
    rerender();
    const errors = await seo().run(parts, (p) => {
      view.busy = STEP_NAMES[p] || 'Working…';
      const el = document.getElementById('seo-busy');
      if (el) el.lastChild.textContent = view.busy;
    });
    view.busy = '';
    rerender();
    if (errors.length) ui.modal({ title: 'Some steps had problems', body: '<ul class="bullets">' + errors.map((e) => '<li>' + u.esc(e) + '</li>').join('') + '</ul><p class="hint">Results from the steps that worked are shown. Fix the problem on the Setup tab, then run the audit again.</p>' });
    else ui.toast('Audit finished');
  }

  function connectPrompt(host, what) {
    host.insertAdjacentHTML('beforeend', `<section class="panel seo-hero">
      <h2>${what || 'Connect your website to start'}</h2>
      <p>The SEO connector is a free Google Apps Script that checks every page of mammoth-tree.com each week, reads your Google Search Console and Google Analytics numbers, and turns them into a ranked list of fixes for your Squarespace site. It never changes your website by itself.</p>
      <div class="btn-row"><button class="btn primary" data-go="setup">Set it up (about 20 minutes)</button></div>
    </section>`);
  }

  /* ================= Dashboard ================= */
  function renderOverview(host, a) {
    const ready = conn().ready();
    const pending = seo().state.changes.filter((c) => c.status === 'draft' || c.status === 'approved');
    if (!ready) connectPrompt(host);
    else if (!a.hasCrawl && !a.search) host.insertAdjacentHTML('beforeend', `<section class="panel seo-hero"><h2>Run your first audit</h2><p>The connector is set up. Run the first audit to see your website's health, your Google rankings, and what to fix first.</p><div class="btn-row"><button class="btn primary" id="ov-first">Run the first audit</button></div></section>`);
    if (pending.length) host.insertAdjacentHTML('beforeend', `<div class="seo-note"><b>${pending.length} ${pending.length === 1 ? 'change is' : 'changes are'} waiting for you</b> on the Approvals tab. <button class="link-btn" data-go="approvals">Review now</button></div>`);

    const sc = a.search, ga = a.analytics, ix = a.index, ld = a.leads;
    host.insertAdjacentHTML('beforeend', `
      <section class="kpis" aria-label="Google search, last 28 days">
        ${kpi('Clicks from Google', sc ? n0(sc.clicks) : '—', sc ? 'Last 28 days of Google searches' : 'Needs Search Console', sc ? delta(sc.clicks, sc.prev.clicks) : '')}
        ${kpi('Times you showed up', sc ? n0(sc.impressions) : '—', sc ? 'Impressions in Google results' : 'Needs Search Console', sc ? delta(sc.impressions, sc.prev.impressions) : '')}
        ${kpi('Average position', sc && sc.position ? sc.position.toFixed(1) : '—', sc ? 'Lower is better. 1 to 10 is page one' : 'Needs Search Console', sc && sc.position && sc.prev.position ? delta(sc.position, sc.prev.position, { abs: true, lowerIsBetter: true }) : '')}
        ${kpi('Pages in Google', ix ? ix.indexed + ' of ' + ix.inspected : '—', ix ? (ix.notIndexed.length ? ix.notIndexed.length + ' not indexed yet' : 'Every checked page is indexed') : 'Needs Search Console', '')}
      </section>
      <section class="kpis" aria-label="Visits and leads">
        ${kpi('Visits from Google search', ga ? n0(ga.organic.sessions) : '—', ga ? 'Google Analytics, last 28 days' : 'Needs Google Analytics', ga ? delta(ga.organic.sessions, ga.organicPrev.sessions) : '')}
        ${kpi('Conversions from search', ga ? n0(ga.organic.keyEvents) : '—', ga ? (ga.events.length ? ga.events.map((e) => e.name).slice(0, 3).join(', ') : 'Mark your form submission as a key event in GA4') : 'Needs Google Analytics', ga ? delta(ga.organic.keyEvents, ga.organicPrev.keyEvents) : '')}
        ${kpi('Leads from Google', ld ? n0(ld.organic.leads) : '—', ld ? 'Search + Maps leads in the CRM, last 90 days' : '', '')}
        ${kpi('Won from Google leads', ld ? u.money(ld.organic.revenue) : '—', ld ? ld.organic.won + (ld.organic.won === 1 ? ' job' : ' jobs') + ' won, last 90 days' + (ld.demo ? ' (sample data)' : '') : '', '')}
      </section>`);

    if (sc) {
      host.insertAdjacentHTML('beforeend', `
        <section class="panel"><div class="panel-head"><h3>Clicks from Google by week</h3><div class="legend"><span><i class="sw bar"></i>Clicks</span><span class="muted">Hover a week for impressions and position</span></div></div><div id="ov-weeks"></div></section>
        <section class="panel">
          <div class="panel-head"><h3>Where you rank by town</h3><span class="hint">Best position for searches that showed your site, last 28 days</span></div>
          ${matrixTable(a)}
          <p class="hint">Empty cells mean Google hasn't shown your site for that search yet. That's where town and service pages help most. <span class="badge good">1–3</span> <span class="badge info">4–10</span> <span class="badge warn">11–20</span> <span class="badge bad">21+</span></p>
        </section>
        <div class="grid-2-1">
          <section class="panel"><div class="panel-head"><h3>Top searches</h3><span class="hint">${u.esc(u.fmtShort(sc.range.start))} – ${u.esc(u.fmtShort(sc.range.end))}</span></div>${queryTable(sc.queries.slice().sort((x, y) => y.clicks - x.clicks || y.impressions - x.impressions).slice(0, 15))}</section>
          <section class="panel"><div class="panel-head"><h3>Top pages</h3></div>${sc.pages.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Page</th><th class="num">Clicks</th><th class="num">Shown</th><th class="num">Position</th></tr></thead><tbody>${sc.pages.slice(0, 12).map((p) => `<tr><td>${u.esc(seo().path(p.url))}</td><td class="num">${n0(p.clicks)}</td><td class="num">${n0(p.impressions)}</td><td class="num">${posBadge(p.position)}</td></tr>`).join('')}</tbody></table></div>` : ui.empty('No pages have shown in Google yet.')}</section>
        </div>`);
      const W = sc.weeks.slice(-13);
      MT.charts.bars(u.qs('#ov-weeks', host), {
        labels: W.map((w) => u.fmtShort(w.week)), values: W.map((w) => w.clicks), ariaLabel: 'Clicks from Google by week', fmt: (v) => n0(v),
        tip: (i) => '<strong>Week of ' + u.esc(u.fmtShort(W[i].week)) + '</strong><div class="tip-row">Clicks <b>' + n0(W[i].clicks) + '</b></div><div class="tip-row">Shown <b>' + n0(W[i].impressions) + '</b></div>' + (W[i].days < 7 ? '<div class="tip-muted">' + W[i].days + ' days of data</div>' : ''),
      });
    } else if (ready) host.insertAdjacentHTML('beforeend', `<section class="panel">${ui.empty('Rankings, clicks, and keyword positions appear here once Search Console is connected (Setup → step 4).')}</section>`);

    const sum = MT.seoAI.TASKS.auditSummary.template({ analysis: a });
    host.insertAdjacentHTML('beforeend', `<div class="grid-2">
      <section class="panel"><div class="panel-head"><h3>Leads by how they found you</h3><span class="hint">Last 90 days</span></div>
        <div id="ov-leads"></div>
        <p class="hint">Set "Found us online through" on each lead (ask callers "Did you find us on Google search or Google Maps?"). Website form leads are labeled automatically where the site allows it.</p></section>
      <section class="panel"><div class="panel-head"><h3>Website health</h3><button class="link-btn" data-go="audit">Open the audit</button></div>
        ${a.hasCrawl ? `<div class="seo-health"><div class="seo-score ${a.score >= 80 ? 'good' : a.score >= 60 ? 'warn' : 'bad'}"><b>${a.score}</b><span>of 100</span></div>
          <div><p>${u.esc(sum.summary)}</p>${sum.nextSteps.length ? '<h4 class="sub-h">Fix first</h4><ol class="tight-list">' + sum.nextSteps.map((x) => '<li>' + u.esc(x) + '</li>').join('') + '</ol>' : ''}</div></div>` : ui.empty('Run the audit to see your score.')}
      </section></div>`);
    const lr = ld ? ld.rows.slice().sort((x, y) => y.leads - x.leads) : [];
    const lh = u.qs('#ov-leads', host);
    if (lr.length) MT.charts.hbars(lh, lr.map((r) => ({ label: r.label, value: r.leads, sub: r.won + ' won, ' + u.moneyShort(r.revenue) })), { fmt: (v) => n0(v) + (v === 1 ? ' lead' : ' leads') });
    else lh.innerHTML = ui.empty('No leads in the last 90 days.');
    bindCommon(host);
    const first = u.qs('#ov-first', host);
    if (first) first.addEventListener('click', () => runAudit(['crawl', 'search', 'analytics', 'index']));
  }

  function matrixTable(a) {
    const services = S().services;
    const cols = [{ id: 'general', name: SHORT.general }].concat(services.map((s) => ({ id: s.id, name: SHORT[s.id] || s.name })));
    const rows = S().towns.slice().sort((x, y) => y.top - x.top).map((t) => ({ key: t.name, label: t.name, top: t.top })).concat([{ key: 'near me', label: '"near me"', top: false }]);
    return `<div class="table-wrap"><table class="table seo-matrix"><thead><tr><th>Town</th>${cols.map((c) => `<th class="num">${u.esc(c.name)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${u.esc(r.label)}${r.top ? ' <span class="badge done">Top</span>' : ''}</td>${cols.map((c) => { const m = a.search.matrix[r.key + '|' + c.id]; return `<td class="num"${m ? ` title="${u.esc('"' + m.q + '": shown ' + m.impressions + ' times')}"` : ''}>${m ? posBadge(m.position) : '<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  }
  function queryTable(qs) {
    if (!qs.length) return ui.empty('No searches yet.');
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Search</th><th class="num">Clicks</th><th class="num">Shown</th><th class="num">Position</th></tr></thead><tbody>
      ${qs.map((q) => { const ch = q.prevPosition == null ? '' : q.prevPosition - q.position; return `<tr><td>${u.esc(q.q)}${q.brand ? ' ' + ui.badge('Your name') : ''}</td><td class="num">${n0(q.clicks)}</td><td class="num">${n0(q.impressions)}</td><td class="num nowrap">${posBadge(q.position)}${ch !== '' && Math.abs(ch) >= 1 ? ` <small class="${ch > 0 ? 'pos-up' : 'pos-down'}">${ch > 0 ? '▲' : '▼'}${Math.abs(ch).toFixed(0)}</small>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  }

  /* ================= Site audit ================= */
  function renderAudit(host, a) {
    if (!conn().ready()) { connectPrompt(host); bindCommon(host); return; }
    if (!a.hasCrawl) { host.insertAdjacentHTML('beforeend', `<section class="panel seo-hero"><h2>No audit yet</h2><p>Run the audit to check every page for titles, headings, links, structured data, and indexing problems.</p><div class="btn-row"><button class="btn primary" id="au-run">Run the audit</button></div></section>`); u.qs('#au-run', host).addEventListener('click', () => runAudit(['crawl', 'index'])); return; }
    const f = view.filter, R = MT.seoAudit.RULES;
    const cats = Array.from(new Set(a.groups.map((g) => g.cat)));
    const groups = a.groups.map((g) => Object.assign({}, g, { items: g.items.filter((i) => f.show === 'all' || i.state === f.show) }))
      .filter((g) => g.items.length && (!f.sev || g.sev === f.sev) && (!f.cat || g.cat === f.cat));
    const caps = seo().publisher.capabilities();
    host.innerHTML = `
      <section class="panel seo-summary">
        <div class="seo-score ${a.score >= 80 ? 'good' : a.score >= 60 ? 'warn' : 'bad'}"><b>${a.score}</b><span>of 100</span></div>
        <dl class="facts seo-facts">
          <div><dt>High priority</dt><dd class="${a.counts.high ? 'neg' : ''}">${a.counts.high}</dd></div>
          <div><dt>Medium</dt><dd>${a.counts.medium}</dd></div>
          <div><dt>Low</dt><dd>${a.counts.low}</dd></div>
          <div><dt>Pages checked</dt><dd>${a.pages.length}${a.site.truncated ? '+' : ''}</dd></div>
        </dl>
        <p class="hint">Checked ${u.esc(u.fmtDate(a.crawlAt.slice(0, 10)))} · ${u.esc(caps.platform)} site · sitemap ${a.site.sitemap === 200 ? 'found (' + a.site.sitemapCount + ' pages)' : 'missing'} · structured data: ${u.esc(a.site.schema.join(', ') || 'none')}${a.index ? ' · ' + a.index.indexed + ' of ' + a.index.inspected + ' pages indexed' : ''}</p>
      </section>
      <div class="toolbar seo-filters">
        <div class="seg" role="radiogroup" aria-label="Priority">${[['', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([v, l]) => `<button role="radio" data-sev="${v}" class="${f.sev === v ? 'on' : ''}" aria-checked="${f.sev === v}">${l}</button>`).join('')}</div>
        <select class="input" id="au-cat" aria-label="Category">${u.options(cats, f.cat, 'All categories')}</select>
        <select class="input" id="au-show" aria-label="Status">${u.options([{ value: 'open', label: 'Open issues' }, { value: 'fixed', label: 'Marked fixed' }, { value: 'ignored', label: 'Ignored' }, { value: 'all', label: 'Everything' }], f.show)}</select>
      </div>
      <div class="stack tight">${groups.length ? groups.map((g) => {
        const r = R[g.rule];
        return `<details class="panel issue-group" ${groups.length <= 3 ? 'open' : ''}>
          <summary><span class="badge ${g.sev === 'high' ? 'bad' : g.sev === 'medium' ? 'warn' : ''}">${g.sev}</span><b>${u.esc(r.title)}</b><span class="muted">${g.items.length} ${g.items.length === 1 ? 'item' : 'items'} · ${u.esc(g.cat)}</span></summary>
          <p>${u.esc(r.why)}</p>
          <div class="fix-box"><h4>How to fix it in Squarespace</h4><ol class="tight-list">${r.fix.map((x) => '<li>' + x + '</li>').join('')}</ol></div>
          <ul class="list issue-items">${g.items.map((i) => `<li class="issue-row" data-key="${u.esc(i.key)}">
            <div class="grow"><div class="row-title">${i.url ? `<button class="link-btn" data-page="${u.esc(i.url)}">${u.esc(seo().path(i.url))}</button>` : 'Whole site'} ${i.state !== 'open' ? ui.badge(i.state === 'fixed' ? 'Marked fixed' : 'Ignored', i.state === 'fixed' ? 'good' : '') : ''}</div>${i.detail ? `<div class="row-sub">${u.esc(i.detail)}</div>` : ''}</div>
            <div class="issue-actions">
              ${r.suggest && (i.url || r.suggest === 'schema') && i.state === 'open' ? `<button class="btn ghost sm" data-suggest="${r.suggest}" data-url="${u.esc(i.url)}" data-reason="${u.esc(r.title)}">Suggest a fix</button>` : ''}
              ${i.state === 'open' ? '<button class="btn ghost sm" data-mark="fixed">Mark fixed</button><button class="btn ghost sm" data-mark="ignored">Ignore</button>' : '<button class="btn ghost sm" data-mark="open">Reopen</button>'}
            </div></li>`).join('')}</ul>
        </details>`;
      }).join('') : `<section class="panel">${ui.empty(f.show === 'open' ? 'No open issues match these filters. Nice work.' : 'Nothing here.')}</section>`}</div>
      <details class="panel"><summary class="panel-summary"><b>All pages</b> <span class="muted">${a.pages.length}</span></summary>
        <div class="table-wrap"><table class="table"><thead><tr><th>Page</th><th>Type</th><th class="num">Words</th><th class="num">Links in</th><th>In Google</th><th class="num">Issues</th></tr></thead><tbody>
        ${a.pages.slice().sort((x, y) => y.issueCount - x.issueCount).map((p) => { const ix = a.index && a.index.byUrl[p.url]; return `<tr class="click" data-page="${u.esc(p.url)}"><td>${u.esc(p.path)}</td><td>${u.esc(p.type)}</td><td class="num">${n0(p.words)}</td><td class="num">${p.inlinks}</td><td>${ix ? (ix.verdict === 'PASS' ? ui.badge('Indexed', 'good') : ix.error ? ui.badge('Not checked') : ui.badge('No', 'bad')) : '<span class="muted">—</span>'}</td><td class="num">${p.issueCount || ''}</td></tr>`; }).join('')}
        </tbody></table></div></details>`;
    u.qsa('[data-sev]', host).forEach((b) => b.addEventListener('click', () => { f.sev = b.dataset.sev; rerender(); }));
    u.qs('#au-cat', host).addEventListener('change', (e) => { f.cat = e.target.value; rerender(); });
    u.qs('#au-show', host).addEventListener('change', (e) => { f.show = e.target.value; rerender(); });
    u.qsa('[data-mark]', host).forEach((b) => b.addEventListener('click', () => {
      const key = b.closest('[data-key]').dataset.key;
      if (b.dataset.mark === 'open') delete seo().state.issueState[key];
      else seo().state.issueState[key] = { status: b.dataset.mark, at: new Date().toISOString() };
      seo().save();
      if (b.dataset.mark === 'fixed') ui.toast('Marked fixed. If the next audit still finds it, it will reopen.');
    }));
    bindCommon(host);
  }

  /* ---------- page details ---------- */
  function openPage(url) {
    const a = seo().analysis();
    const p = a.pages.find((x) => x.url === url);
    const raw = !p && seo().data && seo().data.crawl ? seo().data.crawl.pages.find((x) => x.url === url) : null;
    if (!p) { ui.modal({ title: seo().path(url), body: raw ? `<p>Status ${raw.status}${raw.redirect ? ', redirects to ' + u.esc(seo().path(raw.redirect)) : ''}.</p>` : '<p>This page wasn\'t found in the latest audit.</p>' }); return; }
    const issues = a.issues.filter((i) => i.url === url);
    const ix = a.index && a.index.byUrl[url];
    const gsc = a.search ? a.search.pages.find((x) => x.url === url) : null;
    const qp = a.search ? a.search.queryPages.filter((x) => x.url === url).sort((x, y) => y.impressions - x.impressions).slice(0, 8) : [];
    ui.modal({
      title: p.path, size: 'lg',
      body: `<p>${ext(url, 'Open this page on your website')} · ${u.esc(p.type)} page · ${n0(p.words)} words · ${p.inlinks} pages link here</p>
        <dl class="kv">
          <div><dt>Title (${p.title.length})</dt><dd>${u.esc(p.title || '—')}</dd></div>
          <div><dt>Description (${p.description.length})</dt><dd>${u.esc(p.description || '—')}</dd></div>
          <div><dt>Main heading</dt><dd>${u.esc(p.h1.join(' | ') || '—')}</dd></div>
          <div><dt>In Google</dt><dd>${ix ? u.esc((ix.verdict === 'PASS' ? 'Indexed' : 'Not indexed') + (ix.coverage ? ': ' + ix.coverage : '') + (ix.lastCrawl ? ', last visited by Google ' + u.fmtDate(ix.lastCrawl.slice(0, 10)) : '')) : 'Not checked yet'}</dd></div>
          <div><dt>Search, 28 days</dt><dd>${gsc ? n0(gsc.clicks) + ' clicks, shown ' + n0(gsc.impressions) + ' times, position ' + gsc.position.toFixed(1) : 'No data'}</dd></div>
          <div><dt>Structured data</dt><dd>${u.esc(p.schema.join(', ') || 'None')}</dd></div>
        </dl>
        ${qp.length ? '<h4 class="sub-h">Searches that show this page</h4><ul class="bullets">' + qp.map((q) => '<li>' + u.esc(q.q) + ' (position ' + q.position.toFixed(1) + ', shown ' + q.impressions + ')</li>').join('') + '</ul>' : ''}
        <h4 class="sub-h">Heading outline</h4>${p.headings.length ? '<ul class="outline">' + p.headings.slice(0, 30).map((h) => `<li style="--lvl:${h[0]}"><span class="muted">H${h[0]}</span> ${u.esc(h[1])}</li>`).join('') + '</ul>' : '<p class="hint">No headings found.</p>'}
        <h4 class="sub-h">Issues on this page</h4>${issues.length ? '<ul class="bullets">' + issues.map((i) => '<li>' + ui.badge(i.sev, i.sev === 'high' ? 'bad' : i.sev === 'medium' ? 'warn' : '') + ' ' + u.esc(MT.seoAudit.RULES[i.rule].title) + (i.detail ? ': ' + u.esc(i.detail) : '') + '</li>').join('') + '</ul>' : '<p class="hint">No issues found.</p>'}`,
      actions: [
        { label: 'Suggest a title', kind: 'ghost', onClick: () => suggest('title', url, 'Better title') },
        { label: 'Suggest a description', kind: 'ghost', onClick: () => suggest('description', url, 'Better description') },
        { label: 'Suggest a heading', kind: 'ghost', onClick: () => suggest('h1', url, 'Better main heading') },
        { label: 'Close', kind: 'primary' },
      ],
    });
  }

  /* ---------- suggestions → approval drafts ---------- */
  async function suggest(kind, url, reason) {
    const a = seo().analysis();
    const page = a.pages.find((p) => p.url === url);
    if (kind === 'schema') { previewSchema(reason); return; }
    if (!page) { ui.toast('That page isn\'t in the latest audit.', 'err'); return; }
    const queries = a.search ? a.search.queryPages.filter((x) => x.url === url).sort((x, y) => y.impressions - x.impressions).slice(0, 8).map((x) => x.q) : null;
    ui.toast(MT.seoAI.available() ? 'Asking the AI for a draft…' : 'Preparing a suggestion…');
    const res = await MT.seoAI.run(kind, { page, queries });
    const before = kind === 'title' ? page.titleCore || page.title : kind === 'description' ? page.description : kind === 'h1' ? page.h1[0] || '' : page.path;
    const label = { title: 'New title', description: 'New description', h1: 'New main heading', redirect: 'New address' }[kind];
    const opts = [res.value].concat(res.alternatives || []).filter(Boolean);
    const limit = kind === 'title' ? 60 - (S().titleSuffix || '').length : kind === 'description' ? 158 : 0;
    ui.modal({
      title: label + ' for ' + page.path, size: 'lg',
      body: `<p>${sourceBadge(res.source)} ${kind === 'title' && S().titleSuffix ? '<span class="hint">Squarespace adds "' + u.esc(S().titleSuffix.trim()) + '" after it.</span>' : ''}</p>
        <div class="diff"><div><h4>Now</h4><p>${u.esc(before || '(empty)')}</p></div></div>
        <fieldset class="opt-list"><legend>Choose one, then edit it if you like</legend>${opts.map((o, i) => `<label class="check"><input type="radio" name="opt" value="${i}" ${i ? '' : 'checked'}><span>${u.esc(o)} ${limit ? '<small class="muted">(' + o.length + ')</small>' : ''}</span></label>`).join('')}</fieldset>
        <label class="field"><span>New ${u.esc(label.replace('New ', '').toLowerCase())}</span>${kind === 'description' ? `<textarea class="input" rows="3" id="sg-text">${u.esc(opts[0] || '')}</textarea>` : `<input class="input" id="sg-text" value="${u.esc(opts[0] || '')}">`}<small id="sg-count"></small></label>
        ${res.source === 'template' ? '<p class="hint">Template suggestion. Once an AI key is added (Setup → AI), suggestions are written from the page\'s own text and searches.</p>' : ''}`,
      onMount(b) {
        const t = u.qs('#sg-text', b), cnt = u.qs('#sg-count', b);
        const count = () => { cnt.textContent = limit ? t.value.length + ' of ' + limit + ' characters' : ''; cnt.className = limit && t.value.length > limit ? 'neg' : ''; };
        u.qsa('[name=opt]', b).forEach((r) => r.addEventListener('change', () => { t.value = opts[+r.value]; count(); }));
        t.addEventListener('input', count); count();
      },
      actions: [{ label: 'Cancel' }, { label: 'Send for approval', kind: 'primary', onClick: (b) => {
        const val = u.qs('#sg-text', b).value.trim();
        if (!val) { ui.toast('Enter the new text.', 'err'); return false; }
        const edited = val !== res.value;
        const ch = MT.seoAI.toChange(kind, Object.assign({}, res, { value: val, source: edited && res.source === 'template' ? 'manual' : res.source }), { page, reason });
        if (ch) { seo().save(); ui.toast('Added to Approvals'); }
      } }],
    });
  }
  function previewSchema(reason) {
    const res = MT.seoAI.TASKS.schema.template();
    const core = S().plan !== 'basic';
    ui.modal({
      title: 'Business details markup', size: 'lg',
      body: `<p>Google uses structured data to understand your business type, phone, and service area.</p>
        <h4 class="sub-h">On your Basic plan: Squarespace Business information</h4>
        <table class="table"><tbody>${res.businessInfo.map(([k, v]) => `<tr><th>${u.esc(k)}</th><td>${u.esc(v)}</td></tr>`).join('')}</tbody></table>
        <h4 class="sub-h">${core ? 'Full markup to paste into code injection' : 'Full markup for later (needs the Core plan)'}</h4><pre class="code">${u.esc(res.value)}</pre>`,
      actions: [{ label: 'Cancel' }, { label: 'Send for approval', kind: 'primary', onClick: () => { if (MT.seoAI.toChange('schema', Object.assign(res, { source: 'template' }), { reason })) { seo().save(); ui.toast('Added to Approvals'); } } }],
    });
  }

  /* ================= Opportunities ================= */
  function renderOpps(host, a) {
    const b = a.biz, o = a.opps;
    const statusBadge = { missing: ui.badge('Missing', 'bad'), improve: ui.badge('Needs work', 'warn'), ok: ui.badge('Good', 'good') };
    const townBadge = { 'has-page': ui.badge('Has a page', 'good'), ready: ui.badge('Ready for a page', 'info'), 'needs-proof': ui.badge('Needs local proof', ''), wait: ui.badge('Wait (monthly limit)', 'warn') };
    host.innerHTML = `
      <section class="panel"><div class="panel-head"><h3>What a Google visitor is worth to you</h3><button class="link-btn" data-go="setup">Change</button></div>
        <dl class="facts seo-facts">
          <div><dt>Average job</dt><dd>${u.money(b.avgJob)}</dd><div class="ps-note">From ${u.esc(b.avgSrc)}</div></div>
          <div><dt>Close rate</dt><dd>${u.pct(b.closeRate)}</dd><div class="ps-note">From ${u.esc(b.closeSrc)}</div></div>
          <div><dt>Visitors who become leads</dt><dd>${u.pct(b.leadRate, 1)}</dd><div class="ps-note">Typical for service sites</div></div>
          <div><dt>Value per click</dt><dd>${u.money(b.perClick, true)}</dd><div class="ps-note">Used to rank every opportunity</div></div>
        </dl></section>

      <section class="panel"><div class="panel-head"><h3>Quick wins: searches you already show up for</h3><span class="hint">Moving up a few spots on these is the fastest new business</span></div>
        ${!a.search ? ui.empty('Connect Search Console (Setup → step 4) to see these.') : o.queries.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Search</th><th class="num">Position now</th><th class="num">Goal</th><th class="num">Shown / 28 days</th><th class="num">Extra clicks / month</th><th class="num">Value / month</th><th></th></tr></thead><tbody>
          ${o.queries.slice(0, 20).map((q) => { const top = a.search.queryPages.filter((x) => x.q === q.q).sort((x, y) => y.impressions - x.impressions)[0]; return `<tr><td>${u.esc(q.q)}</td><td class="num">${posBadge(q.position)}</td><td class="num">${q.target}</td><td class="num">${n0(q.impressions)}</td><td class="num">${q.gainClicks.toFixed(1)}</td><td class="num"><b>${u.money(q.value)}</b></td><td>${top ? `<button class="btn ghost sm" data-page="${u.esc(top.url)}">${u.esc(seo().path(top.url))}</button>` : ''}</td></tr>`; }).join('')}
          </tbody></table></div><p class="hint">Value = extra clicks × ${u.pct(b.leadRate, 1)} become leads × ${u.pct(b.closeRate)} close × ${u.money(b.avgJob)} average job. Estimates, not promises.</p>` : ui.empty('No tree-service searches with room to grow yet. New service and town pages create them.')}
      </section>

      <section class="panel"><div class="panel-head"><h3>Service pages</h3><span class="hint">One strong page per service is the base of local SEO</span></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Service</th><th>Status</th><th>Page</th><th class="num">Words</th><th class="num">Shown / 28 days</th><th></th></tr></thead><tbody>
        ${o.services.map((s) => `<tr><td><b>${u.esc(s.service.name)}</b>${s.service.value >= 3 ? ' ' + ui.badge('High value', 'info') : ''}</td><td>${statusBadge[s.status]}</td><td>${s.page ? `<button class="link-btn" data-page="${u.esc(s.page.url)}">${u.esc(s.page.path)}</button>` : '<span class="muted">None. It\'s only mentioned on a shared page.</span>'}</td><td class="num">${s.page ? n0(s.page.words) : '—'}</td><td class="num">${a.search ? n0(s.impressions) : '—'}</td>
          <td>${s.status !== 'ok' ? `<button class="btn ghost sm" data-draft-service="${s.service.id}">${s.page ? 'Draft a better page' : 'Draft this page'}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div></section>

      <section class="panel"><div class="panel-head"><h3>Town pages</h3><span class="hint">${o.locationPagesThisMonth} drafted in the last 30 days (limit 2)</span></div>
        <p class="hint">To avoid thin or copy-paste pages (which Google treats as spam), a town gets its own page only with real local proof: at least 3 completed jobs there, or 1 job plus 4 job photos, recorded in the CRM. Customer city comes from Clients; photos from Job cam. Every other town is still listed in "Areas we serve" on your service pages.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Town</th><th class="num">Jobs won</th><th class="num">Photos</th><th>Named on site</th><th class="num">Best position</th><th>Status</th><th></th></tr></thead><tbody>
        ${o.towns.map((t) => `<tr><td>${u.esc(t.town.name)}${t.town.top ? ' <span class="badge done">Top</span>' : ''}</td><td class="num">${t.proof.jobs}</td><td class="num">${t.proof.photos}</td><td>${a.hasCrawl ? (t.mentioned ? 'Yes' : '<span class="neg">No</span>') : '—'}</td><td class="num">${posBadge(t.bestPosition)}</td><td>${townBadge[t.status]}</td>
          <td>${t.status === 'ready' ? `<button class="btn ghost sm" data-draft-town="${u.esc(t.town.name)}">Draft town page</button>` : t.status === 'has-page' ? `<button class="link-btn" data-page="${u.esc(t.page.url)}">${u.esc(t.page.path)}</button>` : t.status === 'needs-proof' ? `<span class="hint">${Math.max(0, 3 - t.proof.jobs)} more ${3 - t.proof.jobs === 1 ? 'job' : 'jobs'}</span>` : ''}</td></tr>`).join('')}
        </tbody></table></div>${o.towns.some((t) => t.proof.demo) ? '<p class="hint">The CRM still has sample data, so job counts here aren\'t real.</p>' : ''}</section>

      <div class="grid-2">
        <section class="panel"><div class="panel-head"><h3>Internal links to add</h3></div>
          ${!a.hasCrawl ? ui.empty('Run the audit first.') : o.links.length ? '<ul class="list compact">' + o.links.slice(0, 15).map((l) => `<li class="list-row" data-page="${u.esc(l.from.url)}"><div class="grow"><div class="row-title">On ${u.esc(l.from.path)}</div><div class="row-sub">Link the words "${u.esc(l.term)}" to ${u.esc(l.to.path)}</div></div></li>`).join('') + '</ul>' : ui.empty(o.services.some((s) => s.page) ? 'No missing links found.' : 'Links are suggested once each service has its own page.')}
        </section>
        <section class="panel"><div class="panel-head"><h3>Business details for Google</h3></div>
          <p>Structured data tells Google you're a tree service, your phone, and the towns you serve. ${a.hasCrawl ? (a.site.business.length ? 'Found on your site: ' + u.esc(a.site.business.map((x) => x.type).join(', ')) + '.' : '<b>None found on your site yet.</b>') : ''}</p>
          <div class="btn-row"><button class="btn ghost" data-suggest="schema" data-url="" data-reason="Business details markup">Prepare it</button></div>
        </section>
      </div>

      <section class="panel"><div class="panel-head"><h3>Local SEO checklist</h3><span class="hint">${Object.values(seo().state.checklist).filter(Boolean).length} of ${seo().CHECKLIST.length} done</span></div>
        <p class="hint">For "tree service near me", the Google Maps results often matter more than the website. These steps are free.</p>
        ${Array.from(new Set(seo().CHECKLIST.map((c) => c.group))).map((g) => `<h4 class="sub-h">${u.esc(g)}</h4>${seo().CHECKLIST.filter((c) => c.group === g).map((c) => `<label class="check"><input type="checkbox" data-check="${c.id}" ${seo().state.checklist[c.id] ? 'checked' : ''}><span>${u.esc(c.text)}</span></label>`).join('')}`).join('')}
      </section>`;
    u.qsa('[data-check]', host).forEach((cb) => cb.addEventListener('change', () => { seo().state.checklist[cb.dataset.check] = cb.checked; seo().save(true); }));
    u.qsa('[data-draft-service]', host).forEach((btn) => btn.addEventListener('click', () => draftService(btn.dataset.draftService, btn)));
    u.qsa('[data-draft-town]', host).forEach((btn) => btn.addEventListener('click', () => draftTown(btn.dataset.draftTown, btn)));
    bindCommon(host);
  }

  async function draftService(id, btn) {
    const a = seo().analysis();
    const s = seo().service(id);
    const row = a.opps.services.find((x) => x.service.id === id);
    const queries = a.search ? a.search.queries.filter((q) => q.service === id && q.relevant).sort((x, y) => y.impressions - x.impressions).slice(0, 10).map((q) => q.q) : [];
    if (btn) { btn.disabled = true; btn.textContent = 'Drafting…'; }
    const res = await MT.seoAI.run('servicePage', { service: s, queries, existing: row && row.page ? row.page.text : '' });
    if (btn) { btn.disabled = false; btn.textContent = 'Draft this page'; }
    previewPage(res, { label: (row && row.page ? 'Improve the ' : 'New ') + s.name.toLowerCase() + ' page', reason: row && row.page ? 'The current page is thin or has issues' : 'No dedicated page for ' + s.name.toLowerCase() });
  }
  async function draftTown(name, btn) {
    const a = seo().analysis();
    const t = a.opps.towns.find((x) => x.town.name === name);
    if (!t || t.status !== 'ready') { ui.toast('This town doesn\'t have enough local proof for its own page yet.', 'err'); return; }
    const queries = a.search ? a.search.queries.filter((q) => q.town === name && q.relevant).slice(0, 10).map((q) => q.q) : [];
    if (btn) { btn.disabled = true; btn.textContent = 'Drafting…'; }
    const res = await MT.seoAI.run('locationPage', { town: t.town, proof: t.proof, queries });
    if (btn) { btn.disabled = false; btn.textContent = 'Draft town page'; }
    previewPage(res, { label: 'New town page: ' + name, reason: t.proof.jobs + ' completed jobs in ' + name, town: t.town });
  }
  function previewPage(res, ctx) {
    const text = MT.seoAI.pageText(res);
    const placeholders = (text.match(/\[ADD:[^\]]*\]/g) || []).length;
    // Guard against near-copies of existing pages
    const a = seo().analysis();
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);
    let worst = null;
    a.pages.forEach((p) => {
      if (!p.text || p.words < 80) return;
      const pw = new Set(p.text.toLowerCase().split(/\W+/));
      const overlap = words.filter((w) => w.length > 4 && pw.has(w)).length / Math.max(1, words.filter((w) => w.length > 4).length);
      if (!worst || overlap > worst.overlap) worst = { page: p, overlap };
    });
    ui.modal({
      title: ctx.label, size: 'lg',
      body: `<p>${sourceBadge(res.source)} ${placeholders ? ui.badge(placeholders + ' facts to add', 'warn') : ''}</p>
        ${placeholders ? '<p class="hint">Replace every [ADD: …] with your real details before publishing. The CRM never makes up facts like years in business, prices, or insurance.</p>' : ''}
        ${worst && worst.overlap > 0.85 ? `<p class="check-note">Much of this wording also appears on ${u.esc(worst.page.path)}. Rewrite parts of it so the pages don't compete.</p>` : ''}
        <label class="field"><span>Draft (edit freely)</span><textarea class="input mono" rows="18" id="pg-text">${u.esc(text)}</textarea></label>`,
      actions: [{ label: 'Cancel' }, { label: 'Send for approval', kind: 'primary', onClick: (b) => {
        const body = u.qs('#pg-text', b).value;
        const slug = (body.match(/^URL slug:\s*\/?(\S+)/m) || [])[1] || res.slug;
        const ch = MT.seoAI.toChange('page', Object.assign({}, res, { slug, source: body !== text && res.source === 'template' ? 'manual' : res.source }), { label: ctx.label, reason: ctx.reason, town: ctx.town });
        if (ch) { ch.body = body; seo().save(); ui.toast('Added to Approvals'); }
      } }],
    });
  }

  /* ================= Approvals ================= */
  function renderApprovals(host) {
    const caps = seo().publisher.capabilities();
    const all = seo().state.changes;
    const order = ['draft', 'approved', 'published', 'verified'];
    host.innerHTML = `
      <section class="panel"><div class="panel-head"><h3>How changes reach your website</h3>${ui.badge(caps.directPublish ? 'Direct publishing' : 'You publish by hand', caps.directPublish ? 'good' : 'info')}</div>
        <ul class="bullets">${caps.notes.map((x) => '<li>' + u.esc(x) + '</li>').join('')}</ul>
        <p class="hint">Steps: <b>Needs approval</b> → you approve → <b>Ready to publish</b> → you paste it into Squarespace and select "I've published it" → the next audit confirms it's <b>Live</b>. A copy of the old text is kept so any change can be rolled back.</p></section>
      ${order.map((st) => { const list = all.filter((c) => c.status === st); return list.length ? `<h3 class="seo-h">${u.esc(seo().STATUS[st].name)} <span class="muted">${list.length}</span></h3><div class="stack tight">${list.map(changeCard).join('')}</div>` : ''; }).join('')}
      ${!all.some((c) => order.includes(c.status)) ? `<section class="panel">${ui.empty('Nothing waiting. Use "Suggest a fix" on the Site audit tab or "Draft this page" on Opportunities to create changes.')}</section>` : ''}
      ${all.some((c) => !order.includes(c.status)) ? `<details class="panel"><summary class="panel-summary"><b>Rejected and rolled back</b> <span class="muted">${all.filter((c) => !order.includes(c.status)).length}</span></summary><div class="stack tight">${all.filter((c) => !order.includes(c.status)).map(changeCard).join('')}</div></details>` : ''}`;
    u.qsa('[data-act]', host).forEach((b) => b.addEventListener('click', () => changeAction(b.dataset.act, b.closest('[data-chg]').dataset.chg)));
  }
  function changeCard(c) {
    const st = seo().STATUS[c.status];
    const isPage = c.kind === 'page';
    const actions = {
      draft: '<button class="btn primary sm" data-act="approve">Approve</button><button class="btn ghost sm" data-act="edit">Edit</button><button class="btn ghost sm" data-act="reject">Reject</button>',
      approved: '<button class="btn primary sm" data-act="steps">How to publish</button><button class="btn ghost sm" data-act="published">I\'ve published it</button><button class="btn ghost sm" data-act="reject">Cancel</button>',
      published: '<button class="btn ghost sm" data-act="steps">Publishing steps</button><button class="btn ghost sm" data-act="check">Check now</button><button class="btn ghost sm" data-act="rollback">Roll back</button>',
      verified: '<button class="btn ghost sm" data-act="rollback">Roll back</button>',
      rejected: '<button class="btn danger-ghost sm" data-act="delete">Delete</button>',
      rolledback: '<button class="btn danger-ghost sm" data-act="delete">Delete</button>',
    }[c.status];
    return `<article class="panel chg" data-chg="${c.id}">
      <div class="chg-head"><div class="grow"><b>${u.esc(c.label)}</b><div class="row-sub">${u.esc(c.reason || '')}${c.reason ? ' · ' : ''}created ${u.esc(u.fmtDate(c.created.slice(0, 10)))}</div></div>${sourceBadge(c.source)}${c.needs === 'core' ? ui.badge('Core plan', 'warn') : ''}${ui.badge(st.name, st.kind)}</div>
      ${isPage ? `<details><summary>Show the page draft</summary><pre class="code tall">${u.esc(c.body || '')}</pre></details>`
        : c.kind === 'schema' ? (c.businessInfo ? '<table class="table"><tbody>' + c.businessInfo.map(([k, v]) => `<tr><th>${u.esc(k)}</th><td>${u.esc(v)}</td></tr>`).join('') + '</tbody></table>' : '') + `<details><summary>Show the markup</summary><pre class="code">${u.esc(c.after)}</pre></details>`
        : `<div class="diff"><div><h4>Before</h4><p>${u.esc(c.kind === 'redirect' ? seo().path(c.url) : c.before || '(empty)')}</p></div><div><h4>After</h4><p>${u.esc(c.kind === 'redirect' ? seo().path(c.after) : c.after)}</p></div></div>`}
      <div class="btn-row">${actions}<details class="trail"><summary>History</summary><ul class="feed">${(c.trail || []).map((t) => `<li><span class="feed-dot" aria-hidden="true"></span><div><div>${u.esc(seo().STATUS[t.status] ? seo().STATUS[t.status].name : t.status)}${t.note ? ': ' + u.esc(t.note) : ''}</div><time>${u.esc(new Date(t.at).toLocaleString())}</time></div></li>`).join('')}</ul></details></div>
    </article>`;
  }
  function changeAction(act, id) {
    const C = seo().changes, c = C.get(id);
    if (!c) return;
    if (act === 'approve') { C.approve(id); ui.toast('Approved. Select "How to publish" for the steps.'); }
    else if (act === 'reject') C.reject(id);
    else if (act === 'published') ui.confirm('Did you publish it?', 'Confirm that this change is now live on your website. The next audit will check it.', 'Yes, it\'s published', () => C.published(id));
    else if (act === 'delete') ui.confirm('Delete this change?', 'It will be removed from the list. Its entries stay in History.', 'Delete', () => C.remove(id));
    else if (act === 'rollback') ui.confirm('Roll back this change?', 'A new draft that puts the earlier version back is created for your approval.', 'Create rollback draft', () => { if (C.rollback(id)) { ui.toast('Rollback draft created'); } });
    else if (act === 'check') runAudit(['crawl']);
    else if (act === 'edit') editChange(c);
    else if (act === 'steps') publishSteps(c);
  }
  function editChange(c) {
    const isPage = c.kind === 'page';
    ui.modal({
      title: 'Edit: ' + c.label, size: 'lg',
      body: isPage ? `<label class="field"><span>Page draft</span><textarea class="input mono" rows="18" id="ed-text">${u.esc(c.body || '')}</textarea></label>`
        : `<label class="field"><span>${c.kind === 'redirect' ? 'New address' : 'New text'}</span><textarea class="input" rows="${c.kind === 'schema' ? 14 : 3}" id="ed-text">${u.esc(c.after)}</textarea></label>${(c.alternatives || []).length ? '<p class="hint">Other options: ' + c.alternatives.map(u.esc).join(' · ') + '</p>' : ''}`,
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: (b) => {
        const v = u.qs('#ed-text', b).value;
        if (isPage) c.body = v; else c.after = v.trim();
        if (c.source === 'template') c.source = 'manual';
        c.trail.push({ at: new Date().toISOString(), status: 'draft', note: 'Edited by you' });
        seo().save();
      } }],
    });
  }
  function publishSteps(c) {
    const steps = seo().publisher.steps(c);
    const copies = [];
    if (c.kind === 'page') {
      const d = c.draft || {};
      [['SEO title', d.seoTitle], ['SEO description', d.seoDescription], ['URL slug', '/' + String(c.after || '').replace(/^\/+/, '')], ['Page text', c.body]].forEach(([k, v]) => { if (v) copies.push([k, v]); });
    } else if (c.kind === 'redirect') copies.push(['URL mapping line', seo().path(c.url) + ' -> ' + seo().path(c.after) + ' 301'], ['New URL slug', seo().path(c.after).replace(/^\//, '')]);
    else if (c.kind === 'schema') { (c.businessInfo || []).forEach(([k, v]) => copies.push([k, v])); if (c.needs === 'core') copies.push(['Markup', c.after]); }
    else copies.push([{ title: 'SEO title', description: 'SEO description', h1: 'Main heading' }[c.kind] || 'Text', c.after]);
    ui.modal({
      title: 'Publish: ' + c.label, size: 'lg',
      body: `<ol class="steps">${steps.map((s) => '<li>' + s + '</li>').join('')}</ol>
        <h4 class="sub-h">Copy and paste</h4>
        ${copies.map(([k, v], i) => `<div class="copy-row"><div class="grow"><b>${u.esc(k)}</b><pre class="code${v.length > 300 ? ' tall' : ''}" id="cp-${i}">${u.esc(v)}</pre></div><button class="btn ghost sm" data-cp="${i}">Copy</button></div>`).join('')}
        <p class="hint">Live page: ${ext(c.url)}</p>`,
      onMount(b) { u.qsa('[data-cp]', b).forEach((btn) => btn.addEventListener('click', () => u.copyText(copies[+btn.dataset.cp][1]).then(() => ui.toast(copies[+btn.dataset.cp][0] + ' copied')))); },
      actions: [{ label: 'Close' }].concat(c.status === 'approved' ? [{ label: 'I\'ve published it', kind: 'primary', onClick: () => seo().changes.published(c.id) }] : []),
    });
  }

  /* ================= History ================= */
  function renderHistory(host) {
    const st = seo().state;
    const kinds = [['', 'Everything'], ['site', 'Website changes'], ['change', 'Approvals'], ['audit', 'Audits'], ['auto', 'Autopilot']];
    const items = st.history.filter((h) => !view.histKind || h.kind === view.histKind).slice(0, 150);
    const snaps = st.snapshots.slice().reverse();
    host.innerHTML = `
      <section class="panel"><div class="panel-head"><h3>Weekly progress</h3></div>
        ${snaps.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Audit</th><th class="num">Score</th><th class="num">High</th><th class="num">Medium</th><th class="num">Low</th><th class="num">Pages</th><th class="num">Clicks (28 d)</th><th class="num">Position</th><th class="num">Indexed</th></tr></thead><tbody>
        ${snaps.map((x) => `<tr><td>${u.esc(u.fmtDate(x.at.slice(0, 10)))}</td><td class="num"><b>${x.score == null ? '—' : x.score}</b></td><td class="num">${x.high}</td><td class="num">${x.medium}</td><td class="num">${x.low}</td><td class="num">${x.pages}</td><td class="num">${x.clicks == null ? '—' : n0(x.clicks)}</td><td class="num">${x.position ? x.position.toFixed(1) : '—'}</td><td class="num">${x.indexed == null ? '—' : x.indexed}</td></tr>`).join('')}
        </tbody></table></div>` : ui.empty('Each audit adds a row here, so you can see progress week by week.')}</section>
      <section class="panel"><div class="panel-head"><h3>Change log</h3><div class="seg">${kinds.map(([k, l]) => `<button data-hk="${k}" class="${view.histKind === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <p class="hint">Website changes are found by comparing each audit with the one before, including edits made outside the CRM. Up to 12 weeks of page snapshots are kept in your connector sheet.</p>
        ${items.length ? `<ul class="feed">${items.map((h) => `<li class="feed-${u.esc(h.kind)}"><span class="feed-dot" aria-hidden="true"></span><div><div>${u.esc(h.text)}</div>${h.before != null && h.after != null ? `<div class="row-sub">"${u.esc(String(h.before).slice(0, 120))}" → "${u.esc(String(h.after).slice(0, 120))}"</div>` : ''}<time>${u.esc(new Date(h.at).toLocaleString())}</time></div></li>`).join('')}</ul>` : ui.empty('Nothing logged yet.')}
      </section>
      ${st.aiLog.length ? `<details class="panel"><summary class="panel-summary"><b>AI usage</b> <span class="muted">${st.aiLog.length}</span></summary><div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Task</th><th>Model</th><th class="num">Tokens in / out</th><th>Result</th></tr></thead><tbody>${st.aiLog.slice(0, 50).map((l) => `<tr><td>${u.esc(new Date(l.at).toLocaleString())}</td><td>${u.esc(l.task)}</td><td>${u.esc(l.model || '—')}</td><td class="num">${n0(l.input)} / ${n0(l.output)}</td><td>${l.ok ? ui.badge('OK', 'good') : ui.badge('Failed', 'bad') + ' ' + u.esc(l.error)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
    u.qsa('[data-hk]', host).forEach((b) => b.addEventListener('click', () => { view.histKind = b.dataset.hk; rerender(); }));
  }

  /* ================= Setup ================= */
  function renderSetup(host) {
    const st = seo().state, s = st.settings, c = s.connector, cs = c.status || {};
    const f = s.facts, m = s.model;
    const code = MT.seoConnector.code(c.key), manifest = MT.seoConnector.manifest();
    const utm = s.site.replace(/\/+$/, '') + '/?utm_source=google&utm_medium=organic&utm_campaign=gbp';
    const done = (ok) => (ok ? '<span class="badge good">Done</span>' : '');
    host.innerHTML = `
      <section class="panel"><div class="panel-head"><h3>What are Search Console and Google Analytics?</h3></div>
        <div class="grid-2">
          <div><h4 class="sub-h">Google Search Console</h4><p>Google's free report card for your website <b>in Google search</b>: which searches showed your site, how often, where you ranked, how many people clicked, and which pages Google has (or hasn't) added to its index. It's what tells us you rank #6 for "tree removal Libertyville".</p></div>
          <div><h4 class="sub-h">Google Analytics (GA4)</h4><p>Google's free visitor counter for what happens <b>on your website</b>: how many people visited, where they came from (Google search, Maps, Facebook…), and how many filled out your contact form. It's what tells us search visitors turned into leads.</p></div>
        </div>
        <p class="hint">Both are free and work on the Squarespace Basic plan. Search Console is the most important. Start there.</p></section>

      <section class="panel"><div class="panel-head"><h3>Step 1: Connect Google to your website</h3>${done(st.checklist['sq-gsc'] && st.checklist['sq-ga4'])}</div>
        <ol class="steps">
          <li><b>Search Console:</b> in Squarespace, open <b>Analytics → Search keywords</b> (or <b>Settings → Connected accounts</b>) and select <b>Connect Google Search Console</b>. Sign in with the Google account you'll use for the connector. Squarespace verifies the site and sends your sitemap automatically. If you set it up yourself at ${ext('https://search.google.com/search-console', 'search.google.com/search-console')}, choose the <b>Domain</b> property type for mammoth-tree.com.</li>
          <li><b>Google Analytics:</b> at ${ext('https://analytics.google.com/', 'analytics.google.com')}, create a GA4 property for mammoth-tree.com and copy its <b>Measurement ID</b> (starts with G-). In Squarespace, go to <b>Settings → Developer tools → External API keys</b> (older menus: Settings → Advanced → External API keys) and paste it in <b>Google Analytics</b>. No code needed.</li>
          <li>In Google Analytics, open <b>Admin → Events</b> and turn on <b>Mark as key event</b> for <b>form_submit</b> (it appears a day after someone submits your contact form). That's how form leads from Google search get counted.</li>
        </ol>
        <label class="check"><input type="checkbox" data-check="sq-gsc" ${st.checklist['sq-gsc'] ? 'checked' : ''}><span>Search Console is connected</span></label>
        <label class="check"><input type="checkbox" data-check="sq-ga4" ${st.checklist['sq-ga4'] ? 'checked' : ''}><span>Google Analytics is connected</span></label></section>

      <section class="panel"><div class="panel-head"><h3>Step 2: Create a free Google Cloud project</h3></div>
        <p>The connector reads Search Console and Analytics through Google's APIs, which must be switched on in a Google Cloud project. It's free. No billing account is needed for this.</p>
        <ol class="steps">
          <li>Open ${ext('https://console.cloud.google.com/projectcreate', 'Google Cloud → New project')}, name it <b>Mammoth SEO</b>, and select <b>Create</b>.</li>
          <li>With that project selected, open each link and select <b>Enable</b>: ${ext('https://console.cloud.google.com/apis/library/searchconsole.googleapis.com', 'Search Console API')}, ${ext('https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com', 'Google Analytics Data API')}, and ${ext('https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com', 'Google Analytics Admin API')}.</li>
          <li>Open ${ext('https://console.cloud.google.com/auth/overview', 'Google Auth Platform')} and select <b>Get started</b>. App name: <b>Mammoth SEO</b>; support email: yours. Audience: choose <b>Internal</b> if info@mammoth-tree.com is a Google Workspace account; otherwise choose <b>External</b>, finish, then under <b>Audience</b> select <b>Publish app</b>. (Leaving it in "Testing" makes Google sign the connector out every 7 days.) You don't need Google's verification for your own use.</li>
          <li>Open the project's ${ext('https://console.cloud.google.com/home/dashboard', 'Dashboard')} and copy the <b>Project number</b> (digits only). You'll paste it in the next step.</li>
        </ol></section>

      <section class="panel"><div class="panel-head"><h3>Step 3: Create the connector</h3>${done(c.url && cs.ok)}</div>
        <ol class="steps">
          <li>In Google Drive, create a blank Google Sheet named <b>Mammoth SEO</b>. Open <b>Extensions → Apps Script</b>.</li>
          <li>Select the gear (<b>Project Settings</b>). Check <b>Show "appsscript.json" manifest file in editor</b>. Under <b>Google Cloud Platform (GCP) Project</b>, select <b>Change project</b>, paste the project number, and confirm.</li>
          <li>Back in the editor (<b>&lt;&gt;</b>), open <b>Code.gs</b>, delete everything, and paste this code. It contains your private key. <button class="btn ghost sm" data-copy="code">Copy code</button><pre class="code" id="cp-code">${u.esc(code)}</pre></li>
          <li>Open <b>appsscript.json</b>, delete everything, and paste this. It lists exactly what the connector may access (read-only for Search Console and Analytics). <button class="btn ghost sm" data-copy="manifest">Copy settings</button><pre class="code" id="cp-manifest">${u.esc(manifest)}</pre></li>
          <li>Select <b>Save</b>. In the function menu at the top choose <b>authorize</b>, then <b>Run</b>. Approve access with the Google account that owns Search Console. If Google warns that the app isn't verified, select <b>Advanced → Go to Mammoth SEO</b>. It's your own script.</li>
          <li>Select <b>Deploy → New deployment</b> → gear → <b>Web app</b>. Execute as: <b>Me</b>. Who has access: <b>Anyone</b>. Select <b>Deploy</b> and copy the Web app URL.</li>
          <li>Paste it here:<div class="input-with-btn"><input class="input" id="su-url" value="${u.esc(c.url)}" placeholder="https://script.google.com/macros/s/…/exec"><button class="btn primary sm" id="su-connect">${c.url ? 'Reconnect' : 'Connect'}</button></div>
            ${c.lastError ? `<p class="hint neg">${u.esc(c.lastError)}</p>` : cs.ok ? `<p class="hint">Connected · connector version ${cs.version}${cs.version < MT.seoConnector.VERSION ? ' <b class="neg">(update available: paste the new code and deploy a new version)</b>' : ''}</p>` : ''}</li>
        </ol>
        <p class="hint">When the code here changes in an app update, paste it again, then use <b>Deploy → Manage deployments → Edit → Version: New version</b> so the web address stays the same.</p></section>

      <section class="panel"><div class="panel-head"><h3>Step 4: Choose your site and schedule</h3>${done(cs.gsc && cs.scheduled)}</div>
        ${c.url ? `<div class="form-grid">
          <label class="field"><span>Website address</span><input class="input" id="su-site" value="${u.esc(cs.site || s.site)}"></label>
          <label class="field"><span>Weekly summary email (optional)</span><input class="input" id="su-email" type="email" value="${u.esc(cs.email || '')}" placeholder="info@mammoth-tree.com"></label>
          <div class="field"><span>Search Console property</span><div class="input-with-btn"><select class="input" id="su-gsc">${u.options(cs.gsc ? [cs.gsc] : [], cs.gsc || '', 'Select Find to list yours')}</select><button class="btn ghost sm" id="su-find-gsc">Find</button></div></div>
          <div class="field"><span>Google Analytics property</span><div class="input-with-btn"><select class="input" id="su-ga4">${u.options(cs.ga4 ? [{ value: cs.ga4, label: 'Property ' + cs.ga4 }] : [], cs.ga4 || '', 'Select Find to list yours')}</select><button class="btn ghost sm" id="su-find-ga4">Find</button></div></div>
        </div>
        <div class="btn-row"><button class="btn primary" id="su-save">Save</button>
          <label class="check"><input type="checkbox" id="su-weekly" ${cs.scheduled ? 'checked' : ''}><span>Run the audit automatically every Monday morning</span></label></div>
        <div class="btn-row"><button class="btn ghost" id="su-run">Run the audit now</button></div>` : '<p class="hint">Connect the connector first (step 3).</p>'}</section>

      <section class="panel"><div class="panel-head"><h3>Business facts</h3><span class="hint">The only facts templates and AI may use</span></div>
        <div class="form-grid" id="su-facts">
          <label class="field"><span>Business name</span><input class="input" name="business" value="${u.esc(f.business)}"></label>
          <label class="field"><span>Phone (must match everywhere)</span><input class="input" name="phone" value="${u.esc(f.phone)}"></label>
          <label class="field"><span>Email</span><input class="input" name="email" value="${u.esc(f.email)}"></label>
          <label class="field"><span>Main region (used in titles)</span><input class="input" name="region" value="${u.esc(f.region)}"></label>
          <label class="field span-2"><span>Broader service area</span><input class="input" name="area" value="${u.esc(f.area)}"></label>
          <label class="field"><span>Insurance (leave blank if unsure)</span><input class="input" name="insured" value="${u.esc(f.insured)}" placeholder="e.g. Fully insured, $2M general liability"></label>
          <label class="field"><span>Years in business</span><input class="input" name="years" value="${u.esc(f.years)}" placeholder="e.g. 12"></label>
          <label class="field"><span>License or certification numbers</span><input class="input" name="license" value="${u.esc(f.license)}"></label>
          <label class="field"><span>Emergency service</span><input class="input" name="emergency" value="${u.esc(f.emergency)}" placeholder="e.g. 24/7 storm response"></label>
          <label class="field span-2"><span>Other true facts worth mentioning</span><textarea class="input" rows="2" name="extra">${u.esc(f.extra)}</textarea></label>
          <label class="check span-2"><input type="checkbox" name="isa" ${f.isa ? 'checked' : ''}><span>ISA Certified Arborist on staff</span></label>
        </div>
        <div class="form-grid" style="margin-top:14px">
          <label class="field"><span>Squarespace plan</span><select class="input" id="su-plan">${u.options([{ value: 'basic', label: 'Basic (no custom code)' }, { value: 'core', label: 'Core' }, { value: 'plus', label: 'Plus' }, { value: 'advanced', label: 'Advanced' }], s.plan)}</select><small>Basic is fine. Anything that needs a higher plan is labeled.</small></label>
          <label class="field"><span>Text Squarespace adds after page titles</span><input class="input" id="su-suffix" value="${u.esc(s.titleSuffix)}"><small>From Marketing → SEO → Search appearance. Leave blank if it adds nothing.</small></label>
        </div>
        <div class="btn-row"><button class="btn primary" id="su-facts-save">Save facts</button></div></section>

      <section class="panel"><div class="panel-head"><h3>Towns and services</h3></div>
        <div class="form-grid">
          <label class="field"><span>Towns you serve, one per line. Start a line with * for top-priority towns.</span><textarea class="input" rows="12" id="su-towns">${u.esc(s.towns.map((t) => (t.top ? '* ' : '') + t.name).join('\n'))}</textarea></label>
          <div class="field"><span>Services and the words people search for them (comma separated)</span>
            ${s.services.map((x) => `<div class="svc-row"><input class="input" data-svc-name="${x.id}" value="${u.esc(x.name)}" aria-label="Service name"><input class="input" data-svc-terms="${x.id}" value="${u.esc(x.terms.join(', '))}" aria-label="Search words for ${u.esc(x.name)}"></div>`).join('')}</div>
        </div>
        <div class="btn-row"><button class="btn primary" id="su-towns-save">Save towns and services</button></div></section>

      <section class="panel"><div class="panel-head"><h3>What a lead is worth</h3><span class="hint">Used to rank opportunities by business value</span></div>
        <div class="form-grid">
          <label class="field"><span>Average job value ($)</span><input class="input" type="number" min="0" id="su-avg" value="${u.esc(m.avgJob)}" placeholder="From your won jobs"></label>
          <label class="field"><span>Close rate (%)</span><input class="input" type="number" min="0" max="100" id="su-close" value="${u.esc(m.closeRate)}" placeholder="From your deals"></label>
          <label class="field"><span>Website visitors who become leads (%)</span><input class="input" type="number" min="0" max="100" step="0.5" id="su-lead" value="${u.esc(m.leadRate)}"></label>
        </div>
        <div class="btn-row"><button class="btn primary" id="su-model-save">Save</button></div></section>

      <section class="panel"><div class="panel-head"><h3>Lead tracking</h3><span class="hint">Which leads came from Google</span></div>
        <ol class="steps">
          <li><b>Tag your Google Business Profile link.</b> In your Business Profile, set the website to this address. Visits from Google Maps then show up separately from regular search in Analytics. <div class="input-with-btn"><input class="input" readonly value="${u.esc(utm)}"><button class="btn ghost sm" data-copytext="${u.esc(utm)}">Copy</button></div></li>
          <li><b>Ask on your Squarespace form.</b> Edit your contact form and add a dropdown <b>"How did you find us?"</b> with: Google search, Google Maps, Facebook / Nextdoor, Referral, Yard sign or truck, Other. This works on the Basic plan.</li>
          <li><b>Record it on each lead.</b> When you add a lead, set <b>Found us online through</b> (Leads → open a deal). For callers, ask "Did you find us on Google search or on Google Maps?" The dashboard turns these into leads and revenue from Google.</li>
          <li><b>Automatic tracking (optional, Core plan).</b> The website form in Integrations records the visitor's source automatically, but it needs a plan that runs custom code. Not needed to get started.</li>
        </ol>
        <label class="check"><input type="checkbox" data-check="gbp-utm" ${st.checklist['gbp-utm'] ? 'checked' : ''}><span>Business Profile link updated</span></label>
        <label class="check"><input type="checkbox" data-check="sq-formq" ${st.checklist['sq-formq'] ? 'checked' : ''}><span>"How did you find us?" added to the form</span></label></section>

      <section class="panel"><div class="panel-head"><h3>AI writing (optional, later)</h3>${ui.badge(cs.ai && cs.ai.configured ? 'Connected: ' + cs.ai.model : 'Not connected', cs.ai && cs.ai.configured ? 'good' : '')}</div>
        <p>Everything works now with templates. Add an AI key later and the same buttons start writing drafts from your real pages, searches, and job history. Nothing has to be rebuilt. The key stays inside your Google connector, never in the browser or on GitHub.</p>
        <ol class="steps">
          <li>Create an API key at ${ext('https://console.anthropic.com/', 'console.anthropic.com')} (pay per use; add a monthly spending limit there).</li>
          <li>In Apps Script, open <b>Project Settings → Script properties → Add script property</b>. Property: <b>AI_KEY</b>, value: your key. Save.</li>
          <li>Optional: add <b>AI_MODEL</b> to choose the model (the default is claude-opus-5-5; claude-sonnet-5-5 costs less) and <b>AI_EFFORT</b> (low, medium, or high).</li>
          <li>Select <b>Check connection</b> below.</li>
        </ol>
        <div class="form-grid">
          <label class="field"><span>Autopilot after each weekly audit</span><select class="input" id="su-auto">${u.options([{ value: 'off', label: 'Off' }, { value: 'suggest', label: 'Suggest only: I ask for drafts myself' }, { value: 'draft', label: 'Prepare drafts automatically for my approval' }], s.automation.mode)}</select><small>Nothing is ever published without your approval.</small></label>
          <label class="field"><span>Most drafts per audit</span><input class="input" type="number" min="0" max="10" id="su-max" value="${u.esc(s.automation.maxDrafts)}"></label>
        </div>
        <div class="btn-row"><button class="btn primary" id="su-auto-save">Save</button><button class="btn ghost" id="su-ai-check" ${c.url ? '' : 'disabled'}>Check connection</button></div></section>

      <section class="panel"><div class="panel-head"><h3>Backup</h3></div>
        <p class="hint">SEO settings, approvals, and history sync to your private GitHub repository (data/seo.json) on devices connected in Integrations. Audit results stay in your connector sheet.</p>
        <div class="btn-row"><button class="btn ghost" id="su-backup">Download SEO backup</button></div></section>`;

    const on = (sel, ev, fn) => { const el = u.qs(sel, host); if (el) el.addEventListener(ev, fn); };
    const copy = (text, label) => u.copyText(text).then(() => ui.toast(label + ' copied'));
    u.qsa('[data-copy]', host).forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy === 'code' ? code : manifest, b.dataset.copy === 'code' ? 'Code' : 'Settings')));
    u.qsa('[data-copytext]', host).forEach((b) => b.addEventListener('click', () => copy(b.dataset.copytext, 'Link')));
    u.qsa('[data-check]', host).forEach((cb) => cb.addEventListener('change', () => { st.checklist[cb.dataset.check] = cb.checked; seo().save(true); }));
    const busy = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Working…'; try { await fn(); } catch (e) { ui.toast(e.message, 'err'); } finally { btn.disabled = false; btn.textContent = t; } };

    on('#su-connect', 'click', (e) => busy(e.target, async () => {
      const url = u.qs('#su-url', host).value.trim();
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error('That doesn\'t look like an Apps Script web app address. It should start with https://script.google.com/');
      c.url = url;
      try {
        const status = await conn().get('status');
        c.status = status; c.lastError = '';
        if (!status.site) c.status = await conn().get('config', { site: s.site });
        seo().save();
        ui.toast('Connector connected');
      } catch (err) { c.lastError = err.message; seo().save(); throw err; }
    }));
    on('#su-find-gsc', 'click', (e) => busy(e.target, async () => {
      const r = await conn().get('sites');
      const sel = u.qs('#su-gsc', host);
      if (!r.sites.length) throw new Error('This Google account has no Search Console properties yet. Finish step 1 first.');
      const guess = r.sites.find((x) => /mammoth-tree/i.test(x.url)) || r.sites[0];
      sel.innerHTML = u.options(r.sites.map((x) => ({ value: x.url, label: x.url.replace('sc-domain:', 'Domain: ') + (x.level === 'siteUnverifiedUser' ? ' (not verified)' : '') })), (cs.gsc || guess.url));
    }));
    on('#su-find-ga4', 'click', (e) => busy(e.target, async () => {
      const r = await conn().get('properties');
      if (!r.properties.length) throw new Error('No Google Analytics properties found for this account.');
      u.qs('#su-ga4', host).innerHTML = u.options(r.properties.map((x) => ({ value: x.id, label: x.name + ' (' + x.account + ')' })), cs.ga4 || (r.properties.find((x) => /mammoth/i.test(x.name)) || r.properties[0]).id);
    }));
    on('#su-save', 'click', (e) => busy(e.target, async () => {
      const site = u.qs('#su-site', host).value.trim();
      c.status = await conn().get('config', { site, gsc: u.qs('#su-gsc', host).value, ga4: u.qs('#su-ga4', host).value, email: u.qs('#su-email', host).value.trim() });
      s.site = site.replace(/\/+$/, '');
      seo().save();
      ui.toast('Saved in the connector');
    }));
    on('#su-weekly', 'change', async (e) => {
      try { c.status = await conn().get('schedule', { on: e.target.checked ? '1' : '0' }); seo().save(); ui.toast(e.target.checked ? 'Weekly audit scheduled for Monday mornings' : 'Weekly audit turned off'); }
      catch (err) { e.target.checked = !e.target.checked; ui.toast(err.message, 'err'); }
    });
    on('#su-run', 'click', () => runAudit(['crawl', 'search', 'analytics', 'index']));
    on('#su-facts-save', 'click', () => {
      Object.assign(f, u.formData(u.qs('#su-facts', host)));
      s.plan = u.qs('#su-plan', host).value;
      s.titleSuffix = u.qs('#su-suffix', host).value;
      seo().save(); ui.toast('Business facts saved');
    });
    on('#su-towns-save', 'click', () => {
      const towns = u.qs('#su-towns', host).value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const top = l.startsWith('*');
        const name = l.replace(/^\*\s*/, '').replace(/,?\s*(il|illinois)$/i, '').trim().replace(/\b([a-z])/g, (x, ch) => ch.toUpperCase());
        return { name, state: 'IL', top };
      });
      if (!towns.length) { ui.toast('Add at least one town.', 'err'); return; }
      s.towns = towns;
      s.services.forEach((x) => {
        const nm = u.qs('[data-svc-name="' + x.id + '"]', host), tm = u.qs('[data-svc-terms="' + x.id + '"]', host);
        if (nm && nm.value.trim()) x.name = nm.value.trim();
        if (tm) x.terms = tm.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      });
      seo().save(); ui.toast('Towns and services saved');
    });
    on('#su-model-save', 'click', () => {
      Object.assign(m, { avgJob: u.qs('#su-avg', host).value, closeRate: u.qs('#su-close', host).value, leadRate: u.qs('#su-lead', host).value || 3 });
      seo().save(); ui.toast('Saved');
    });
    on('#su-auto-save', 'click', () => {
      s.automation.mode = u.qs('#su-auto', host).value;
      s.automation.maxDrafts = Math.max(0, Math.min(10, u.num(u.qs('#su-max', host).value)));
      seo().save(); ui.toast('Autopilot settings saved');
    });
    on('#su-ai-check', 'click', (e) => busy(e.target, async () => {
      c.status = await conn().get('status');
      seo().save();
      ui.toast(c.status.ai && c.status.ai.configured ? 'AI is connected (' + c.status.ai.model + ')' : 'No AI key found yet. Add AI_KEY under Script properties.', c.status.ai && c.status.ai.configured ? 'ok' : 'err');
    }));
    on('#su-backup', 'click', () => seo().backup());
  }

  /** Shared handlers for page links, suggestions, and tab jumps inside any tab. */
  function bindCommon(host) {
    u.qsa('[data-page]', host).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openPage(b.dataset.page); }));
    u.qsa('[data-suggest]', host).forEach((b) => b.addEventListener('click', () => suggest(b.dataset.suggest, b.dataset.url, b.dataset.reason)));
    u.qsa('[data-go]', host).forEach((b) => b.addEventListener('click', () => { view.tab = b.dataset.go; try { localStorage.setItem(TAB_KEY, view.tab); } catch (e) { /* ignore */ } rerender(); }));
  }
})();
