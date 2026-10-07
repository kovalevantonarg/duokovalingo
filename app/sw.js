// duokovalingo service worker: offline shell, runtime caching, push reminders. No build step, no precache list.
// Bump SHELL to refresh the app shell; RUNTIME keeps its name so lessons saved for offline survive updates.
const SHELL = "drill-shell-v2";
const RUNTIME = "drill-runtime";
const FONTS = "drill-fonts";
const KEEP = [SHELL, RUNTIME, FONTS];

self.addEventListener("install", (e) => {
  // with cleanUrls /index.html redirects to /, and a redirected response can't answer a navigation: store / twice
  e.waitUntil(
    caches
      .open(SHELL)
      .then(async (c) => {
        await c.addAll(["/", "/manifest.webmanifest"]);
        await c.put("/index.html", (await c.match("/")).clone());
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n.startsWith("drill-") && !KEEP.includes(n)).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// navigations: network first, the cached shell when offline (also for /?from=... URLs)
async function page(req) {
  try {
    const res = await fetch(req);
    const path = new URL(req.url).pathname;
    if (res.ok && !res.redirected && path === "/")
      caches.open(SHELL).then((c) => c.put("/index.html", res.clone()));
    return res;
  } catch {
    return (await caches.match("/index.html")) || (await caches.match("/")) || Response.error();
  }
}

// app code (js, css, generated bundles): the network when online, so a deploy shows up on the next load; cache offline
async function networkFirst(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}

// lessons and images: answer from cache at once, refresh it in the background
async function staleWhileRevalidate(e, req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    e.waitUntil(net.catch(() => {}));
    return hit;
  }
  return net;
}

// Google Fonts never change under the same URL
async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com")
    return e.respondWith(cacheFirst(req));
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return; // API: network only
  if (req.mode === "navigate") return e.respondWith(page(req));
  if (/\.(js|css)$/.test(url.pathname)) return e.respondWith(networkFirst(req));
  e.respondWith(staleWhileRevalidate(e, req));
});

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "duokovalingo", {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: d.url || "/" },
    }),
  );
});

// tap on the reminder: reuse an open app window if there is one
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (wins) => {
      const win = wins.find((w) => new URL(w.url).origin === location.origin);
      if (!win) return self.clients.openWindow(url);
      await win.focus();
      return win.navigate ? win.navigate(url).catch(() => win) : win;
    }),
  );
});
