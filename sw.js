// hafriyatcim.com — Service Worker v2
const CACHE = 'hafriyatcim-v2';

const STATIC = [
  '/',
  '/index.html',
  '/ilanlar.html',
  '/giris.html',
  '/styles.css',
  '/api.js',
  '/logo.png',
  '/manifest.json'
];

// ─── Install: kritik varlıkları önbelleğe al ───────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// ─── Activate: eski önbellekleri temizle ───────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: Network-first API, Cache-first statik ──────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API çağrıları: her zaman network
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ hata: 'Çevrimdışısınız.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Statik varlıklar: önce cache, sonra network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
