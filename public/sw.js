const CACHE_NAME = 'apex-recomp-v5'; // bumped to force update
const STATIC_ASSETS = [
  '/css/styles.css',
  '/manifest.json',
  '/icons/icon.svg',
  '/js/config.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/mealLog.js',
  '/js/vitals.js',
  '/js/gym.js',
  '/js/huaweiCard.js',
  '/js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Navigation requests (the page HTML) → NETWORK-FIRST, so index.html is
  // always fresh. Fall back to cache only when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Static assets → cache-first with network fallback.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
