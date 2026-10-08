/* SurplusServe service worker.
 * - Precaches the app shell (file list injected at build time).
 * - Navigations: network first, then cached app shell, then offline.html.
 * - Static assets: cache first. API calls: always network (never cached).
 */
const VERSION = '__CACHE_VERSION__';
const SHELL_CACHE = `ss-shell-${VERSION}`;
const RUNTIME_CACHE = 'ss-runtime-v1';
const PRECACHE = self.__PRECACHE__;

/** Static hosting may redirect /x.html → /x; navigations reject redirected responses, so re-wrap them. */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ss-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache the API (auth, live data, OTPs).
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = (await cache.match('/')) || (await cache.match('/offline.html'));
        return hit ? clean(hit) : Response.error();
      }),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // OpenStreetMap tiles: stale-while-revalidate with a small, trimmed cache.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open('ss-tiles-v1').then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then(async (res) => {
            if (res.ok) {
              await cache.put(req, res.clone());
              const keys = await cache.keys();
              if (keys.length > 300) await Promise.all(keys.slice(0, keys.length - 300).map((k) => cache.delete(k)));
            }
            return res;
          })
          .catch(() => hit || Response.error());
        return hit || network;
      }),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
