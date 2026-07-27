// RosterDoc Service Worker — Offline Support
const CACHE_VERSION = 'rosterdoc-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

// Shell pages to pre-cache on install
const SHELL_URLS = ['/', '/login', '/swaps'];

// ── Install: pre-cache shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => {
      return cache.addAll(SHELL_URLS).catch(() => {
        // Silently continue if some pages fail to pre-cache
      });
    }),
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('rosterdoc-') && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      );
    }),
  );
  self.clients.claim();
});

// ── Fetch: routing strategies ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // API routes: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|webmanifest)$/) ||
    url.pathname.startsWith('/_next/')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Page routes (HTML): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
});

// ── Strategies ──

/** Cache-first: serve from cache; update cache from network in background. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return a simple offline response for pages
    if (request.headers.get('accept')?.includes('text/html')) {
      return cache.match('/') || new Response('You are offline.', { status: 503 });
    }
    return new Response('Offline', { status: 503 });
  }
}

/** Network-first: try network; fall back to cache; fall back to error. */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'You are offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Stale-while-revalidate: serve cache; fetch network in background and update cache. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}
