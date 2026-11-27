"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PushServerStatus {
  readonly configured: boolean;
  readonly vapidPublicKey: string | null;
  readonly subscriptions: ReadonlyArray<{
    readonly endpoint: string;
    readonly topicPicks: boolean;
    readonly topicLive: boolean;
    readonly topicSocial: boolean;
  }>;
}

export interface PwaPushTopics {
  readonly picks: boolean;
  readonly live: boolean;
  readonly social: boolean;
}

export interface ServerPushSubscriptionRecord {
  readonly endpoint: string;
  readonly topicPicks: boolean;
  readonly topicLive: boolean;
  readonly topicSocial: boolean;
  readonly updatedAtIso?: string;
}

export function matchDevicePushSubscription(
  subscriptions: ReadonlyArray<ServerPushSubscriptionRecord> | null | undefined,
  localEndpoint: string | null | undefined,
): ServerPushSubscriptionRecord | null {
  if (!localEndpoint || !subscriptions || subscriptions.length === 0) return null;
  return subscriptions.find((sub) => sub.endpoint === localEndpoint) ?? null;
}

export interface UsePwaInstallAndPushOptions {
  readonly enabled?: boolean;
  readonly onNotify?: (message: string, tone?: "default" | "success" | "warning") => void;
  readonly overrideState?: {
    readonly configured: boolean;
    readonly subscribed: boolean;
    readonly installAvailable?: boolean;
  };
}

export interface UsePwaInstallAndPushResult {
  readonly pushLoading: boolean;
  readonly pushSupported: boolean;
  readonly permissionState: NotificationPermission;
  readonly serverConfigured: boolean;
  readonly isSubscribed: boolean;
  readonly topics: PwaPushTopics;
  readonly pushStatusMessage: string;
  readonly canInstall: boolean;
  readonly isStandalone: boolean;
  readonly isIosSafari: boolean;
  readonly installBusy: boolean;
  readonly installStatusMessage: string;
  readonly togglePush: (next: boolean) => Promise<void>;
  readonly setTopic: (key: keyof PwaPushTopics, value: boolean) => Promise<void>;
  readonly triggerInstall: () => Promise<void>;
}

function isBeforeInstallPromptEvent(
  event: Event,
): event is BeforeInstallPromptEvent {
  return "prompt" in event && "userChoice" in event;
}

function readNavigatorStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator;
  if ("standalone" in nav && typeof nav.standalone === "boolean") {
    return nav.standalone;
  }
  return false;
}

function getNavigatorInstallFn(): (() => Promise<void>) | null {
  if (typeof window === "undefined") return null;
  const nav = window.navigator;
  if ("install" in nav && typeof nav.install === "function") {
    return nav.install.bind(nav) as () => Promise<void>;
  }
  return null;
}

function base64UrlToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function usePwaInstallAndPush(
  options?: UsePwaInstallAndPushOptions,
): UsePwaInstallAndPushResult {
  const enabled = options?.enabled ?? true;
  const overrideState = options?.overrideState;
  const onNotifyRef = useRef(options?.onNotify);
  onNotifyRef.current = options?.onNotify;

  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const [pushSupported, setPushSupported] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>("default");
  const [serverConfigured, setServerConfigured] = useState<boolean>(
    overrideState?.configured ?? false,
  );
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(
    overrideState?.subscribed ?? false,
  );
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);
  const [topics, setTopics] = useState<PwaPushTopics>({
    picks: true,
    live: true,
    social: true,
  });
  const [pushStatusMessage, setPushStatusMessage] = useState<string>("");

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [supportsWebInstall, setSupportsWebInstall] = useState<boolean>(false);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState<boolean>(
    Boolean(overrideState?.installAvailable),
  );
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isIosSafari, setIsIosSafari] = useState<boolean>(false);
  const [installBusy, setInstallBusy] = useState<boolean>(false);
  const [installStatusMessage, setInstallStatusMessage] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      Boolean(window.matchMedia?.("(display-mode: standalone)").matches) ||
      readNavigatorStandalone();
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent || "";
    const isIosDevice =
      /iP(hone|ad|od)/i.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isSafariEngine = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    setIsIosSafari(isIosDevice && isSafariEngine && !standalone);
    setSupportsWebInstall(getNavigatorInstallFn() !== null);

    const onBeforeInstall = (ev: Event) => {
      if (!isBeforeInstallPromptEvent(ev)) return;
      ev.preventDefault();
      deferredPromptRef.current = ev;
      setHasDeferredPrompt(true);
    };

    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      setIsStandalone(true);
      setInstallStatusMessage("PitchLab ya está instalada en este dispositivo.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);

    const hasPush =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof Notification !== "undefined";
    setPushSupported(hasPush);
    if (hasPush) {
      setPermissionState(Notification.permission);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (overrideState || !enabled || typeof fetch !== "function") return;
    const controller = new AbortController();

    fetch("/api/me/push", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 403 && typeof window !== "undefined") {
          const errPayload = (await res.json().catch(() => null)) as { error?: unknown } | null;
          if (errPayload?.error === "pase_requerido") {
            window.dispatchEvent(
              new CustomEvent("pitchlab:plan-updated", {
                detail: { reason: "pase_requerido", url: "/api/me/push" },
              }),
            );
          }
          return null;
        }
        return res.ok ? ((await res.json()) as PushServerStatus) : null;
      })
      .then(async (data) => {
        if (controller.signal.aborted || !data) return;
        setServerConfigured(Boolean(data.configured));
        setVapidPublicKey(data.vapidPublicKey ?? null);

        let localEndpoint: string | null = null;
        if ("serviceWorker" in navigator && "PushManager" in window) {
          try {
            const reg = await Promise.race([
              navigator.serviceWorker.getRegistration?.() ?? Promise.resolve(undefined),
              new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1_500)),
            ]);
            const localSub = reg?.pushManager ? await reg.pushManager.getSubscription() : null;
            localEndpoint = localSub?.endpoint ?? null;
          } catch (err) {
            void err;
          }
        }
        if (controller.signal.aborted) return;

        const matchedSub = matchDevicePushSubscription(data.subscriptions, localEndpoint);
        if (matchedSub) {
          setIsSubscribed(true);
          setActiveEndpoint(matchedSub.endpoint);
          setTopics({
            picks: matchedSub.topicPicks,
            live: matchedSub.topicLive,
            social: matchedSub.topicSocial,
          });
        } else {
          setIsSubscribed(false);
          setActiveEndpoint(null);
        }
      })
      .catch((err) => {
        void err;
      });

    return () => {
      controller.abort();
    };
  }, [enabled, overrideState]);

  const togglePush = useCallback(
    async (next: boolean) => {
      if (pushLoading) return;
      if (overrideState) {
        setIsSubscribed(next);
        return;
      }
      if (!enabled || !pushSupported) return;

      setPushLoading(true);
      setPushStatusMessage("");
      try {
        if (!next) {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          const endpoint = existing?.endpoint ?? activeEndpoint;
          if (existing) {
            await existing.unsubscribe().catch((err) => {
              void err;
            });
          }
          await fetch("/api/me/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(endpoint ? { endpoint } : {}),
          });
          setIsSubscribed(false);
          setActiveEndpoint(null);
          setPushStatusMessage("Avisos push desactivados en este dispositivo.");
          onNotifyRef.current?.("Avisos push desactivados.", "default");
          return;
        }

        if (!serverConfigured || !vapidPublicKey) {
          setPushStatusMessage(
            "Las notificaciones push aún no tienen clave VAPID activa en este entorno.",
          );
          return;
        }

        const perm =
          Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
        setPermissionState(perm);
        if (perm !== "granted") {
          setPushStatusMessage("Permiso de notificaciones denegado por el navegador.");
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        const subscription =
          existing ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
          }));

        const jsonSub = subscription.toJSON();
        const res = await fetch("/api/me/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: jsonSub.keys?.p256dh ?? "",
              auth: jsonSub.keys?.auth ?? "",
            },
            topics,
          }),
        });
        if (!res.ok) {
          setPushStatusMessage("No se pudo guardar la suscripción push en el servidor.");
          return;
        }
        setIsSubscribed(true);
        setActiveEndpoint(subscription.endpoint);
        setPushStatusMessage("Notificaciones push activas en este dispositivo.");
        onNotifyRef.current?.("Notificaciones push activadas.", "success");
      } catch (err) {
        void err;
        setPushStatusMessage("No se pudo actualizar el estado de notificaciones push.");
      } finally {
        setPushLoading(false);
      }
    },
    [
      activeEndpoint,
      enabled,
      overrideState,
      pushLoading,
      pushSupported,
      serverConfigured,
      topics,
      vapidPublicKey,
    ],
  );

  const setTopic = useCallback(
    async (key: keyof PwaPushTopics, value: boolean) => {
      const nextTopics: PwaPushTopics = { ...topics, [key]: value };
      setTopics(nextTopics);
      if (overrideState || !enabled || !isSubscribed || !activeEndpoint) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const jsonSub = sub?.toJSON();
        if (!sub || !jsonSub?.keys?.p256dh || !jsonSub.keys.auth) return;
        await fetch("/api/me/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: { p256dh: jsonSub.keys.p256dh, auth: jsonSub.keys.auth },
            topics: nextTopics,
          }),
        });
      } catch (err) {
        void err;
      }
    },
    [activeEndpoint, enabled, isSubscribed, overrideState, topics],
  );

  const triggerInstall = useCallback(async () => {
    if (installBusy) return;
    setInstallBusy(true);
    try {
      const installFn = getNavigatorInstallFn();
      if (supportsWebInstall && installFn) {
        await installFn();
        setInstallStatusMessage("PitchLab instalada o abierta como aplicación.");
        setIsStandalone(true);
      } else if (deferredPromptRef.current) {
        const promptEvent = deferredPromptRef.current;
        deferredPromptRef.current = null;
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        setInstallStatusMessage(
          outcome === "accepted"
            ? "PitchLab instalada en tu dispositivo."
            : "Instalación cancelada.",
        );
        if (!deferredPromptRef.current) {
          setHasDeferredPrompt(false);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setInstallStatusMessage("Instalación cancelada o incompleta.");
      } else {
        setInstallStatusMessage(
          "No se pudo iniciar la instalación desde este navegador.",
        );
      }
    } finally {
      setInstallBusy(false);
    }
  }, [installBusy, supportsWebInstall]);

  const canInstall = !isStandalone && (supportsWebInstall || hasDeferredPrompt);

  return {
    pushLoading,
    pushSupported,
    permissionState,
    serverConfigured,
    isSubscribed,
    topics,
    pushStatusMessage,
    canInstall,
    isStandalone,
    isIosSafari,
    installBusy,
    installStatusMessage,
    togglePush,
    setTopic,
    triggerInstall,
  };
}
