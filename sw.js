/* היום ומחר - offline copy. Network first for the page and the calendar feeds; the last good copy when there is
   no signal. The cache name changes with every build, so a new page replaces the old copy. */
const V = "tzofen-0a0ce459d080";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;                 // parking counters and links: straight to the network
  const page = r.mode === "navigate";
  if (!page && !/\.(ics|png|webmanifest)$/.test(u.pathname)) return;
  // the cache key never has the address query (?d=&s=), so no secret or answer is stored as a key
  const key = page ? self.registration.scope : u.origin + u.pathname;
  e.respondWith((async () => {
    const c = await caches.open(V);
    try {
      const res = await fetch(r);
      if (res.ok) {
        const h = new Headers(res.headers); h.set("x-cached-at", new Date().toISOString());
        await c.put(key, new Response(await res.clone().blob(), {headers: h}));
      }
      return res;
    } catch (err) {
      const hit = await c.match(key);
      if (!hit) throw err;
      if (!page) return hit;
      const html = (await hit.text()).replace("<head>", '<head><meta name="from-cache" content="' + (hit.headers.get("x-cached-at") || "") + '">');
      return new Response(html, {headers: {"content-type": "text/html; charset=utf-8"}});
    }
  })());
});
