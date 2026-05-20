// ============================================================
// Service Worker — Sistema Panutrir
// Estratégia: Cache First para assets locais,
//             Network First para navegação,
//             Stale-While-Revalidate para CDNs externos.
// ============================================================

const CACHE_NAME   = 'panutrir-v1';
const CDN_CACHE    = 'panutrir-cdn-v1';
const FONT_CACHE   = 'panutrir-fonts-v1';

// Assets locais que devem ser cacheados imediatamente no install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './logo_nova.jpg',
];

// URLs de CDN (JavaScript)
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// ── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      // Pré-cacheia assets locais
      caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS)),
      // Pré-cacheia libs de CDN
      caches.open(CDN_CACHE).then(cache => cache.addAll(CDN_URLS)),
    ])
    .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const VALID_CACHES = [CACHE_NAME, CDN_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !VALID_CACHES.includes(k)).map(k => caches.delete(k))
      )
    )
    .then(() => self.clients.claim())
  );
});

// ── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET
  if (request.method !== 'GET') return;

  // ── Fontes do Google: Cache First (fontes não mudam)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // ── CDN (xlsx, Chart.js): Cache First (versões fixas)
  if (
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'cdnjs.cloudflare.com'
  ) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // ── Assets locais (HTML, imagens, manifest): Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }

  // ── Demais requests externos: só rede
  event.respondWith(fetch(request));
});

// ── Estratégias de cache ─────────────────────────────────────

/**
 * Cache First: retorna do cache; se não tiver, busca na rede e salva.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — recurso não disponível no cache.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Stale-While-Revalidate: entrega do cache enquanto atualiza em background.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await networkFetch || new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
