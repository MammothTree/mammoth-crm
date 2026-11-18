/* Mammoth CRM — app shell and router */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;
  const ROUTES = ['dashboard', 'pipeline', 'customers', 'estimator', 'invoices', 'jobcam', 'jobcost', 'time', 'calendar', 'routes', 'books', 'overhead', 'templates', 'branding', 'integrations', 'app', 'settings', 'crew', 'seo', 'partners', 'training'];
  const THEME_KEY = 'mammothcrm.theme';

  const app = {
    route: 'dashboard',
    params: {},
    go(route, params) {
      app.params = params || {};
      if (location.hash.slice(1) === route) app.render();
      else location.hash = route;
    },
    render() {
      const view = MT.views[app.route];
      const root = document.getElementById('view');
      MT.charts.hideTip();
      document.getElementById('page-title').textContent = view.title;
      document.title = view.title + ' | ' + ((store.state.settings.company.shortName || store.state.settings.company.name || 'CRM'));
      u.qsa('.nav a').forEach((a) => {
        const on = a.getAttribute('href') === '#' + app.route;
        a.classList.toggle('on', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      document.getElementById('demo-note').hidden = !store.state.demo;
      app.syncBanner();
      try {
        view.render(root);
      } catch (e) {
        console.error(e);
        root.innerHTML = '<div class="panel"><h3>This page hit an error</h3><p>' + u.esc(e.message) + '</p><p class="hint">Your data is safe. Try reloading the page. If it keeps happening, download a backup from Settings.</p></div>';
      }
    },
  };
  MT.app = app;

  function onHash() {
    const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
    const r = parts[0];
    if (r === 'crew' && parts[1]) app.params = { sheet: parts[1] };
    let next = ROUTES.includes(r) ? r : 'dashboard';
    // A device kept in crew view only shows the crew screen (and job photos).
    if (MT.crewLocal && MT.crewLocal.get().locked && !['crew', 'jobcam'].includes(next)) { next = 'crew'; if (location.hash !== '#crew') history.replaceState(null, '', '#crew'); }
    document.body.classList.toggle('crew-mode', next === 'crew' || (next === 'jobcam' && MT.crewLocal && MT.crewLocal.get().locked));
    const changed = next !== app.route;
    app.route = next;
    app.render();
    if (changed) { window.scrollTo(0, 0); document.getElementById('view').focus({ preventScroll: true }); }
    document.body.classList.remove('nav-open');
  }

  /** True when nothing would be lost by reloading or replacing data: no open window, no field being typed in, not mid-estimate. */
  /** A bar at the top of every page whenever this device's data isn't reaching GitHub, with the fix one tap away. */
  const SNOOZE_KEY = 'mammothcrm.syncsnooze';
  app.syncBanner = function () {
    const note = document.getElementById('demo-note');
    let el = document.getElementById('sync-banner');
    if (!el && note) { el = document.createElement('div'); el.id = 'sync-banner'; el.setAttribute('role', 'status'); note.parentNode.insertBefore(el, note); }
    if (!el) return;
    const sync = MT.sync, c = sync.cfg();
    let snoozed = false;
    try { snoozed = Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch (e) { /* ignore */ }
    let msg = '', act = '', kind = 'warn';
    if (sync.ready()) {
      const p = c.problem;
      if (p && p.kind === 'conflict') { msg = 'Sync is paused: this device and GitHub both have changes that the other doesn\'t.'; act = 'combine'; }
      else if (p && p.kind === 'key') { msg = 'Sync stopped: GitHub didn\'t accept this device\'s access key. It may have expired or been deleted.'; act = 'key'; kind = 'bad'; }
      else if (p) { msg = 'Sync problem: ' + p.msg; act = 'retry'; }
      else if (c.dirty && c.lastSync && Date.now() - Date.parse(c.lastSync) > 15 * 60000 && navigator.onLine !== false) { msg = 'Some changes on this device haven\'t reached GitHub yet.'; act = 'retry'; }
      else if (!c.auto) { msg = 'Automatic sync is off on this device, so your other devices won\'t see changes made here.'; act = 'auto'; }
    } else if (!store.state.demo && !snoozed) { msg = 'This device isn\'t connected to GitHub sync, so changes made here stay on this device only.'; act = 'connect'; kind = 'info'; }
    el.className = 'sync-banner ' + kind;
    el.hidden = !msg;
    if (!msg) { el.innerHTML = ''; return; }
    const btns = {
      combine: '<button class="btn primary sm" data-sb="combine">Combine both (keeps everything)</button><button class="btn ghost sm" data-sb="open">Other choices</button>',
      key: '<button class="btn primary sm" data-sb="open">Fix the key</button>',
      retry: '<button class="btn primary sm" data-sb="retry">Sync now</button><button class="btn ghost sm" data-sb="open">Details</button>',
      auto: '<button class="btn primary sm" data-sb="auto">Turn on sync</button>',
      connect: '<button class="btn primary sm" data-sb="open">Connect</button><button class="btn ghost sm" data-sb="snooze">Not now</button>',
    }[act];
    el.innerHTML = `<span class="sb-msg">${u.esc(msg)}</span><span class="sb-btns">${btns}</span>`;
    u.qsa('[data-sb]', el).forEach((b) => b.addEventListener('click', () => syncAction(b.dataset.sb, b)));
  };
  function syncAction(a, b) {
    const sync = MT.sync;
    const done = (msg) => { if (MT.views.estimator.onDataReplaced) MT.views.estimator.onDataReplaced(); app.render(); if (msg) ui.toast(msg); };
    const fail = (e) => { ui.toast(e.message || String(e), 'err'); app.syncBanner(); };
    if (a === 'open') { MT.views.integrations.open = 'github'; app.go('integrations'); return; }
    if (a === 'snooze') { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3 * 86400000)); } catch (e) { /* ignore */ } app.syncBanner(); return; }
    if (a === 'auto') { const c = sync.cfg(); c.auto = true; sync.setCfg(c); b.disabled = true; sync.autoSync().then(() => done('Sync is on'), fail); return; }
    if (a === 'retry') { b.disabled = true; b.textContent = 'Syncing…'; sync.autoSync().then((r) => { if (r === 'conflict') app.syncBanner(); else done(r === 'offline' ? 'No connection right now. It will retry.' : 'Synced'); }, fail); return; }
    if (a === 'combine') {
      ui.modal({
        title: 'Combine this device with GitHub?', size: 'sm',
        body: '<p>Everything from both copies is kept: clients, leads, estimates, invoices, payments, photos, and notes added on either device. Where the same record was changed on both, this device\'s version is used.</p><p class="hint">A restore point is saved first (Settings → Undo), and GitHub keeps every past version. Something you deleted on only one device comes back; just delete it again.</p>',
        actions: [{ label: 'Cancel' }, { label: 'Combine both', kind: 'primary', onClick: () => { sync.combine().then(() => done('Combined. Both devices now have everything.'), fail); } }],
      });
    }
  }

  function idle() {
    const a = document.activeElement;
    return !document.querySelector('.modal-backdrop') && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && app.route !== 'estimator';
  }
  app.idle = idle;

  let updatePending = false;
  function showUpdateReady() {
    updatePending = true;
    if (document.getElementById('update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'update-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>A new version of the CRM is ready.</span><button class="btn primary sm" type="button">Refresh</button>';
    bar.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(bar);
  }

  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  document.addEventListener('DOMContentLoaded', () => {
    let theme = '';
    try { theme = localStorage.getItem(THEME_KEY) || ''; } catch (e) { /* ignore */ }
    applyTheme(theme);
    store.load();
    MT.brand.apply();
    store.onChange(() => { MT.brand.apply(); app.render(); });

    document.getElementById('theme-btn').addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      const t = dark ? 'light' : 'dark';
      applyTheme(t);
      try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
      app.render();
    });
    document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    document.getElementById('q-estimate').addEventListener('click', () => {
      MT.views.estimator.draft = null;
      MT.views.estimator.isNew = true;
      app.go('estimator', { mode: 'build' });
    });
    document.getElementById('q-deal').addEventListener('click', () => MT.views.pipeline.openDeal(null));
    document.getElementById('q-customer').addEventListener('click', () => MT.views.customers.edit(null));
    document.getElementById('crew-exit').addEventListener('click', async () => {
      const L = MT.crewLocal.get();
      const leave = () => { const L2 = MT.crewLocal.get(); L2.locked = false; MT.crewLocal.set(L2); app.go('dashboard'); };
      if (L.locked && MT.lock.isSet()) {
        MT.ui.modal({ title: 'Leave crew view', size: 'sm', body: '<label class="field"><span>Enter the PIN</span><input class="input" type="password" inputmode="numeric" id="cx-pin" maxlength="8"></label>',
          actions: [{ label: 'Cancel' }, { label: 'Leave', kind: 'primary', keepOpen: true, onClick: async (b, close) => { if (await MT.lock.check(MT.u.qs('#cx-pin', b).value)) { close(); leave(); } else MT.ui.toast('That PIN is not right.', 'err'); } }] });
      } else leave();
    });
    document.getElementById('crew-home').addEventListener('click', () => app.go('crew'));
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); MT.installPrompt = e; if (app.route === 'app') app.render(); });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').then((reg) => {
        // Check for a new version whenever the app comes back to the screen, and every 5 minutes while it's open.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          if (updatePending && idle()) { location.reload(); return; } // coming back to the app: switch to the new version quietly
          reg.update().catch(() => {});
        });
        setInterval(() => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }, 5 * 60000);
      }).catch(() => { /* app still works without offline support */ });
      // A new version took over while the app was open: offer a one-tap refresh.
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateReady(); });
    }
    document.getElementById('today').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Keep other open tabs in step with this one.
    window.addEventListener('storage', (e) => { if (e.key === 'mammothcrm.data.v1' && e.newValue) { store.load(); MT.views.estimator.onDataReplaced(); MT.brand.apply(); app.render(); } });
    window.addEventListener('hashchange', onHash);
    window.addEventListener('resize', u.debounce(() => { if (['dashboard', 'routes'].includes(app.route)) app.render(); }, 250));
    if (MT.seo) MT.seo.startup();
    onHash();
    MT.lock.init();
    // GitHub sync: catch up when the app opens, reconnects, comes back to the foreground, and every minute while it's
    // on screen, so changes made on another device show up within about a minute. Never while a window or form is open.
    let lastSync = 0;
    const catchUp = () => {
      if (!MT.sync.ready() || Date.now() - lastSync < 55000 || navigator.onLine === false || !idle()) return;
      lastSync = Date.now();
      MT.sync.autoSync().then(() => { if (MT.sync.cfg().mediaAuto) return MT.media.backupAll(); }).catch(() => { /* will retry next time */ });
    };
    setTimeout(catchUp, 1500);
    window.addEventListener('online', catchUp);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') catchUp(); });
    setInterval(() => { if (document.visibilityState === 'visible') catchUp(); }, 60000);
    // Square pay links: check for online payments on open and every couple of minutes while the CRM is on screen.
    // Shared estimates and invoices: pick up opens, approvals, and customer notes on the same schedule.
    if (MT.pay) {
      const remote = () => { MT.pay.autoCheck(); if (MT.docs) MT.docs.autoCheck(); };
      setTimeout(remote, 5000);
      setInterval(() => { if (document.visibilityState === 'visible') remote(); }, 60000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(remote, 3000); });
    }
    // Website leads: check on open, then every 10 minutes while the CRM is open.
    if (MT.views.integrations && MT.views.integrations.autoPull) {
      setTimeout(() => MT.views.integrations.autoPull(), 4000);
      setInterval(() => MT.views.integrations.autoPull(), 10 * 60000);
    }
  });
})();
