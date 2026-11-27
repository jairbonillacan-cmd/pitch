"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  Button,
  EditorialCard,
} from "../../components/ui/primitives";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../components/PlatformOverlays";
import { SettingsGroup, SettingsRow } from "../components/SettingsGroup";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useAbortableJson, useSafeEffect } from "../hooks";
import { usePlatformActions, usePlatformCore } from "../platform-provider";
import {
  readStoredPrefs,
  writeStoredPrefs,
  type PauseChoice,
  type StoredAccountPrefsV1,
} from "./account/account-helpers";

interface ServerResponsiblePrefsEnvelope {
  readonly preferences?: {
    readonly showMxnBalance?: boolean;
    readonly pauseCommunity?: boolean;
    readonly responsiblePauseKind?: Exclude<PauseChoice, null> | null;
    readonly responsiblePauseUntilIso?: string | null;
  };
}

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

function pauseChoiceLabel(choice: PauseChoice): string {
  if (choice === "24h") return "24 horas";
  if (choice === "7d") return "7 días";
  if (choice === "30d") return "30 días";
  return "Sin pausa";
}

export function resolveStoredPauseUntilIso(
  pauseChoice: PauseChoice,
  pauseChosenAtIso: string | null,
  nowMs = Date.now(),
): string | null {
  if (!pauseChoice || !pauseChosenAtIso) return null;
  const untilMs = Date.parse(pauseChosenAtIso);
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) {
    return null;
  }
  return new Date(untilMs).toISOString();
}

function mirrorResponsibleLocalState(next: {
  readonly pauseChoice: PauseChoice;
  readonly pauseUntilIso: string | null;
  readonly pauseCommunity: boolean;
}): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("pl-responsible-play-v1", JSON.stringify(next));
  } catch (err) {
    void err;
  }
}

export function ClubResponsiblePlayView({
  disableNetwork = false,
}: {
  readonly disableNetwork?: boolean;
} = {}): React.JSX.Element {
  const { hasAccountSessionAuth, showMxnBalance, serverPreferences, serverPreferencesLoaded } =
    usePlatformCore();
  const { setShowMxnBalance, navigateTo, pushToast, updateServerPreferences } = usePlatformActions();

  const canPersistServer = Boolean(
    hasAccountSessionAuth && !disableNetwork && typeof fetch === "function",
  );

  const [prefs, setPrefs] = useState<StoredAccountPrefsV1>(() => readStoredPrefs());
  const [pauseUntilIso, setPauseUntilIso] = useState<string | null>(null);
  const [pendingPause, setPendingPause] = useState<Exclude<PauseChoice, null> | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const hydratedRef = useRef<unknown>(null);

  const shouldFallbackFetchPrefs = Boolean(
    canPersistServer && serverPreferencesLoaded === undefined && serverPreferences === undefined,
  );
  const serverQuery = useAbortableJson<ServerResponsiblePrefsEnvelope>("/api/me/preferences", {
    enabled: shouldFallbackFetchPrefs,
  });
  const effectivePrefsPayload =
    serverPreferences !== undefined ? serverPreferences : (serverQuery.data?.preferences ?? null);

  useSafeEffect(() => {
    const stored = readStoredPrefs();
    setPrefs(stored);
    setPauseUntilIso(resolveStoredPauseUntilIso(stored.pauseChoice, stored.pauseChosenAtIso));
  }, []);

  useSafeEffect(() => {
    const p = effectivePrefsPayload;
    if (!canPersistServer || !p) return;
    if (hydratedRef.current === p) return;
    hydratedRef.current = p;

    const pauseKind: PauseChoice =
      p.responsiblePauseKind === "24h" ||
      p.responsiblePauseKind === "7d" ||
      p.responsiblePauseKind === "30d"
        ? p.responsiblePauseKind
        : null;
    if (typeof p.showMxnBalance === "boolean") {
      setShowMxnBalance(p.showMxnBalance);
    }
    setPauseUntilIso(p.responsiblePauseUntilIso ?? null);
    setPrefs((prev) => {
      const next: StoredAccountPrefsV1 = {
        ...prev,
        showMxnBalance:
          typeof p.showMxnBalance === "boolean" ? p.showMxnBalance : prev.showMxnBalance,
        pauseChoice: pauseKind,
        pauseChosenAtIso: p.responsiblePauseUntilIso ?? null,
        privacy: {
          ...prev.privacy,
          pauseCommunity:
            typeof p.pauseCommunity === "boolean" ? p.pauseCommunity : prev.privacy.pauseCommunity,
        },
      };
      writeStoredPrefs(next);
      return next;
    });
  }, [canPersistServer, effectivePrefsPayload, setShowMxnBalance]);

  const persistServer = useCallback(
    async (patch: Record<string, unknown>, onRevert: () => void): Promise<boolean> => {
      if (!canPersistServer) return true;
      setBusy(true);
      try {
        const res = await fetch("/api/me/preferences", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          onRevert();
          pushToast("No pudimos guardar el cambio en tu cuenta.", "warning");
          return false;
        }
        return true;
      } catch (err) {
        void err;
        onRevert();
        pushToast("Error de conexión al guardar en tu cuenta.", "warning");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [canPersistServer, pushToast],
  );

  const handleConfirmPause = useCallback(() => {
    if (!pendingPause) return;
    const chosen = pendingPause;
    const prevChoice = prefs.pauseChoice;
    const prevChosenAt = prefs.pauseChosenAtIso;
    const prevUntil = pauseUntilIso;
    const untilIso = new Date(Date.now() + PAUSE_DURATIONS_MS[chosen]).toISOString();

    setPendingPause(null);
    setPauseUntilIso(untilIso);
    setPrefs((curr) => {
      const next: StoredAccountPrefsV1 = {
        ...curr,
        pauseChoice: chosen,
        pauseChosenAtIso: untilIso,
      };
      writeStoredPrefs(next);
      return next;
    });
    mirrorResponsibleLocalState({
      pauseChoice: chosen,
      pauseUntilIso: untilIso,
      pauseCommunity: prefs.privacy.pauseCommunity,
    });

    void persistServer({ responsiblePauseKind: chosen }, () => {
      setPauseUntilIso(prevUntil);
      setPrefs((curr) => {
        const reverted: StoredAccountPrefsV1 = {
          ...curr,
          pauseChoice: prevChoice,
          pauseChosenAtIso: prevChosenAt,
        };
        writeStoredPrefs(reverted);
        return reverted;
      });
    }).then((ok) => {
      if (ok) {
        updateServerPreferences?.({
          responsiblePauseKind: chosen,
          responsiblePauseUntilIso: untilIso,
        });
        pushToast(`Descanso voluntario activado (${pauseChoiceLabel(chosen)}).`, "success");
      }
    });
  }, [pauseUntilIso, pendingPause, persistServer, prefs.pauseChoice, prefs.pauseChosenAtIso, prefs.privacy.pauseCommunity, pushToast, updateServerPreferences]);

  const handleClearPause = useCallback(() => {
    const prevChoice = prefs.pauseChoice;
    const prevChosenAt = prefs.pauseChosenAtIso;
    const prevUntil = pauseUntilIso;

    setPauseUntilIso(null);
    setPrefs((curr) => {
      const next: StoredAccountPrefsV1 = {
        ...curr,
        pauseChoice: null,
        pauseChosenAtIso: null,
      };
      writeStoredPrefs(next);
      return next;
    });
    mirrorResponsibleLocalState({
      pauseChoice: null,
      pauseUntilIso: null,
      pauseCommunity: prefs.privacy.pauseCommunity,
    });

    void persistServer({ responsiblePauseKind: null }, () => {
      setPauseUntilIso(prevUntil);
      setPrefs((curr) => {
        const reverted: StoredAccountPrefsV1 = {
          ...curr,
          pauseChoice: prevChoice,
          pauseChosenAtIso: prevChosenAt,
        };
        writeStoredPrefs(reverted);
        return reverted;
      });
    }).then((ok) => {
      if (ok) {
        pushToast("Descanso voluntario desactivado.", "default");
      }
    });
  }, [pauseUntilIso, persistServer, prefs.pauseChoice, prefs.pauseChosenAtIso, prefs.privacy.pauseCommunity, pushToast]);

  const handleToggleCommunityPause = useCallback(() => {
    const prevVal = prefs.privacy.pauseCommunity;
    const nextVal = !prevVal;
    setPrefs((curr) => {
      const next: StoredAccountPrefsV1 = {
        ...curr,
        privacy: { ...curr.privacy, pauseCommunity: nextVal },
      };
      writeStoredPrefs(next);
      return next;
    });
    mirrorResponsibleLocalState({
      pauseChoice: prefs.pauseChoice,
      pauseUntilIso: pauseUntilIso,
      pauseCommunity: nextVal,
    });

    void persistServer({ pauseCommunity: nextVal }, () => {
      setPrefs((curr) => {
        const reverted: StoredAccountPrefsV1 = {
          ...curr,
          privacy: { ...curr.privacy, pauseCommunity: prevVal },
        };
        writeStoredPrefs(reverted);
        return reverted;
      });
    }).then((ok) => {
      if (ok) {
        pushToast(
          nextVal
            ? "Comunidad pausada: tus avisos sociales quedaron silenciados."
            : "Comunidad reactivada.",
          "default",
        );
      }
    });
  }, [pauseUntilIso, persistServer, prefs.pauseChoice, prefs.privacy.pauseCommunity, pushToast]);

  const handleToggleHideMxn = useCallback(() => {
    const prevShow = showMxnBalance;
    const nextShow = !prevShow;
    setShowMxnBalance(nextShow);
    setPrefs((curr) => {
      const next: StoredAccountPrefsV1 = { ...curr, showMxnBalance: nextShow };
      writeStoredPrefs(next);
      return next;
    });

    void persistServer({ showMxnBalance: nextShow }, () => {
      setShowMxnBalance(prevShow);
      setPrefs((curr) => {
        const reverted: StoredAccountPrefsV1 = { ...curr, showMxnBalance: prevShow };
        writeStoredPrefs(reverted);
        return reverted;
      });
    }).then((ok) => {
      if (ok) {
        pushToast(
          nextShow
            ? "Referencia en MXN visible en tu récord privado."
            : "Montos en MXN ocultos; tu récord se muestra solo en unidades.",
          "default",
        );
      }
    });
  }, [persistServer, pushToast, setShowMxnBalance, showMxnBalance]);

  const formattedUntil = formatUntilMx(pauseUntilIso);

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/juego-responsable">
        <div className="pl-ed-club-wrap" data-club-responsible-play="">
          <div className="pl-rp-root space-y-5 max-w-4xl mx-auto">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <h1 className="m-0 text-2xl font-extrabold tracking-tight text-[var(--pl-text)]">
                  Juego responsable
                </h1>
                <p className="m-0 text-sm text-[var(--pl-text-secondary)] max-w-[65ch]">
                  PitchLab es una plataforma informativa de análisis deportivo (+18). No recibimos
                  apuestas ni pagos de premios. Aquí administras pausas voluntarias, silencio social
                  y líneas gratuitas de apoyo en México.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigateTo("/app/account?tab=prefs")}
              >
                <MaestroIcon name="arrowLeft" size={14} />
                <span>Preferencias</span>
              </Button>
            </header>

            <EditorialCard
              title="Descanso voluntario de tu cuenta"
              meta={prefs.pauseChoice ? `Activo · ${pauseChoiceLabel(prefs.pauseChoice)}` : "Sin pausa"}
            >
              <div className="pl-ed-stack">
                <p className="pl-ed-subcopy">
                  Toma un respiro cuando lo necesites. Pausar tu cuenta suspende alertas y avisos
                  durante el periodo elegido sin borrar tu bitácora.
                </p>

                <div
                  className="pl-rp-pause-grid"
                  role="group"
                  aria-label="Elegir duración de descanso voluntario"
                >
                  {PAUSE_OPTIONS.map((option) => {
                    const active = prefs.pauseChoice === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={busy}
                        aria-pressed={active}
                        className="pl-rp-pause-btn"
                        data-rp-pause={option.value}
                        onClick={() => setPendingPause(option.value)}
                      >
                        <span className="num">{option.label}</span>
                        <span className="pl-rp-pause-sub">{option.detail}</span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className={`pl-rp-status${prefs.pauseChoice ? " is-active" : ""}`}
                  role="status"
                  aria-live="polite"
                  data-rp-status=""
                >
                  <div>
                    <strong>
                      {prefs.pauseChoice
                        ? `Descanso activo: ${pauseChoiceLabel(prefs.pauseChoice)}`
                        : "Sin descanso temporal activo"}
                    </strong>
                    {prefs.pauseChoice && formattedUntil ? (
                      <span className="pl-ed-muted num block">
                        Hasta el {formattedUntil} (hora del Centro de México)
                      </span>
                    ) : null}
                  </div>

                  {prefs.pauseChoice ? (
                    <Button variant="secondary" size="sm" disabled={busy} onClick={handleClearPause}>
                      Quitar descanso
                    </Button>
                  ) : null}
                </div>
              </div>
            </EditorialCard>

            <SettingsGroup title="Controles rápidos en el Club">
              <SettingsRow
                icon="users"
                title="Pausar Comunidad"
                subtitle="Oculta tus publicaciones, te retira del Ranking y silencia notificaciones sociales."
                trailing={
                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs.privacy.pauseCommunity}
                    aria-label="Pausar Comunidad"
                    disabled={busy}
                    className="pl-rp-switch"
                    data-rp-community-toggle=""
                    onClick={handleToggleCommunityPause}
                  >
                    {prefs.privacy.pauseCommunity ? "Pausada" : "Activa"}
                  </button>
                }
              />
              <SettingsRow
                icon="bankroll-wallet"
                title="Mostrar récord solo en unidades"
                subtitle="Oculta cualquier equivalencia referencial en pesos mexicanos (MXN) dentro de Mi récord."
                trailing={
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!showMxnBalance}
                    aria-label="Mostrar récord solo en unidades"
                    disabled={busy}
                    className="pl-rp-switch"
                    data-rp-units-only-toggle=""
                    onClick={handleToggleHideMxn}
                  >
                    {!showMxnBalance ? "Solo unidades" : "Con MXN"}
                  </button>
                }
              />
              <SettingsRow
                icon="shield"
                title="Compromiso legal y política +18"
                subtitle="Marco informativo SEGOB, LFPDPPP y principios completos de juego responsable."
                href="/legal/juego-responsable"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/legal/juego-responsable");
                }}
              />
            </SettingsGroup>

            <EditorialCard title="Principios de análisis responsable" meta="+18 · México">
              <ul className="m-0 pl-5 space-y-2 text-sm text-[var(--pl-text-secondary)]">
                <li>
                  <strong className="text-[var(--pl-text)]">La probabilidad no garantiza un resultado:</strong>{" "}
                  incluso un escenario con 75 % estimado falla en aproximadamente 1 de cada 4 ocasiones.
                </li>
                <li>
                  <strong className="text-[var(--pl-text)]">Protege tus finanzas personales:</strong>{" "}
                  nunca comprometas dinero destinado a vivienda, salud, alimentación, ahorro o deudas,
                  ni intentes recuperar pérdidas.
                </li>
                <li>
                  <strong className="text-[var(--pl-text)]">Decisiones sin impulso:</strong> utiliza la
                  bitácora en unidades simuladas antes del partido para evaluar criterio con calma.
                </li>
              </ul>
            </EditorialCard>

            <EditorialCard title="Líneas gratuitas de ayuda en México" meta="Confidencial · 24/7">
              <div className="pl-ed-stack">
                <p className="pl-ed-subcopy">
                  Si tú o alguien cercano experimenta ansiedad, pérdida de control o estrés relacionado
                  con el juego con apuesta, llama sin costo en México:
                </p>

                <div className="pl-rp-helplines">
                  <a
                    href="tel:8009112000"
                    className="pl-rp-tel-btn pl-rp-tel-btn--primary"
                    data-rp-tel="linea-vida"
                  >
                    <span className="pl-rp-tel-title num">Línea de la Vida · 800 911 2000</span>
                    <span className="pl-rp-tel-sub">
                      CONASAMA · Secretaría de Salud · 24 horas, los 365 días del año
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
        </div>

        <ConfirmActionDialog
          open={pendingPause !== null}
          title={
            pendingPause
              ? `¿Activar descanso voluntario por ${pauseChoiceLabel(pendingPause)}?`
              : "¿Activar descanso voluntario?"
          }
          description={
            pendingPause
              ? `Pausaremos tus alertas y avisos durante ${pauseChoiceLabel(pendingPause)}. Tu historial y tus picks sellados permanecen intactos y puedes quitar el descanso cuando quieras.`
              : ""
          }
          cancelLabel="Cancelar"
          confirmLabel="Confirmar descanso"
          tone="brand"
          onConfirm={handleConfirmPause}
          onCancel={() => setPendingPause(null)}
        />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
