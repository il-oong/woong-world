const CACHE = "woong-hub-v1";
const PRECACHE = ["/", "/cheongak", "/calendar"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // API 요청은 캐시 안 함
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
      return cached ?? net;
    })
  );
});

self.addEventListener("push", (e) => {
  let data = { title: "Woong Hub", body: "새 알림이 있습니다.", url: "/" };
  if (e.data) {
    try { data = { ...data, ...e.data.json() }; } catch {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
