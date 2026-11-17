// No background push subscription: alerts are requested by the open webapp.
// Registered with the app's path as its scope (browser-notifications.ts), so
// every URL here resolves against that scope, never the origin's root: the
// landing serves the rest of the domain.
const APP_ROOT = self.registration.scope;
// The app's home without its trailing slash (`/dashboard`) is outside the
// scope but is still the app.
const APP_HOME = APP_ROOT.replace(/\/$/, "");

function isAppWindow(url) {
  const page = new URL(url);
  page.search = "";
  page.hash = "";
  return page.href === APP_HOME || page.href.startsWith(APP_ROOT);
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

function requestClient(client, message) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (handled) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(handled);
    };
    const timer = setTimeout(() => finish(false), 400);
    channel.port1.onmessage = (event) => finish(event.data?.handled === true);
    try {
      client.postMessage(message, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

function clickPayload(data) {
  if (
    !data ||
    typeof data.notificationId !== "string" ||
    !data.notificationId ||
    data.notificationId.length > 128 ||
    typeof data.userId !== "string" ||
    !data.userId ||
    data.userId.length > 128
  )
    return null;
  const matchId = String(data.matchId ?? "");
  // Pick ids are cuids; anything else could smuggle a path into the URL.
  const pickId = String(data.pickId ?? "");
  const type =
    typeof data.notificationType === "string" ? data.notificationType : "";
  return {
    notificationId: data.notificationId,
    userId: data.userId,
    ...(/^[1-9]\d*$/.test(matchId) ? { matchId } : {}),
    ...(/^[A-Za-z0-9_-]{1,128}$/.test(pickId) ? { pickId } : {}),
    ...(/^[a-z0-9_]{1,64}$/.test(type) ? { notificationType: type } : {}),
  };
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const payload = clickPayload(event.notification.data);
      if (!payload) {
        await self.clients.openWindow(new URL("picks", APP_ROOT).href);
        return;
      }
      const windows = (
        await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        })
      ).filter((client) => isAppWindow(client.url));
      // Probe in parallel: public, loading, stale, and other-account pages do not acknowledge.
      const ready = await Promise.all(
        windows.map((client) =>
          requestClient(client, {
            type: "scout-notification-probe",
            userId: payload.userId,
          }),
        ),
      );
      for (const [index, client] of windows.entries()) {
        if (!ready[index]) continue;
        if (
          await requestClient(client, {
            type: "scout-notification-click",
            ...payload,
          })
        ) {
          await client.focus();
          return;
        }
      }
      // Preserve the payload through startup/login without putting account IDs in server logs.
      // Same precedence as notificationDestination: a pick notification lands
      // on its pick, otherwise its match.
      const target = new URL(
        payload.pickId
          ? `picks/${payload.pickId}`
          : payload.matchId
            ? `matches/${payload.matchId}`
            : "picks",
        APP_ROOT,
      );
      const fragment = new URLSearchParams({
        notificationClick: "1",
        notificationId: payload.notificationId,
        notificationUserId: payload.userId,
      });
      if (payload.matchId) fragment.set("notificationMatchId", payload.matchId);
      if (payload.pickId) fragment.set("notificationPickId", payload.pickId);
      if (payload.notificationType)
        fragment.set("notificationType", payload.notificationType);
      target.hash = fragment.toString();
      await self.clients.openWindow(target.href);
    })(),
  );
});

