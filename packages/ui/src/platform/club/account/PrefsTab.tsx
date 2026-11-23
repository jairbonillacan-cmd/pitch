"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { Switch } from "@heroui/react";
import {
  COMPETITION_CATALOG,
  LEAGUE_REGIONS,
  isLeagueActiveInWindow,
  parseStrictFiniteNumber,
  type LeagueId,
  type LeagueRegionKey,
} from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreTable,
  type SofascoreTableColumn,
} from "../../../components/ui/primitives";
import { LeagueBadge } from "../../../sports";
import { BOOKMAKER_OPTIONS } from "../../bookmakers";
import {
  FeedbackSupportDialog,
  type AccountSupportModalKind,
} from "../../components/FeedbackSupportDialog";
import { ExampleBadge, MaestroIcon } from "../../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../../components/PlatformOverlays";
import { PlSelect } from "../../components/PlSelect";
import { SettingsGroup, SettingsRow } from "../../components/SettingsGroup";
import { type VisualStyle } from "../../components/ShellChrome";
import { useAbortableJson, useSafeEffect } from "../../hooks";
import {
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import { formatUnits, profileRecord } from "../../profile-stats";
import { normalizeRecordPrivacy } from "../../record-stats";
import type { OddsFormat, RiskBand } from "../../types";
import { todayId } from "../home/home-model";
import {
  DEFAULT_STORED_PREFS_V1,
  MAX_PREFERRED_BOOKMAKERS_PREF,
  MAX_SAVED_VIEWS_PREF,
  PRIORITY_MX_BOOKMAKER_IDS,
  describeSavedViewFilters,
  formatPreferredBooksSummary,
  getOddsFormatPreview,
  partitionPriorityBookmakers,
  readAccountSavedViews,
  readStoredPrefs,
  sanitizeAccountSavedViews,
  sanitizePreferredBookmakersPref,
  serializeSavedViewsForApi,
  toggleLeagueSelection,
  writeAccountSavedViews,
  writeStoredPrefs,
  type AccountSavedView,
  type AccountSavedViewSport,
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

interface ServerPreferencesEnvelope {
  readonly preferences?: {
    readonly oddsFormat?: OddsFormat;
    readonly themeMode?: ThemePreference;
    readonly timezone?: string;
    readonly riskPreference?: RiskBand;
    readonly favoriteLeagues?: string[];
    readonly unitMxnCentavos?: number;
    readonly showMxnBalance?: boolean;
    readonly publicRecordVisible?: boolean;
    readonly emailPickResults?: boolean;
    readonly emailValueAlerts?: boolean;
    readonly emailBeforeMatch?: boolean;
    readonly emailBillingReminder?: boolean;
    readonly emailWeeklyDigest?: boolean;
    readonly emailMonthlyRecord?: boolean;
    readonly pushEnabled?: boolean;
    readonly showInRanking?: boolean;
    readonly pauseCommunity?: boolean;
    readonly responsiblePauseKind?: Exclude<PauseChoice, null> | null;
    readonly responsiblePauseUntilIso?: string | null;
    readonly recordPrivacy?: unknown;
    readonly bankrollStartMxnCentavos?: number | null;
    readonly preferredBookmakers?: string[];
    readonly preferredBooks?: string[];
    readonly savedViews?: unknown[];
    readonly showInactiveLeagues?: boolean;
    readonly lineMoveAlerts?: boolean;
    readonly language?: string;
    readonly alertCadence?: AlertCadence;
  };
}

const PREF_GROUPS = [
  { id: "pl-prefs-resumen", label: "General" },
  { id: "pl-prefs-ligas", label: "Tus ligas" },
  { id: "pl-prefs-datos", label: "Datos y casas" },
  { id: "pl-prefs-vistas", label: "Vistas guardadas" },
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

const SAVED_VIEW_SPORT_OPTIONS: ReadonlyArray<{ value: AccountSavedViewSport; label: string }> = [
  { value: "all", label: "Todos los deportes" },
  { value: "futbol", label: "Fútbol" },
  { value: "nba", label: "NBA" },
  { value: "nfl", label: "NFL" },
  { value: "mlb", label: "MLB" },
  { value: "nhl", label: "NHL" },
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
    detail: "Cuando un pick de tu bitácora se cumple o no (desactivado por defecto).",
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
    detail:
      "Tu nombre entra al ranking de Comunidad con 5 picks cerrados en la semana o 15 en el mes. Requiere perfil público.",
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

type NearestScrollIntoViewOptions = ScrollIntoViewOptions & {
  readonly container?: "all" | "nearest";
};

function scrollNavChipIntoView(element: HTMLElement | null): void {
  if (!element || typeof element.scrollIntoView !== "function") return;
  const opts: NearestScrollIntoViewOptions = {
    block: "nearest",
    inline: "nearest",
    container: "nearest",
  };
  try {
    element.scrollIntoView(opts);
  } catch (err) {
    void err;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

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

function buildSavedViewId(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 22);
  const stamp = Date.now().toString(36).slice(-6);
  return `vista-${slug || "filtro"}-${stamp}`.slice(0, 48);
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
          className="pl-acct-seg-btn"
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
    preferredBooks:
      override.preferredBooks !== undefined
        ? sanitizePreferredBookmakersPref(override.preferredBooks)
        : base.preferredBooks,
    savedViews:
      override.savedViews !== undefined
        ? sanitizeAccountSavedViews(override.savedViews)
        : (base.savedViews ?? []),
  };
}

type PrefsConfirmKind = "pause" | "export" | "delete" | null;

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
    dataset,
    hasAccountSessionAuth,
    favoriteLeagues,
    oddsFormat,
    riskPreference,
    userTimezone,
    preferredBooks,
  } = usePlatformCore();
  const {
    setFavoriteLeagues,
    setOddsFormat,
    setRiskPreference,
    setUserTimezone,
    setShowMxnBalance,
    setUnitMxn,
    setPreferredBooks,
    pushToast,
    navigateTo,
    logoutSession,
  } = usePlatformActions();
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
  const viewNameInputId = `${baseId}-view-name`;
  const viewSportSelectId = `${baseId}-view-sport`;

  const [prefs, setPrefs] = useState<StoredAccountPrefsV1>(() =>
    mergePrefs(DEFAULT_STORED_PREFS_V1, storyOverride?.initialPrefs),
  );
  const [savedViews, setSavedViews] = useState<AccountSavedView[]>(() =>
    sanitizeAccountSavedViews(storyOverride?.initialPrefs?.savedViews ?? []),
  );
  const [newViewName, setNewViewName] = useState<string>("");
  const [newViewSport, setNewViewSport] = useState<AccountSavedViewSport>("futbol");
  const [newViewEvOnly, setNewViewEvOnly] = useState<boolean>(true);
  const [newViewPinHome, setNewViewPinHome] = useState<boolean>(true);
  const [savedViewError, setSavedViewError] = useState<string | null>(null);
  const [maxBooksWarn, setMaxBooksWarn] = useState<boolean>(false);

  const [unitDraft, setUnitDraft] = useState<string>(() =>
    String(storyOverride?.initialPrefs?.unitMxn ?? DEFAULT_STORED_PREFS_V1.unitMxn),
  );
  const [unitError, setUnitError] = useState<string | null>(null);
  const [pendingBreak, setPendingBreak] = useState<Exclude<PauseChoice, null>>("7d");
  const [lastLeagueWarn, setLastLeagueWarn] = useState<boolean>(false);
  const [activeGroup, setActiveGroup] = useState<PrefGroupId>("pl-prefs-resumen");
  const [localSavedTick, setLocalSavedTick] = useState<number>(0);
  const [confirmKind, setConfirmKind] = useState<PrefsConfirmKind>(null);
  const [supportModal, setSupportModal] = useState<AccountSupportModalKind>(null);
  const [showInactiveLeagues, setShowInactiveLeagues] = useState<boolean>(false);
  const [leagueSearch, setLeagueSearch] = useState<string>("");
  const [accountActionNote, setAccountActionNote] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<boolean>(false);
  const [deleteBusy, setDeleteBusy] = useState<boolean>(false);

  const navRef = useRef<HTMLElement | null>(null);
  const unitDebounceRef = useRef<number | null>(null);
  const hydratedServerDataRef = useRef<ServerPreferencesEnvelope | null>(null);

  const serverPrefsQuery = useAbortableJson<ServerPreferencesEnvelope>("/api/me/preferences", {
    enabled: canPersistServer,
  });

  useSafeEffect(() => {
    return () => {
      if (unitDebounceRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(unitDebounceRef.current);
      }
    };
  }, []);

  useSafeEffect(() => {
    const stored = mergePrefs(readStoredPrefs(), storyOverride?.initialPrefs);
    setPrefs(stored);
    setUnitDraft(String(stored.unitMxn));
    if (stored.pauseChoice) {
      setPendingBreak(stored.pauseChoice);
    }
    if (storyOverride?.initialPrefs?.savedViews !== undefined) {
      setSavedViews(sanitizeAccountSavedViews(storyOverride.initialPrefs.savedViews));
    } else if (!canPersistServer) {
      setSavedViews(readAccountSavedViews());
    }
  }, [canPersistServer, storyOverride?.initialPrefs]);

  useSafeEffect(() => {
    const payload = serverPrefsQuery.data;
    if (!canPersistServer || !payload?.preferences) return;
    if (hydratedServerDataRef.current === payload) return;
    hydratedServerDataRef.current = payload;

    const p = payload.preferences;
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

    const rawBookmakers =
      Array.isArray(p.preferredBookmakers) && p.preferredBookmakers.length > 0
        ? p.preferredBookmakers
        : Array.isArray(p.preferredBooks)
          ? p.preferredBooks
          : null;
    const syncedBookmakers = rawBookmakers
      ? sanitizePreferredBookmakersPref(rawBookmakers)
      : null;
    if (syncedBookmakers) {
      setPreferredBooks(syncedBookmakers);
    }

    const syncedSavedViews = Array.isArray(p.savedViews)
      ? sanitizeAccountSavedViews(p.savedViews)
      : readAccountSavedViews();
    setSavedViews(syncedSavedViews);
    writeAccountSavedViews(syncedSavedViews);

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

    if (p.themeMode === "dark" || p.themeMode === "light" || p.themeMode === "system") {
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
        preferredBooks: syncedBookmakers ?? prev.preferredBooks,
        savedViews: syncedSavedViews,
      };
      writeStoredPrefs(next);
      return next;
    });
  }, [
    canPersistServer,
    serverPrefsQuery.data,
    setFavoriteLeagues,
    setOddsFormat,
    setPreferredBooks,
    setRiskPreference,
    setShowMxnBalance,
    setUnitMxn,
    setUserTimezone,
  ]);

  useSafeEffect(() => {
    if (typeof window === "undefined" || prefs.themeMode !== "system") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const onSystemChange = () => applyDocumentThemeMode("system");
    mq.addEventListener?.("change", onSystemChange);
    return () => mq.removeEventListener?.("change", onSystemChange);
  }, [prefs.themeMode]);

  useSafeEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      try {
        const explicit = window.localStorage.getItem("pl-theme");
        if (explicit === "light" || explicit === "dark") {
          setPrefs((prev) => {
            if (prev.themeMode === explicit) return prev;
            const next: StoredAccountPrefsV1 = { ...prev, themeMode: explicit };
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

  useSafeEffect(() => {
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
        const topId = visible[0]?.target.id;
        if (topId && PREF_GROUPS.some((g) => g.id === topId)) {
          setActiveGroup(topId as PrefGroupId);
        }
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: [0, 0.25] },
    );

    for (const el of elements) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  useSafeEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;
    const activeChip = navEl.querySelector<HTMLElement>(`[data-pref-nav="${activeGroup}"]`);
    scrollNavChipIntoView(activeChip);
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
    if (prefs.timezone && !base.some((opt) => opt.value === prefs.timezone)) {
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
    const cleanedStr = raw.replace(/[^0-9.]/g, "");
    const cleaned = parseStrictFiniteNumber(cleanedStr);
    if (cleaned !== null && cleaned >= 10) {
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
    const cleaned = parseStrictFiniteNumber(unitDraft.replace(/[^0-9.]/g, ""));
    if (cleaned === null || cleaned < 10) {
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
    const parsed = parseStrictFiniteNumber(unitDraft.replace(/[^0-9.]/g, ""));
    return parsed !== null && parsed > 0 ? parsed : prefs.unitMxn;
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
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const q = norm(leagueSearch);
    const byRegion = new Map<
      LeagueRegionKey,
      Array<{ id: LeagueId; name: string; active: boolean }>
    >();
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
  const bookmakerGroups = useMemo(() => partitionPriorityBookmakers(BOOKMAKER_OPTIONS), []);
  const oddsPreview = getOddsFormatPreview(oddsFormat);
  const boundedPreferredBooks = useMemo(
    () => preferredBooks.slice(0, MAX_PREFERRED_BOOKMAKERS_PREF),
    [preferredBooks],
  );
  const allPriorityMxSelected = PRIORITY_MX_BOOKMAKER_IDS.every((id) =>
    boundedPreferredBooks.includes(id),
  );
  const pinnedViewsCount = useMemo(
    () => savedViews.filter((view) => view.pinToHomeHub).length,
    [savedViews],
  );

  const applyPreferredBooks = useCallback(
    (nextBooks: string[], prevBooks: string[]) => {
      const sanitized = sanitizePreferredBookmakersPref(nextBooks);
      setPreferredBooks(sanitized);
      updatePrefs((prev) => ({ ...prev, preferredBooks: sanitized }));
      void persistServerPrefs(
        { preferredBookmakers: sanitized, preferredBooks: sanitized },
        () => {
          setPreferredBooks(prevBooks);
          setPrefs((curr) => {
            const reverted = { ...curr, preferredBooks: prevBooks };
            writeStoredPrefs(reverted);
            return reverted;
          });
        },
      );
    },
    [persistServerPrefs, setPreferredBooks, updatePrefs],
  );

  const handleToggleBook = (bookId: string) => {
    const prevBooks = boundedPreferredBooks;
    const exists = prevBooks.includes(bookId);
    if (exists && prevBooks.length <= 1) {
      pushToast("Deja al menos una casa de referencia activa.", "default");
      return;
    }
    if (!exists && prevBooks.length >= MAX_PREFERRED_BOOKMAKERS_PREF) {
      setMaxBooksWarn(true);
      pushToast(`Puedes seleccionar hasta ${MAX_PREFERRED_BOOKMAKERS_PREF} casas preferidas.`, "default");
      return;
    }
    setMaxBooksWarn(false);
    const nextBooks = exists
      ? prevBooks.filter((id) => id !== bookId)
      : sanitizePreferredBookmakersPref([...prevBooks, bookId]);
    applyPreferredBooks(nextBooks, prevBooks);
  };

  const handleSelectPriorityMxBooks = () => {
    const prevBooks = boundedPreferredBooks;
    const nextBooks = sanitizePreferredBookmakersPref([...PRIORITY_MX_BOOKMAKER_IDS]);
    setMaxBooksWarn(false);
    applyPreferredBooks(nextBooks, prevBooks);
    pushToast("Casas prioritarias MX activadas.", "default", {
      actionLabel: "Deshacer",
      onAction: () => applyPreferredBooks(prevBooks, nextBooks),
    });
  };

  const applySavedViews = useCallback(
    (nextViews: readonly AccountSavedView[], prevViews: readonly AccountSavedView[]) => {
      const serialized = serializeSavedViewsForApi(nextViews);
      setSavedViews(serialized);
      writeAccountSavedViews(serialized);
      setPrefs((curr) => ({ ...curr, savedViews: serialized }));
      notifySaved();
      void persistServerPrefs({ savedViews: serialized }, () => {
        const reverted = serializeSavedViewsForApi(prevViews);
        setSavedViews(reverted);
        writeAccountSavedViews(reverted);
        setPrefs((curr) => ({ ...curr, savedViews: reverted }));
      });
    },
    [notifySaved, persistServerPrefs],
  );

  const handleCreateSavedView = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newViewName.trim().slice(0, 40);
    if (cleanName.length < 2) {
      setSavedViewError("Escribe un nombre de al menos 2 caracteres para tu vista.");
      return;
    }
    if (savedViews.length >= MAX_SAVED_VIEWS_PREF) {
      setSavedViewError(`Alcanzaste el límite de ${MAX_SAVED_VIEWS_PREF} vistas guardadas.`);
      return;
    }
    setSavedViewError(null);
    const created: AccountSavedView = {
      id: buildSavedViewId(cleanName),
      name: cleanName,
      sport: newViewSport,
      league: "all",
      band: "all",
      kind: "all",
      sort: "ventaja",
      onlyPositiveEdge: newViewEvOnly,
      minOddsStep: 0,
      maxOddsStep: 100,
      window: "all",
      pinToHomeHub: newViewPinHome,
    };
    applySavedViews([...savedViews, created], savedViews);
    setNewViewName("");
    pushToast(`Vista «${cleanName}» guardada.`, "success");
  };

  const handleTogglePinSavedView = useCallback(
    (viewId: string) => {
      const prev = savedViews;
      const next = prev.map((view) =>
        view.id === viewId ? { ...view, pinToHomeHub: !view.pinToHomeHub } : view,
      );
      applySavedViews(next, prev);
    },
    [applySavedViews, savedViews],
  );

  const handleDeleteSavedView = useCallback(
    (viewId: string) => {
      const prev = savedViews;
      const removed = prev.find((view) => view.id === viewId);
      if (!removed) return;
      const next = prev.filter((view) => view.id !== viewId);
      applySavedViews(next, prev);
      pushToast(`Vista «${removed.name}» eliminada.`, "default", {
        actionLabel: "Deshacer",
        onAction: () => applySavedViews(prev, next),
      });
    },
    [applySavedViews, pushToast, savedViews],
  );

  const savedViewsColumns = useMemo<readonly SofascoreTableColumn<AccountSavedView>[]>(
    () => [
      {
        key: "name",
        header: "Vista",
        render: (view) => (
          <div className="min-w-0">
            <strong className="block text-sm font-bold text-[var(--pl-text)] truncate">
              {view.name}
            </strong>
            <span className="block text-xs text-[var(--pl-text-muted)]">
              {describeSavedViewFilters(view)}
            </span>
          </div>
        ),
      },
      {
        key: "pin",
        header: "Fijar en Inicio",
        align: "end",
        render: (view) => (
          <button
            type="button"
            aria-pressed={view.pinToHomeHub}
            data-saved-view-pin={view.id}
            className="pl-acct-league-pill pl-acct-chip-btn"
            onClick={() => handleTogglePinSavedView(view.id)}
          >
            <MaestroIcon name={view.pinToHomeHub ? "check" : "bookmark"} size={13} />
            <span>{view.pinToHomeHub ? "Fijada" : "Fijar"}</span>
          </button>
        ),
      },
      {
        key: "actions",
        header: "Acción",
        align: "end",
        render: (view) => (
          <Button
            type="button"
            variant="ghost"
            tone="danger"
            size="sm"
            data-saved-view-delete={view.id}
            aria-label={`Eliminar vista ${view.name}`}
            onClick={() => handleDeleteSavedView(view.id)}
          >
            Eliminar
          </Button>
        ),
      },
    ],
    [handleDeleteSavedView, handleTogglePinSavedView],
  );

  const handleConfirmPause = useCallback(() => {
    const nextBreak = pendingBreak;
    const prevChoice = prefs.pauseChoice;
    const prevChosenAt = prefs.pauseChosenAtIso;
    const revertPause = () => {
      updatePrefs((curr) => ({
        ...curr,
        pauseChoice: prevChoice,
        pauseChosenAtIso: prevChosenAt,
      }));
      void persistServerPrefs({ responsiblePauseKind: prevChoice });
    };
    updatePrefs((prev) => ({
      ...prev,
      pauseChoice: nextBreak,
      pauseChosenAtIso: new Date().toISOString(),
    }));
    pushToast(`Descanso de ${selectedBreakLabel} activado.`, "default", {
      actionLabel: "Deshacer",
      onAction: revertPause,
    });
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
  }, [pendingBreak, persistServerPrefs, prefs.pauseChoice, prefs.pauseChosenAtIso, pushToast, selectedBreakLabel, updatePrefs]);

  const handleConfirmExport = useCallback(() => {
    if (!canPersistServer) {
      setAccountActionNote("Archivo descargado en modo vista previa.");
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
        setAccountActionNote("Archivo JSON descargado con tu perfil, bitácora y actividad.");
      } catch (err) {
        void err;
        pushToast("Error de conexión al preparar tu descarga.", "warning");
      } finally {
        setExportBusy(false);
      }
    })();
  }, [canPersistServer, identity.cleanHandle, pushToast]);

  const handleConfirmArcoDelete = useCallback(() => {
    if (!canPersistServer) {
      const msg = "En modo de prueba con PIN no hay cuenta guardada en el servidor.";
      setAccountActionNote(msg);
      pushToast(msg, "default");
      return;
    }
    setDeleteBusy(true);
    void (async () => {
      try {
        const res = await fetch("/api/me/deletion-request", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Solicitud ARCO desde Preferencias" }),
        });
        const json = (await res.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        if (!res.ok) {
          pushToast(
            json?.error ?? "No pudimos registrar tu solicitud. Intenta de nuevo.",
            "warning",
          );
          return;
        }
        const okMsg =
          json?.message ??
          "Solicitud registrada; procesamos la baja y borrado en un máximo de 72 horas hábiles.";
        setAccountActionNote(okMsg);
        pushToast(okMsg, "success");
      } catch (err) {
        void err;
        pushToast("Error de conexión al enviar la solicitud.", "warning");
      } finally {
        setDeleteBusy(false);
      }
    })();
  }, [canPersistServer, pushToast]);

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
          className="pl-acct-prefs-nav"
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
              value={`${oddsPreview.label} (${oddsFormat === "decimal" ? "1.91" : "−110"})`}
              onClick={() => scrollToSection("pl-prefs-datos")}
            />
            <SettingsRow
              icon="ticket"
              title="Casas preferidas"
              subtitle="Prioritarias MX y referencia sharp (máx. 12)"
              value={formatPreferredBooksSummary(boundedPreferredBooks)}
              onClick={() => scrollToSection("pl-prefs-datos")}
            />
            <SettingsRow
              icon="bookmark"
              title="Vistas guardadas"
              subtitle="Filtros rápidos y accesos fijados en Inicio"
              value={`${savedViews.length}/${MAX_SAVED_VIEWS_PREF}`}
              onClick={() => scrollToSection("pl-prefs-vistas")}
            />
            <SettingsRow
              icon="bell"
              title="Notificaciones"
              subtitle="Alertas de valor, picks y app móvil"
              value={`${activeAlertsCount} activas`}
              onClick={() => scrollToSection("pl-prefs-alertas")}
            />
          </SettingsGroup>

          <SofascoreCard
            id="pl-prefs-ligas"
            title="Tus ligas"
            meta={`${favoriteLeagues.length} seleccionadas`}
            className="pl-acct-prefs-card"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="pl-acct-prefs-lead m-0">
                  Inicio, la tira de fechas y tus alertas priorizan estas competencias. Elige al
                  menos una ({favoriteLeagues.length} seleccionadas).
                </p>
                <div className="pl-prefs-inactive-switch">
                  <span className="text-xs font-medium text-[var(--pl-text-secondary)]">
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
                    className="pl-acct-switch"
                  >
                    <Switch.Control className="pl-acct-switch-control">
                      <Switch.Thumb className="pl-acct-switch-thumb" />
                    </Switch.Control>
                  </Switch>
                </div>
              </div>

              <div className="pl-prefs-league-search">
                <MaestroIcon name="search" size={14} />
                <input
                  type="search"
                  enterKeyHint="search"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="pl-acct-search-input"
                  value={leagueSearch}
                  onChange={(e) => setLeagueSearch(e.target.value)}
                  placeholder="Buscar liga o copa (Liga MX, Champions, MLS, MLB…)"
                  aria-label="Filtrar ligas disponibles"
                />
              </div>

              <div className="space-y-4" role="group" aria-label="Ligas">
                {groupedLeagues.map(({ region, items }) => (
                  <div key={region.key} className="space-y-2">
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">
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
                <p role="alert" className="pl-acct-prefs-warn" data-last-league-warning="">
                  Deja al menos una liga activa.
                </p>
              ) : null}
            </div>
          </SofascoreCard>

          <SofascoreCard
            id="pl-prefs-datos"
            title="Cómo ves los datos"
            className="pl-acct-prefs-card"
          >
            <div className="pl-acct-prefs-rows">
              <div className="pl-acct-prefs-row">
                <div className="pl-acct-prefs-row-copy">
                  <b id={oddsLabelId} className="pl-acct-prefs-row-title">
                    Formato de momio
                  </b>
                  <span className="pl-acct-prefs-row-detail num">{oddsPreview.detail}</span>
                  <span
                    className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold num text-[var(--pl-text-secondary)]"
                    data-odds-format-preview=""
                  >
                    <span className="pl-pill pl-pill--brand text-[11px] num">
                      Ej. justo {oddsPreview.sampleFair}
                    </span>
                  </span>
                </div>
                <PrefsSegment
                  labelledBy={oddsLabelId}
                  value={oddsFormat}
                  onChange={handleOddsChange}
                  dataAttr="data-odds-format-opt"
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
                  triggerClassName="pl-acct-select-trigger"
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

              <div
                className="pl-acct-pesos-divider space-y-3 py-4 min-w-0"
                data-preferred-books-section=""
              >
                <div className="flex flex-wrap items-start justify-between gap-2.5 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="pl-acct-prefs-row-title">Casas preferidas</b>
                      <span className="pl-pill pl-pill--brand text-[11px] num">
                        Prioridad MX · {boundedPreferredBooks.length}/{MAX_PREFERRED_BOOKMAKERS_PREF}
                      </span>
                    </div>
                    <span className="pl-acct-prefs-row-detail block mt-0.5">
                      Mostramos primero el mejor momio capturado entre tus casas frente al momio
                      justo de Spacetime v5.1 (corte menor a 72 h, sin enlaces de afiliado).
                    </span>
                  </div>
                  {!allPriorityMxSelected ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-select-priority-mx-books=""
                      onClick={handleSelectPriorityMxBooks}
                    >
                      Activar Top 5 MX
                    </Button>
                  ) : null}
                </div>

                {maxBooksWarn ? (
                  <p role="alert" className="pl-acct-prefs-warn">
                    Límite de {MAX_PREFERRED_BOOKMAKERS_PREF} casas preferidas alcanzado. Desactiva
                    una para elegir otra.
                  </p>
                ) : null}

                <div className="space-y-2 min-w-0" data-priority-mx-books="">
                  <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-brand)]">
                    Prioritarias en México y línea sharp
                  </p>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Casas prioritarias en México"
                  >
                    {bookmakerGroups.priorityMx.map((book) => {
                      const active = boundedPreferredBooks.includes(book.id);
                      const hint = book.id === "pinnacle" ? "Sharp · Ref." : book.regionHint;
                      return (
                        <button
                          key={book.id}
                          type="button"
                          className="pl-acct-league-pill pl-acct-chip-btn"
                          data-book-toggle={book.id}
                          data-book-priority="mx"
                          aria-pressed={active}
                          onClick={() => handleToggleBook(book.id)}
                        >
                          {active ? (
                            <MaestroIcon
                              name="check"
                              size={12}
                              className="text-[var(--pl-brand)]"
                            />
                          ) : null}
                          <span className="font-bold">{book.label}</span>
                          <span
                            className={`text-[11px] ${
                              active ? "text-[var(--pl-brand)]" : "text-[var(--pl-text-muted)]"
                            }`}
                          >
                            {hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 min-w-0 pt-1" data-other-books="">
                  <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">
                    Otras casas disponibles
                  </p>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Otras casas de referencia"
                  >
                    {bookmakerGroups.others.map((book) => {
                      const active = boundedPreferredBooks.includes(book.id);
                      return (
                        <button
                          key={book.id}
                          type="button"
                          className="pl-acct-league-pill pl-acct-chip-btn"
                          data-book-toggle={book.id}
                          aria-pressed={active}
                          onClick={() => handleToggleBook(book.id)}
                        >
                          {active ? <MaestroIcon name="check" size={12} /> : null}
                          <span className="font-bold">{book.label}</span>
                          <span className="text-[11px] text-[var(--pl-text-muted)]">
                            {book.regionHint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </SofascoreCard>

          <SofascoreCard
            id="pl-prefs-vistas"
            title="Vistas guardadas"
            meta={`${savedViews.length}/${MAX_SAVED_VIEWS_PREF} · ${pinnedViewsCount} en Inicio`}
            className="pl-acct-prefs-card"
          >
            <div className="space-y-4" data-saved-views-prefs="">
              <p className="pl-acct-prefs-lead m-0">
                Guarda combinaciones de filtros para Explorar picks (hasta {MAX_SAVED_VIEWS_PREF})
                y fija tus favoritas como acceso directo en Inicio.
              </p>

              {savedViews.length === 0 ? (
                <SofascoreEmptyState
                  title="Aún no tienes vistas guardadas"
                  description="Crea una vista rápida abajo o guárdala desde Explorar picks para fijarla en Inicio."
                />
              ) : (
                <SofascoreTable
                  caption="Vistas guardadas de filtros y fijado en Inicio"
                  columns={savedViewsColumns}
                  rows={savedViews}
                  rowKey={(view) => view.id}
                  density="compact"
                />
              )}

              <form
                onSubmit={handleCreateSavedView}
                className="pl-acct-view-form"
                aria-label="Crear vista guardada"
                noValidate
              >
                <div className="pl-acct-view-form-grid">
                  <div className="pl-acct-field">
                    <label htmlFor={viewNameInputId} className="pl-acct-field-label">
                      Nombre de la vista
                    </label>
                    <input
                      id={viewNameInputId}
                      type="text"
                      name="savedViewName"
                      maxLength={40}
                      autoComplete="off"
                      enterKeyHint="done"
                      placeholder="Ej. EV+ Fútbol hoy"
                      value={newViewName}
                      onChange={(e) => {
                        setNewViewName(e.target.value);
                        if (savedViewError) setSavedViewError(null);
                      }}
                      className="pl-acct-input"
                    />
                  </div>

                  <div className="pl-acct-field">
                    <label
                      id={`${viewSportSelectId}-label`}
                      htmlFor={viewSportSelectId}
                      className="pl-acct-field-label"
                    >
                      Deporte
                    </label>
                    <PlSelect
                      id={viewSportSelectId}
                      ariaLabelledBy={`${viewSportSelectId}-label`}
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="pl-acct-select-trigger"
                      value={newViewSport}
                      onChange={(nextSport) => setNewViewSport(nextSport)}
                      options={SAVED_VIEW_SPORT_OPTIONS}
                    />
                  </div>
                </div>

                <div className="pl-acct-view-form-foot">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="pl-acct-check-label">
                      <input
                        type="checkbox"
                        checked={newViewEvOnly}
                        onChange={(e) => setNewViewEvOnly(e.target.checked)}
                        className="pl-acct-checkbox"
                      />
                      <span>Solo EV+</span>
                    </label>

                    <label className="pl-acct-check-label">
                      <input
                        type="checkbox"
                        checked={newViewPinHome}
                        onChange={(e) => setNewViewPinHome(e.target.checked)}
                        className="pl-acct-checkbox"
                      />
                      <span>Fijar en Inicio</span>
                    </label>
                  </div>

                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={savedViews.length >= MAX_SAVED_VIEWS_PREF}
                    data-create-saved-view=""
                  >
                    <MaestroIcon name="plus" size={14} />
                    <span>Guardar vista</span>
                  </Button>
                </div>

                {savedViewError ? (
                  <p role="alert" className="pl-acct-prefs-warn">
                    {savedViewError}
                  </p>
                ) : null}
              </form>
            </div>
          </SofascoreCard>

          <SofascoreCard
            id="pl-prefs-picks"
            title="Picks y parlays"
            className="pl-acct-prefs-card"
          >
            <div className="space-y-4">
              <p className="pl-acct-prefs-lead m-0">
                Qué perfil abre por defecto en Parlay rápido y en Picks del día. Lo puedes cambiar
                ahí mismo.
              </p>

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
                        type="text"
                        inputMode="numeric"
                        enterKeyHint="done"
                        className="pl-acct-unit-input num"
                        value={unitDraft}
                        onChange={(e) => handleUnitInputChange(e.target.value)}
                        onBlur={handleUnitBlur}
                        aria-invalid={unitError ? "true" : "false"}
                        aria-describedby={unitError ? unitErrorId : undefined}
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
                        <b className="pl-acct-pesos-units">{formatUnits(record.netUnits)}</b> se
                        verá como{" "}
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
            </div>
          </SofascoreCard>

          <SofascoreCard
            id="pl-prefs-alertas"
            title="Alertas"
            meta="En la app y por correo"
            className="pl-acct-prefs-card"
          >
            <div className="pl-acct-prefs-rows">
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
                  <div key={item.key} className="pl-acct-prefs-row pl-acct-prefs-row--switch">
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
                    Controla cada cuánto recibes alertas de movimiento de línea o hitos de tus
                    picks.
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
            </div>
          </SofascoreCard>

          <SofascoreCard
            id="pl-prefs-privacidad"
            title="Privacidad"
            className="pl-acct-prefs-card"
          >
            <div className="pl-acct-prefs-rows">
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
                  <div key={item.key} className="pl-acct-prefs-row pl-acct-prefs-row--switch">
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
            </div>
          </SofascoreCard>

          <SofascoreCard
            id="pl-prefs-descanso"
            title="Juego responsable"
            className="pl-acct-prefs-card"
          >
            <div className="space-y-4">
              <p className="pl-acct-prefs-lead m-0">
                Si quieres alejarte un tiempo, pausa tu cuenta para dejar de ver picks y alertas
                durante el periodo que elijas.
              </p>

              {prefs.pauseChoice === null ? (
                <div className="pl-acct-break-controls">
                  <span className="pl-acct-pesos-label">Tomar un descanso de</span>
                  <PrefsSegment
                    ariaLabel="Duración del descanso"
                    value={pendingBreak}
                    onChange={setPendingBreak}
                    options={BREAK_OPTIONS}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirmKind("pause")}
                  >
                    Pausar mi cuenta
                  </Button>
                </div>
              ) : (
                <div role="status" className="pl-acct-pause-banner">
                  <span>
                    {hasAccountSessionAuth
                      ? `Descanso activo (${selectedBreakLabel}) guardado en tu cuenta.`
                      : `Descanso elegido (${selectedBreakLabel}). La pausa se aplicará cuando se active tu cuenta.`}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
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
                  </Button>
                </div>
              )}

              <a href="/legal/juego-responsable" className="pl-acct-help-link">
                Recursos de ayuda y juego responsable
              </a>
            </div>
          </SofascoreCard>

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
                subtitle={
                  telegramUrl
                    ? "Canal oficial de novedades y análisis"
                    : "Próximamente · avisos y novedades"
                }
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
                onClick={() => setConfirmKind("export")}
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

            <SettingsGroup title="Zona de peligro" footnote={accountActionNote ?? undefined}>
              <SettingsRow
                icon="trash"
                title="Eliminar cuenta"
                subtitle="Solicita la baja definitiva ARCO y borrado de tus datos"
                tone="danger"
                showChevron={false}
                disabled={deleteBusy}
                dataAttr="prefs-delete-account-row"
                onClick={() => setConfirmKind("delete")}
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

      <ConfirmActionDialog
        open={confirmKind === "pause"}
        title={`¿Pausar tu cuenta por ${selectedBreakLabel}?`}
        description={
          hasAccountSessionAuth
            ? `Aplicaremos un descanso de ${selectedBreakLabel} en tu cuenta para pausar alertas y avisos durante este periodo.`
            : `Guardaremos tu elección de descanso por ${selectedBreakLabel}. La pausa se aplicará cuando se active tu cuenta.`
        }
        cancelLabel="Cancelar"
        confirmLabel="Confirmar descanso"
        tone="brand"
        onConfirm={handleConfirmPause}
        onCancel={() => setConfirmKind(null)}
      />

      <ConfirmActionDialog
        open={confirmKind === "export"}
        title="Descargar mis datos"
        description="Descargaremos un archivo JSON con tu perfil, preferencias, bitácora, transferencias, cupones y actividad registrada en PitchLab."
        cancelLabel="Cancelar"
        confirmLabel={exportBusy ? "Preparando…" : "Descargar JSON"}
        tone="brand"
        onConfirm={handleConfirmExport}
        onCancel={() => {
          if (!exportBusy) setConfirmKind(null);
        }}
      />

      <ConfirmActionDialog
        open={confirmKind === "delete"}
        title="¿Solicitar eliminación definitiva de cuenta?"
        description="Esta solicitud ARCO inicia la baja definitiva de tu perfil, tu bitácora y tus publicaciones en un máximo de 72 horas hábiles. No se puede deshacer."
        cancelLabel="Cancelar"
        confirmLabel={deleteBusy ? "Enviando…" : "Solicitar baja definitiva"}
        tone="danger"
        onConfirm={handleConfirmArcoDelete}
        onCancel={() => {
          if (!deleteBusy) setConfirmKind(null);
        }}
      />
    </div>
  );
}
