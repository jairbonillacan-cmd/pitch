/* Service Worker de PitchLab · Web Push + caché acotado CacheFirst para estáticos + respaldo /offline (solo fuera de desarrollo local) */

const STATIC_CACHE_NAME = "pitchlab-static-v2";
const OFFLINE_CACHE_NAME = "pitchlab-offline-v1";
const OFFLINE_URL = "/offline";
const STATIC_CACHE_MAX_ENTRIES = 150;
const STATIC_PATH_PREFIXES = ["/_next/static/", "/fonts/", "/brand/", "/icons/", "/icons-dark/"];

function isLocalDevHost() {
  const host = (self.location && self.location.hostname) || "";
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );
}

function isCacheableStaticAsset(request) {
  if (isLocalDevHost()) return false;
  if (request.method !== "GET") return false;
  let parsed;
  try {
    parsed = new URL(request.url);
  } catch {
    return false;
  }
  if (parsed.origin !== self.location.origin) return false;
  return STATIC_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));
}

async function trimStaticCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= STATIC_CACHE_MAX_ENTRIES) return;
    const excess = keys.length - STATIC_CACHE_MAX_ENTRIES;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  } catch {
    // Ignorar errores de cuota del navegador
  }
}

self.addEventListener("install", (event) => {
  if (isLocalDevHost()) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE_NAME)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => undefined),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  const purgeAllLocal = isLocalDevHost();
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => {
              if (!name.startsWith("pitchlab-")) return false;
              if (purgeAllLocal) return true;
              return name !== STATIC_CACHE_NAME && name !== OFFLINE_CACHE_NAME;
            })
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (isLocalDevHost()) return;

  // Navegaciones: siempre red primero; jamás cachear HTML privado (/app) ni violar Cero-Fuga.
  // Si falla la red por completo, devolver la página pública `/offline` precacheada.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const offlineCache = await caches.open(OFFLINE_CACHE_NAME);
        const fallback = await offlineCache.match(OFFLINE_URL);
        if (fallback) return fallback;
        return new Response("Sin conexión a internet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
    );
    return;
  }

  if (!isCacheableStaticAsset(event.request)) return;
  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const network = await fetch(event.request);
      if (network && network.ok && network.type === "basic") {
        cache.put(event.request, network.clone()).then(() => trimStaticCache(cache)).catch(() => undefined);
      }
      return network;
    }),
  );
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
    body: "Tienes una actualización en tu cuenta de PitchLab.",
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
