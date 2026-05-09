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
      icon: "/icon-192.png",
      badge: "/icon-badge.png",
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
