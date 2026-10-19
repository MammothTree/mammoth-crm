/* Mammoth CRM — Partner finder: find the top-rated complementary businesses nearby (landscapers, fence, pool,
   builders, developers, concrete…) on Google Maps and run a contractor-rate outreach campaign.
   Google's Maps terms don't allow keeping copies of listings, so the campaign saves each business's Google place ID,
   its name, and your own notes. Phone, website, and ratings are fetched live and kept only for this session.
   Details become yours to keep when you add the business as a client. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;
  const CACHE_KEY = 'mammothcrm.partnercache.v1'; // session only
  const FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'nationalPhoneNumber', 'websiteURI', 'googleMapsURI', 'businessStatus', 'primaryTypeDisplayName'];
  const STATUSES = [
    { id: 'new', name: 'To contact', kind: '' },
    { id: 'contacted', name: 'Contacted', kind: 'info' },
    { id: 'interested', name: 'Interested', kind: 'warn' },
    { id: 'partner', name: 'Partner', kind: 'good' },
    { id: 'no', name: 'Not interested', kind: 'bad' },
  ];
  const DEFAULT_CENTER = { lat: 42.2631, lon: -88.004 }; // Mundelein, until the yard address is located

  const view = { title: 'Partner finder', tab: 'find', cat: '', busy: '', fStatus: '', fCat: '' };
  MT.views = MT.views || {};
  MT.views.partners = view;

  /* ---------- session cache of Google details ---------- */
  let cache = {};
  try { cache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }
  const saveCache = () => { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* session cache is optional */ } };
  const results = (cache.results = cache.results || {}); // category id → [placeId…]
  const details = (cache.details = cache.details || {}); // placeId → details

  const P = () => store.state.partners || (store.state.partners = store.defaultPartners());
  const S = (id) => STATUSES.find((x) => x.id === id) || STATUSES[0];
  const googleKey = () => (MT.views.integrations && MT.views.integrations.secrets.get().googleKey) || '';
  function center() {
    const g = store.state.settings.company.yardGeo;
    return g && !g.sample && g.lat ? { lat: g.lat, lon: g.lon } : DEFAULT_CENTER;
  }
  function simplify(p) {
    const loc = p.location ? { lat: typeof p.location.lat === 'function' ? p.location.lat() : p.location.lat, lon: typeof p.location.lng === 'function' ? p.location.lng() : p.location.lng } : null;
    return {
      placeId: p.id, name: p.displayName || '', address: p.formattedAddress || '', lat: loc && loc.lat, lon: loc && loc.lon,
      rating: p.rating || 0, reviews: p.userRatingCount || 0, phone: p.nationalPhoneNumber || '', website: p.websiteURI || '',
      maps: p.googleMapsURI || '', status: p.businessStatus || '', type: p.primaryTypeDisplayName || '',
      miles: loc ? Math.round(MT.calc.milesBetween(center(), loc) * 10) / 10 : null,
    };
  }
  /** Ranks by rating, weighted by how many reviews back it up (a 4.9 with 300 reviews beats a 5.0 with 3). */
  const score = (d) => (d.reviews / (d.reviews + 20)) * d.rating + (20 / (d.reviews + 20)) * 4.2;

  async function places() {
    const key = googleKey();
    if (!key) throw new Error('Add your Google API key first (Integrations → Google reviews).');
    await MT.views.integrations.loadMaps(key);
    return (await google.maps.importLibrary('places')).Place;
  }

  /** Searches around the yard and near each top town, merges, and keeps the 25 best within the radius. */
  async function findTop(cat, onStep) {
    const Place = await places();
    const miles = Math.max(5, u.num(P().radius) || 25);
    const c = center();
    const bias = { center: { lat: c.lat, lng: c.lon }, radius: Math.min(50000, Math.round(miles * 1609)) };
    const towns = MT.seo ? MT.seo.state.settings.towns.filter((t) => t.top) : [];
    const queries = [cat.query].concat(towns.map((t) => cat.query + ' in ' + t.name + ', ' + (t.state || 'IL')));
    const found = new Map();
    const own = String(store.state.settings.company.name || 'Mammoth').toLowerCase().split(' ')[0];
    for (let i = 0; i < queries.length; i++) {
      if (onStep) onStep(i + 1, queries.length, queries[i]);
      try {
        const { places: list } = await Place.searchByText({ textQuery: queries[i], fields: FIELDS, locationBias: bias, maxResultCount: 20, region: 'us', language: 'en' });
        (list || []).forEach((p) => { if (!found.has(p.id)) found.set(p.id, simplify(p)); });
      } catch (e) {
        if (i === 0) throw new Error(friendly(e));
      }
    }
    const top = Array.from(found.values())
      .filter((d) => !/CLOSED/.test(d.status) && (d.miles == null || d.miles <= miles) && !d.name.toLowerCase().includes(own))
      .sort((a, b) => score(b) - score(a))
      .slice(0, 25);
    top.forEach((d) => { details[d.placeId] = d; });
    results[cat.id] = top.map((d) => d.placeId);
    saveCache();
    return top;
  }
  function friendly(e) {
    const m = String((e && e.message) || e);
    if (/not authorized|API_KEY|REQUEST_DENIED|ApiNotActivated|not enabled/i.test(m)) return 'Google refused the search. In Google Cloud, make sure "Places API (New)" and "Maps JavaScript API" are enabled for your key, and that billing is on. (' + m + ')';
    return m;
  }

  /** Live details for saved businesses (only this session). */
  async function refreshDetails(ids) {
    const need = ids.filter((id) => !details[id]);
    if (!need.length || !googleKey()) return;
    let Place;
    try { Place = await places(); } catch (e) { return; }
    for (let i = 0; i < need.length; i += 4) {
      await Promise.all(need.slice(i, i + 4).map(async (id) => {
        try { const p = new Place({ id }); await p.fetchFields({ fields: FIELDS.filter((f) => f !== 'id') }); p.id = id; details[id] = simplify(p); } catch (e) { details[id] = { placeId: id, missing: true }; }
      }));
      saveCache();
      fillRows();
    }
  }

  /* ---------- campaign helpers ---------- */
  const saved = (placeId) => P().list.find((x) => x.placeId === placeId);
  function addToCampaign(d, catId) {
    if (saved(d.placeId)) return null;
    const item = { id: u.uid('pt'), placeId: d.placeId, label: d.name, category: catId, status: 'new', contact: '', email: '', phone: '', notes: '', followUp: '', lastContact: '', customerId: '', addedAt: u.todayISO() };
    P().list.unshift(item);
    return item;
  }
  function merge(text, item) {
    const co = store.state.settings.company;
    const owner = co.owner && co.owner !== 'Owner' ? co.owner : '[your name]';
    return String(text || '')
      .replace(/\{\{business\}\}/g, item ? item.label : '[business]')
      .replace(/\{\{contact\}\}/g, item && item.contact ? u.firstName(item.contact) : 'there')
      .replace(/\{\{rate\}\}/g, String(u.num(P().rate) || 10))
      .replace(/\{\{owner\}\}/g, owner)
      .replace(/\{\{company\.name\}\}/g, co.name || '')
      .replace(/\{\{company\.phone\}\}/g, co.phone || '')
      .replace(/\{\{company\.address\}\}/g, co.address || '[your business address]');
  }
  function addAsClient(item) {
    const d = details[item.placeId] || {};
    const s = store.state;
    if (item.customerId && store.customer(item.customerId)) { MT.app.go('customers'); return; }
    const parts = String(d.address || '').split(',');
    const c = {
      id: u.uid('c'), name: item.contact || item.label, company: item.label, phone: item.phone || d.phone || '', email: item.email || '',
      address: (parts[0] || '').trim(), city: parts.slice(1, 2).join('').trim(), source: 'Contractor partner', type: 'Commercial',
      notes: ['Contractor partner program (' + (u.num(P().rate) || 10) + '% contractor rate).', d.website ? 'Website: ' + d.website : '', item.notes].filter(Boolean).join(' '), createdAt: u.todayISO(),
    };
    s.customers.unshift(c);
    item.customerId = c.id;
    store.log('lead', 'New contractor partner client: ' + item.label, { customerId: c.id });
    store.save();
    ui.toast(item.label + ' added to Clients');
  }

  /* ================= Render ================= */
  view.render = function (root) {
    const p = P();
    if (!view.cat || !p.categories.some((c) => c.id === view.cat)) view.cat = p.categories[0].id;
    const count = p.list.length;
    root.innerHTML = `
      <div class="seo-head">
        <div class="seg" role="tablist">
          ${[['find', 'Find businesses'], ['campaign', 'Campaign' + (count ? ' <span class="seo-count">' + count + '</span>' : '')], ['offer', 'Offer & messages']].map(([id, l]) => `<button role="tab" data-tab="${id}" class="${view.tab === id ? 'on' : ''}" aria-selected="${view.tab === id}">${l}</button>`).join('')}
        </div>
        ${view.busy ? `<span class="seo-busy" role="status"><span class="spinner" aria-hidden="true"></span><span id="pf-busy">${u.esc(view.busy)}</span></span>` : ''}
      </div>
      <div id="pf-host" class="stack"></div>`;
    u.qsa('[data-tab]', root).forEach((b) => b.addEventListener('click', () => { view.tab = b.dataset.tab; view.render(root); }));
    const host = u.qs('#pf-host', root);
    if (view.tab === 'campaign') renderCampaign(host, root);
    else if (view.tab === 'offer') renderOffer(host, root);
    else renderFind(host, root);
  };

  /* ---------- Find ---------- */
  function renderFind(host, root) {
    const p = P(), key = googleKey();
    const cat = p.categories.find((c) => c.id === view.cat);
    const ids = results[cat.id] || [];
    const list = ids.map((id) => details[id]).filter(Boolean);
    const yard = store.state.settings.company.yardGeo;
    const topTowns = MT.seo ? MT.seo.state.settings.towns.filter((t) => t.top).map((t) => t.name) : [];
    host.innerHTML = `
      ${key ? '' : `<section class="panel seo-hero"><h2>Connect Google Maps first</h2>
        <p>Finding businesses uses the same Google API key as Google reviews. In the Google Cloud console, turn on <b>Places API (New)</b> and <b>Maps JavaScript API</b> and create a key (Google requires a billing account; a full search of every category normally stays inside Google's free monthly allowance). Then paste the key in Integrations.</p>
        <div class="btn-row"><a class="btn primary" href="#integrations">Open Integrations → Google reviews</a></div></section>`}
      <section class="panel">
        <div class="panel-head"><h3>What kind of business?</h3><span class="hint">Pick a category, then find the top 25 near you</span></div>
        <div class="chip-row">${p.categories.map((c) => { const n = p.list.filter((x) => x.category === c.id).length; return `<button class="chip ${c.id === view.cat ? 'on' : ''}" data-cat="${c.id}">${u.esc(c.name)}${n ? ' · ' + n : ''}</button>`; }).join('')}
          <button class="chip" id="pf-addcat">+ Add a category</button></div>
        <div class="pf-area">
          <label class="field inline"><span>Within</span><input class="input" type="number" min="5" max="31" id="pf-radius" value="${u.esc(p.radius)}"><span>miles of ${yard && !yard.sample ? 'your yard' : 'Mundelein'}</span></label>
          <span class="hint">${topTowns.length ? 'Also searches near ' + u.esc(topTowns.join(', ')) + '.' : ''} Google allows up to 31 miles.</span>
        </div>
        <div class="btn-row"><button class="btn primary" id="pf-find" ${key && !view.busy ? '' : 'disabled'}>${list.length ? 'Search again' : 'Find the top 25'} ${u.esc(cat.name.toLowerCase())}</button>
          ${list.length ? `<button class="btn ghost" id="pf-addall">Add all ${list.filter((d) => !saved(d.placeId)).length} new to campaign</button>` : ''}
          <span class="hint">Search words: "${u.esc(cat.query)}" <button class="link-btn" id="pf-editcat">Change</button></span></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h3>Top ${u.esc(cat.name.toLowerCase())}</h3><span class="hint">Ranked by rating, weighted by number of reviews</span></div>
        ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th class="num">#</th><th>Business</th><th>Rating</th><th class="num">Miles</th><th>Phone</th><th>Website</th><th></th></tr></thead><tbody>
          ${list.map((d, i) => { const s = saved(d.placeId); return `<tr>
            <td class="num">${i + 1}</td>
            <td><b>${u.esc(d.name)}</b><div class="row-sub">${u.esc(d.type || '')}${d.type && d.address ? ' · ' : ''}${u.esc(d.address.replace(/, USA$/, ''))}</div></td>
            <td class="nowrap">${d.rating ? '★ ' + d.rating.toFixed(1) + ' <span class="muted">(' + d.reviews + ')</span>' : '<span class="muted">No reviews</span>'}</td>
            <td class="num">${d.miles == null ? '—' : d.miles}</td>
            <td class="nowrap">${d.phone ? `<a href="tel:${u.esc(d.phone.replace(/[^\d+]/g, ''))}">${u.esc(d.phone)}</a>` : '<span class="muted">—</span>'}</td>
            <td>${d.website ? `<a href="${u.esc(d.website)}" target="_blank" rel="noopener">${u.esc(d.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''))}</a>` : '<span class="muted">—</span>'}${d.maps ? ` · <a href="${u.esc(d.maps)}" target="_blank" rel="noopener">Map</a>` : ''}</td>
            <td>${s ? ui.badge(S(s.status).name, S(s.status).kind) : `<button class="btn ghost sm" data-add="${u.esc(d.placeId)}">Add to campaign</button>`}</td></tr>`; }).join('')}
          </tbody></table></div><p class="hint">Business information from Google Maps. It's shown for this session only, so it's always current. Google doesn't list email addresses: find them on each website, or call.</p>`
        : ui.empty(key ? 'Select "Find the top 25" to search Google Maps.' : 'Connect your Google API key to search.')}
      </section>`;
    u.qsa('[data-cat]', host).forEach((b) => b.addEventListener('click', () => { view.cat = b.dataset.cat; view.render(root); }));
    u.qs('#pf-radius', host).addEventListener('change', (e) => { P().radius = Math.min(31, Math.max(5, u.num(e.target.value) || 25)); store.save(true); });
    u.qs('#pf-addcat', host).addEventListener('click', () => editCategory(null, root));
    u.qs('#pf-editcat', host).addEventListener('click', () => editCategory(cat, root));
    const find = u.qs('#pf-find', host);
    if (find) find.addEventListener('click', async () => {
      view.busy = 'Searching Google Maps…';
      view.render(root);
      try {
        const top = await findTop(cat, (i, n, q) => { const el = document.getElementById('pf-busy'); if (el) el.textContent = 'Searching "' + q + '" (' + i + ' of ' + n + ')…'; });
        ui.toast(top.length ? 'Found ' + top.length + ' ' + cat.name.toLowerCase() : 'No ' + cat.name.toLowerCase() + ' found. Try other search words or a larger radius.', top.length ? 'ok' : 'err');
      } catch (e) { ui.toast(e.message, 'err'); }
      view.busy = '';
      view.render(root);
    });
    u.qsa('[data-add]', host).forEach((b) => b.addEventListener('click', () => { if (addToCampaign(details[b.dataset.add], cat.id)) { store.save(true); ui.toast('Added to campaign'); view.render(root); } }));
    const all = u.qs('#pf-addall', host);
    if (all) all.addEventListener('click', () => { let n = 0; list.forEach((d) => { if (addToCampaign(d, cat.id)) n++; }); store.save(true); ui.toast(n + ' added to campaign'); view.render(root); });
  }

  function editCategory(cat, root) {
    ui.modal({
      title: cat ? 'Edit ' + cat.name : 'Add a category', size: 'sm',
      body: `<div class="form-grid one"><label class="field"><span>Category name</span><input class="input" id="ec-name" value="${u.esc(cat ? cat.name : '')}" placeholder="e.g. Roofers"></label>
        <label class="field"><span>Words to search Google Maps for</span><input class="input" id="ec-q" value="${u.esc(cat ? cat.query : '')}" placeholder="e.g. roofing contractor"><small>What a homeowner would type into Google Maps.</small></label></div>`,
      actions: [
        cat && !P().list.some((x) => x.category === cat.id) && P().categories.length > 1 ? { label: 'Remove', kind: 'danger-ghost', left: true, onClick: () => { P().categories = P().categories.filter((c) => c.id !== cat.id); delete results[cat.id]; saveCache(); store.save(true); view.render(root); } } : null,
        { label: 'Cancel' },
        { label: 'Save', kind: 'primary', onClick: (b) => {
          const name = u.qs('#ec-name', b).value.trim(), q = u.qs('#ec-q', b).value.trim();
          if (!name || !q) { ui.toast('Fill in both fields.', 'err'); return false; }
          if (cat) { if (cat.query !== q) delete results[cat.id]; cat.name = name; cat.query = q; }
          else { const c = { id: u.uid('cat'), name, query: q }; P().categories.push(c); view.cat = c.id; }
          saveCache(); store.save(true); view.render(root);
        } },
      ].filter(Boolean),
    });
  }

  /* ---------- Campaign ---------- */
  function renderCampaign(host, root) {
    const p = P();
    const items = p.list.filter((x) => (!view.fStatus || x.status === view.fStatus) && (!view.fCat || x.category === view.fCat));
    const catName = (id) => (p.categories.find((c) => c.id === id) || { name: 'Other' }).name;
    const today = u.todayISO();
    host.innerHTML = `
      <section class="panel"><div class="pf-stats">${STATUSES.map((s) => { const n = p.list.filter((x) => x.status === s.id).length; return `<button class="pf-stat ${view.fStatus === s.id ? 'on' : ''}" data-fs="${s.id}"><b>${n}</b><span>${s.name}</span></button>`; }).join('')}</div>
        <div class="toolbar" style="margin-top:12px"><select class="input" id="pf-fcat" aria-label="Category">${u.options(p.categories.map((c) => ({ value: c.id, label: c.name })), view.fCat, 'All categories')}</select>${view.fStatus ? '<button class="btn ghost sm" id="pf-clear">Show all statuses</button>' : ''}
          <span class="hint">${p.list.filter((x) => x.followUp && x.followUp <= today && !['partner', 'no'].includes(x.status)).length} follow-ups due</span></div></section>
      <section class="panel">${items.length ? `<div class="table-wrap"><table class="table pf-camp"><thead><tr><th>Business</th><th>Status</th><th>Follow up</th><th>Contact</th><th></th></tr></thead><tbody>
        ${items.map((x) => `<tr data-id="${x.id}" data-pid="${u.esc(x.placeId)}">
          <td><b>${u.esc(x.label)}</b><div class="row-sub">${u.esc(catName(x.category))} · <span class="pf-live">${liveLine(x)}</span></div>${x.notes ? `<div class="row-sub">📝 ${u.esc(x.notes.slice(0, 90))}</div>` : ''}</td>
          <td><select class="input sm" data-status aria-label="Status">${u.options(STATUSES.map((s) => ({ value: s.id, label: s.name })), x.status)}</select></td>
          <td><input class="input sm" type="date" data-follow value="${u.esc(x.followUp)}" aria-label="Follow up date">${x.followUp && x.followUp <= today && !['partner', 'no'].includes(x.status) ? '<div class="row-sub neg">Due</div>' : ''}${x.lastContact ? `<div class="row-sub">Last: ${u.esc(u.fmtShort(x.lastContact))}</div>` : ''}</td>
          <td>${x.contact ? u.esc(x.contact) + '<br>' : ''}${x.email ? `<span class="row-sub">${u.esc(x.email)}</span>` : '<span class="row-sub muted">No email yet</span>'}</td>
          <td class="pf-actions">
            <button class="btn ghost sm" data-act="call">Call</button><button class="btn ghost sm" data-act="email">Email</button><button class="btn ghost sm" data-act="text">Text</button>
            <button class="btn ghost sm" data-act="edit">Notes</button>
            ${x.customerId && store.customer(x.customerId) ? '<button class="btn ghost sm" data-act="client">Client ✓</button>' : '<button class="btn ghost sm" data-act="client">Add to clients</button>'}
          </td></tr>`).join('')}
      </tbody></table></div>` : ui.empty(p.list.length ? 'Nothing matches these filters.' : 'No businesses yet. Use "Find businesses" and add the ones you want to reach.')}</section>`;
    u.qsa('[data-fs]', host).forEach((b) => b.addEventListener('click', () => { view.fStatus = view.fStatus === b.dataset.fs ? '' : b.dataset.fs; view.render(root); }));
    u.qs('#pf-fcat', host).addEventListener('change', (e) => { view.fCat = e.target.value; view.render(root); });
    const cl = u.qs('#pf-clear', host); if (cl) cl.addEventListener('click', () => { view.fStatus = ''; view.render(root); });
    u.qsa('tr[data-id]', host).forEach((tr) => {
      const item = p.list.find((x) => x.id === tr.dataset.id);
      u.qs('[data-status]', tr).addEventListener('change', (e) => {
        item.status = e.target.value;
        if (item.status === 'contacted' && !item.lastContact) item.lastContact = today;
        store.save(true);
        if (item.status === 'partner' && !item.customerId) ui.confirm('Add ' + item.label + ' to Clients?', 'Partners become commercial clients, so you can send estimates and invoices at your contractor rate.', 'Add to clients', () => { addAsClient(item); view.render(root); });
        else view.render(root);
      });
      u.qs('[data-follow]', tr).addEventListener('change', (e) => { item.followUp = e.target.value; store.save(true); });
      u.qsa('[data-act]', tr).forEach((b) => b.addEventListener('click', () => action(b.dataset.act, item, root)));
    });
    refreshDetails(items.map((x) => x.placeId));
  }
  function liveLine(x) {
    const d = details[x.placeId];
    if (!d) return googleKey() ? 'Loading details…' : 'Connect Google to see phone and rating';
    if (d.missing) return 'No longer on Google Maps';
    return [d.rating ? '★ ' + d.rating.toFixed(1) + ' (' + d.reviews + ')' : '', d.phone || x.phone, d.miles != null ? d.miles + ' mi' : ''].filter(Boolean).map(u.esc).join(' · ');
  }
  function fillRows() {
    u.qsa('tr[data-pid]').forEach((tr) => {
      const item = P().list.find((x) => x.id === tr.dataset.id);
      const el = u.qs('.pf-live', tr);
      if (item && el) el.innerHTML = liveLine(item);
    });
  }
  function touch(item) { item.lastContact = u.todayISO(); if (item.status === 'new') item.status = 'contacted'; store.save(true); }
  function action(act, item, root) {
    const d = details[item.placeId] || {};
    const phone = item.phone || d.phone || '';
    if (act === 'call') {
      if (!phone) { ui.toast('No phone number yet. Add one in Notes.', 'err'); return; }
      touch(item); location.href = 'tel:' + phone.replace(/[^\d+]/g, ''); view.render(root);
    } else if (act === 'text') {
      if (!phone) { ui.toast('No phone number yet. Add one in Notes.', 'err'); return; }
      touch(item); location.href = 'sms:' + phone.replace(/[^\d+]/g, '') + '?&body=' + encodeURIComponent(merge(P().text, item)); view.render(root);
    } else if (act === 'email') {
      const body = merge(P().email, item), subject = merge(P().emailSubject, item);
      if (!item.email) {
        ui.modal({ title: 'Email ' + item.label, body: `<p class="hint">Google doesn't list email addresses. ${d.website ? 'Check <a href="' + u.esc(d.website) + '" target="_blank" rel="noopener">their website</a> for one, or c' : 'C'}all and ask who handles subcontractors.</p>
          <label class="field"><span>Email address</span><input class="input" type="email" id="em-addr" placeholder="name@company.com"></label>`, actions: [{ label: 'Copy message instead', onClick: () => { u.copyText(subject + '\n\n' + body).then(() => ui.toast('Message copied')); } }, { label: 'Save and email', kind: 'primary', onClick: (b) => { const v = u.qs('#em-addr', b).value.trim(); if (!/.+@.+\..+/.test(v)) { ui.toast('Enter a valid email.', 'err'); return false; } item.email = v; touch(item); location.href = 'mailto:' + v + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body); view.render(root); } }] });
        return;
      }
      touch(item); location.href = 'mailto:' + item.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body); view.render(root);
    } else if (act === 'client') {
      if (item.customerId && store.customer(item.customerId)) { MT.app.go('customers'); return; }
      addAsClient(item); view.render(root);
    } else if (act === 'edit') {
      ui.modal({
        title: item.label,
        body: `<div class="form-grid">
          <label class="field"><span>Contact person</span><input class="input" name="contact" value="${u.esc(item.contact)}" placeholder="Who handles subcontractors?"></label>
          <label class="field"><span>Email</span><input class="input" type="email" name="email" value="${u.esc(item.email)}"></label>
          <label class="field"><span>Direct phone</span><input class="input" name="phone" value="${u.esc(item.phone)}" placeholder="${u.esc(d.phone || '')}"></label>
          <label class="field"><span>Last contacted</span><input class="input" type="date" name="lastContact" value="${u.esc(item.lastContact)}"></label>
          <label class="field span-2"><span>Notes</span><textarea class="input" rows="4" name="notes">${u.esc(item.notes)}</textarea></label></div>
          ${d.address ? `<p class="hint">${u.esc(d.address)}${d.website ? ' · <a href="' + u.esc(d.website) + '" target="_blank" rel="noopener">Website</a>' : ''}${d.maps ? ' · <a href="' + u.esc(d.maps) + '" target="_blank" rel="noopener">Google Maps</a>' : ''}</p>` : ''}`,
        actions: [
          { label: 'Remove from campaign', kind: 'danger-ghost', left: true, onClick: () => ui.confirm('Remove ' + item.label + '?', 'It is removed from the campaign list. A client record you created for it is kept.', 'Remove', () => { P().list = P().list.filter((x) => x.id !== item.id); store.save(true); view.render(root); }) },
          { label: 'Cancel' },
          { label: 'Save', kind: 'primary', onClick: (b) => { Object.assign(item, u.formData(b)); store.save(true); view.render(root); } },
        ],
      });
    }
  }

  /* ---------- Offer & messages ---------- */
  function renderOffer(host, root) {
    const p = P(), co = store.state.settings.company;
    const example = p.list[0] || { label: 'Green Acres Landscaping', contact: 'Dana Smith' };
    host.innerHTML = `
      <section class="panel"><div class="panel-head"><h3>Your contractor offer</h3></div>
        <div class="form-grid">
          <label class="field"><span>Contractor discount (%)</span><input class="input" type="number" min="0" max="50" id="of-rate" value="${u.esc(p.rate)}"><small>Used as {{rate}} in messages.</small></label>
          <div class="field"><span>Before you send</span><small>${co.owner && co.owner !== 'Owner' ? '' : '<b class="neg">Add your name in Branding</b> so messages are signed. '}${co.address ? '' : '<b class="neg">Add your business address in Branding.</b> Marketing emails must include it (CAN-SPAM). '}${co.owner && co.owner !== 'Owner' && co.address ? 'Your name and address are set.' : ''}</small></div>
        </div></section>
      <section class="panel"><div class="panel-head"><h3>Email</h3><span class="hint">Merge fields: {{business}} {{contact}} {{rate}} {{owner}} {{company.name}} {{company.phone}} {{company.address}}</span></div>
        <label class="field"><span>Subject</span><input class="input" id="of-subj" value="${u.esc(p.emailSubject)}"></label>
        <label class="field" style="margin-top:10px"><span>Message</span><textarea class="input" rows="12" id="of-email">${u.esc(p.email)}</textarea></label>
        <p class="hint">Keep the "reply no thanks" line. Commercial emails must offer a way to opt out.</p></section>
      <section class="panel"><div class="panel-head"><h3>Text message</h3></div>
        <textarea class="input" rows="4" id="of-text">${u.esc(p.text)}</textarea></section>
      <section class="panel"><div class="panel-head"><h3>Preview</h3><span class="hint">For ${u.esc(example.label)}</span></div><pre class="code tall" id="of-prev"></pre></section>
      <div class="btn-row"><button class="btn primary" id="of-save">Save offer and messages</button></div>`;
    const prev = () => { u.qs('#of-prev', host).textContent = merge(u.qs('#of-subj', host).value, example) + '\n\n' + merge(u.qs('#of-email', host).value, example).replace(/\{\{rate\}\}/g, u.qs('#of-rate', host).value) + '\n\n— Text —\n' + merge(u.qs('#of-text', host).value, example); };
    ['#of-subj', '#of-email', '#of-text', '#of-rate'].forEach((s) => u.qs(s, host).addEventListener('input', prev));
    prev();
    u.qs('#of-save', host).addEventListener('click', () => {
      Object.assign(p, { rate: Math.max(0, Math.min(50, u.num(u.qs('#of-rate', host).value))), emailSubject: u.qs('#of-subj', host).value, email: u.qs('#of-email', host).value, text: u.qs('#of-text', host).value });
      store.save(true); ui.toast('Offer saved'); view.render(root);
    });
  }

  view.findTop = findTop; // used by tests
})();
