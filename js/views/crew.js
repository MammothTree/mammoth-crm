/* Mammoth CRM — Crew view: a simple phone screen for the crew's day (jobs, directions, clock in/out, photos) */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const KEY = 'mammothcrm.crew.v1';

  const local = {
    get() { try { return Object.assign({ me: '', sheet: null, entries: [], locked: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { me: '', sheet: null, entries: [], locked: false }; } },
    set(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { ui.toast('This phone could not save. Storage may be full.', 'err'); } },
  };
  MT.crewLocal = local;

  const view = { title: 'My day', date: null };
  const fmtTime = (hhmm) => { if (!hhmm) return ''; const [h, m] = hhmm.split(':').map(Number); return ((h + 11) % 12 + 1) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); };
  const fmtH = (h) => { const m = Math.round(h * 60); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
  const directions = (addr) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr);
  let ticker = null;

  view.render = function (root) {
    const L = local.get();
    const p = MT.app.params;
    if (p.sheet) {
      try {
        const sh = MT.crewlink.readSheet(p.sheet);
        if (!L.sheet || L.sheet.id !== sh.id) { L.sheet = sh; L.me = sh.c; }
        local.set(L);
        history.replaceState(null, '', location.href.split('#')[0] + '#crew');
        ui.toast('Your day from ' + sh.co.n + ' is loaded on this phone');
      } catch (e) { ui.toast(e.message, 'err'); }
      MT.app.params = {};
    }
    const sheetMode = !!L.sheet;
    return sheetMode ? renderSheet(root, L) : renderLocal(root, L);
  };

  /* ----- Day sheet sent from the office (works on any phone, no shared database needed) ----- */
  function renderSheet(root, L) {
    const sh = L.sheet;
    const today = u.todayISO();
    const mine = L.entries.filter((e) => e.sheet === sh.id);
    const open = mine.find((e) => !e.e);
    const total = u.sum(mine, (e) => calc.entryHours({ date: e.d, start: e.s, end: e.e, breakMin: e.b }));
    root.innerHTML = `
      <section class="crew-hero">
        <div class="crew-who"><span class="crew-date">${u.esc(u.fmtDate(sh.d, { weekday: 'long', month: 'long', day: 'numeric' }))}</span><h2>${u.esc(sh.n || 'Your')}'s day</h2>
        <p class="hint">Sent by ${u.esc(sh.co.n)}${sh.d !== today ? '. <b>This sheet is for ' + u.esc(u.fmtDate(sh.d)) + ', not today.</b>' : ''}</p></div>
        <div class="crew-status ${open ? 'on' : ''}">${open ? `<b>On the clock</b><span>Since ${fmtTime(open.s)}, <span data-elapsed>${fmtH(calc.entryHours({ date: open.d, start: open.s, end: '', breakMin: 0 }))}</span></span>` : `<b>Off the clock</b><span>${total ? fmtH(total) + ' recorded' : 'Tap Clock in at your first stop'}</span>`}</div>
      </section>
      ${sh.j.length ? sh.j.map((j, i) => jobCard({ key: j.i + '|' + i, title: j.t, kind: j.k, start: j.s, client: j.cn, address: j.a, phone: j.p, notes: j.no, dayN: j.dn, days: j.dd, open: open && open.key === j.i + '|' + i })).join('') : `<section class="panel">${ui.empty('No stops on this day sheet.')}</section>`}
      <section class="panel crew-actions">
        <button class="btn primary big" id="cr-send" ${mine.length ? '' : 'disabled'}>Send my hours to the office</button>
        <p class="hint">${mine.length ? mine.length + ' time ' + (mine.length === 1 ? 'entry' : 'entries') + ' on this phone.' : 'Your hours appear here after you clock in.'} Sending opens a text message with a code the office pastes into Time tracking.</p>
        <button class="btn ghost" id="cr-clear">Remove this day sheet</button>
      </section>`;

    bindCards(root, (key, j) => {
      const L2 = local.get();
      const op = L2.entries.find((e) => e.sheet === sh.id && !e.e);
      if (op) { op.e = calc.nowHHMM(); }
      if (!op || op.key !== key) {
        const jj = sh.j[+key.split('|')[1]];
        L2.entries.push({ id: u.uid('e').slice(2), sheet: sh.id, key, j: jj.i, d: u.todayISO(), s: calc.nowHHMM(), e: '', b: 0 });
      }
      local.set(L2);
      ui.toast(op && op.key === key ? 'Clocked out' : 'Clocked in');
      view.render(root);
    });
    tick(root, () => { const o = local.get().entries.find((e) => e.sheet === sh.id && !e.e); return o ? calc.entryHours({ date: o.d, start: o.s, end: '', breakMin: 0 }) : 0; });
    u.qs('#cr-send', root).addEventListener('click', () => sendHours(root, sh));
    u.qs('#cr-clear', root).addEventListener('click', () => ui.confirm('Remove this day sheet?', 'Send your hours first. Hours that were not sent will be lost.', 'Remove', () => {
      const L2 = local.get(); L2.sheet = null; L2.entries = L2.entries.filter((e) => e.sheet !== sh.id); local.set(L2); view.render(root);
    }));
  }

  function sendHours(root, sh) {
    const L = local.get();
    const mine = L.entries.filter((e) => e.sheet === sh.id);
    const open = mine.find((e) => !e.e);
    ui.modal({
      title: 'Send my hours', size: 'sm',
      body: `${open ? '<p class="notice"><span>You are still on the clock. Clock out first if you are done for the day.</span></p>' : ''}
        <label class="field"><span>Unpaid break today (minutes)</span><input class="input" type="number" min="0" step="5" id="sh-break" value="${mine.length && mine[mine.length - 1].b ? mine[mine.length - 1].b : 30}"></label>`,
      actions: [{ label: 'Cancel' }, { label: 'Create message', kind: 'primary', onClick: (b) => {
        const brk = u.num(u.qs('#sh-break', b).value);
        const entries = L.entries.filter((e) => e.sheet === sh.id).map((e, i, arr) => ({ id: e.id, j: e.j, d: e.d, s: e.s, e: e.e, b: i === arr.length - 1 ? brk : 0 }));
        const L2 = local.get(); L2.entries.forEach((e) => { if (e.sheet === sh.id && e.id === entries[entries.length - 1].id) e.b = brk; }); local.set(L2);
        const hrs = u.sum(entries, (e) => calc.entryHours({ date: e.d, start: e.s, end: e.e, breakMin: e.b }));
        const code = MT.crewlink.hoursCode(sh, entries, sh.n);
        const msg = `${sh.n} hours for ${u.fmtDate(sh.d)}: ${fmtH(hrs)}.\n${code}`;
        setTimeout(() => ui.modal({
          title: 'Send this to the office', size: 'sm',
          body: `<div class="preview"><div class="prev-body">${u.esc(msg)}</div></div>`,
          actions: [
            { label: 'Copy', kind: 'ghost', keepOpen: true, onClick: () => { u.copyText(msg).then(() => ui.toast('Copied')); } },
            { label: 'Text it', kind: 'primary', keepOpen: true, onClick: () => { window.location.href = 'sms:' + String(sh.co.p || '').replace(/[^\d+]/g, '') + '?&body=' + encodeURIComponent(msg); } },
          ],
        }), 0);
      } }],
    });
  }

  /* ----- This device has the CRM data (owner's phone, office tablet, or once shared sync exists) ----- */
  function renderLocal(root, L) {
    const s = store.state;
    if (!view.date) view.date = u.todayISO();
    const crew = s.crew.filter((c) => c.active !== false);
    const me = crew.find((c) => c.id === L.me);
    if (!me) {
      root.innerHTML = `<section class="crew-hero"><div class="crew-who"><h2>Who's using this phone?</h2><p class="hint">Pick your name to see your jobs for the day.</p></div></section>
        <div class="crew-pick-me">${crew.map((c) => `<button class="crew-me" data-me="${c.id}"><span class="avatar" style="background:${u.esc(c.color || '#888')};color:#fff">${u.esc(u.initials(c.name))}</span><span><b>${u.esc(c.name)}</b><small>${u.esc(c.role)}</small></span></button>`).join('') || ui.empty('No crew yet. Add your crew in Settings.')}</div>`;
      u.qsa('[data-me]', root).forEach((b) => b.addEventListener('click', () => { const L2 = local.get(); L2.me = b.dataset.me; local.set(L2); view.render(root); }));
      return;
    }
    const items = calc.dayItems(s, view.date).filter((x) => (x.crewIds || []).includes(me.id));
    const open = s.timeEntries.find((e) => e.crewId === me.id && !e.end && e.date === u.todayISO());
    const todayH = u.sum(s.timeEntries.filter((e) => e.crewId === me.id && e.date === view.date), calc.entryHours);
    root.innerHTML = `
      <section class="crew-hero">
        <div class="crew-who"><div class="crew-nav"><button class="icon-btn" id="cd-prev" aria-label="Previous day">&#8249;</button><span class="crew-date">${u.esc(u.fmtDate(view.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</span><button class="icon-btn" id="cd-next" aria-label="Next day">&#8250;</button></div>
          <h2>${u.esc(me.name.split(' ')[0])}'s day</h2><button class="link-btn" id="cd-switch">Not ${u.esc(me.name.split(' ')[0])}? Switch</button></div>
        <div class="crew-status ${open ? 'on' : ''}">${open ? `<b>On the clock</b><span>Since ${fmtTime(open.start)}, <span data-elapsed>${fmtH(calc.entryHours(open))}</span></span>` : `<b>Off the clock</b><span>${todayH ? fmtH(todayH) + ' recorded' : 'Tap Clock in at your first stop'}</span>`}</div>
      </section>
      ${items.length ? items.map((x) => {
        const c = store.customer(x.customerId) || {};
        const dealId = x.kind === 'job' ? x.id : (x.event && x.event.dealId) || '';
        return jobCard({ key: x.kind + '|' + x.id, title: x.title, kind: x.kind, start: x.start, client: c.name, address: [c.address, c.city].filter(Boolean).join(', '), phone: c.phone, notes: [c.notes, x.kind === 'job' ? x.deal.notes : x.event && x.event.notes].filter(Boolean).join(' / '), dayN: x.dayN, days: x.days, open: open && ((dealId && open.dealId === dealId) || (!dealId && open.note === x.id)), photos: dealId && x.kind === 'job' ? dealId : '' });
      }).join('') : `<section class="panel">${ui.empty('Nothing scheduled for you on this day.')}</section>`}
      ${view.date === u.todayISO() ? `<section class="panel crew-actions"><button class="btn ghost" id="cd-shop">${open && !open.dealId ? 'Clock out of shop time' : 'Clock in for shop or travel time'}</button><p class="hint">Your hours go straight into Time tracking.</p></section>` : ''}`;

    bindCards(root, (key) => {
      if (view.date !== u.todayISO()) { ui.toast('You can only clock in for today.', 'err'); return; }
      const [kind, id] = key.split('|');
      const x = items.find((y) => y.kind === kind && y.id === id);
      const dealId = x.kind === 'job' ? x.id : (x.event && x.event.dealId) || '';
      const op = s.timeEntries.find((e) => e.crewId === me.id && !e.end && e.date === u.todayISO());
      const same = op && ((dealId && op.dealId === dealId) || (!dealId && op.note === x.id));
      if (op) { op.end = calc.nowHHMM(); if (calc.entryHours(op) > 6 && !op.breakMin) op.breakMin = 30; }
      if (!same) s.timeEntries.push({ id: u.uid('te'), crewId: me.id, dealId, kind: dealId ? 'job' : 'office', date: u.todayISO(), start: calc.nowHHMM(), end: '', breakMin: 0, note: dealId ? '' : x.id });
      store.log('time', me.name + (same ? ' clocked out of "' : ' clocked in on "') + x.title + '" from the crew view', { dealId });
      store.save();
      ui.toast(same ? 'Clocked out' : 'Clocked in');
    });
    tick(root, () => { const o = s.timeEntries.find((e) => e.crewId === me.id && !e.end && e.date === u.todayISO()); return o ? calc.entryHours(o) : 0; });
    u.qs('#cd-prev', root).addEventListener('click', () => { view.date = u.addDays(view.date, -1); view.render(root); });
    u.qs('#cd-next', root).addEventListener('click', () => { view.date = u.addDays(view.date, 1); view.render(root); });
    u.qs('#cd-switch', root).addEventListener('click', () => { const L2 = local.get(); L2.me = ''; local.set(L2); view.render(root); });
    const shop = u.qs('#cd-shop', root);
    if (shop) shop.addEventListener('click', () => {
      const op = s.timeEntries.find((e) => e.crewId === me.id && !e.end && e.date === u.todayISO());
      if (op) op.end = calc.nowHHMM();
      if (!op || op.dealId) s.timeEntries.push({ id: u.uid('te'), crewId: me.id, dealId: '', kind: 'shop', date: u.todayISO(), start: calc.nowHHMM(), end: '', breakMin: 0, note: 'From crew view' });
      store.save();
      ui.toast(op && !op.dealId ? 'Clocked out' : 'Clocked in for shop time');
    });
    u.qsa('[data-photos]', root).forEach((b) => b.addEventListener('click', () => MT.app.go('jobcam', { dealId: b.dataset.photos })));
  }

  function jobCard(j) {
    const kindName = { job: 'Job', visit: 'Estimate visit', other: 'Other' }[j.kind] || 'Stop';
    return `<article class="crew-card k-${u.esc(j.kind)} ${j.open ? 'on' : ''}">
      <div class="cc-top"><span class="cc-time">${j.start ? fmtTime(j.start) : 'Any time'}</span><span class="badge">${kindName}${j.days > 1 ? ', day ' + j.dayN + ' of ' + j.days : ''}</span></div>
      <h3>${u.esc(j.title)}</h3>
      <p class="cc-client">${u.esc(j.client || '')}${j.address ? '<br>' + u.esc(j.address) : ''}</p>
      ${j.notes ? `<p class="cc-notes">${u.esc(j.notes)}</p>` : ''}
      <div class="cc-actions">
        <button class="btn ${j.open ? 'danger' : 'primary'} big" data-clock="${u.esc(j.key)}">${j.open ? 'Clock out' : 'Clock in'}</button>
        ${j.address ? `<a class="btn ghost" href="${directions(j.address)}" target="_blank" rel="noopener">Directions</a>` : ''}
        ${j.phone ? `<a class="btn ghost" href="tel:${u.esc(String(j.phone).replace(/[^\d+]/g, ''))}">Call</a>` : ''}
        ${j.photos ? `<button class="btn ghost" data-photos="${u.esc(j.photos)}">Photos</button>` : ''}
      </div>
    </article>`;
  }
  function bindCards(root, onClock) { u.qsa('[data-clock]', root).forEach((b) => b.addEventListener('click', () => onClock(b.dataset.clock))); }
  function tick(root, hoursFn) {
    clearInterval(ticker);
    ticker = setInterval(() => {
      const el = u.qs('[data-elapsed]', root);
      if (!el || !el.isConnected) { clearInterval(ticker); return; }
      el.textContent = fmtH(hoursFn());
    }, 30000);
  }

  MT.views.crew = view;
})();
