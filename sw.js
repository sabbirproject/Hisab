/* Service worker — offline app shell only. Caches same-origin static GET files.
   It never touches cross-origin requests (Apps Script API), never caches POST or private responses, never sees secrets. */
const VERSION = 'gdx-shell-v1.0.0';
const SHELL = ['./', './index.html', './manifest.webmanifest', './css/app.css',
  './js/config.js', './js/util.js', './js/db.js', './js/store.js', './js/api.js', './js/charts.js', './js/app.js', './js/reports.js', './js/settings.js', './js/owner.js', './js/start.js',
  './icons/logo-mark.png', './icons/logo-full.png', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-64.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
