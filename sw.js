/* Mammoth CRM — service worker: makes the app installable and usable without signal.
   App files are served from the cache and refreshed in the background, so updates arrive on the next open. */
const SHELL_CACHE = 'mammoth-shell-v3';
const RUNTIME_CACHE = 'mammoth-runtime-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './js/util.js', './js/store.js', './js/seed.js', './js/charts.js', './js/media.js', './js/print.js', './js/brand.js', './js/lock.js', './js/crewlink.js',
  './js/views/dashboard.js', './js/views/customers.js', './js/views/estimator.js', './js/views/invoices.js', './js/views/pipeline.js',
  './js/views/jobcam.js', './js/views/jobcost.js', './js/views/timetrack.js', './js/views/calendar.js', './js/views/routes.js',
  './js/views/templates.js', './js/views/overhead.js', './js/views/books.js', './js/views/branding.js', './js/views/integrations.js', './js/views/settings.js',
  './js/views/phoneapp.js', './js/views/crew.js', './js/app.js',
];
// Libraries and fonts worth keeping for offline use. Live data services (maps, routing, Google, GitHub) always go to the network.
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Stale-while-revalidate: instant from cache, then refresh the cache from the network.
    e.respondWith(caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      const fresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (cached) { e.waitUntil(fresh); return cached; }
      const res = await fresh;
      return res || new Response('Offline', { status: 503, statusText: 'Offline' });
    }));
    return;
  }

  if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(RUNTIME_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }));
  }
});
