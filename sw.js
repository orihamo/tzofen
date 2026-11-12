/* היום ומחר - offline copy and Daily 5 push. Stamped by build.py --stage: build id, mode and asset list.
   Modes: "normal"      page network first (3 s), last good copy when offline, refreshed in the background
          "passthrough" emergency: no caching at all, push still works, old caches deleted
          "kill"        last resort: deletes caches, unregisters itself (this also drops push subscriptions) */
const BUILD = "6863bb6f";
const MODE = "normal";
const ASSETS = ["a/app.124fa1e1.css", "a/app.a617b304.js", "a/outfit-latin.8c9aecb0.woff2", "a/varela-hebrew.80c8f2db.woff2"];               // hashed files under a/, immutable: cache first
const V = "tzofen-" + BUILD;             // page copies, one cache per build
const A = "tzofen-assets";               // hashed assets, kept across builds, pruned to the current list
const NET_MS = 3000;

function wipe() {
  return caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); });
}

self.addEventListener("install", function (e) {
  if (MODE === "normal") {
    e.waitUntil(caches.open(A).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.match(u).then(function (hit) { return hit ? null : c.add(u).catch(function () {}); });
      }));
    }).then(function () { return self.skipWaiting(); }));
  } else {
    self.skipWaiting();
  }
});

self.addEventListener("activate", function (e) {
  e.waitUntil((function () {
    if (MODE === "kill") {
      return wipe().then(function () { return self.registration.unregister(); }).then(function () {
        return self.clients.matchAll({ type: "window" });
      }).then(function (list) { list.forEach(function (w) { w.navigate(w.url); }); });
    }
    if (MODE === "passthrough") {
      return wipe().then(function () { return self.clients.claim(); });
    }
    return caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) { return (k === V || k === A) ? null : caches.delete(k); }));
    }).then(function () {
      return caches.open(A);
    }).then(function (c) {
      return c.keys().then(function (reqs) {
        return Promise.all(reqs.map(function (r) {
          var p = new URL(r.url).pathname.replace(/^.*\/(a\/)/, "$1");
          return ASSETS.indexOf(p) < 0 ? c.delete(r) : null;
        }));
      });
    }).then(function () { return self.clients.claim(); });
  })());
});

/* the cache key never carries the address query or hash, so no answer or Drive secret is stored as a key */
function keyOf(u) { return u.origin + u.pathname.replace(/index\.html$/, ""); }

function stamp(res) {
  var h = new Headers(res.headers);
  h.set("x-cached-at", new Date().toISOString());
  return res.clone().blob().then(function (b) { return new Response(b, { headers: h }); });
}

function withMeta(hit) {
  return hit.text().then(function (html) {
    var at = hit.headers.get("x-cached-at") || "";
    return new Response(html.replace("<head>", '<head><meta name="from-cache" content="' + at + '">'),
      { headers: { "content-type": "text/html; charset=utf-8" } });
  });
}

function timeout(ms) {
  return new Promise(function (_, rej) { setTimeout(function () { rej(new Error("slow")); }, ms); });
}

self.addEventListener("fetch", function (e) {
  if (MODE === "normal" ? false : true) return;
  var r = e.request;
  if (r.method === "GET" ? false : true) return;
  var u = new URL(r.url);
  if (u.origin === location.origin ? false : true) return;        // parking counters, Google, Lemida: straight to the network
  if (u.pathname.slice(-6) === "/sw.js") return;
  var page = r.mode === "navigate";
  var hashed = /\/a\/[^/]+\.(css|js|woff2)$/.test(u.pathname);
  var soft = /\.(ics|png|webmanifest|json)$/.test(u.pathname);
  if (page === false && hashed === false && soft === false) return;

  if (hashed) {                                                  // content-hashed name: the bytes never change
    e.respondWith(caches.open(A).then(function (c) {
      return c.match(r).then(function (hit) {
        if (hit) return hit;
        return fetch(r).then(function (res) {
          if (res.ok) c.put(r, res.clone());
          return res;
        });
      });
    }));
    return;
  }

  var key = keyOf(u);
  if (soft && page === false) {                                  // calendar feeds, icons, manifest: cached copy now, fresh one for next time
    e.respondWith(caches.open(V).then(function (c) {
      return c.match(key).then(function (hit) {
        var net = fetch(r).then(function (res) {
          if (res.ok && res.type === "basic") { stamp(res).then(function (s) { c.put(key, s); }); }
          return res;
        });
        if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
        return net;
      });
    }));
    return;
  }

  e.respondWith(caches.open(V).then(function (c) {               // the page: network first, 3 s, then the last good copy
    var net = fetch(r).then(function (res) {
      if (res.ok && res.type === "basic") { stamp(res).then(function (s) { c.put(key, s); }); }
      return res;
    });
    return Promise.race([net, timeout(NET_MS)]).catch(function (err) {
      return c.match(key).then(function (hit) {
        if (hit === undefined) return net;                       // nothing stored yet: wait for the network after all
        e.waitUntil(net.catch(function () {}));                  // keep fetching in the background so the copy is fresh next time
        return withMeta(hit);
      });
    });
  }));
});

/* Daily 5 reminders: the PC sends a web push; every push must show a notification or Safari drops the subscription */
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  e.waitUntil(self.registration.showNotification(d.title || "היום ומחר", {
    body: d.body || "חמש שאלות, שלוש דקות.", icon: "icon4-192.png", badge: "icon4-192.png", lang: "he", dir: "rtl",
    tag: "daily5", data: { url: d.url || "./?t=prac" } }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var raw = (e.notification.data && e.notification.data.url) || "./?t=prac";
  var to = new URL("./", self.registration.scope);
  try {
    var want = new URL(raw, self.registration.scope);
    /* a push payload may carry any address: only this site is ever opened */
    if (want.origin === location.origin && want.href.indexOf(self.registration.scope) === 0) to = want;
  } catch (err) {}
  var href = to.href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ("navigate" in c && (c.url === href) === false) { return c.navigate(href).then(function (w) { return w && w.focus(); }); }
      if ("focus" in c) return c.focus();
    }
    return self.clients.openWindow(href);
  }));
});
