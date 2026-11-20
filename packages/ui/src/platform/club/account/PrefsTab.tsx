"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Switch } from "@heroui/react";
import {
  COMPETITION_CATALOG,
  LEAGUE_REGIONS,
  isLeagueActiveInWindow,
  type LeagueId,
  type LeagueRegionKey,
} from "@pitchlab/contracts";
import { LeagueBadge } from "../../../sports";
import {
  FeedbackSupportDialog,
  type AccountSupportModalKind,
} from "../../components/FeedbackSupportDialog";
import { ExampleBadge, MaestroIcon } from "../../components/MaestroPrimitives";
import { type VisualStyle } from "../../components/ShellChrome";
import { TopLayerModalDialog } from "../../components/PlatformOverlays";
import { PlSelect } from "../../components/PlSelect";
import { SettingsGroup, SettingsRow } from "../../components/SettingsGroup";
import { BOOKMAKER_OPTIONS, sanitizePreferredBooks } from "../../bookmakers";
import { todayId } from "../home/home-model";
import {
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import { formatUnits, profileRecord } from "../../profile-stats";
import { normalizeRecordPrivacy } from "../../record-stats";
import type { OddsFormat, RiskBand } from "../../types";
import {
  DEFAULT_STORED_PREFS_V1,
  readStoredPrefs,
  toggleLeagueSelection,
  writeStoredPrefs,
  type AlertCadence,
  type PauseChoice,
  type SessionAccountIdentity,
  type StoredAccountPrefsV1,
  type ThemePreference,
} from "./account-helpers";
import { PwaAndPushSection } from "./PwaAndPushSection";

export interface PrefsTabStoryOverride {
  accountsEnabled?: boolean;
  email?: string | null;
  initialPrefs?: Partial<StoredAccountPrefsV1>;
  visualStyle?: VisualStyle;
}

const PREF_GROUPS = [
  { id: "pl-prefs-resumen", label: "General" },
  { id: "pl-prefs-ligas", label: "Tus ligas" },
  { id: "pl-prefs-datos", label: "Datos y casas" },
  { id: "pl-prefs-picks", label: "Picks y parlays" },
  { id: "pl-prefs-alertas", label: "Notificaciones" },
  { id: "pl-prefs-privacidad", label: "Privacidad" },
  { id: "pl-prefs-descanso", label: "Juego responsable" },
  { id: "pl-prefs-soporte", label: "Soporte y cuenta" },
] as const;

type PrefGroupId = (typeof PREF_GROUPS)[number]["id"];

const LEAGUE_OPTIONS: ReadonlyArray<{ id: LeagueId; name: string; region: LeagueRegionKey }> =
  COMPETITION_CATALOG.map((c) => ({
    id: c.id,
    name: c.label,
    region: c.region,
  }));

const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/Mexico_City", label: "Ciudad de México (UTC−6)" },
  { value: "America/Cancun", label: "Cancún (UTC−5)" },
  { value: "America/Hermosillo", label: "Hermosillo (UTC−7)" },
  { value: "America/Tijuana", label: "Tijuana (UTC−8)" },
  { value: "America/Los_Angeles", label: "Los Ángeles · EE. UU. (UTC−8)" },
  { value: "America/Denver", label: "Denver · EE. UU. (UTC−7)" },
  { value: "America/Chicago", label: "Chicago · EE. UU. (UTC−6)" },
  { value: "America/New_York", label: "Nueva York · EE. UU. (UTC−5)" },
  { value: "America/Bogota", label: "Bogotá · Colombia (UTC−5)" },
  { value: "America/Lima", label: "Lima · Perú (UTC−5)" },
  { value: "America/Caracas", label: "Caracas · Venezuela (UTC−4)" },
  { value: "America/Santiago", label: "Santiago · Chile (UTC−3)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires · Argentina (UTC−3)" },
  { value: "America/Sao_Paulo", label: "São Paulo · Brasil (UTC−3)" },
  { value: "Europe/London", label: "Londres · Reino Unido (UTC+0)" },
  { value: "Europe/Madrid", label: "Madrid · España (UTC+1)" },
  { value: "UTC", label: "Tiempo universal · UTC (UTC+0)" },
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
    detail: "Tu nombre entra al ranking de Comunidad con 5 picks cerrados en la semana o 15 en el mes. Requiere perfil público.",
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
  dataAttr,
}: {
  labelledBy?: string;
  ariaLabel?: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  dataAttr?: string;
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
          {...(dataAttr ? { [dataAttr]: opt.value } : {})}
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
    recordPrivacy: override.recordPrivacy
      ? normalizeRecordPrivacy(override.recordPrivacy)
      : base.recordPrivacy,
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
  const { dataset, hasAccountSessionAuth, favoriteLeagues, oddsFormat, riskPreference, userTimezone, preferredBooks } = usePlatformCore();
  const { setFavoriteLeagues, setOddsFormat, setRiskPreference, setUserTimezone, setShowMxnBalance, setUnitMxn, setPreferredBooks, pushToast, navigateTo, logoutSession } = usePlatformActions();
  const journal = useJournalEntries();

  const accountsEnabled = storyOverride?.accountsEnabled ?? hasAccountSessionAuth;
  const canPersistServer = Boolean(
    hasAccountSessionAuth && !storyOverride && typeof fetch === "function",
  );
  const emailDisplay = storyOverride?.email ?? serverEmail ?? identity.atHandle;

  const baseId = useId();
  const oddsLabelId = `${baseId}-odds`;
  const themeLabelId = `${baseId}-theme`;
  const tzSelectId = `${baseId}-tz`;
  const unitInputId = `${baseId}-unit`;
  const unitErrorId = `${baseId}-unit-err`;
  const pesosLabelId = `${baseId}-pesos-label`;
  const pesosDescId = `${baseId}-pesos-desc`;
  const pauseDialogTitleId = `${baseId}-pause-dlg`;
  const exportDialogTitleId = `${baseId}-export-dlg`;
  const deleteDialogTitleId = `${baseId}-delete-dlg`;
  const deleteReasonId = `${baseId}-delete-reason`;

  const [prefs, setPrefs] = useState<StoredAccountPrefsV1>(() =>
    mergePrefs(DEFAULT_STORED_PREFS_V1, storyOverride?.initialPrefs),
  );
  const [unitDraft, setUnitDraft] = useState<string>(() =>
    String(storyOverride?.initialPrefs?.unitMxn ?? DEFAULT_STORED_PREFS_V1.unitMxn),
  );
  const [unitError, setUnitError] = useState<string | null>(null);
  const [pendingBreak, setPendingBreak] = useState<Exclude<PauseChoice, null>>("7d");
  const [lastLeagueWarn, setLastLeagueWarn] = useState<boolean>(false);
  const [activeGroup, setActiveGroup] = useState<PrefGroupId>("pl-prefs-resumen");
  const [localSavedTick, setLocalSavedTick] = useState<number>(0);
  const [activeDialog, setActiveDialog] = useState<PrefsDialogKind>(null);
  const [supportModal, setSupportModal] = useState<AccountSupportModalKind>(null);
  const [showInactiveLeagues, setShowInactiveLeagues] = useState<boolean>(false);
  const [leagueSearch, setLeagueSearch] = useState<string>("");
  const [accountActionNote, setAccountActionNote] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<boolean>(false);
  const [deleteBusy, setDeleteBusy] = useState<boolean>(false);
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const navRef = useRef<HTMLElement | null>(null);
  const unitDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (unitDebounceRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(unitDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const stored = mergePrefs(readStoredPrefs(), storyOverride?.initialPrefs);
    setPrefs(stored);
    setUnitDraft(String(stored.unitMxn));
    if (stored.pauseChoice) {
      setPendingBreak(stored.pauseChoice);
    }
  }, [storyOverride?.initialPrefs]);

  // Con cuenta real autenticada: hidrata todas las preferencias desde PostgreSQL (`/api/me/preferences`).
  useEffect(() => {
    if (!canPersistServer) return;
    let cancelled = false;
    void fetch("/api/me/preferences", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) =>
        res.ok
          ? ((await res.json().catch(() => null)) as {
              preferences?: {
                oddsFormat?: OddsFormat;
                themeMode?: ThemePreference;
                timezone?: string;
                riskPreference?: RiskBand;
                favoriteLeagues?: string[];
                unitMxnCentavos?: number;
                showMxnBalance?: boolean;
                publicRecordVisible?: boolean;
                emailPickResults?: boolean;
                emailValueAlerts?: boolean;
                emailBeforeMatch?: boolean;
                emailBillingReminder?: boolean;
                emailWeeklyDigest?: boolean;
                emailMonthlyRecord?: boolean;
                pushEnabled?: boolean;
                showInRanking?: boolean;
                pauseCommunity?: boolean;
                responsiblePauseKind?: Exclude<PauseChoice, null> | null;
                responsiblePauseUntilIso?: string | null;
                recordPrivacy?: unknown;
                bankrollStartMxnCentavos?: number | null;
                preferredBooks?: string[];
                showInactiveLeagues?: boolean;
                lineMoveAlerts?: boolean;
                language?: string;
                alertCadence?: AlertCadence;
              };
            } | null)
          : null,
      )
      .then((data) => {
        if (cancelled || !data?.preferences) return;
        const p = data.preferences;
        const allowedLeagueIds = new Set<string>(LEAGUE_OPTIONS.map((l) => l.id));
        const serverLeagues = Array.isArray(p.favoriteLeagues)
          ? (p.favoriteLeagues.filter((l): l is LeagueId => allowedLeagueIds.has(l)) as LeagueId[])
          : [];
        if (serverLeagues.length > 0) {
          setFavoriteLeagues(serverLeagues);
        }
        if (p.oddsFormat === "american" || p.oddsFormat === "decimal") {
          setOddsFormat(p.oddsFormat);
        }
        if (
          p.riskPreference === "conservador" ||
          p.riskPreference === "medio" ||
          p.riskPreference === "arriesgado"
        ) {
          setRiskPreference(p.riskPreference);
        }
        if (typeof p.timezone === "string" && p.timezone.trim()) {
          setUserTimezone(p.timezone);
        }
        if (typeof p.showMxnBalance === "boolean") {
          setShowMxnBalance(p.showMxnBalance);
        }
        if (Array.isArray(p.preferredBooks)) {
          setPreferredBooks(sanitizePreferredBooks(p.preferredBooks));
        }
        if (typeof p.showInactiveLeagues === "boolean") {
          setShowInactiveLeagues(p.showInactiveLeagues);
        }
        const unitMxnValue =
          typeof p.unitMxnCentavos === "number" && Number.isFinite(p.unitMxnCentavos)
            ? Math.max(10, Math.min(100_000, Math.round(p.unitMxnCentavos / 100)))
            : DEFAULT_STORED_PREFS_V1.unitMxn;
        setUnitMxn(unitMxnValue);
        setUnitDraft(String(unitMxnValue));
        setUnitError(null);

        if (
          p.themeMode === "dark" ||
          p.themeMode === "light" ||
          p.themeMode === "system"
        ) {
          applyDocumentThemeMode(p.themeMode);
        }
        if (
          p.responsiblePauseKind === "24h" ||
          p.responsiblePauseKind === "7d" ||
          p.responsiblePauseKind === "30d"
        ) {
          setPendingBreak(p.responsiblePauseKind);
        }

        setPrefs((prev) => {
          const next: StoredAccountPrefsV1 = {
            ...prev,
            v: 1,
            themeMode:
              p.themeMode === "dark" || p.themeMode === "light" || p.themeMode === "system"
                ? p.themeMode
                : prev.themeMode,
            timezone: typeof p.timezone === "string" && p.timezone.trim() ? p.timezone : prev.timezone,
            showMxnBalance:
              typeof p.showMxnBalance === "boolean" ? p.showMxnBalance : prev.showMxnBalance,
            unitMxn: unitMxnValue,
            alerts: {
              valueAlerts:
                typeof p.emailValueAlerts === "boolean" ? p.emailValueAlerts : prev.alerts.valueAlerts,
              beforeMatch:
                typeof p.emailBeforeMatch === "boolean" ? p.emailBeforeMatch : prev.alerts.beforeMatch,
              pickSettled:
                typeof p.emailPickResults === "boolean" ? p.emailPickResults : prev.alerts.pickSettled,
              billingReminder:
                typeof p.emailBillingReminder === "boolean"
                  ? p.emailBillingReminder
                  : prev.alerts.billingReminder,
              weeklyDigest:
                typeof p.emailWeeklyDigest === "boolean"
                  ? p.emailWeeklyDigest
                  : prev.alerts.weeklyDigest,
              monthlyRecord:
                typeof p.emailMonthlyRecord === "boolean"
                  ? p.emailMonthlyRecord
                  : prev.alerts.monthlyRecord,
            },
            alertCadence:
              p.alertCadence === "inmediato" ||
              p.alertCadence === "cada_15m" ||
              p.alertCadence === "solo_hitos"
                ? p.alertCadence
                : prev.alertCadence,
            privacy: {
              publicProfile:
                typeof p.publicRecordVisible === "boolean"
                  ? p.publicRecordVisible
                  : prev.privacy.publicProfile,
              showInRanking:
                typeof p.showInRanking === "boolean" ? p.showInRanking : prev.privacy.showInRanking,
              pauseCommunity:
                typeof p.pauseCommunity === "boolean" ? p.pauseCommunity : prev.privacy.pauseCommunity,
            },
            pauseChoice:
              p.responsiblePauseKind === "24h" ||
              p.responsiblePauseKind === "7d" ||
              p.responsiblePauseKind === "30d"
                ? p.responsiblePauseKind
                : null,
            pauseChosenAtIso: p.responsiblePauseUntilIso ?? null,
            recordPrivacy:
              p.recordPrivacy !== undefined
                ? normalizeRecordPrivacy(p.recordPrivacy)
                : prev.recordPrivacy,
            bankrollStartMxn:
              p.bankrollStartMxnCentavos === null
                ? null
                : typeof p.bankrollStartMxnCentavos === "number" &&
                    Number.isFinite(p.bankrollStartMxnCentavos)
                  ? Math.round(p.bankrollStartMxnCentavos / 100)
                  : prev.bankrollStartMxn,
            preferredBooks: Array.isArray(p.preferredBooks)
              ? sanitizePreferredBooks(p.preferredBooks)
              : prev.preferredBooks,
          };
          writeStoredPrefs(next);
          return next;
        });
      })
      .catch((err) => {
        void err;
      });
    return () => {
      cancelled = true;
    };
  }, [
    canPersistServer,
    setFavoriteLeagues,
    setOddsFormat,
    setPreferredBooks,
    setRiskPreference,
    setShowMxnBalance,
    setUnitMxn,
    setUserTimezone,
  ]);

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

  const persistServerPrefs = useCallback(
    async (patch: Record<string, unknown>, onError?: () => void): Promise<boolean> => {
      if (!canPersistServer) return true;
      try {
        const res = await fetch("/api/me/preferences", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
      } catch (err) {
        void err;
        onError?.();
        pushToast("No se pudo guardar tu preferencia en el servidor.", "warning");
        return false;
      }
    },
    [canPersistServer, pushToast],
  );

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
    const prevLeagues = favoriteLeagues;
    const result = toggleLeagueSelection(prevLeagues, leagueId);
    if (result.blockedLast) {
      setLastLeagueWarn(true);
      return;
    }
    setLastLeagueWarn(false);
    setFavoriteLeagues(result.next);
    notifySaved();
    void persistServerPrefs({ favoriteLeagues: result.next }, () => {
      setFavoriteLeagues(prevLeagues);
    });
  };

  const handleOddsChange = (next: OddsFormat) => {
    if (next === oddsFormat) return;
    const prevFormat = oddsFormat;
    setOddsFormat(next);
    notifySaved();
    void persistServerPrefs({ oddsFormat: next }, () => {
      setOddsFormat(prevFormat);
    });
  };

  const handleThemeChange = (next: ThemePreference) => {
    const prevTheme = prefs.themeMode;
    applyDocumentThemeMode(next);
    updatePrefs((prev) => ({ ...prev, themeMode: next }));
    void persistServerPrefs({ themeMode: next }, () => {
      applyDocumentThemeMode(prevTheme);
      setPrefs((curr) => {
        const reverted = { ...curr, themeMode: prevTheme };
        writeStoredPrefs(reverted);
        return reverted;
      });
    });
  };

  const timezoneOptions = useMemo(() => {
    const base = TIMEZONE_OPTIONS.map((tz) => {
      const match = /^(.*)\s+\((UTC[^)]+)\)$/.exec(tz.label);
      return {
        value: tz.value,
        label: match ? match[1]! : tz.label,
        description: match ? match[2] : undefined,
        triggerLabel: tz.label,
        textValue: tz.label,
        icon: <MaestroIcon name="calendar" size={14} />,
      };
    });
    if (
      prefs.timezone &&
      !base.some((opt) => opt.value === prefs.timezone)
    ) {
      base.push({
        value: prefs.timezone,
        label: prefs.timezone,
        description: undefined,
        triggerLabel: prefs.timezone,
        textValue: prefs.timezone,
        icon: <MaestroIcon name="calendar" size={14} />,
      });
    }
    return base;
  }, [prefs.timezone]);

  const handleUnitInputChange = (raw: string) => {
    setUnitDraft(raw);
    const cleaned = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(cleaned) && cleaned >= 10) {
      setUnitError(null);
      const clamped = Math.min(100_000, Math.round(cleaned));
      updatePrefs((prev) => ({ ...prev, unitMxn: clamped }));
      setUnitMxn(clamped);
      if (canPersistServer && typeof window !== "undefined") {
        if (unitDebounceRef.current !== null) {
          window.clearTimeout(unitDebounceRef.current);
        }
        unitDebounceRef.current = window.setTimeout(() => {
          void persistServerPrefs({ unitMxnCentavos: clamped * 100 });
        }, 450);
      }
    }
  };

  const handleUnitBlur = () => {
    const cleaned = Number(unitDraft.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(cleaned) || cleaned < 10) {
      setUnitError("El valor mínimo por unidad es $10 MXN.");
    } else {
      setUnitError(null);
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

  const todayIso = useMemo(
    () => todayId(userTimezone || prefs.timezone || "America/Mexico_City"),
    [userTimezone, prefs.timezone],
  );
  const groupedLeagues = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const q = norm(leagueSearch);
    const byRegion = new Map<LeagueRegionKey, Array<{ id: LeagueId; name: string; active: boolean }>>();
    for (const lg of LEAGUE_OPTIONS) {
      const active =
        dataset.games.length === 0
          ? true
          : isLeagueActiveInWindow(dataset.games, lg.id, todayIso, 30);
      const isFav = favoriteLeagues.includes(lg.id);
      if (!showInactiveLeagues && !active && !isFav) continue;
      if (q && !norm(lg.name).includes(q) && !norm(lg.id).includes(q)) continue;
      const arr = byRegion.get(lg.region) ?? [];
      arr.push({ id: lg.id, name: lg.name, active });
      byRegion.set(lg.region, arr);
    }
    return LEAGUE_REGIONS.map((region) => ({
      region,
      items: byRegion.get(region.key) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [dataset.games, favoriteLeagues, leagueSearch, showInactiveLeagues, todayIso]);

  const telegramUrl =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() || "" : "";
  const activeAlertsCount = Object.values(prefs.alerts).filter(Boolean).length;

  const scrollToSection = (groupId: PrefGroupId) => {
    setActiveGroup(groupId);
    if (typeof document === "undefined") return;
    const section = document.getElementById(groupId);
    if (!section) return;
    const reduced =
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    section.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

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
          {/* 0. Resumen rápido (estilo app nativa · Imágenes 7 y 8) */}
          <SettingsGroup id="pl-prefs-resumen" title="General">
            <SettingsRow
              icon="globe"
              title="Idioma"
              subtitle="Interfaz y formatos regionales"
              value="Español (MX)"
              showChevron={false}
            />
            <SettingsRow
              icon="activity"
              title="Formato de cuotas"
              subtitle="Americano (−110) o Decimal (1.91)"
              value={oddsFormat === "decimal" ? "Decimal" : "Americano"}
              onClick={() => scrollToSection("pl-prefs-datos")}
            />
            <SettingsRow
              icon="ticket"
              title="Casas de apuestas"
              subtitle="Tus casas habituales de referencia"
              value={`${preferredBooks.length} selec.`}
              onClick={() => scrollToSection("pl-prefs-datos")}
            />
            <SettingsRow
              icon="bell"
              title="Notificaciones"
              subtitle="Alertas de valor, picks y app móvil"
              value={`${activeAlertsCount} activas`}
              onClick={() => scrollToSection("pl-prefs-alertas")}
            />
          </SettingsGroup>

          {/* 1. Tus ligas (agrupadas por región · solo activas 30d por defecto) */}
          <section
            id="pl-prefs-ligas"
            className="pl-acct-card pl-acct-prefs-section glass-card glass-ring"
            aria-labelledby="pl-prefs-h-ligas"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="pl-prefs-h-ligas" className="pl-acct-prefs-h2">
                  Tus ligas
                </h2>
                <p className="pl-acct-prefs-lead">
                  Inicio, la tira de fechas y tus alertas priorizan estas competencias. Elige al
                  menos una ({favoriteLeagues.length} seleccionadas).
                </p>
              </div>
              <label className="pl-prefs-inactive-switch">
                <span className="text-xs font-medium" style={{ color: "var(--pl-text-secondary)" }}>
                  Ver en pausa
                </span>
                <Switch
                  isSelected={showInactiveLeagues}
                  onChange={(next) => {
                    const prevVal = showInactiveLeagues;
                    setShowInactiveLeagues(next);
                    notifySaved();
                    void persistServerPrefs({ showInactiveLeagues: next }, () => {
                      setShowInactiveLeagues(prevVal);
                    });
                  }}
                  aria-label="Ver competencias en pausa sin partidos en 30 días"
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              </label>
            </div>

            <div className="pl-prefs-league-search">
              <MaestroIcon name="search" size={14} />
              <input
                type="search"
                value={leagueSearch}
                onChange={(e) => setLeagueSearch(e.target.value)}
                placeholder="Buscar liga o copa (Liga MX, Champions, MLS, MLB…)"
                aria-label="Filtrar ligas disponibles"
              />
            </div>

            <div className="space-y-4" role="group" aria-label="Ligas">
              {groupedLeagues.map(({ region, items }) => (
                <div key={region.key} className="space-y-2">
                  <p
                    className="m-0 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    {region.label}
                  </p>
                  <div className="pl-acct-league-grid">
                    {items.map((league) => {
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
                          {!league.active ? (
                            <span className="pl-prefs-pause-tag">En pausa</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
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
                <label
                  id={`${tzSelectId}-label`}
                  htmlFor={tzSelectId}
                  className="pl-acct-prefs-row-title"
                >
                  Horario de los partidos
                </label>
                <span className="pl-acct-prefs-row-detail">
                  Todas las horas de la app usan esta zona.
                </span>
              </div>
              <PlSelect
                id={tzSelectId}
                ariaLabelledBy={`${tzSelectId}-label`}
                variant="field"
                size="md"
                fullWidth={false}
                popoverWidth="min-trigger"
                value={prefs.timezone}
                onChange={(nextTz) => {
                  const prevTz = prefs.timezone;
                  updatePrefs((prev) => ({ ...prev, timezone: nextTz }));
                  setUserTimezone(nextTz);
                  void persistServerPrefs({ timezone: nextTz }, () => {
                    setUserTimezone(prevTz);
                    setPrefs((curr) => {
                      const reverted = { ...curr, timezone: prevTz };
                      writeStoredPrefs(reverted);
                      return reverted;
                    });
                  });
                }}
                options={timezoneOptions}
              />
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
                    const prevRisk = riskPreference;
                    setRiskPreference(opt.value);
                    notifySaved();
                    void persistServerPrefs({ riskPreference: opt.value }, () => {
                      setRiskPreference(prevRisk);
                    });
                  }}
                >
                  <b className="pl-acct-risk-title">{opt.name}</b>
                  <span className="pl-acct-risk-detail num">{opt.detail}</span>
                </button>
              ))}
            </div>

            <div className="pl-acct-pesos-divider space-y-2.5" data-preferred-books-section="">
              <div>
                <b className="pl-acct-prefs-row-title">Tus casas de referencia</b>
                <span className="pl-acct-prefs-row-detail block mt-0.5">
                  Mostramos primero el mejor momio capturado entre las casas que usas (corte vigente
                  menor a 72 h). Informativo, sin enlaces de afiliado.
                </span>
              </div>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Tus casas de referencia"
              >
                {BOOKMAKER_OPTIONS.map((book) => {
                  const active = preferredBooks.includes(book.id);
                  return (
                    <button
                      key={book.id}
                      type="button"
                      className="pl-acct-league-pill min-h-11 px-3 text-xs"
                      data-book-toggle={book.id}
                      aria-pressed={active}
                      onClick={() => {
                        const prevBooks = preferredBooks;
                        const exists = prevBooks.includes(book.id);
                        if (exists && prevBooks.length <= 1) {
                          pushToast("Deja al menos una casa de referencia activa.", "default");
                          return;
                        }
                        const nextBooks = exists
                          ? prevBooks.filter((id) => id !== book.id)
                          : sanitizePreferredBooks([...prevBooks, book.id]);
                        setPreferredBooks(nextBooks);
                        updatePrefs((prev) => ({ ...prev, preferredBooks: nextBooks }));
                        void persistServerPrefs({ preferredBooks: nextBooks }, () => {
                          setPreferredBooks(prevBooks);
                        });
                      }}
                    >
                      <span className="font-bold">{book.label}</span>
                      <span className="text-[11px] opacity-70">{book.regionHint}</span>
                    </button>
                  );
                })}
              </div>
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
                  onChange={(next) => {
                    const prevShow = prefs.showMxnBalance;
                    updatePrefs((prev) => ({ ...prev, showMxnBalance: next }));
                    setShowMxnBalance(next);
                    void persistServerPrefs({ showMxnBalance: next }, () => {
                      setShowMxnBalance(prevShow);
                      setPrefs((curr) => {
                        const reverted = { ...curr, showMxnBalance: prevShow };
                        writeStoredPrefs(reverted);
                        return reverted;
                      });
                    });
                  }}
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
                      onBlur={handleUnitBlur}
                      aria-invalid={unitError ? "true" : "false"}
                      aria-describedby={unitError ? unitErrorId : undefined}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <span>MXN</span>
                  </span>
                  {unitError ? (
                    <p id={unitErrorId} role="alert" className="pl-acct-prefs-warn">
                      {unitError}
                    </p>
                  ) : null}

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
              const serverAlertField =
                item.key === "valueAlerts"
                  ? "emailValueAlerts"
                  : item.key === "beforeMatch"
                    ? "emailBeforeMatch"
                    : item.key === "pickSettled"
                      ? "emailPickResults"
                      : "emailBillingReminder";
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
                    onChange={(next) => {
                      const prevValue = prefs.alerts[item.key];
                      updatePrefs((prev) => ({
                        ...prev,
                        alerts: { ...prev.alerts, [item.key]: next },
                      }));
                      void persistServerPrefs({ [serverAlertField]: next }, () => {
                        setPrefs((curr) => {
                          const reverted = {
                            ...curr,
                            alerts: { ...curr.alerts, [item.key]: prevValue },
                          };
                          writeStoredPrefs(reverted);
                          return reverted;
                        });
                      });
                    }}
                    className="pl-acct-switch"
                  >
                    <Switch.Control className="pl-acct-switch-control">
                      <Switch.Thumb className="pl-acct-switch-thumb" />
                    </Switch.Control>
                  </Switch>
                </div>
              );
            })}

            <div className="pl-acct-prefs-row" data-alert-cadence-row="">
              <div className="pl-acct-prefs-row-copy">
                <b id={`${baseId}-cadence-title`} className="pl-acct-prefs-row-title">
                  Frecuencia de avisos en vivo
                </b>
                <span className="pl-acct-prefs-row-detail">
                  Controla cada cuánto recibes alertas de movimiento de línea o hitos de tus picks.
                </span>
              </div>
              <PrefsSegment<AlertCadence>
                labelledBy={`${baseId}-cadence-title`}
                value={prefs.alertCadence}
                dataAttr="data-alert-cadence"
                options={[
                  { value: "inmediato", label: "Inmediato" },
                  { value: "cada_15m", label: "Cada 15 min" },
                  { value: "solo_hitos", label: "Solo hitos" },
                ]}
                onChange={(nextCadence) => {
                  const prevCadence = prefs.alertCadence;
                  updatePrefs((prev) => ({ ...prev, alertCadence: nextCadence }));
                  void persistServerPrefs({ alertCadence: nextCadence }, () => {
                    setPrefs((curr) => {
                      const reverted = { ...curr, alertCadence: prevCadence };
                      writeStoredPrefs(reverted);
                      return reverted;
                    });
                  });
                }}
              />
            </div>

            <PwaAndPushSection
              accountsEnabled={accountsEnabled}
              canPersistServer={canPersistServer}
              onNotifyToast={(msg, tone) => pushToast(msg, tone)}
            />
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
              const serverPrivacyField =
                item.key === "publicProfile"
                  ? "publicRecordVisible"
                  : item.key === "showInRanking"
                    ? "showInRanking"
                    : "pauseCommunity";
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
                    onChange={(next) => {
                      const prevValue = prefs.privacy[item.key];
                      updatePrefs((prev) => ({
                        ...prev,
                        privacy: { ...prev.privacy, [item.key]: next },
                      }));
                      void persistServerPrefs({ [serverPrivacyField]: next }, () => {
                        setPrefs((curr) => {
                          const reverted = {
                            ...curr,
                            privacy: { ...curr.privacy, [item.key]: prevValue },
                          };
                          writeStoredPrefs(reverted);
                          return reverted;
                        });
                      });
                    }}
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
                  {hasAccountSessionAuth
                    ? `Descanso activo (${selectedBreakLabel}) guardado en tu cuenta.`
                    : `Descanso elegido (${selectedBreakLabel}). La pausa se aplicará cuando se active tu cuenta.`}
                </span>
                <button
                  type="button"
                  className="pl-acct-btn pl-acct-btn--ghost pl-acct-btn--sm"
                  onClick={() => {
                    const prevChoice = prefs.pauseChoice;
                    const prevChosenAt = prefs.pauseChosenAtIso;
                    updatePrefs((prev) => ({
                      ...prev,
                      pauseChoice: null,
                      pauseChosenAtIso: null,
                    }));
                    void persistServerPrefs({ responsiblePauseKind: null }, () => {
                      setPrefs((curr) => {
                        const reverted = {
                          ...curr,
                          pauseChoice: prevChoice,
                          pauseChosenAtIso: prevChosenAt,
                        };
                        writeStoredPrefs(reverted);
                        return reverted;
                      });
                    });
                  }}
                >
                  Deshacer
                </button>
              </div>
            )}

            <a href="/legal/juego-responsable" className="pl-acct-help-link">
              Recursos de ayuda y juego responsable
            </a>
          </section>

          {/* Soporte, Comunidad, Legal, Sesión y Zona de peligro (Imágenes 8 y 9) */}
          <div id="pl-prefs-soporte" className="space-y-4">
            <SettingsGroup title="Soporte">
              <SettingsRow
                icon="sparkles"
                title="Feedback e ideas"
                subtitle="Ayúdanos a decidir qué construir después"
                dataAttr="prefs-feedback-row"
                onClick={() => setSupportModal("feedback")}
              />
              <SettingsRow
                icon="message"
                title="Contactar con soporte"
                subtitle="Recibe ayuda del equipo de PitchLab."
                dataAttr="prefs-support-row"
                onClick={() => setSupportModal("support")}
              />
            </SettingsGroup>

            <SettingsGroup title="Comunidad">
              <SettingsRow
                icon="share"
                title="Únete a nuestra comunidad de Telegram"
                subtitle={telegramUrl ? "Canal oficial de novedades y análisis" : "Próximamente · avisos y novedades"}
                href={telegramUrl || undefined}
                external={Boolean(telegramUrl)}
                dataAttr="prefs-telegram-row"
                onClick={telegramUrl ? undefined : () => setSupportModal("telegram")}
              />
            </SettingsGroup>

            <SettingsGroup title="Legal y datos">
              <SettingsRow
                icon="shield"
                title="Política de privacidad"
                href="/legal/privacidad"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/legal/privacidad");
                }}
              />
              <SettingsRow
                icon="receipt"
                title="Términos de uso"
                href="/legal/terminos"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/legal/terminos");
                }}
              />
              <SettingsRow
                icon="download"
                title="Descargar mis datos"
                subtitle={
                  accountsEnabled
                    ? `${emailDisplay} · copia en JSON de tu cuenta y bitácora`
                    : "Disponible al iniciar sesión con correo"
                }
                disabled={!accountsEnabled || exportBusy}
                onClick={() => setActiveDialog("export")}
              />
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow
                icon="logout"
                title="Cerrar sesión"
                tone="danger"
                showChevron={false}
                dataAttr="prefs-logout-row"
                onClick={() => {
                  void logoutSession();
                }}
              />
            </SettingsGroup>

            <SettingsGroup
              title="Zona de peligro"
              footnote={accountActionNote ?? undefined}
            >
              <SettingsRow
                icon="trash"
                title="Eliminar cuenta"
                subtitle="Solicita la baja definitiva y borrado de tus datos"
                tone="danger"
                showChevron={false}
                disabled={deleteBusy}
                dataAttr="prefs-delete-account-row"
                onClick={() => setSupportModal("delete")}
              />
            </SettingsGroup>
          </div>
        </div>
      </div>

      <FeedbackSupportDialog
        kind={supportModal}
        onClose={() => setSupportModal(null)}
        accountsEnabled={accountsEnabled}
        onSuccessToast={(msg) => {
          setAccountActionNote(msg);
          pushToast(msg, "success");
        }}
        onErrorToast={(err) => pushToast(err, "warning")}
      />

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
            {hasAccountSessionAuth ? (
              <>
                Aplicaremos un descanso de <strong>{selectedBreakLabel}</strong> en tu cuenta para
                pausar alertas y avisos durante este periodo.
              </>
            ) : (
              <>
                Guardaremos tu elección de descanso por <strong>{selectedBreakLabel}</strong>. La
                pausa se aplicará cuando se active tu cuenta.
              </>
            )}
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
                const nextBreak = pendingBreak;
                const prevChoice = prefs.pauseChoice;
                const prevChosenAt = prefs.pauseChosenAtIso;
                updatePrefs((prev) => ({
                  ...prev,
                  pauseChoice: nextBreak,
                  pauseChosenAtIso: new Date().toISOString(),
                }));
                setActiveDialog(null);
                void persistServerPrefs({ responsiblePauseKind: nextBreak }, () => {
                  setPrefs((curr) => {
                    const reverted = {
                      ...curr,
                      pauseChoice: prevChoice,
                      pauseChosenAtIso: prevChosenAt,
                    };
                    writeStoredPrefs(reverted);
                    return reverted;
                  });
                });
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
        onClose={() => {
          if (!exportBusy) setActiveDialog(null);
        }}
        ariaLabelledBy={exportDialogTitleId}
      >
        <div className="pl-acct-dialog-body">
          <h3 id={exportDialogTitleId} className="pl-acct-h3">
            Descargar mis datos
          </h3>
          <p className="pl-acct-dialog-copy">
            Descargaremos un archivo JSON con tu perfil, preferencias, bitácora, transferencias,
            cupones y actividad registrada en PitchLab.
          </p>
          <div className="pl-acct-dialog-actions">
            <button
              type="button"
              autoFocus
              disabled={exportBusy}
              className="pl-acct-btn pl-acct-btn--ghost"
              onClick={() => setActiveDialog(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={exportBusy}
              className="pl-acct-btn pl-acct-btn--primary"
              onClick={() => {
                if (!canPersistServer) {
                  setAccountActionNote("Archivo descargado en modo vista previa.");
                  setActiveDialog(null);
                  return;
                }
                setExportBusy(true);
                void (async () => {
                  try {
                    const res = await fetch("/api/me/export", {
                      credentials: "same-origin",
                      cache: "no-store",
                    });
                    if (!res.ok) {
                      const json = (await res.json().catch(() => null)) as { error?: string } | null;
                      pushToast(json?.error ?? "No se pudo descargar tus datos.", "warning");
                      return;
                    }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    const disp = res.headers.get("Content-Disposition") ?? "";
                    const match = /filename="([^"]+)"/.exec(disp);
                    link.href = url;
                    link.download = match?.[1] ?? `pitchlab-datos-${identity.cleanHandle}.json`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                    setAccountActionNote(
                      "Archivo JSON descargado con tu perfil, bitácora y actividad.",
                    );
                    setActiveDialog(null);
                  } catch (err) {
                    void err;
                    pushToast("Error de conexión al preparar tu descarga.", "warning");
                  } finally {
                    setExportBusy(false);
                  }
                })();
              }}
            >
              {exportBusy ? "Preparando…" : "Descargar JSON"}
            </button>
          </div>
        </div>
      </TopLayerModalDialog>

      {/* Confirmación de eliminación de cuenta */}
      <TopLayerModalDialog
        open={activeDialog === "delete"}
        onClose={() => {
          if (!deleteBusy) setActiveDialog(null);
        }}
        ariaLabelledBy={deleteDialogTitleId}
      >
        <div className="pl-acct-dialog-body">
          <h3 id={deleteDialogTitleId} className="pl-acct-h3">
            ¿Solicitar eliminación de cuenta?
          </h3>
          <p className="pl-acct-dialog-copy">
            Esta solicitud inicia la baja definitiva de tu perfil, tu bitácora y tus publicaciones
            conforme al aviso de privacidad. La atendemos en un máximo de 72 horas hábiles.
          </p>
          <div className="space-y-1.5">
            <label htmlFor={deleteReasonId} className="pl-acct-field-label">
              Motivo (opcional)
            </label>
            <textarea
              id={deleteReasonId}
              rows={3}
              maxLength={500}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Cuéntanos brevemente si deseas ayudarnos a mejorar (opcional)"
              className="glass-input w-full p-2.5 text-base"
            />
          </div>
          {deleteError ? (
            <p role="alert" className="pl-acct-prefs-warn">
              {deleteError}
            </p>
          ) : null}
          <div className="pl-acct-dialog-actions">
            <button
              type="button"
              autoFocus
              disabled={deleteBusy}
              className="pl-acct-btn pl-acct-btn--primary"
              onClick={() => setActiveDialog(null)}
            >
              Conservar mi cuenta
            </button>
            <button
              type="button"
              disabled={deleteBusy}
              className="pl-acct-btn pl-acct-btn--danger"
              onClick={() => {
                if (!canPersistServer) {
                  setAccountActionNote("Solicitud registrada en modo vista previa.");
                  setActiveDialog(null);
                  return;
                }
                setDeleteBusy(true);
                setDeleteError(null);
                void (async () => {
                  try {
                    const res = await fetch("/api/me/deletion-request", {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ reason: deleteReason.trim() }),
                    });
                    const json = (await res.json().catch(() => null)) as {
                      message?: string;
                      error?: string;
                    } | null;
                    if (!res.ok) {
                      setDeleteError(
                        json?.error ?? "No pudimos registrar tu solicitud. Intenta de nuevo.",
                      );
                      return;
                    }
                    setAccountActionNote(
                      json?.message ??
                        "Solicitud registrada; procesamos la baja y borrado en un máximo de 72 horas hábiles.",
                    );
                    setDeleteReason("");
                    setActiveDialog(null);
                  } catch (err) {
                    void err;
                    setDeleteError("Error de conexión al enviar la solicitud.");
                  } finally {
                    setDeleteBusy(false);
                  }
                })();
              }}
            >
              {deleteBusy ? "Enviando…" : "Solicitar baja"}
            </button>
          </div>
        </div>
      </TopLayerModalDialog>
    </div>
  );
}
