/* Mammoth CRM — app shell and router */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, store = MT.store;
  const ROUTES = ['dashboard', 'pipeline', 'customers', 'estimator', 'invoices', 'jobcam', 'jobcost', 'time', 'calendar', 'routes', 'books', 'overhead', 'templates', 'branding', 'integrations', 'app', 'settings', 'crew'];
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
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* app still works without offline support */ });
    document.getElementById('today').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Keep other open tabs in step with this one.
    window.addEventListener('storage', (e) => { if (e.key === 'mammothcrm.data.v1' && e.newValue) { store.load(); MT.views.estimator.onDataReplaced(); MT.brand.apply(); app.render(); } });
    window.addEventListener('hashchange', onHash);
    window.addEventListener('resize', u.debounce(() => { if (['dashboard', 'routes'].includes(app.route)) app.render(); }, 250));
    onHash();
    MT.lock.init();
    // Website leads: check on open, then every 10 minutes while the CRM is open.
    if (MT.views.integrations && MT.views.integrations.autoPull) {
      setTimeout(() => MT.views.integrations.autoPull(), 4000);
      setInterval(() => MT.views.integrations.autoPull(), 10 * 60000);
    }
  });
})();
