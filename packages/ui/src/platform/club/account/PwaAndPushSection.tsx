"use client";

import React, { useId } from "react";
import { Switch } from "@heroui/react";
import { Button } from "../../../components/ui/primitives";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { usePwaInstallAndPush, type PwaPushTopics } from "../../hooks";

export interface PwaAndPushSectionProps {
  readonly accountsEnabled: boolean;
  readonly canPersistServer: boolean;
  readonly onNotifyToast?: (msg: string, tone?: "default" | "success" | "warning") => void;
  readonly storyPushState?: {
    configured: boolean;
    subscribed: boolean;
    installAvailable?: boolean;
  };
}

const PUSH_TOPICS: ReadonlyArray<{ key: keyof PwaPushTopics; label: string }> = [
  { key: "picks", label: "Picks liquidados" },
  { key: "live", label: "Inicio 60 min y goles en vivo" },
  { key: "social", label: "Comunidad" },
];

export function PwaAndPushSection({
  accountsEnabled,
  canPersistServer,
  onNotifyToast,
  storyPushState,
}: PwaAndPushSectionProps): React.JSX.Element {
  const pushLabelId = useId();
  const pushDescId = useId();

  const pwa = usePwaInstallAndPush({
    enabled: canPersistServer,
    onNotify: onNotifyToast,
    overrideState: storyPushState,
  });

  const pushDetailText = !accountsEnabled
    ? "Inicia sesión con tu cuenta para recibir avisos push de goles, inicio en 60 min y picks liquidados."
    : !pwa.pushSupported && !storyPushState
      ? "Este navegador no admite Web Push."
      : pwa.permissionState === "denied"
        ? "Permiso bloqueado en el navegador; habilítalo en la configuración del sitio."
        : !pwa.serverConfigured
          ? "Base Web Push lista en el dispositivo; pendiente habilitar claves VAPID en producción."
          : "Recibe avisos instantáneos de partidos vigilados, goles en vivo y picks liquidados.";

  const switchDisabled =
    !storyPushState &&
    (!accountsEnabled ||
      !pwa.pushSupported ||
      pwa.permissionState === "denied" ||
      !pwa.serverConfigured ||
      pwa.pushLoading);

  const showInstallBlock =
    pwa.canInstall ||
    Boolean(pwa.installStatusMessage) ||
    pwa.isStandalone ||
    pwa.isIosSafari;

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
          isSelected={pwa.isSubscribed}
          isDisabled={switchDisabled}
          onChange={(next) => {
            void pwa.togglePush(next);
          }}
          className="pl-acct-switch"
        >
          <Switch.Control className="pl-acct-switch-control">
            <Switch.Thumb className="pl-acct-switch-thumb" />
          </Switch.Control>
        </Switch>
      </div>

      {pwa.isSubscribed ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Temas de avisos push">
          {PUSH_TOPICS.map((topic) => (
            <button
              key={topic.key}
              type="button"
              aria-pressed={pwa.topics[topic.key]}
              onClick={() => {
                void pwa.setTopic(topic.key, !pwa.topics[topic.key]);
              }}
              className="pl-acct-league-pill pl-acct-chip-btn"
            >
              {topic.label}
            </button>
          ))}
        </div>
      ) : null}

      {pwa.pushStatusMessage ? (
        <p role="status" aria-live="polite" className="m-0 text-xs text-[var(--pl-text-muted)]">
          {pwa.pushStatusMessage}
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-[var(--pl-border)]"
        hidden={!showInstallBlock}
      >
        <div className="min-w-0 flex-1">
          <b className="pl-acct-prefs-row-title block">App en tu pantalla de inicio</b>
          <span className="pl-acct-prefs-row-detail">
            {pwa.isStandalone
              ? "Estás usando PitchLab en modo aplicación instalada."
              : pwa.isIosSafari && !pwa.canInstall
                ? "Instala PitchLab en tu iPhone o iPad desde Safari en 2 pasos:"
                : "Instala PitchLab como acceso directo ligero con modo pantalla completa."}
          </span>
        </div>
        {pwa.canInstall ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pwa.installBusy}
            data-pwa-install-btn=""
            onClick={() => {
              void pwa.triggerInstall();
            }}
          >
            <MaestroIcon name="download" size={14} />
            <span>{pwa.installBusy ? "Instalando…" : "Instalar PitchLab"}</span>
          </Button>
        ) : null}
      </div>

      {pwa.isIosSafari && !pwa.isStandalone && !pwa.canInstall ? (
        <ol
          className="m-0 pl-0 list-none grid gap-2 sm:grid-cols-2 text-xs"
          aria-label="Cómo instalar PitchLab en iOS Safari"
          data-ios-install-guide=""
        >
          <li className="rounded-xl p-3 flex items-start gap-2 bg-[var(--pl-surface-elevated)] border border-[var(--pl-border)]">
            <span
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full font-extrabold text-[11px] bg-[var(--pl-brand)] text-[var(--pl-btn-primary-fg)] num"
              aria-hidden="true"
            >
              1
            </span>
            <span>
              Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.
            </span>
          </li>
          <li className="rounded-xl p-3 flex items-start gap-2 bg-[var(--pl-surface-elevated)] border border-[var(--pl-border)]">
            <span
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full font-extrabold text-[11px] bg-[var(--pl-brand)] text-[var(--pl-btn-primary-fg)] num"
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

      {pwa.installStatusMessage ? (
        <p role="status" aria-live="polite" className="m-0 text-xs text-[var(--pl-text-muted)]">
          {pwa.installStatusMessage}
        </p>
      ) : null}
    </div>
  );
}
