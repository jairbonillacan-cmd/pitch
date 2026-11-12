"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Switch } from "@heroui/react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge } from "../../../sports";
import { ExampleBadge } from "../../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../../components/PlatformOverlays";
import { usePlatform } from "../../platform-provider";
import { formatUnits, profileRecord } from "../../profile-stats";
import type { OddsFormat, RiskBand } from "../../types";
import {
  DEFAULT_STORED_PREFS_V1,
  readStoredPrefs,
  toggleLeagueSelection,
  writeStoredPrefs,
  type PauseChoice,
  type SessionAccountIdentity,
  type StoredAccountPrefsV1,
  type ThemePreference,
} from "./account-helpers";

export interface PrefsTabStoryOverride {
  accountsEnabled?: boolean;
  email?: string | null;
  initialPrefs?: Partial<StoredAccountPrefsV1>;
}

const PREF_GROUPS = [
  { id: "pl-prefs-ligas", label: "Tus ligas" },
  { id: "pl-prefs-datos", label: "Cómo ves los datos" },
  { id: "pl-prefs-picks", label: "Picks y parlays" },
  { id: "pl-prefs-alertas", label: "Alertas" },
  { id: "pl-prefs-privacidad", label: "Privacidad" },
  { id: "pl-prefs-descanso", label: "Juego responsable" },
] as const;

type PrefGroupId = (typeof PREF_GROUPS)[number]["id"];

const LEAGUE_OPTIONS: ReadonlyArray<{ id: LeagueId; name: string }> = [
  { id: "liga-mx" as LeagueId, name: "Liga MX" },
  { id: "nfl" as LeagueId, name: "NFL" },
  { id: "premier-league" as LeagueId, name: "Premier League" },
  { id: "laliga" as LeagueId, name: "LaLiga" },
  { id: "bundesliga" as LeagueId, name: "Bundesliga" },
  { id: "serie-a" as LeagueId, name: "Serie A" },
  { id: "ligue-1" as LeagueId, name: "Ligue 1" },
];

const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/Mexico_City", label: "Ciudad de México (UTC−6)" },
  { value: "America/Tijuana", label: "Tijuana (UTC−8)" },
  { value: "America/Cancun", label: "Cancún (UTC−5)" },
  { value: "America/Hermosillo", label: "Hermosillo (UTC−7)" },
];

const RISK_OPTIONS: ReadonlyArray<{ value: RiskBand; name: string; detail: string }> = [
  { value: "conservador", name: "Conservador", detail: "Picks de 72 % o más" },
  { value: "medio", name: "Medio", detail: "Picks de 56 a 72 %" },
  { value: "arriesgado", name: "Arriesgado", detail: "Lo más parejo, momios más altos" },
];

const ALERT_ITEMS: ReadonlyArray<{
  key: keyof StoredAccountPrefsV1["alerts"];
  title: string;
  detail: string;
}> = [
  {
    key: "valueAlerts",
    title: "Alertas de valor",
    detail: "Cuando un momio paga más que el justo en tus ligas.",
  },
  {
    key: "beforeMatch",
    title: "Antes del partido",
    detail: "30 minutos antes de los partidos con picks en tu bitácora.",
  },
  {
    key: "pickSettled",
    title: "Resultado de tus picks",
    detail: "Cuando un pick de tu bitácora se cumple o no.",
  },
  {
    key: "billingReminder",
    title: "Aviso antes de cobrar",
    detail: "Unos días antes de renovar tu pase.",
  },
];

const PRIVACY_ITEMS: ReadonlyArray<{
  key: keyof StoredAccountPrefsV1["privacy"];
  title: string;
  detail: string;
}> = [
  {
    key: "publicProfile",
    title: "Perfil público",
    detail: "Otros socios ven tu perfil, tu saldo en unidades y tus picks cerrados.",
  },
  {
    key: "showInRanking",
    title: "Aparecer en el ranking",
    detail: "Tu nombre entra al ranking de Comunidad cuando tienes 20 picks cerrados en el mes.",
  },
  {
    key: "pauseCommunity",
    title: "Pausar Comunidad",
    detail:
      "Ocultas tus publicaciones y dejas de recibir avisos de Comunidad. Tu bitácora sigue igual.",
  },
];

const BREAK_OPTIONS: ReadonlyArray<{ value: Exclude<PauseChoice, null>; label: string }> = [
  { value: "24h", label: "24 horas" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
];

function applyDocumentThemeMode(mode: ThemePreference): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const resolvedLight =
    mode === "light" ||
    (mode === "system" &&
      Boolean(window.matchMedia?.("(prefers-color-scheme: light)").matches));
  const target: "dark" | "light" = resolvedLight ? "light" : "dark";
  const root = document.documentElement;
  if ((root.dataset.theme === "light" ? "light" : "dark") !== target) {
    root.dataset.themeSwitching = "true";
    root.dataset.theme = target;
    void root.offsetHeight;
    delete root.dataset.themeSwitching;
  }
  root.style.colorScheme = target;
  try {
    if (mode === "system") {
      window.localStorage.removeItem("pl-theme");
    } else {
      window.localStorage.setItem("pl-theme", target);
    }
  } catch (err) {
    void err;
  }
}

function PrefsSegment<T extends string>({
  labelledBy,
  ariaLabel,
  value,
  onChange,
  options,
}: {
  labelledBy?: string;
  ariaLabel?: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}): React.JSX.Element {
  return (
    <div
      className="pl-acct-seg"
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : ariaLabel}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const idx = options.findIndex((o) => o.value === value);
        const safeIdx = idx >= 0 ? idx : 0;
        const delta = e.key === "ArrowRight" ? 1 : -1;
        const nextOpt = options[(safeIdx + delta + options.length) % options.length]!;
        onChange(nextOpt.value);
        const btn = e.currentTarget.querySelector<HTMLButtonElement>(
          `[data-seg-value="${nextOpt.value}"]`,
        );
        btn?.focus();
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-seg-value={opt.value}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function mergePrefs(
  base: StoredAccountPrefsV1,
  override?: Partial<StoredAccountPrefsV1>,
): StoredAccountPrefsV1 {
  if (!override) return base;
  return {
    ...base,
    ...override,
    alerts: { ...base.alerts, ...(override.alerts ?? {}) },
    privacy: { ...base.privacy, ...(override.privacy ?? {}) },
  };
}

type PrefsDialogKind = "pause" | "export" | "delete" | null;

export function PrefsTab({
  identity,
  serverEmail,
  onSaved,
  storyOverride,
}: {
  identity: SessionAccountIdentity;
  serverEmail?: string | null;
  onSaved?: () => void;
  storyOverride?: PrefsTabStoryOverride;
}): React.JSX.Element {
  const {
    accountsEnabled: ctxAccountsEnabled,
    favoriteLeagues,
    setFavoriteLeagues,
    oddsFormat,
    setOddsFormat,
    riskPreference,
    setRiskPreference,
    journal,
  } = usePlatform();

  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;
  const emailDisplay = storyOverride?.email ?? serverEmail ?? identity.atHandle;

  const baseId = useId();
  const oddsLabelId = `${baseId}-odds`;
  const themeLabelId = `${baseId}-theme`;
  const tzSelectId = `${baseId}-tz`;
  const unitInputId = `${baseId}-unit`;
  const pesosLabelId = `${baseId}-pesos-label`;
  const pesosDescId = `${baseId}-pesos-desc`;
  const pauseDialogTitleId = `${baseId}-pause-dlg`;
  const exportDialogTitleId = `${baseId}-export-dlg`;
  const deleteDialogTitleId = `${baseId}-delete-dlg`;

  const [prefs, setPrefs] = useState<StoredAccountPrefsV1>(() =>
    mergePrefs(DEFAULT_STORED_PREFS_V1, storyOverride?.initialPrefs),
  );
  const [unitDraft, setUnitDraft] = useState<string>(() =>
    String(storyOverride?.initialPrefs?.unitMxn ?? DEFAULT_STORED_PREFS_V1.unitMxn),
  );
  const [pendingBreak, setPendingBreak] = useState<Exclude<PauseChoice, null>>("7d");
  const [lastLeagueWarn, setLastLeagueWarn] = useState<boolean>(false);
  const [activeGroup, setActiveGroup] = useState<PrefGroupId>("pl-prefs-ligas");
  const [localSavedTick, setLocalSavedTick] = useState<number>(0);
  const [activeDialog, setActiveDialog] = useState<PrefsDialogKind>(null);
  const [accountActionNote, setAccountActionNote] = useState<string | null>(null);

  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const stored = mergePrefs(readStoredPrefs(), storyOverride?.initialPrefs);
    setPrefs(stored);
    setUnitDraft(String(stored.unitMxn));
    if (stored.pauseChoice) {
      setPendingBreak(stored.pauseChoice);
    }
  }, [storyOverride?.initialPrefs]);

  // Si el modo es «Sistema», escucha cambios del esquema de color del dispositivo.
  useEffect(() => {
    if (typeof window === "undefined" || prefs.themeMode !== "system") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const onSystemChange = () => applyDocumentThemeMode("system");
    mq.addEventListener?.("change", onSystemChange);
    return () => mq.removeEventListener?.("change", onSystemChange);
  }, [prefs.themeMode]);

  // Si el usuario alterna el tema desde el botón superior o el menú de cuenta, sincroniza el estado.
  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      try {
        const explicit = window.localStorage.getItem("pl-theme");
        if (explicit === "light" || explicit === "dark") {
          setPrefs((prev) => {
            if (prev.themeMode === explicit) return prev;
            const next = { ...prev, themeMode: explicit as ThemePreference };
            writeStoredPrefs(next);
            return next;
          });
        }
      } catch (err) {
        void err;
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // Resalta en el índice el grupo visible al hacer scroll.
  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    const elements = PREF_GROUPS.map((g) => document.getElementById(g.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveGroup(visible[0].target.id as PrefGroupId);
        }
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: [0, 0.25] },
    );

    for (const el of elements) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;
    const activeChip = navEl.querySelector<HTMLElement>(`[data-pref-nav="${activeGroup}"]`);
    activeChip?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      container: "nearest",
    } as ScrollIntoViewOptions);
  }, [activeGroup]);

  const notifySaved = useCallback(() => {
    setLocalSavedTick((n) => n + 1);
    onSaved?.();
  }, [onSaved]);

  const updatePrefs = useCallback(
    (updater: (prev: StoredAccountPrefsV1) => StoredAccountPrefsV1) => {
      setPrefs((prev) => {
        const next = updater(prev);
        writeStoredPrefs(next);
        return next;
      });
      notifySaved();
    },
    [notifySaved],
  );

  const handleToggleLeague = (leagueId: LeagueId) => {
    const result = toggleLeagueSelection(favoriteLeagues, leagueId);
    if (result.blockedLast) {
      setLastLeagueWarn(true);
      return;
    }
    setLastLeagueWarn(false);
    setFavoriteLeagues(result.next);
    notifySaved();
  };

  const handleOddsChange = (next: OddsFormat) => {
    if (next === oddsFormat) return;
    setOddsFormat(next);
    notifySaved();
  };

  const handleThemeChange = (next: ThemePreference) => {
    applyDocumentThemeMode(next);
    updatePrefs((prev) => ({ ...prev, themeMode: next }));
  };

  const handleUnitInputChange = (raw: string) => {
    setUnitDraft(raw);
    const cleaned = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(cleaned) && cleaned >= 10) {
      const clamped = Math.min(100_000, Math.round(cleaned));
      updatePrefs((prev) => ({ ...prev, unitMxn: clamped }));
    }
  };

  const handleJumpToGroup = (e: React.MouseEvent<HTMLAnchorElement>, groupId: PrefGroupId) => {
    e.preventDefault();
    setActiveGroup(groupId);
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const section = document.getElementById(groupId);
    if (!section) return;
    const reduced = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    section.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const record = useMemo(() => profileRecord(journal), [journal]);

  const parsedUnit = useMemo(() => {
    const n = Number(unitDraft.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : prefs.unitMxn;
  }, [prefs.unitMxn, unitDraft]);

  const sampleUnits = 6.4;
  const activeUnits = record.settled > 0 ? record.netUnits : sampleUnits;
  const mxnAmount = Math.round(Math.abs(activeUnits) * parsedUnit);
  const mxnSign = activeUnits < 0 ? "−" : "";
  const formattedMxn = `${mxnSign}$${mxnAmount.toLocaleString("es-MX")} MXN`;

  const selectedBreakLabel =
    BREAK_OPTIONS.find((b) => b.value === (prefs.pauseChoice ?? pendingBreak))?.label ?? "7 días";

  return (
    <div className="pl-acct-prefs-wrap">
      {!onSaved ? (
        <div className="pl-acct-prefs-standalone-status">
          <span role="status" aria-live="polite" className="pl-acct-autosave">
            <span className="pl-acct-autosave-dot" aria-hidden="true" />
            <span>{localSavedTick > 0 ? "Guardado" : "Los cambios se guardan solos"}</span>
          </span>
        </div>
      ) : null}

      <div className="pl-acct-prefs-layout">
        <nav
          ref={navRef}
          className="pl-acct-prefs-nav glass-card glass-ring"
          aria-label="Grupos de preferencias"
        >
          {PREF_GROUPS.map((group) => {
            const isActive = activeGroup === group.id;
            return (
              <a
                key={group.id}
                href={`#${group.id}`}
                data-pref-nav={group.id}
                aria-current={isActive ? "true" : undefined}
                className={`pl-acct-prefs-nav-link${isActive ? " is-active" : ""}`}
                onClick={(e) => handleJumpToGroup(e, group.id)}
              >
                {group.label}
              </a>
            );
          })}
        </nav>

        <div className="pl-acct-prefs-content">
          {/* 1. Tus ligas */}
          <section
            id="pl-prefs-ligas"
            className="pl-acct-card pl-acct-prefs-section glass-card glass-ring"
            aria-labelledby="pl-prefs-h-ligas"
          >
            <div>
              <h2 id="pl-prefs-h-ligas" className="pl-acct-prefs-h2">
                Tus ligas
              </h2>
              <p className="pl-acct-prefs-lead">
                Inicio, la tira de fechas y tus alertas muestran solo estas ligas. Elige al menos
                una.
              </p>
            </div>

            <div className="pl-acct-league-grid" role="group" aria-label="Ligas">
              {LEAGUE_OPTIONS.map((league) => {
                const isSelected = favoriteLeagues.includes(league.id);
                return (
                  <button
                    key={league.id}
                    type="button"
                    className="pl-acct-league-pill"
                    data-league-toggle={league.id}
                    aria-pressed={isSelected}
                    onClick={() => handleToggleLeague(league.id)}
                  >
                    <LeagueBadge league={league.id} size={20} />
                    <span>{league.name}</span>
                  </button>
                );
              })}
            </div>

            {lastLeagueWarn ? (
              <p
                role="alert"
                className="pl-acct-prefs-warn"
                data-last-league-warning=""
              >
                Deja al menos una liga activa.
              </p>
            ) : null}
          </section>

          {/* 2. Cómo ves los datos */}
          <section
            id="pl-prefs-datos"
            className="pl-acct-card pl-acct-prefs-section pl-acct-prefs-section--rows glass-card glass-ring"
            aria-labelledby="pl-prefs-h-datos"
          >
            <h2 id="pl-prefs-h-datos" className="pl-acct-prefs-h2 pl-acct-prefs-h2--rows">
              Cómo ves los datos
            </h2>

            <div className="pl-acct-prefs-row">
              <div className="pl-acct-prefs-row-copy">
                <b id={oddsLabelId} className="pl-acct-prefs-row-title">
                  Formato de momio
                </b>
                <span className="pl-acct-prefs-row-detail num">
                  {oddsFormat === "american"
                    ? "Así: −130 · +131. Lo común en México."
                    : "Así: 1.77 · 2.31."}
                </span>
              </div>
              <PrefsSegment
                labelledBy={oddsLabelId}
                value={oddsFormat}
                onChange={handleOddsChange}
                options={[
                  { value: "american", label: "Americano" },
                  { value: "decimal", label: "Decimal" },
                ]}
              />
            </div>

            <div className="pl-acct-prefs-row">
              <div className="pl-acct-prefs-row-copy">
                <b id={themeLabelId} className="pl-acct-prefs-row-title">
                  Tema
                </b>
                <span className="pl-acct-prefs-row-detail">
                  «Sistema» sigue el ajuste de tu teléfono o computadora.
                </span>
              </div>
              <PrefsSegment
                labelledBy={themeLabelId}
                value={prefs.themeMode}
                onChange={handleThemeChange}
                options={[
                  { value: "dark", label: "Oscuro" },
                  { value: "light", label: "Claro" },
                  { value: "system", label: "Sistema" },
                ]}
              />
            </div>

            <div className="pl-acct-prefs-row">
              <div className="pl-acct-prefs-row-copy">
                <label htmlFor={tzSelectId} className="pl-acct-prefs-row-title">
                  Horario de los partidos
                </label>
                <span className="pl-acct-prefs-row-detail">
                  Todas las horas de la app usan esta zona.
                </span>
              </div>
              <select
                id={tzSelectId}
                className="pl-acct-select"
                value={prefs.timezone}
                onChange={(e) =>
                  updatePrefs((prev) => ({ ...prev, timezone: e.target.value }))
                }
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* 3. Picks y parlays */}
          <section
            id="pl-prefs-picks"
            className="pl-acct-card pl-acct-prefs-section glass-card glass-ring"
            aria-labelledby="pl-prefs-h-picks"
          >
            <div>
              <h2 id="pl-prefs-h-picks" className="pl-acct-prefs-h2">
                Picks y parlays
              </h2>
              <p className="pl-acct-prefs-lead">
                Qué perfil abre por defecto en Parlay rápido y en Picks del día. Lo puedes cambiar
                ahí mismo.
              </p>
            </div>

            <div className="pl-acct-risk-grid" role="group" aria-label="Perfil predeterminado">
              {RISK_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="pl-acct-risk-card"
                  aria-pressed={riskPreference === opt.value}
                  onClick={() => {
                    if (riskPreference === opt.value) return;
                    setRiskPreference(opt.value);
                    notifySaved();
                  }}
                >
                  <b className="pl-acct-risk-title">{opt.name}</b>
                  <span className="pl-acct-risk-detail num">{opt.detail}</span>
                </button>
              ))}
            </div>

            <div className="pl-acct-pesos-divider">
              <div className="pl-acct-prefs-row pl-acct-prefs-row--switch pl-acct-prefs-row--flush">
                <div className="pl-acct-prefs-row-copy">
                  <b id={pesosLabelId} className="pl-acct-prefs-row-title">
                    Ver mi saldo también en pesos
                  </b>
                  <span id={pesosDescId} className="pl-acct-prefs-row-detail">
                    Solo para ti. Tu perfil público sigue mostrando unidades.
                  </span>
                </div>
                <Switch
                  aria-labelledby={pesosLabelId}
                  aria-describedby={pesosDescId}
                  isSelected={prefs.showMxnBalance}
                  onChange={(next) =>
                    updatePrefs((prev) => ({ ...prev, showMxnBalance: next }))
                  }
                  className="pl-acct-switch"
                >
                  <Switch.Control className="pl-acct-switch-control">
                    <Switch.Thumb className="pl-acct-switch-thumb" />
                  </Switch.Control>
                </Switch>
              </div>

              {prefs.showMxnBalance ? (
                <div className="pl-acct-pesos-box">
                  <label htmlFor={unitInputId} className="pl-acct-pesos-label">
                    Mi unidad vale
                  </label>
                  <span className="pl-acct-pesos-input-wrap">
                    <span>$</span>
                    <input
                      id={unitInputId}
                      className="pl-acct-unit-input num"
                      value={unitDraft}
                      onChange={(e) => handleUnitInputChange(e.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <span>MXN</span>
                  </span>

                  {record.settled > 0 ? (
                    <span className="pl-acct-pesos-preview num">
                      Tu saldo{" "}
                      <b className="pl-acct-pesos-units">{formatUnits(record.netUnits)}</b> se verá
                      como{" "}
                      <b className="pl-acct-pesos-strong">
                        {formatUnits(record.netUnits)} ≈ {formattedMxn}
                      </b>
                    </span>
                  ) : !accountsEnabled ? (
                    <span className="pl-acct-pesos-preview num">
                      Tu saldo <b className="pl-acct-pesos-units">+6.4u</b> se verá como{" "}
                      <b className="pl-acct-pesos-strong">+6.4u ≈ {formattedMxn}</b>{" "}
                      <ExampleBadge />
                    </span>
                  ) : (
                    <span className="pl-acct-pesos-preview num">
                      Referencia actual:{" "}
                      <b className="pl-acct-pesos-strong">
                        1.0u ≈ ${Math.round(parsedUnit).toLocaleString("es-MX")} MXN
                      </b>
                    </span>
                  )}

                  <span className="pl-acct-pesos-disclaimer">
                    PitchLab no sugiere cuánto apostar. Esta cifra es solo tu referencia.
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          {/* 4. Alertas */}
          <section
            id="pl-prefs-alertas"
            className="pl-acct-card pl-acct-prefs-section pl-acct-prefs-section--rows glass-card glass-ring"
            aria-labelledby="pl-prefs-h-alertas"
          >
            <div className="pl-acct-prefs-head-inline">
              <h2 id="pl-prefs-h-alertas" className="pl-acct-prefs-h2">
                Alertas
              </h2>
              <span className="pl-acct-prefs-caption">En la app y por correo</span>
            </div>

            {ALERT_ITEMS.map((item) => {
              const titleId = `${baseId}-alert-${item.key}`;
              const descId = `${baseId}-alert-desc-${item.key}`;
              return (
                <div
                  key={item.key}
                  className="pl-acct-prefs-row pl-acct-prefs-row--switch"
                >
                  <div className="pl-acct-prefs-row-copy">
                    <b id={titleId} className="pl-acct-prefs-row-title">
                      {item.title}
                    </b>
                    <span id={descId} className="pl-acct-prefs-row-detail">
                      {item.detail}
                    </span>
                  </div>
                  <Switch
                    aria-labelledby={titleId}
                    aria-describedby={descId}
                    isSelected={prefs.alerts[item.key]}
                    onChange={(next) =>
                      updatePrefs((prev) => ({
                        ...prev,
                        alerts: { ...prev.alerts, [item.key]: next },
                      }))
                    }
                    className="pl-acct-switch"
                  >
                    <Switch.Control className="pl-acct-switch-control">
                      <Switch.Thumb className="pl-acct-switch-thumb" />
                    </Switch.Control>
                  </Switch>
                </div>
              );
            })}
          </section>

          {/* 5. Privacidad */}
          <section
            id="pl-prefs-privacidad"
            className="pl-acct-card pl-acct-prefs-section pl-acct-prefs-section--rows glass-card glass-ring"
            aria-labelledby="pl-prefs-h-privacidad"
          >
            <h2 id="pl-prefs-h-privacidad" className="pl-acct-prefs-h2 pl-acct-prefs-h2--rows">
              Privacidad
            </h2>

            {PRIVACY_ITEMS.map((item) => {
              const titleId = `${baseId}-priv-${item.key}`;
              const descId = `${baseId}-priv-desc-${item.key}`;
              return (
                <div
                  key={item.key}
                  className="pl-acct-prefs-row pl-acct-prefs-row--switch"
                >
                  <div className="pl-acct-prefs-row-copy">
                    <b id={titleId} className="pl-acct-prefs-row-title">
                      {item.title}
                    </b>
                    <span id={descId} className="pl-acct-prefs-row-detail">
                      {item.detail}
                    </span>
                  </div>
                  <Switch
                    aria-labelledby={titleId}
                    aria-describedby={descId}
                    isSelected={prefs.privacy[item.key]}
                    onChange={(next) =>
                      updatePrefs((prev) => ({
                        ...prev,
                        privacy: { ...prev.privacy, [item.key]: next },
                      }))
                    }
                    className="pl-acct-switch"
                  >
                    <Switch.Control className="pl-acct-switch-control">
                      <Switch.Thumb className="pl-acct-switch-thumb" />
                    </Switch.Control>
                  </Switch>
                </div>
              );
            })}
          </section>

          {/* 6. Juego responsable */}
          <section
            id="pl-prefs-descanso"
            className="pl-acct-card pl-acct-prefs-section glass-card glass-ring"
            aria-labelledby="pl-prefs-h-descanso"
          >
            <div>
              <h2 id="pl-prefs-h-descanso" className="pl-acct-prefs-h2">
                Juego responsable
              </h2>
              <p className="pl-acct-prefs-lead">
                Si quieres alejarte un tiempo, pausa tu cuenta para dejar de ver picks y alertas
                durante el periodo que elijas.
              </p>
            </div>

            {prefs.pauseChoice === null ? (
              <div className="pl-acct-break-controls">
                <span className="pl-acct-pesos-label">Tomar un descanso de</span>
                <PrefsSegment
                  ariaLabel="Duración del descanso"
                  value={pendingBreak}
                  onChange={setPendingBreak}
                  options={BREAK_OPTIONS}
                />
                <button
                  type="button"
                  className="pl-acct-btn pl-acct-btn--ghost"
                  onClick={() => setActiveDialog("pause")}
                >
                  Pausar mi cuenta
                </button>
              </div>
            ) : (
              <div role="status" className="pl-acct-pause-banner">
                <span>
                  Descanso elegido ({selectedBreakLabel}). La pausa se aplicará cuando se active tu
                  cuenta.
                </span>
                <button
                  type="button"
                  className="pl-acct-btn pl-acct-btn--ghost pl-acct-btn--sm"
                  onClick={() =>
                    updatePrefs((prev) => ({
                      ...prev,
                      pauseChoice: null,
                      pauseChosenAtIso: null,
                    }))
                  }
                >
                  Deshacer
                </button>
              </div>
            )}

            <a href="/legal/juego-responsable" className="pl-acct-help-link">
              Recursos de ayuda y juego responsable
            </a>
          </section>

          {/* Pie · Tu cuenta */}
          <section
            className="pl-acct-card pl-acct-prefs-account-foot glass-card glass-ring"
            aria-labelledby="pl-prefs-h-cuenta"
          >
            <div className="pl-acct-prefs-row-copy">
              <b id="pl-prefs-h-cuenta" className="pl-acct-prefs-row-title">
                Tu cuenta
              </b>
              <span className="pl-acct-prefs-row-detail">
                {accountsEnabled
                  ? `${emailDisplay} · descarga tus datos o solicita eliminar tu cuenta.`
                  : "Disponible cuando se activen las cuentas con correo."}
              </span>
            </div>

            <div className="pl-acct-prefs-account-actions">
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--ghost pl-acct-btn--sm"
                disabled={!accountsEnabled}
                onClick={() => setActiveDialog("export")}
              >
                Descargar mis datos
              </button>
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--ghost pl-acct-btn--sm pl-acct-btn--muted-text"
                disabled={!accountsEnabled}
                onClick={() => setActiveDialog("delete")}
              >
                Eliminar cuenta
              </button>
            </div>

            {accountActionNote ? (
              <p role="status" className="pl-acct-prefs-foot-note">
                {accountActionNote}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {/* Confirmación de pausa de cuenta */}
      <TopLayerModalDialog
        open={activeDialog === "pause"}
        onClose={() => setActiveDialog(null)}
        ariaLabelledBy={pauseDialogTitleId}
      >
        <div className="pl-acct-dialog-body">
          <h3 id={pauseDialogTitleId} className="pl-acct-h3">
            ¿Pausar tu cuenta por {selectedBreakLabel}?
          </h3>
          <p className="pl-acct-dialog-copy">
            Guardaremos tu elección de descanso por <strong>{selectedBreakLabel}</strong>. La pausa
            se aplicará cuando se active tu cuenta.
          </p>
          <div className="pl-acct-dialog-actions">
            <button
              type="button"
              autoFocus
              className="pl-acct-btn pl-acct-btn--ghost"
              onClick={() => setActiveDialog(null)}
            >
              Volver
            </button>
            <button
              type="button"
              className="pl-acct-btn pl-acct-btn--primary"
              onClick={() => {
                updatePrefs((prev) => ({
                  ...prev,
                  pauseChoice: pendingBreak,
                  pauseChosenAtIso: new Date().toISOString(),
                }));
                setActiveDialog(null);
              }}
            >
              Confirmar descanso
            </button>
          </div>
        </div>
      </TopLayerModalDialog>

      {/* Confirmación de descarga de datos */}
      <TopLayerModalDialog
        open={activeDialog === "export"}
        onClose={() => setActiveDialog(null)}
        ariaLabelledBy={exportDialogTitleId}
      >
        <div className="pl-acct-dialog-body">
          <h3 id={exportDialogTitleId} className="pl-acct-h3">
            Descargar mis datos
          </h3>
          <p className="pl-acct-dialog-copy">
            Prepararemos un archivo con tu perfil, tu bitácora y tus preferencias registradas en
            PitchLab.
          </p>
          <div className="pl-acct-dialog-actions">
            <button
              type="button"
              autoFocus
              className="pl-acct-btn pl-acct-btn--ghost"
              onClick={() => setActiveDialog(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="pl-acct-btn pl-acct-btn--primary"
              onClick={() => {
                setAccountActionNote("Solicitud recibida. Te avisaremos por correo cuando el archivo esté listo.");
                setActiveDialog(null);
              }}
            >
              Solicitar archivo
            </button>
          </div>
        </div>
      </TopLayerModalDialog>

      {/* Confirmación de eliminación de cuenta */}
      <TopLayerModalDialog
        open={activeDialog === "delete"}
        onClose={() => setActiveDialog(null)}
        ariaLabelledBy={deleteDialogTitleId}
      >
        <div className="pl-acct-dialog-body">
          <h3 id={deleteDialogTitleId} className="pl-acct-h3">
            ¿Solicitar eliminación de cuenta?
          </h3>
          <p className="pl-acct-dialog-copy">
            Esta solicitud inicia la baja definitiva de tu perfil, tu bitácora y tus publicaciones
            conforme al aviso de privacidad.
          </p>
          <div className="pl-acct-dialog-actions">
            <button
              type="button"
              autoFocus
              className="pl-acct-btn pl-acct-btn--primary"
              onClick={() => setActiveDialog(null)}
            >
              Conservar mi cuenta
            </button>
            <button
              type="button"
              className="pl-acct-btn pl-acct-btn--danger"
              onClick={() => {
                setAccountActionNote(
                  "Solicitud registrada. Revisa tu correo para confirmar la eliminación definitiva.",
                );
                setActiveDialog(null);
              }}
            >
              Solicitar baja
            </button>
          </div>
        </div>
      </TopLayerModalDialog>
    </div>
  );
}
