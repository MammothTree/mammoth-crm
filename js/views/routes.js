/* Mammoth CRM — Route planner: order a day's stops to save miles and fuel */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const ROAD_FACTOR = 1.25; // straight-line miles × this ≈ road miles, used when road data is unavailable

  const view = { title: 'Route planner', date: null, road: {}, busy: false, crew: null };

  /* ---------- geocoding (OpenStreetMap: Photon, then Nominatim) ---------- */
  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
  async function geocode(q) {
    try {
      const r = await withTimeout(fetch('https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(q)), 8000);
      const j = await r.json();
      const f = j.features && j.features[0];
      if (f) return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
    } catch (e) { /* try the next service */ }
    try {
      const r = await withTimeout(fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q)), 8000);
      const j = await r.json();
      if (j[0]) return { lat: +j[0].lat, lon: +j[0].lon };
    } catch (e) { /* give up */ }
    return null;
  }
  view.geocode = geocode;
  const addrOf = (c) => [c.address, c.city].filter(Boolean).join(', ');
  const needsGeo = (c) => c && addrOf(c) && (!c.geo || (!c.geo.sample && c.geo.q !== addrOf(c)));

  /* ---------- routing ---------- */
  function stopsFor(date) {
    const s = store.state;
    const oh = calc.overhead(s);
    return calc.dayItems(s, date).filter((x) => !view.crew || (x.crewIds || []).includes(view.crew)).map((x) => {
      const c = store.customer(x.customerId);
      let onsite = 0.5;
      if (x.kind === 'job') {
        const e = x.deal.estimateId && store.estimate(x.deal.estimateId);
        const crewHrs = e ? u.num(e.crewHours) : u.num(x.deal.value) / (oh.recommendedRateRounded || 235);
        onsite = Math.min(u.num(s.overhead.hoursPerDay) || 8, Math.max(1, crewHrs / (x.days || 1)));
      } else if (x.kind === 'visit') onsite = 0.75;
      return Object.assign({}, x, { c, geo: c && c.geo, address: c ? addrOf(c) : '', onsite });
    });
  }
  function matrix(points) {
    const key = points.map((p) => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(';');
    const road = view.road[key];
    const mph = u.num(store.state.settings.avgMph) || 28;
    return points.map((a, i) => points.map((b, j) => {
      if (i === j) return { mi: 0, min: 0 };
      if (road) return { mi: road.dist[i][j] / 1609.34, min: road.dur[i][j] / 60 };
      const mi = calc.milesBetween(a, b) * ROAD_FACTOR;
      return { mi, min: (mi / mph) * 60 };
    }));
  }
  async function fetchRoad(points) {
    const key = points.map((p) => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(';');
    if (view.road[key] || points.length < 2 || points.length > 25) return false;
    const coords = points.map((p) => p.lon.toFixed(5) + ',' + p.lat.toFixed(5)).join(';');
    try {
      const r = await withTimeout(fetch('https://router.project-osrm.org/table/v1/driving/' + coords + '?annotations=distance,duration'), 9000);
      const j = await r.json();
      if (j.code !== 'Ok' || !j.distances || j.distances.some((row) => row.some((v) => v == null))) return false;
      view.road[key] = { dist: j.distances, dur: j.durations };
      return true;
    } catch (e) { return false; }
  }
  /** Shortest round trip from the yard (index 0) through every stop. Exact for up to 8 stops. */
  function bestOrder(M, n) {
    const idx = Array.from({ length: n }, (_, i) => i + 1);
    const cost = (ord) => { let c = 0, prev = 0; ord.forEach((i) => { c += M[prev][i].mi; prev = i; }); return c + M[prev][0].mi; };
    if (n <= 8) {
      let best = idx.slice(), bestC = cost(best);
      const perm = (arr, l) => {
        if (l === arr.length) { const c = cost(arr); if (c < bestC) { bestC = c; best = arr.slice(); } return; }
        for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
      };
      perm(idx.slice(), 0);
      return best;
    }
    // nearest neighbour, then 2-opt
    const left = new Set(idx); let ord = [], cur = 0;
    while (left.size) { let bi = null, bd = Infinity; left.forEach((i) => { if (M[cur][i].mi < bd) { bd = M[cur][i].mi; bi = i; } }); ord.push(bi); left.delete(bi); cur = bi; }
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < ord.length - 1; i++) for (let k = i + 1; k < ord.length; k++) {
        const nw = ord.slice(0, i).concat(ord.slice(i, k + 1).reverse(), ord.slice(k + 1));
        if (cost(nw) + 1e-9 < cost(ord)) { ord = nw; improved = true; }
      }
    }
    return ord;
  }
  function tripStats(M, ord, stops, startHHMM) {
    let mi = 0, min = 0, prev = 0, clock = calc.mins(startHHMM || '07:00');
    const legs = ord.map((i) => {
      const leg = M[prev][i];
      mi += leg.mi; min += leg.min; clock += leg.min;
      const arrive = clock;
      clock += stops[i - 1].onsite * 60;
      prev = i;
      return { i, mi: leg.mi, min: leg.min, arrive };
    });
    const back = M[prev][0];
    mi += back.mi; min += back.min;
    return { legs, mi, min, back, home: clock + back.min };
  }

  const hhmm = (m) => { m = Math.round(m / 5) * 5; const h = Math.floor(m / 60) % 24; return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const fmtClock = (m) => { const t = hhmm(m); const [h, mm] = t.split(':').map(Number); return ((h + 11) % 12 + 1) + ':' + String(mm).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); };
  const fmtDur = (min) => (min >= 60 ? Math.floor(min / 60) + ' hr ' : '') + Math.round(min % 60) + ' min';

  view.render = function (root) {
    const s = store.state;
    if (!view.date) view.date = u.todayISO();
    // Default to the first person (owner first) who has stops that day: one truck, one route.
    if (view.crew === null || (view.crew && !s.crew.some((c) => c.id === view.crew))) {
      const items = calc.dayItems(s, view.date).filter((x) => x.customerId);
      const who = s.crew.find((c) => c.active !== false && items.some((x) => (x.crewIds || []).includes(c.id)));
      view.crew = who ? who.id : '';
    }
    const single = !!view.crew;
    const set = s.settings;
    const yard = set.company.yardGeo;
    const stops = stopsFor(view.date);
    const located = stops.filter((x) => x.geo);
    const missing = stops.filter((x) => !x.geo);
    const fuel = u.num(set.fuelPrice), mpg = u.num(set.truckMpg) || 9;

    let plan = null;
    if (yard && located.length) {
      const pts = [yard].concat(located.map((x) => x.geo));
      const M = matrix(pts);
      const current = located.map((_, i) => i + 1);
      const best = bestOrder(M, located.length);
      const start = located.reduce((m, x) => (x.start && x.start < m ? x.start : m), '23:59');
      const t0 = start === '23:59' ? '07:00' : hhmm(calc.mins(start) - 20);
      plan = { pts, M, cur: tripStats(M, current, located, t0), best: tripStats(M, best, located, t0), t0, road: !!view.road[pts.map((p) => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(';')] };
    }
    // Nearby jobs on other days that would add the fewest miles here
    let nearby = [];
    if (plan) {
      const route = [0].concat(plan.best.legs.map((l) => l.i), [0]);
      nearby = s.deals.filter((d) => d.stage === 'won' && (!d.scheduledDate || (d.scheduledDate > u.todayISO() && d.scheduledDate !== view.date && u.daysBetween(u.todayISO(), d.scheduledDate) <= 21)) && !stops.some((x) => x.id === d.id))
        .map((d) => {
          const c = store.customer(d.customerId);
          if (!c || !c.geo) return null;
          let add = Infinity;
          for (let k = 0; k < route.length - 1; k++) {
            const a = plan.pts[route[k]], b = plan.pts[route[k + 1]];
            const extra = (calc.milesBetween(a, c.geo) + calc.milesBetween(c.geo, b) - calc.milesBetween(a, b)) * ROAD_FACTOR;
            if (extra < add) add = extra;
          }
          const own = calc.milesBetween(yard, c.geo) * 2 * ROAD_FACTOR;
          return { d, c, add, saves: own - add };
        }).filter(Boolean).sort((a, b) => a.add - b.add).slice(0, 5);
    }
    const saved = plan ? plan.cur.mi - plan.best.mi : 0;
    const sample = located.some((x) => x.geo.sample) || (yard && yard.sample);

    root.innerHTML = `
      <div class="toolbar">
        <div class="week-nav">
          <button class="icon-btn" id="rt-prev" aria-label="Previous day">&#8249;</button>
          <input class="input" type="date" id="rt-date" value="${view.date}" aria-label="Day">
          <button class="icon-btn" id="rt-next" aria-label="Next day">&#8250;</button>
          ${view.date !== u.todayISO() ? '<button class="btn ghost sm" id="rt-today">Today</button>' : ''}
        </div>
        <select class="input" id="rt-crew" aria-label="Whose route">${u.options(s.crew.filter((c) => c.active !== false && c.role !== 'Office').map((c) => ({ value: c.id, label: c.name + "'s route" })), view.crew, 'Everyone\'s stops')}</select>
        <span class="spacer"></span>
        <label class="field inline"><span>Fuel $/gal</span><input class="input" type="number" min="0" step="0.01" id="rt-fuel" value="${u.esc(set.fuelPrice)}"></label>
        <label class="field inline"><span>Truck MPG</span><input class="input" type="number" min="1" step="0.5" id="rt-mpg" value="${u.esc(set.truckMpg)}"></label>
      </div>
      ${!yard ? `<div class="notice"><span>Set your yard or shop address so routes start and end there.</span><a class="btn primary sm" href="#branding">Add your address</a></div>` : ''}
      ${missing.length ? `<div class="notice"><span>${missing.length} ${missing.length === 1 ? 'stop needs' : 'stops need'} a map location: ${missing.map((x) => u.esc(x.c ? x.c.name : x.title)).join(', ')}.</span><button class="btn primary sm" id="rt-locate" ${view.busy ? 'disabled' : ''}>${view.busy ? 'Locating…' : 'Find on the map'}</button></div>` : ''}
      ${!stops.length ? `<section class="panel">${ui.empty('Nothing with an address is on the calendar for ' + u.fmtDate(view.date, { weekday: 'long', month: 'long', day: 'numeric' }) + '. Schedule jobs or estimate visits in the Calendar, then plan the route here.')}</section>` : ''}
      ${plan ? `
      <section class="kpis">
        <article class="kpi"><h3 class="kpi-label">Best route</h3><div class="kpi-value">${Math.round(plan.best.mi)} mi</div><div class="kpi-sub">${fmtDur(plan.best.min)} driving, ${located.length} ${located.length === 1 ? 'stop' : 'stops'}</div></article>
        <article class="kpi"><h3 class="kpi-label">Fuel</h3><div class="kpi-value">${u.money(plan.best.mi / mpg * fuel, true)}</div><div class="kpi-sub">${(plan.best.mi / mpg).toFixed(1)} gal at ${mpg} mpg</div></article>
        <article class="kpi"><h3 class="kpi-label">Saved vs. calendar order</h3><div class="kpi-value ${saved > 0.5 ? 'good-text' : ''}">${saved > 0.5 ? Math.round(saved) + ' mi' : '0 mi'}</div><div class="kpi-sub">${saved > 0.5 ? u.money(saved / mpg * fuel, true) + ' fuel and ' + fmtDur(plan.cur.min - plan.best.min) + ' of driving' : 'Your calendar order is already the shortest'}</div></article>
        ${single ? `<article class="kpi"><h3 class="kpi-label">Back at the yard</h3><div class="kpi-value">${fmtClock(plan.best.home)}</div><div class="kpi-sub">Leaving ${fmtClock(calc.mins(plan.t0))}, including time on site</div></article>` : `<article class="kpi"><h3 class="kpi-label">Stops</h3><div class="kpi-value">${located.length}</div><div class="kpi-sub">All crews combined. Pick a person to see their day's timing.</div></article>`}
      </section>
      <section class="panel map-panel">
        <div class="panel-head"><h3>Map</h3>
          <div class="legend"><span><i class="sw route-best"></i>Best route</span><span><i class="sw route-cur"></i>Calendar order</span><span><i class="sw maybe"></i>Jobs you could add</span>
          <label class="check"><input type="checkbox" id="rt-maybe" ${view.showMaybe !== false ? 'checked' : ''}><span>Show possible jobs</span></label></div></div>
        <div id="rt-map" class="rt-map"></div>
        <p class="hint" id="rt-map-note">${sample ? 'Demo stops use sample locations around a sample yard. Your real addresses appear in their true spots. ' : ''}Tap a numbered stop for directions, or a + dot to move that job onto this day.</p>
      </section>
      <div class="route-layout">
        <section class="panel">
          <div class="panel-head"><h3>Stops in the best order</h3><span class="hint">${plan.road ? 'Road distances from OpenStreetMap' : 'Estimated from straight-line distance'}</span></div>
          <ol class="route-list">
            <li class="rl-yard"><span class="rl-n">Y</span><div class="grow"><b>Leave the yard</b><div class="row-sub">${u.esc(set.company.yardAddress || 'Yard')}</div></div><span class="rl-time">${single ? fmtClock(calc.mins(plan.t0)) : ''}</span></li>
            ${plan.best.legs.map((l, n) => { const x = located[l.i - 1]; return `<li class="k-${x.kind}"><span class="rl-n">${n + 1}</span><div class="grow"><b>${u.esc(x.title)}</b><div class="row-sub">${u.esc(x.c ? x.c.name + ', ' + x.address : '')}</div><div class="rl-leg">${l.mi.toFixed(1)} mi, ${fmtDur(l.min)} drive, about ${x.onsite.toFixed(1)} hrs on site${x.start ? ', scheduled ' + fmtClock(calc.mins(x.start)) : ''}</div></div><span class="rl-time">${single ? fmtClock(l.arrive) : ''}</span></li>`; }).join('')}
            <li class="rl-yard"><span class="rl-n">Y</span><div class="grow"><b>Back to the yard</b><div class="rl-leg">${plan.best.back.mi.toFixed(1)} mi</div></div><span class="rl-time">${single ? fmtClock(plan.best.home) : ''}</span></li>
          </ol>
          <div class="btn-row">
            ${single ? '<button class="btn primary" id="rt-apply">Set start times to this order</button>' : ''}
            ${sample ? '<span class="hint">Sample addresses can\'t open in Google Maps.</span>' : '<a class="btn ghost" id="rt-gmaps" target="_blank" rel="noopener">Open in Google Maps</a>'}
            ${!plan.road ? '<button class="btn ghost" id="rt-road">Get road distances</button>' : ''}
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Jobs you could add to this day</h3></div>
          <p class="hint">Unscheduled or upcoming jobs near this route, fewest extra miles first.</p>
          ${nearby.length ? '<ul class="list maybe-list">' + nearby.map((x, i) => `<li class="list-row"><span class="mk-mini">${String.fromCharCode(65 + i)}</span><div class="grow"><div class="row-title">${u.esc(x.d.title)}</div>
            <div class="row-sub">${u.esc(x.c.name)}, ${u.money(x.d.value)}, ${x.d.scheduledDate ? 'now ' + u.fmtDate(x.d.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric' }) : 'not scheduled'}</div>
            <div class="rl-leg">+${x.add.toFixed(1)} mi here${x.saves > 0 ? ', saves ' + x.saves.toFixed(1) + ' mi (' + u.money(x.saves / mpg * fuel, true) + ') vs. its own trip' : ''}</div></div>
            <button class="btn ghost sm" data-move="${x.d.id}">Move here</button></li>`).join('') + '</ul>' : '<p class="hint">No other jobs nearby.</p>'}
        </section>
      </div>` : ''}`;

    // map
    if (plan) drawMap(u.qs('#rt-map', root), plan, located, view.showMaybe !== false ? nearby : [], single);

    const go = (n) => { view.date = u.addDays(view.date, n); view.render(root); };
    u.qs('#rt-prev', root).addEventListener('click', () => go(-1));
    u.qs('#rt-next', root).addEventListener('click', () => go(1));
    const td = u.qs('#rt-today', root); if (td) td.addEventListener('click', () => { view.date = u.todayISO(); view.render(root); });
    u.qs('#rt-crew', root).addEventListener('change', (e) => { view.crew = e.target.value; view.render(root); });
    u.qs('#rt-date', root).addEventListener('change', () => { view.crew = null; });
    u.qs('#rt-date', root).addEventListener('change', (e) => { if (e.target.value) { view.date = e.target.value; view.render(root); } });
    const saveSetting = (k) => (e) => { set[k] = u.num(e.target.value); store.save(true); };
    u.qs('#rt-fuel', root).addEventListener('change', (e) => { saveSetting('fuelPrice')(e); view.render(root); });
    u.qs('#rt-mpg', root).addEventListener('change', (e) => { saveSetting('truckMpg')(e); view.render(root); });
    const loc = u.qs('#rt-locate', root);
    if (loc) loc.addEventListener('click', async () => {
      view.busy = true; view.render(root);
      let ok = 0, fail = [];
      for (const x of missing) {
        if (!x.c || !addrOf(x.c)) { fail.push(x.title); continue; }
        const g = await geocode(addrOf(x.c));
        if (g) { x.c.geo = Object.assign(g, { q: addrOf(x.c) }); ok++; } else fail.push(x.c.name);
        await new Promise((r) => setTimeout(r, 1100)); // be polite to the free map service
      }
      view.busy = false;
      store.save(true);
      view.render(root);
      if (ok) ui.toast('Found ' + ok + ' on the map');
      if (fail.length) ui.toast('Could not find: ' + fail.join(', ') + '. Check the address, or try when online.', 'err');
    });
    const rd = u.qs('#rt-road', root);
    if (rd) rd.addEventListener('click', async () => {
      rd.disabled = true; rd.textContent = 'Getting road distances…';
      const ok = await fetchRoad(plan.pts);
      if (ok) view.render(root); else { rd.disabled = false; rd.textContent = 'Get road distances'; ui.toast('Road data is unavailable right now (offline or the service is busy). Using estimates.', 'err'); }
    });
    const ap = u.qs('#rt-apply', root);
    if (ap) ap.addEventListener('click', () => {
      plan.best.legs.forEach((l) => {
        const x = located[l.i - 1];
        const t = hhmm(Math.round(l.arrive / 15) * 15);
        if (x.kind === 'job' && x.dayN === 1) x.deal.startTime = t;
        else if (x.event) x.event.start = t;
      });
      store.save();
      ui.toast('Start times updated to match the route');
    });
    const gm = u.qs('#rt-gmaps', root);
    if (gm) {
      const ys = set.company.yardAddress || (yard.lat + ',' + yard.lon);
      const way = plan.best.legs.map((l) => located[l.i - 1]).map((x) => x.address || (x.geo.lat + ',' + x.geo.lon));
      gm.href = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(ys) + '&destination=' + encodeURIComponent(ys) + '&waypoints=' + encodeURIComponent(way.join('|'));
    }
    // "Move here" buttons live in the list and inside map pop-ups, so listen on the page.
    root.onclick = (e) => {
      const b = e.target.closest('[data-move]');
      if (!b) return;
      const d = store.deal(b.dataset.move);
      if (!d) return;
      d.scheduledDate = view.date;
      if (!d.startTime) d.startTime = '07:30';
      if (view.crew && !(d.crewIds || []).includes(view.crew)) d.crewIds = (d.crewIds || []).concat([view.crew]);
      store.log('schedule', 'Moved "' + d.title + '" to ' + u.fmtDate(view.date) + ' to save driving', { customerId: d.customerId, dealId: d.id });
      store.save();
      ui.toast('Moved to this day');
    };
    const mb = u.qs('#rt-maybe', root);
    if (mb) mb.addEventListener('change', () => { view.showMaybe = mb.checked; view.render(root); });
    // Try real road distances automatically when online.
    if (plan && !plan.road && navigator.onLine !== false && !view.triedRoad) {
      view.triedRoad = true;
      fetchRoad(plan.pts).then((ok) => { view.triedRoad = false; if (ok && MT.app.route === 'routes') view.render(root); });
    }
  };

  /* ---------- street map (Leaflet + OpenStreetMap), with a drawn fallback when offline ---------- */
  let leafletP = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise((res, rej) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      sc.onload = () => res(window.L);
      sc.onerror = () => { leafletP = null; rej(new Error('Map library unavailable')); };
      document.head.appendChild(sc);
    });
    return leafletP;
  }
  view.geom = {};
  async function roadGeometry(points) {
    const key = points.map((p) => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(';');
    if (view.geom[key]) return view.geom[key];
    try {
      const coords = points.map((p) => p.lon.toFixed(5) + ',' + p.lat.toFixed(5)).join(';');
      const r = await withTimeout(fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson'), 9000);
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes || !j.routes[0]) return null;
      view.geom[key] = j.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
      return view.geom[key];
    } catch (e) { return null; }
  }

  function drawMap(host, plan, located, maybe, single) {
    if (view.map) { try { view.map.remove(); } catch (e) { /* already gone */ } view.map = null; }
    host.innerHTML = '<div class="map-loading">Loading map…</div>';
    if (navigator.onLine === false) { drawSvg(host, plan, located); return; }
    withTimeout(loadLeaflet(), 8000).then((L) => {
      if (!host.isConnected) return;
      host.innerHTML = '';
      const css = getComputedStyle(document.documentElement);
      const primary = css.getPropertyValue('--canopy').trim() || '#24563a';
      const map = L.map(host, { scrollWheelZoom: false, tap: true });
      view.map = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);
      const ll = (p) => [p.lat, p.lon];
      const all = [];
      const curOrd = [0].concat(plan.cur.legs.map((l) => l.i), [0]);
      const bestOrd = [0].concat(plan.best.legs.map((l) => l.i), [0]);
      L.polyline(curOrd.map((i) => ll(plan.pts[i])), { color: '#7b8377', weight: 2, dashArray: '6 7', opacity: 0.8 }).addTo(map);
      const bestLine = L.polyline(bestOrd.map((i) => ll(plan.pts[i])), { color: primary, weight: 5, opacity: 0.9 }).addTo(map);
      roadGeometry(bestOrd.map((i) => plan.pts[i])).then((g) => { if (g && view.map === map) bestLine.setLatLngs(g); });
      const icon = (cls, text) => L.divIcon({ className: 'mk-wrap', html: `<span class="mk ${cls}">${u.esc(text)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const yard = plan.pts[0];
      L.marker(ll(yard), { icon: icon('mk-yard', 'Y'), zIndexOffset: 500 }).addTo(map)
        .bindTooltip('Yard', { permanent: true, direction: 'right', offset: [14, 0], className: 'mk-label' });
      all.push(ll(yard));
      plan.best.legs.forEach((l, n) => {
        const x = located[l.i - 1];
        const p = ll(plan.pts[l.i]); all.push(p);
        const name = x.c ? x.c.name : x.title;
        const dest = x.geo.sample ? '' : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(x.address || p.join(','));
        L.marker(p, { icon: icon('k-' + x.kind, n + 1), zIndexOffset: 1000 - n }).addTo(map)
          .bindTooltip(`${n + 1}. ${u.esc(name)}${single ? ', ' + fmtClock(l.arrive) : ''}`, { permanent: true, direction: 'right', offset: [14, 0], className: 'mk-label' })
          .bindPopup(`<b>${n + 1}. ${u.esc(x.title)}</b><br>${u.esc(name)}<br>${u.esc(x.address)}${x.start ? '<br>Scheduled ' + fmtClock(calc.mins(x.start)) : ''}${dest ? `<br><a href="${dest}" target="_blank" rel="noopener">Directions</a>` : ''}`);
      });
      maybe.forEach((x, i) => {
        const p = ll(x.c.geo); all.push(p);
        L.marker(p, { icon: icon('mk-maybe', String.fromCharCode(65 + i)) }).addTo(map)
          .bindTooltip(`${String.fromCharCode(65 + i)}. ${u.esc(x.c.name)} (+${x.add.toFixed(1)} mi)`, { permanent: true, direction: 'right', offset: [14, 0], className: 'mk-label mk-label-maybe' })
          .bindPopup(`<b>${u.esc(x.d.title)}</b><br>${u.esc(x.c.name)}, ${u.money(x.d.value)}<br>${x.d.scheduledDate ? 'Now ' + u.fmtDate(x.d.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Not scheduled'}<br>Adds ${x.add.toFixed(1)} mi to this route<br><button class="btn primary sm" data-move="${x.d.id}">Move to this day</button>`);
      });
      map.fitBounds(all, { padding: [50, 50], maxZoom: 15 });
      setTimeout(() => { if (view.map === map) map.invalidateSize(); }, 200);
    }).catch(() => { if (host.isConnected) drawSvg(host, plan, located); });
  }

  function drawSvg(host, plan, located) {
    const W = Math.max(280, host.clientWidth || 480), H = Math.round(W * 0.72), pad = 26;
    const lats = plan.pts.map((p) => p.lat), lons = plan.pts.map((p) => p.lon);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const kx = Math.cos(midLat * Math.PI / 180);
    const minX = Math.min(...lons) * kx, maxX = Math.max(...lons) * kx, minY = Math.min(...lats), maxY = Math.max(...lats);
    const sc = Math.min((W - pad * 2) / Math.max(1e-6, maxX - minX), (H - pad * 2) / Math.max(1e-6, maxY - minY));
    const ox = (W - (maxX - minX) * sc) / 2, oy = (H - (maxY - minY) * sc) / 2;
    const P = (p) => [ox + (p.lon * kx - minX) * sc, H - (oy + (p.lat - minY) * sc)];
    const path = (ord) => [0].concat(ord, [0]).map((i, n) => (n ? 'L' : 'M') + P(plan.pts[i]).map((v) => v.toFixed(1)).join(',')).join('');
    const bestOrd = plan.best.legs.map((l) => l.i), curOrd = plan.cur.legs.map((l) => l.i);
    const y = P(plan.pts[0]);
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="route-map" role="img" aria-label="Map of the day's stops">
      <path d="${path(curOrd)}" class="rm-cur"/>
      <path d="${path(bestOrd)}" class="rm-best"/>
      <rect x="${y[0] - 9}" y="${y[1] - 9}" width="18" height="18" rx="4" class="rm-yard"/><text x="${y[0]}" y="${y[1] + 4}" text-anchor="middle" class="rm-yard-t">Y</text>
      ${bestOrd.map((i, n) => { const p = P(plan.pts[i]); const x = located[i - 1]; return `<g class="rm-stop k-${x.kind}"><circle cx="${p[0]}" cy="${p[1]}" r="11"/><text x="${p[0]}" y="${p[1] + 4}" text-anchor="middle">${n + 1}</text><title>${u.esc(x.title)}</title></g>`; }).join('')}
    </svg><p class="hint">The street map needs an internet connection, so this is a simple drawing with positions to scale.</p>`;
  }

  MT.views.routes = view;
})();
