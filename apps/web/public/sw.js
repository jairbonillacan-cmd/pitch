/* Service Worker mínimo de PitchLab · Web Push + apertura en primer plano */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function sanitizeTargetUrl(raw) {
  if (typeof raw !== "string") return "/app";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/app";
  return trimmed;
}

self.addEventListener("push", (event) => {
  let payload = {
    title: "PitchLab",
    body: "Tienes una actualización en tu cuenta del club.",
    url: "/app",
    tag: "pitchlab-general",
  };
  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = {
          title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : payload.title,
          body: typeof parsed.body === "string" ? parsed.body.trim() : payload.body,
          url: sanitizeTargetUrl(parsed.url),
          tag: typeof parsed.tag === "string" && parsed.tag.trim() ? parsed.tag.trim() : payload.tag,
        };
      }
    } catch {
      const fallbackText = event.data.text ? event.data.text() : "";
      if (fallbackText) payload.body = fallbackText;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/brand/app-icons/icon-192.png",
      badge: "/brand/app-icons/favicon.svg",
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = sanitizeTargetUrl(event.notification?.data?.url);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client && client.url.startsWith(self.location.origin)) {
            if ("navigate" in client && typeof client.navigate === "function") {
              return client.navigate(targetUrl).then((navigated) => (navigated ?? client).focus());
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
