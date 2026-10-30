/* היום ומחר - offline copy. Network first for the page and the calendar feeds; the last good copy when there is
   no signal. The cache name changes with every build, so a new page replaces the old copy. */
const V = "tzofen-5b5f6b1d31d2";
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
  if (!page && !/\.(ics|png|webmanifest|json)$/.test(u.pathname)) return;
  // the cache key never has the address query (?d=&s=), so no secret or answer is stored as a key; each page
  // (the home page and practice.html) keeps its own copy
  const key = u.origin + u.pathname.replace(/index\.html$/, "");
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
// Daily 5 reminders: the PC sends a web push; every push must show a notification or Safari drops the subscription
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  e.waitUntil(self.registration.showNotification(d.title || "היום ומחר", {
    body: d.body || "חמש שאלות, שלוש דקות.", icon: "icon4-192.png", badge: "icon4-192.png", lang: "he", dir: "rtl",
    tag: "daily5", data: {url: d.url || "./?t=prac"}}));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const to = new URL((e.notification.data && e.notification.data.url) || "./?t=prac", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(list => {
    for (const c of list) { if ("navigate" in c && c.url !== to) { return c.navigate(to).then(w => w && w.focus()); } if ("focus" in c) return c.focus(); }
    return self.clients.openWindow(to);
  }));
});
