// GET /sw.js — the service worker of the phones (CR-082, X-21). It keeps My schedule (the screen of the workshop and of the PDE)
// readable without network: the page is read from the network first and its last copy kept, the application's files are kept
// once fetched (their names change with each version), and any other page without network shows a short notice. Nothing else is
// intercepted: writes always go to the server (starts and ends without network are queued by the page, src/features/offline/).
// The copies are dropped at sign-out and when a new version of the worker takes over.
export const dynamic = 'force-static';

const SCRIPT = `
const PAGES = 'crucible-pages-v1';
const STATIC = 'crucible-static-v1';
const KEPT = ['/my/schedule'];
const OFFLINE = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Crucible · hors ligne</title></head>'
  + '<body style="font-family:system-ui,sans-serif;background:#16161d;color:#e6e6ef;padding:24px;line-height:1.5">'
  + '<h1 style="font-size:20px">Pas de réseau</h1>'
  + '<p>Cette page n’est pas disponible hors ligne. <a style="color:#a99bff" href="/my/schedule">Mon planning</a> reste lisible s’il a déjà été ouvert sur ce téléphone ; les démarrages et fins d’essai y sont gardés puis envoyés au retour du réseau.</p>'
  + '<p lang="en" style="opacity:.7">No network. My schedule stays readable if it was opened on this phone before.</p></body></html>';
const offlinePage = () => new Response(OFFLINE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== PAGES && k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Sign-out is a POST: the copies of the pages go with the session (checked before the GET filter).
  if (url.pathname.startsWith('/api/auth/sign-out')) {
    event.waitUntil(caches.delete(PAGES));
    return;
  }
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.mode !== 'navigate') return;
  if (KEPT.includes(url.pathname)) {
    event.respondWith(fetch(req).then((res) => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(PAGES).then((c) => c.put(url.pathname, copy));
      }
      return res;
    }).catch(async () => (await caches.match(url.pathname, { cacheName: PAGES })) || offlinePage()));
    return;
  }
  event.respondWith(fetch(req).catch(() => offlinePage()));
});
`;

export function GET(): Response {
  return new Response(SCRIPT, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Service-Worker-Allowed': '/' },
  });
}
