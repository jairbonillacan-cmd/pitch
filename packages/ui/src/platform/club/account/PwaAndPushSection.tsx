"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Switch } from "@heroui/react";
import { MaestroIcon } from "../../components/MaestroPrimitives";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PushServerStatus {
  configured: boolean;
  vapidPublicKey: string | null;
  subscriptions: Array<{
    endpoint: string;
    topicPicks: boolean;
    topicLive: boolean;
    topicSocial: boolean;
  }>;
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

export interface PwaAndPushSectionProps {
  readonly accountsEnabled: boolean;
  readonly canPersistServer: boolean;
  readonly onNotifyToast?: (msg: string, tone?: "default" | "success" | "warning") => void;
  /** Permite a Storybook / pruebas mostrar estados deterministas sin red. */
  readonly storyPushState?: {
    configured: boolean;
    subscribed: boolean;
    installAvailable?: boolean;
  };
}

/**
 * Controles de notificaciones Web Push (conectados a `/api/me/push` y `/sw.js`)
 * e instalación progresiva de la app PWA (`navigator.install()` con respaldo `beforeinstallprompt`).
 */
export function PwaAndPushSection({
  accountsEnabled,
  canPersistServer,
  onNotifyToast,
  storyPushState,
}: PwaAndPushSectionProps): React.JSX.Element {
  const pushLabelId = useId();
  const pushDescId = useId();

  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const [pushSupported, setPushSupported] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>("default");
  const [serverConfigured, setServerConfigured] = useState<boolean>(
    storyPushState?.configured ?? false,
  );
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(storyPushState?.subscribed ?? false);
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);
  const [topics, setTopics] = useState<{ picks: boolean; live: boolean; social: boolean }>({
    picks: true,
    live: true,
    social: true,
  });
  const [pushStatusMsg, setPushStatusMsg] = useState<string>("");

  // PWA Web Install API (`navigator.install()`) + fallback `beforeinstallprompt`
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [supportsWebInstall, setSupportsWebInstall] = useState<boolean>(false);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState<boolean>(
    Boolean(storyPushState?.installAvailable),
  );
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isIosSafari, setIsIosSafari] = useState<boolean>(false);
  const [installBusy, setInstallBusy] = useState<boolean>(false);
  const [installStatus, setInstallStatus] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent || "";
    const isIosDevice =
      /iP(hone|ad|od)/i.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isSafariEngine = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    setIsIosSafari(isIosDevice && isSafariEngine && !standalone);

    const webInstallAvailable =
      typeof (window.navigator as Navigator & { install?: () => Promise<void> }).install ===
      "function";
    setSupportsWebInstall(webInstallAvailable);

    const onBeforeInstall = (ev: Event) => {
      ev.preventDefault();
      deferredPromptRef.current = ev as BeforeInstallPromptEvent;
      setHasDeferredPrompt(true);
    };
    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      setIsStandalone(true);
      setInstallStatus("PitchLab ya está instalada en este dispositivo.");
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
    if (storyPushState || !canPersistServer) return;
    let active = true;
    fetch("/api/me/push", { headers: { accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PushServerStatus | null) => {
        if (!active || !data) return;
        setServerConfigured(Boolean(data.configured));
        setVapidPublicKey(data.vapidPublicKey ?? null);
        const firstSub = data.subscriptions?.[0];
        if (firstSub) {
          setIsSubscribed(true);
          setActiveEndpoint(firstSub.endpoint);
          setTopics({
            picks: firstSub.topicPicks,
            live: firstSub.topicLive,
            social: firstSub.topicSocial,
          });
        }
      })
      .catch((err) => {
        void err;
      });
    return () => {
      active = false;
    };
  }, [canPersistServer, storyPushState]);

  const handleTogglePush = async (next: boolean) => {
    if (pushLoading) return;
    if (storyPushState) {
      setIsSubscribed(next);
      return;
    }
    if (!canPersistServer || !pushSupported) return;

    setPushLoading(true);
    setPushStatusMsg("");
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
        setPushStatusMsg("Avisos push desactivados en este dispositivo.");
        onNotifyToast?.("Avisos push desactivados.", "default");
        return;
      }

      if (!serverConfigured || !vapidPublicKey) {
        setPushStatusMsg("Las notificaciones push aún no tienen clave VAPID activa en este entorno.");
        return;
      }

      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      setPermissionState(perm);
      if (perm !== "granted") {
        setPushStatusMsg("Permiso de notificaciones denegado por el navegador.");
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
        setPushStatusMsg("No se pudo guardar la suscripción push en el servidor.");
        return;
      }
      setIsSubscribed(true);
      setActiveEndpoint(subscription.endpoint);
      setPushStatusMsg("Notificaciones push activas en este dispositivo.");
      onNotifyToast?.("Notificaciones push activadas.", "success");
    } catch (err) {
      void err;
      setPushStatusMsg("No se pudo actualizar el estado de notificaciones push.");
    } finally {
      setPushLoading(false);
    }
  };

  const handleTopicChange = async (key: "picks" | "live" | "social", value: boolean) => {
    const nextTopics = { ...topics, [key]: value };
    setTopics(nextTopics);
    if (storyPushState || !canPersistServer || !isSubscribed || !activeEndpoint) return;
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
  };

  const canShowInstallButton = !isStandalone && (supportsWebInstall || hasDeferredPrompt);

  const handleInstallClick = async () => {
    if (installBusy) return;
    setInstallBusy(true);
    try {
      const navWithInstall = window.navigator as Navigator & { install?: () => Promise<void> };
      if (supportsWebInstall && typeof navWithInstall.install === "function") {
        // Llamada directa en el click handler para preservar transient user activation.
        await navWithInstall.install();
        setInstallStatus("PitchLab instalada o abierta como aplicación.");
        setIsStandalone(true);
      } else if (deferredPromptRef.current) {
        // Evento de un solo uso: limpiar referencia antes de esperar la elección del usuario.
        const promptEvent = deferredPromptRef.current;
        deferredPromptRef.current = null;
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        setInstallStatus(
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
        setInstallStatus("Instalación cancelada o incompleta.");
      } else {
        setInstallStatus("No se pudo iniciar la instalación desde este navegador.");
      }
    } finally {
      setInstallBusy(false);
    }
  };

  const pushDetailText = !accountsEnabled
    ? "Inicia sesión con tu cuenta para recibir avisos push de goles, inicio en 60 min y picks liquidados."
    : !pushSupported && !storyPushState
      ? "Este navegador no admite Web Push."
      : permissionState === "denied"
        ? "Permiso bloqueado en el navegador; habilítalo en la configuración del sitio."
        : !serverConfigured
          ? "Base Web Push lista en el dispositivo; pendiente habilitar claves VAPID en producción."
          : "Recibe avisos instantáneos de partidos vigilados, goles en vivo y picks liquidados.";

  const switchDisabled =
    !storyPushState &&
    (!accountsEnabled || !pushSupported || permissionState === "denied" || !serverConfigured || pushLoading);

  return (
    <div className="pl-acct-pesos-divider space-y-3" data-pwa-push-section="">
      <div className="pl-acct-prefs-row pl-acct-prefs-row--switch pl-acct-prefs-row--flush">
        <div className="pl-acct-prefs-row-copy">
          <b id={pushLabelId} className="pl-acct-prefs-row-title inline-flex items-center gap-1.5">
            <MaestroIcon name="bell" size={14} />
            <span>Notificaciones Push en este dispositivo</span>
          </b>
          <span id={pushDescId} className="pl-acct-prefs-row-detail">
            {pushDetailText}
          </span>
        </div>
        <Switch
          aria-labelledby={pushLabelId}
          aria-describedby={pushDescId}
          isSelected={isSubscribed}
          isDisabled={switchDisabled}
          onChange={(next) => {
            void handleTogglePush(next);
          }}
          className="pl-acct-switch"
        >
          <Switch.Control className="pl-acct-switch-control">
            <Switch.Thumb className="pl-acct-switch-thumb" />
          </Switch.Control>
        </Switch>
      </div>

      {isSubscribed ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Temas de avisos push">
          {(
            [
              { key: "picks", label: "Picks liquidados" },
              { key: "live", label: "Inicio 60 min y goles en vivo" },
              { key: "social", label: "Comunidad" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={topics[t.key]}
              onClick={() => {
                void handleTopicChange(t.key, !topics[t.key]);
              }}
              className="pl-acct-league-pill min-h-11 sm:min-h-9 px-3 text-xs"
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {pushStatusMsg ? (
        <p role="status" className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          {pushStatusMsg}
        </p>
      ) : null}

      {/* Botón progresivo de instalación PWA: oculto cuando el navegador no soporta la API */}
      <div
        className="flex flex-wrap items-center justify-between gap-2.5 pt-2 hairline-t"
        hidden={!canShowInstallButton && !installStatus && !isStandalone && !isIosSafari}
      >
        <div className="min-w-0">
          <b className="pl-acct-prefs-row-title block">App en tu pantalla de inicio</b>
          <span className="pl-acct-prefs-row-detail">
            {isStandalone
              ? "Estás usando PitchLab en modo aplicación instalada."
              : isIosSafari && !canShowInstallButton
                ? "Instala PitchLab en tu iPhone o iPad desde Safari en 2 pasos:"
                : "Instala PitchLab como app ligera con acceso directo y modo pantalla completa."}
          </span>
        </div>
        {canShowInstallButton ? (
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3.5 shrink-0 inline-flex items-center gap-1.5"
            aria-disabled={installBusy ? "true" : undefined}
            data-pwa-install-btn=""
            onClick={() => {
              void handleInstallClick();
            }}
          >
            <MaestroIcon name="download" size={13} />
            <span>{installBusy ? "Instalando..." : "Instalar PitchLab"}</span>
          </button>
        ) : null}
      </div>

      {isIosSafari && !isStandalone && !canShowInstallButton ? (
        <ol
          className="m-0 pl-0 list-none grid gap-2 sm:grid-cols-2 text-xs"
          aria-label="Cómo instalar PitchLab en iOS Safari"
          data-ios-install-guide=""
        >
          <li
            className="rounded-xl p-2.5 flex items-start gap-2"
            style={{ background: "var(--pl-surface)", border: "1px solid var(--pl-border)" }}
          >
            <span
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full font-extrabold text-[11px]"
              style={{ background: "var(--pl-brand)", color: "var(--pl-btn-primary-fg)" }}
              aria-hidden="true"
            >
              1
            </span>
            <span>
              Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.
            </span>
          </li>
          <li
            className="rounded-xl p-2.5 flex items-start gap-2"
            style={{ background: "var(--pl-surface)", border: "1px solid var(--pl-border)" }}
          >
            <span
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full font-extrabold text-[11px]"
              style={{ background: "var(--pl-brand)", color: "var(--pl-btn-primary-fg)" }}
              aria-hidden="true"
            >
              2
            </span>
            <span>
              Elige <strong>«Agregar a pantalla de inicio»</strong> y confirma.
            </span>
          </li>
        </ol>
      ) : null}

      {installStatus ? (
        <p role="status" className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          {installStatus}
        </p>
      ) : null}
    </div>
  );
}
