// Network-passthrough fetch handler. Required for PWA installability on
// Android Chrome — the browser checks that the SW handles fetch events.
self.addEventListener("fetch", () => {
  // no-op; let the network handle it. Adding the listener is what counts.
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "비서", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "비서", {
      body: data.body ?? "새 알림이 있습니다.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url ?? "/" },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});
