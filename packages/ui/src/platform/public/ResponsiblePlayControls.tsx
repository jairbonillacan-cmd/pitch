"use client";

import React, { useState } from "react";
import {
  Button,
  SettingsGroup,
  SettingsRow,
  EditorialCard,
} from "../../components/ui/primitives";
import {
  readStoredPrefs,
  writeStoredPrefs,
  type PauseChoice,
} from "../club/account/account-helpers";
import { useAbortableJson, useLocalStorageState } from "../hooks";

export interface ResponsiblePlayControlsProps {
  readonly disableNetwork?: boolean;
  readonly className?: string;
}

interface LocalResponsibleState {
  readonly pauseChoice: PauseChoice;
  readonly pauseUntilIso: string | null;
  readonly pauseCommunity: boolean;
}

const DEFAULT_LOCAL_STATE: LocalResponsibleState = {
  pauseChoice: null,
  pauseUntilIso: null,
  pauseCommunity: false,
};

const PAUSE_DURATIONS_MS: Readonly<Record<Exclude<PauseChoice, null>, number>> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const PAUSE_OPTIONS: ReadonlyArray<{
  readonly value: Exclude<PauseChoice, null>;
  readonly label: string;
  readonly detail: string;
}> = [
  { value: "24h", label: "24 horas", detail: "Pausa breve" },
  { value: "7d", label: "7 días", detail: "Una semana" },
  { value: "30d", label: "30 días", detail: "Un mes completo" },
];

const SHORT_DATE_TIME_MX = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Mexico_City",
});

function formatUntilMx(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return SHORT_DATE_TIME_MX.format(new Date(ms));
}

function isPauseChoice(value: unknown): value is Exclude<PauseChoice, null> {
  return value === "24h" || value === "7d" || value === "30d";
}

function parseLocalResponsibleState(raw: unknown): LocalResponsibleState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const pauseChoice: PauseChoice = isPauseChoice(obj.pauseChoice) ? obj.pauseChoice : null;
  const pauseUntilIso = typeof obj.pauseUntilIso === "string" ? obj.pauseUntilIso : null;
  const pauseCommunity = Boolean(obj.pauseCommunity);
  return { pauseChoice, pauseUntilIso, pauseCommunity };
}

function mirrorToAccountPrefsStorage(next: LocalResponsibleState): void {
  const current = readStoredPrefs();
  writeStoredPrefs({
    ...current,
    pauseChoice: next.pauseChoice,
    pauseChosenAtIso: next.pauseChoice ? new Date().toISOString() : null,
    privacy: {
      ...current.privacy,
      pauseCommunity: next.pauseCommunity,
    },
  });
}

function pauseChoiceLabel(choice: PauseChoice): string {
  if (choice === "24h") return "24 horas";
  if (choice === "7d") return "7 días";
  if (choice === "30d") return "30 días";
  return "Sin pausa";
}

export function ResponsiblePlayControls({
  disableNetwork = false,
  className,
}: ResponsiblePlayControlsProps = {}): React.JSX.Element {
  const sessionQuery = useAbortableJson<{
    authenticated?: boolean;
    hasAccountSession?: boolean;
  }>(disableNetwork ? null : "/api/public/session", { enabled: !disableNetwork });
  const hasSession = sessionQuery.data?.authenticated === true;
  const hasAccountSession = sessionQuery.data?.hasAccountSession === true;

  const [state, setState] = useLocalStorageState<LocalResponsibleState>(
    "pl-responsible-play-v1",
    DEFAULT_LOCAL_STATE,
    parseLocalResponsibleState,
  );
  const [busy, setBusy] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const persistPatch = async (
    next: LocalResponsibleState,
    serverPatch: Record<string, unknown>,
    localConfirmation: string,
  ): Promise<void> => {
    setState(next);
    mirrorToAccountPrefsStorage(next);

    if (!hasAccountSession || disableNetwork || typeof fetch !== "function") {
      setSyncMessage(`${localConfirmation} Guardado en este dispositivo.`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/me/preferences", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serverPatch),
      });
      if (response.ok) {
        setSyncMessage(`${localConfirmation} Sincronizado en tu cuenta y en este dispositivo.`);
      } else {
        setSyncMessage(
          `${localConfirmation} Guardado en este dispositivo; inicia sesión con cuenta para sincronizar en servidor.`,
        );
      }
    } catch (err) {
      void err;
      setSyncMessage(`${localConfirmation} Guardado localmente en este dispositivo.`);
    } finally {
      setBusy(false);
    }
  };

  const handleSelectPause = (choice: Exclude<PauseChoice, null>): void => {
    const untilIso = new Date(Date.now() + PAUSE_DURATIONS_MS[choice]).toISOString();
    const next: LocalResponsibleState = {
      ...state,
      pauseChoice: choice,
      pauseUntilIso: untilIso,
    };
    void persistPatch(
      next,
      { responsiblePauseKind: choice },
      `Descanso voluntario activado por ${pauseChoiceLabel(choice)}.`,
    );
  };

  const handleClearPause = (): void => {
    const next: LocalResponsibleState = {
      ...state,
      pauseChoice: null,
      pauseUntilIso: null,
    };
    void persistPatch(
      next,
      { responsiblePauseKind: null },
      "Descanso voluntario desactivado.",
    );
  };

  const handleToggleCommunityPause = (): void => {
    const nextCommunity = !state.pauseCommunity;
    const next: LocalResponsibleState = {
      ...state,
      pauseCommunity: nextCommunity,
    };
    void persistPatch(
      next,
      { pauseCommunity: nextCommunity },
      nextCommunity
        ? "Comunidad pausada: tus avisos sociales quedan silenciados."
        : "Comunidad reactivada.",
    );
  };

  const formattedUntil = formatUntilMx(state.pauseUntilIso);

  return (
    <div
      className={className ? `pl-rp-root ${className}` : "pl-rp-root"}
      data-responsible-play-controls=""
    >
      <EditorialCard
        title="Controles inmediatos de descanso y autocontrol"
        meta={hasSession ? "Sesión detectada" : "Disponible sin registro"}
      >
        <div className="pl-ed-stack">
          <p className="pl-ed-subcopy">
            Activa una pausa voluntaria ahora mismo. Se aplica de inmediato en este dispositivo y,
            si tienes cuenta activa, se sincroniza con tus preferencias.
          </p>

          <div
            className="pl-rp-pause-grid"
            role="group"
            aria-label="Elegir duración de descanso voluntario"
          >
            {PAUSE_OPTIONS.map((option) => {
              const active = state.pauseChoice === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  aria-pressed={active}
                  className="pl-rp-pause-btn"
                  data-rp-pause={option.value}
                  onClick={() => handleSelectPause(option.value)}
                >
                  <span className="num">{option.label}</span>
                  <span className="pl-rp-pause-sub">{option.detail}</span>
                </button>
              );
            })}
          </div>

          <div
            className={`pl-rp-status${state.pauseChoice ? " is-active" : ""}`}
            role="status"
            aria-live="polite"
            data-rp-status=""
          >
            <div>
              <strong>
                {state.pauseChoice
                  ? `Descanso activo: ${pauseChoiceLabel(state.pauseChoice)}`
                  : "Sin descanso temporal activo"}
              </strong>
              {state.pauseChoice && formattedUntil ? (
                <span className="pl-ed-muted num" style={{ display: "block" }}>
                  Hasta el {formattedUntil} (hora del Centro de México)
                </span>
              ) : null}
              {syncMessage ? (
                <span className="pl-ed-muted" style={{ display: "block", marginTop: 2 }}>
                  {syncMessage}
                </span>
              ) : null}
            </div>

            {state.pauseChoice ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={handleClearPause}>
                Quitar descanso
              </Button>
            ) : null}
          </div>

          <SettingsGroup title="Comunidad y preferencias de cuenta">
            <SettingsRow
              title="Pausar Comunidad"
              subtitle="Oculta tus publicaciones, te retira del Ranking y silencia avisos sociales sin borrar tu historial privado."
              trailing={
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.pauseCommunity}
                  aria-label="Pausar Comunidad"
                  disabled={busy}
                  className="pl-rp-switch"
                  data-rp-community-toggle=""
                  onClick={handleToggleCommunityPause}
                >
                  {state.pauseCommunity ? "Pausada" : "Activa"}
                </button>
              }
            />
            <SettingsRow
              title={
                hasSession
                  ? "Administrar todas las preferencias de descanso"
                  : "Iniciar sesión para sincronizar en tu cuenta"
              }
              subtitle={
                hasSession
                  ? "Abre /app/account?tab=prefs para ocultar montos en MXN o solicitar baja definitiva."
                  : "Tus pausas ya quedan guardadas localmente en este dispositivo."
              }
              href={
                hasSession
                  ? "/app/account?tab=prefs#pl-prefs-descanso"
                  : "/login?next=%2Flegal%2Fjuego-responsable"
              }
            />
          </SettingsGroup>
        </div>
      </EditorialCard>

      <EditorialCard
        title="Ayuda gratuita y confidencial en México"
        meta="Atención inmediata"
      >
        <div className="pl-ed-stack">
          <p className="pl-ed-subcopy">
            Si sientes pérdida de control, ansiedad o necesidad de hablar con un especialista, llama
            directamente sin costo en México:
          </p>

          <div className="pl-rp-helplines">
            <a
              href="tel:8009112000"
              className="pl-rp-tel-btn pl-rp-tel-btn--primary"
              data-rp-tel="linea-vida"
            >
              <span className="pl-rp-tel-title num">Línea de la Vida · 800 911 2000</span>
              <span className="pl-rp-tel-sub">
                CONASAMA · Secretaría de Salud · 24 horas, 365 días, gratuita y confidencial
              </span>
            </a>

            <a href="tel:5552121212" className="pl-rp-tel-btn" data-rp-tel="cij">
              <span className="pl-rp-tel-title num">CIJ · 55 5212 1212</span>
              <span className="pl-rp-tel-sub">
                Centros de Integración Juvenil · Orientación psicológica y familiar
              </span>
            </a>
          </div>
        </div>
      </EditorialCard>
    </div>
  );
}
