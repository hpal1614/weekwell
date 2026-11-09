// Weekwell service worker: makes the app open fast and installable.
// It only stores the app's own files (page, styles, scripts, icons).
// Your budget data (/api) and sign-in (/auth) are NEVER stored on the device by it.
const CACHE = 'weekwell-shell-v1';
const SHELL = ['/', '/styles.css', '/app.js', '/api.js', '/engine.js', '/forecast.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return;
  // Network first, so updates show up straight away; the saved copy is only for offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || caches.match('/'))),
  );
});
