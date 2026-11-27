"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { Switch } from "@heroui/react";
import {
  COMPETITION_CATALOG,
  isLeagueActiveInWindow,
  parseStrictFiniteNumber,
  type LeagueId,
  type PlatformSport,
} from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreTable,
  type SofascoreTableColumn,
} from "../../../components/ui/primitives";
import {
  resolveThemedPackSrcSet,
  resolveThemedPackUrl,
  usePackIconBase,
} from "../../../pack-icon-theme";
import { LeagueBadge } from "../../../sports";
import {
  THEME_CHANGE_EVENT,
  applyThemeMode,
  getSystemPreferredTheme,
  readStoredThemeMode,
  shouldHydrateServerThemeMode,
} from "../../../theme-controller";
import { BOOKMAKER_OPTIONS } from "../../bookmakers";
import { resolveCircularCountryFlag, type CircularCountryFlag } from "../../country-flags";
import {
  FeedbackSupportDialog,
  type AccountSupportModalKind,
} from "../../components/FeedbackSupportDialog";
import { ExampleBadge, MaestroIcon } from "../../components/MaestroPrimitives";
import {
  ConfirmActionDialog,
  TopLayerModalDialog,
} from "../../components/PlatformOverlays";
import { SettingsGroup, SettingsRow } from "../../components/SettingsGroup";
import { type VisualStyle } from "../../components/ShellChrome";
import { useAbortableJson, useSafeEffect } from "../../hooks";
import { handleRovingTablistKeyDown } from "../../navigation-helpers";
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
  detectDeviceTimezone,
  formatCurrentTimeInTimezone,
  formatPreferredBooksSummary,
  formatTimezoneShortLabel,
  getOddsFormatPreview,
  listWorldTimezoneOptions,
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
  type WorldTimezoneOption,
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
    readonly updatedAtIso?: string | null;
  };
}

const PREF_GROUPS = [
  { id: "pl-prefs-resumen", label: "General" },
  { id: "pl-prefs-ligas", label: "Tus ligas" },
  { id: "pl-prefs-picks", label: "Picks y parlays" },
  { id: "pl-prefs-privacidad", label: "Privacidad" },
  { id: "pl-prefs-soporte", label: "Soporte y cuenta" },
] as const;

type PrefGroupId = (typeof PREF_GROUPS)[number]["id"];
type GeneralModalKind = "theme" | "timezone" | "odds" | "books" | "views" | "alerts" | null;
type LeagueSportFilter = "all" | PlatformSport;

const LEAGUE_SPORT_DEFS: ReadonlyArray<{
  readonly key: PlatformSport;
  readonly label: string;
  readonly shortLabel: string;
}> = [
  { key: "football", label: "Fútbol", shortLabel: "Fútbol" },
  { key: "basketball", label: "Baloncesto", shortLabel: "Baloncesto" },
  { key: "american-football", label: "Fútbol americano", shortLabel: "Fútbol am." },
  { key: "baseball", label: "Béisbol", shortLabel: "Béisbol" },
  { key: "ice-hockey", label: "Hockey sobre hielo", shortLabel: "Hockey" },
];

const COUNTRY_PRIORITY_ORDER: readonly string[] = [
  "México",
  "Estados Unidos",
  "Inglaterra",
  "España",
  "Alemania",
  "Italia",
  "Francia",
  "Argentina",
  "Brasil",
  "Colombia",
  "Chile",
  "Ecuador",
  "Perú",
  "Países Bajos",
  "Portugal",
  "Bélgica",
  "Turquía",
  "Arabia Saudita",
  "Japón",
  "Copas internacionales · Europa",
  "Copas internacionales · Sudamérica",
  "Copas internacionales · CONCACAF",
  "Copas internacionales · Norteamérica",
  "Copas internacionales · África",
  "Selecciones nacionales",
];

function resolveLeagueCountryGroup(comp: (typeof COMPETITION_CATALOG)[number]): string {
  if (comp.region === "national-teams") return "Selecciones nacionales";
  if (comp.countrySlug !== null) return comp.country;
  return `Copas internacionales · ${comp.country}`;
}

function countrySortRank(countryLabel: string): number {
  const idx = COUNTRY_PRIORITY_ORDER.indexOf(countryLabel);
  return idx >= 0 ? idx : 999;
}

function resolveCountryAccordionFlag(countryLabel: string): CircularCountryFlag | null {
  if (countryLabel === "Copas internacionales · Europa") {
    return resolveCircularCountryFlag("europa");
  }
  if (
    countryLabel.startsWith("Copas internacionales") ||
    countryLabel === "Selecciones nacionales"
  ) {
    return resolveCircularCountryFlag("internacional");
  }
  return resolveCircularCountryFlag(countryLabel);
}

const LEAGUE_OPTIONS: ReadonlyArray<{
  readonly id: LeagueId;
  readonly name: string;
  readonly sport: PlatformSport;
  readonly countryGroup: string;
  readonly prestigeTier: 1 | 2 | 3 | 4;
}> = COMPETITION_CATALOG.map((c) => ({
  id: c.id,
  name: c.label,
  sport: c.sport,
  countryGroup: resolveLeagueCountryGroup(c),
  prestigeTier: c.prestigeTier,
}));

const TZ_VISIBLE_PAGE = 50;

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

function formatPauseChoiceLabel(choice: PauseChoice): string {
  if (choice === "24h") return "Pausa · 24 horas";
  if (choice === "7d") return "Pausa · 7 días";
  if (choice === "30d") return "Pausa · 30 días";
  return "Sin pausa";
}

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
  applyThemeMode(mode, { persistStorage: true, syncServer: false });
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

type PrefsConfirmKind = "export" | "delete" | null;

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
  const modalTitleId = `${baseId}-general-modal-title`;
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
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">("dark");
  const [deviceTimezone, setDeviceTimezone] = useState<string | null>(null);
  const [tzSearch, setTzSearch] = useState<string>("");
  const [tzRegion, setTzRegion] = useState<string>("all");
  const [tzVisibleCount, setTzVisibleCount] = useState<number>(TZ_VISIBLE_PAGE);
  const iconBase = usePackIconBase();
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
  const [lastLeagueWarn, setLastLeagueWarn] = useState<boolean>(false);
  const [activeGroup, setActiveGroup] = useState<PrefGroupId>("pl-prefs-resumen");
  const [localSavedTick, setLocalSavedTick] = useState<number>(0);
  const [confirmKind, setConfirmKind] = useState<PrefsConfirmKind>(null);
  const [generalModal, setGeneralModal] = useState<GeneralModalKind>(null);
  const [supportModal, setSupportModal] = useState<AccountSupportModalKind>(null);
  const [showInactiveLeagues, setShowInactiveLeagues] = useState<boolean>(false);
  const [leagueSearch, setLeagueSearch] = useState<string>("");
  const [leagueSportFilter, setLeagueSportFilter] = useState<LeagueSportFilter>("all");
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

    const serverThemeMode =
      p.themeMode === "dark" || p.themeMode === "light" || p.themeMode === "system"
        ? p.themeMode
        : null;
    const hydrateServerTheme = Boolean(
      serverThemeMode && shouldHydrateServerThemeMode(p.updatedAtIso),
    );
    if (hydrateServerTheme && serverThemeMode) {
      applyThemeMode(serverThemeMode, {
        persistStorage: true,
        syncServer: false,
        recordTimestamp: false,
      });
    }

    setPrefs((prev) => {
      const next: StoredAccountPrefsV1 = {
        ...prev,
        v: 1,
        themeMode: hydrateServerTheme && serverThemeMode ? serverThemeMode : readStoredThemeMode(),
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
    if (typeof window === "undefined") return;
    setSystemTheme(getSystemPreferredTheme());
    setDeviceTimezone(detectDeviceTimezone());
    const syncLocalTheme = () => {
      const currentMode = readStoredThemeMode();
      setSystemTheme(getSystemPreferredTheme());
      setPrefs((prev) => {
        if (prev.themeMode === currentMode) return prev;
        const next: StoredAccountPrefsV1 = { ...prev, themeMode: currentMode };
        writeStoredPrefs(next);
        return next;
      });
    };
    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: light)")
        : null;
    const onSchemeChange = () => setSystemTheme(getSystemPreferredTheme());
    window.addEventListener(THEME_CHANGE_EVENT, syncLocalTheme);
    mq?.addEventListener("change", onSchemeChange);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncLocalTheme);
      mq?.removeEventListener("change", onSchemeChange);
    };
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

  const tzReferenceNow = useMemo(
    () => (generalModal === "timezone" ? new Date() : null),
    [generalModal],
  );

  const worldTimezones = useMemo<readonly WorldTimezoneOption[]>(() => {
    if (!tzReferenceNow) return [];
    const base = listWorldTimezoneOptions(tzReferenceNow);
    if (prefs.timezone && !base.some((opt) => opt.value === prefs.timezone)) {
      return [
        {
          value: prefs.timezone,
          city: formatTimezoneShortLabel(prefs.timezone),
          region: "Otras zonas",
          offsetLabel: "",
          offsetMinutes: 0,
          searchIndex: prefs.timezone.toLowerCase(),
        },
        ...base,
      ];
    }
    return base;
  }, [prefs.timezone, tzReferenceNow]);

  const tzRegionTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tz of worldTimezones) {
      counts.set(tz.region, (counts.get(tz.region) ?? 0) + 1);
    }
    const order = ["América", "Europa", "Asia", "Oceanía", "África", "Pacífico", "Atlántico", "Índico", "UTC"];
    const tabs: Array<{ key: string; label: string; count: number }> = [
      { key: "all", label: "Todas", count: worldTimezones.length },
    ];
    for (const region of order) {
      const count = counts.get(region) ?? 0;
      if (count > 0) tabs.push({ key: region, label: region, count });
    }
    return tabs;
  }, [worldTimezones]);

  const filteredTimezones = useMemo(() => {
    if (worldTimezones.length === 0) return [];
    const q = tzSearch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/−/g, "-")
      .trim();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    return worldTimezones.filter((opt) => {
      if (tzRegion !== "all" && !q && opt.region !== tzRegion) return false;
      if (tokens.length === 0) return true;
      return tokens.every((tok) => opt.searchIndex.includes(tok));
    });
  }, [tzRegion, tzSearch, worldTimezones]);

  const handleTimezoneChange = (nextTz: string) => {
    if (nextTz === prefs.timezone) return;
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
  };

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

  const todayIso = useMemo(
    () => todayId(userTimezone || prefs.timezone || "America/Mexico_City"),
    [userTimezone, prefs.timezone],
  );

  const filteredLeagues = useMemo(() => {
    const norm = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const q = norm(leagueSearch);
    const sportLabelByKey = new Map<PlatformSport, string>(
      LEAGUE_SPORT_DEFS.map((s) => [s.key, `${s.label} ${s.shortLabel}`]),
    );
    const matches: Array<{
      id: LeagueId;
      name: string;
      sport: PlatformSport;
      countryGroup: string;
      prestigeTier: 1 | 2 | 3 | 4;
      active: boolean;
    }> = [];
    for (const lg of LEAGUE_OPTIONS) {
      const active =
        dataset.games.length === 0
          ? true
          : isLeagueActiveInWindow(dataset.games, lg.id, todayIso, 30);
      const isFav = favoriteLeagues.includes(lg.id);
      if (!showInactiveLeagues && !active && !isFav) continue;
      if (q) {
        const sportText = sportLabelByKey.get(lg.sport) ?? "";
        const hit =
          norm(lg.name).includes(q) ||
          norm(lg.id).includes(q) ||
          norm(lg.countryGroup).includes(q) ||
          norm(sportText).includes(q);
        if (!hit) continue;
      }
      matches.push({
        id: lg.id,
        name: lg.name,
        sport: lg.sport,
        countryGroup: lg.countryGroup,
        prestigeTier: lg.prestigeTier,
        active,
      });
    }
    return matches;
  }, [dataset.games, favoriteLeagues, leagueSearch, showInactiveLeagues, todayIso]);

  const sportTabs = useMemo(() => {
    const countBySport = new Map<PlatformSport, number>();
    for (const item of filteredLeagues) {
      countBySport.set(item.sport, (countBySport.get(item.sport) ?? 0) + 1);
    }
    const items: Array<{ key: LeagueSportFilter; label: string; count: number }> = [
      { key: "all", label: "Todos", count: filteredLeagues.length },
    ];
    for (const def of LEAGUE_SPORT_DEFS) {
      const count = countBySport.get(def.key) ?? 0;
      if (count > 0 || leagueSportFilter === def.key) {
        items.push({ key: def.key, label: def.shortLabel, count });
      }
    }
    return items;
  }, [filteredLeagues, leagueSportFilter]);

  const groupedLeagues = useMemo(() => {
    const favoriteSet = new Set<LeagueId>(favoriteLeagues);
    const bySport = new Map<
      PlatformSport,
      Map<string, Array<{ id: LeagueId; name: string; active: boolean; prestigeTier: 1 | 2 | 3 | 4 }>>
    >();
    for (const item of filteredLeagues) {
      if (leagueSportFilter !== "all" && item.sport !== leagueSportFilter) continue;
      let byCountry = bySport.get(item.sport);
      if (!byCountry) {
        byCountry = new Map();
        bySport.set(item.sport, byCountry);
      }
      const countryList = byCountry.get(item.countryGroup) ?? [];
      countryList.push({
        id: item.id,
        name: item.name,
        active: item.active,
        prestigeTier: item.prestigeTier,
      });
      byCountry.set(item.countryGroup, countryList);
    }
    return LEAGUE_SPORT_DEFS.map((sportDef) => {
      const byCountry = bySport.get(sportDef.key);
      if (!byCountry || byCountry.size === 0) return null;
      const countries = Array.from(byCountry.entries())
        .sort(([a], [b]) => {
          const rankDiff = countrySortRank(a) - countrySortRank(b);
          return rankDiff !== 0 ? rankDiff : a.localeCompare(b, "es");
        })
        .map(([country, items]) => ({
          country,
          items: [...items].sort((a, b) =>
            a.prestigeTier !== b.prestigeTier
              ? a.prestigeTier - b.prestigeTier
              : a.name.localeCompare(b.name, "es"),
          ),
        }));
      const totalCount = countries.reduce((acc, group) => acc + group.items.length, 0);
      const selectedCount = countries.reduce(
        (acc, group) => acc + group.items.filter((it) => favoriteSet.has(it.id)).length,
        0,
      );
      return { sport: sportDef, countries, totalCount, selectedCount };
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [favoriteLeagues, filteredLeagues, leagueSportFilter]);

  const themeRowValue =
    prefs.themeMode === "light"
      ? "Claro"
      : prefs.themeMode === "dark"
        ? "Oscuro"
        : systemTheme === "light"
          ? "Sistema (claro)"
          : "Sistema (oscuro)";

  const timezoneRowValue = formatTimezoneShortLabel(prefs.timezone);

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

  const exportBusyRef = useRef<boolean>(false);
  const deleteBusyRef = useRef<boolean>(false);
  const prefsModalBodyRef = useRef<HTMLDivElement | null>(null);

  const handleConfirmExport = useCallback(() => {
    if (exportBusyRef.current || exportBusy) return;
    if (!canPersistServer) {
      setAccountActionNote("Archivo descargado en modo vista previa.");
      return;
    }
    exportBusyRef.current = true;
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
        exportBusyRef.current = false;
        setExportBusy(false);
      }
    })();
  }, [canPersistServer, exportBusy, identity.cleanHandle, pushToast]);

  const handleConfirmArcoDelete = useCallback(() => {
    if (deleteBusyRef.current || deleteBusy) return;
    if (!canPersistServer) {
      const msg = "En modo de prueba con PIN no hay cuenta guardada en el servidor.";
      setAccountActionNote(msg);
      pushToast(msg, "default");
      return;
    }
    deleteBusyRef.current = true;
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
        deleteBusyRef.current = false;
        setDeleteBusy(false);
      }
    })();
  }, [canPersistServer, deleteBusy, pushToast]);

  const generalModalMeta: {
    readonly title: string;
    readonly subtitle: string;
    readonly maxWidth: string;
  } | null =
    generalModal === "theme"
      ? {
          title: "Tema de la interfaz",
          subtitle: "«Sistema» sigue el ajuste de tu teléfono o computadora.",
          maxWidth: "28rem",
        }
      : generalModal === "timezone"
        ? {
            title: "Horario de los partidos",
            subtitle: "Todas las horas de la app usan esta zona.",
            maxWidth: "30rem",
          }
        : generalModal === "odds"
          ? {
              title: "Formato de cuotas",
              subtitle: "Cambia cómo se muestran todos los momios en la app.",
              maxWidth: "28rem",
            }
          : generalModal === "books"
            ? {
                title: "Casas preferidas",
                subtitle: "Prioritarias MX y referencia sharp (máx. 12).",
                maxWidth: "36rem",
              }
            : generalModal === "views"
              ? {
                  title: "Vistas guardadas",
                  subtitle: `Filtros rápidos para Explorar picks (${savedViews.length}/${MAX_SAVED_VIEWS_PREF} · ${pinnedViewsCount} en Inicio).`,
                  maxWidth: "38rem",
                }
              : generalModal === "alerts"
                ? {
                    title: "Notificaciones",
                    subtitle: "Alertas de valor, picks, frecuencia y app móvil.",
                    maxWidth: "34rem",
                  }
                : null;

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
              icon={prefs.themeMode === "light" ? "sun" : "moon"}
              title="Tema"
              subtitle="Oscuro, claro o según tu dispositivo"
              value={themeRowValue}
              dataAttr="prefs-general-theme"
              onClick={() => setGeneralModal("theme")}
            />
            <SettingsRow
              icon="calendar"
              title="Horario de los partidos"
              subtitle="Zona horaria para toda la app"
              value={timezoneRowValue}
              dataAttr="prefs-general-timezone"
              onClick={() => setGeneralModal("timezone")}
            />
            <SettingsRow
              icon="activity"
              title="Formato de cuotas"
              subtitle="Americano (−110) o Decimal (1.91)"
              value={`${oddsPreview.label} (${oddsFormat === "decimal" ? "1.91" : "−110"})`}
              dataAttr="prefs-general-odds"
              onClick={() => setGeneralModal("odds")}
            />
            <SettingsRow
              icon="ticket"
              title="Casas preferidas"
              subtitle="Prioritarias MX y referencia sharp (máx. 12)"
              value={formatPreferredBooksSummary(boundedPreferredBooks)}
              dataAttr="prefs-general-books"
              onClick={() => setGeneralModal("books")}
            />
            <SettingsRow
              icon="bookmark"
              title="Vistas guardadas"
              subtitle="Filtros rápidos y accesos fijados en Inicio"
              value={`${savedViews.length}/${MAX_SAVED_VIEWS_PREF}`}
              dataAttr="prefs-general-views"
              onClick={() => setGeneralModal("views")}
            />
            <SettingsRow
              icon="bell"
              title="Notificaciones"
              subtitle="Alertas de valor, picks y app móvil"
              value={`${activeAlertsCount} activas`}
              dataAttr="prefs-general-alerts"
              onClick={() => setGeneralModal("alerts")}
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
                  placeholder="Buscar liga, país o deporte (Liga MX, México, NBA…)"
                  aria-label="Filtrar ligas por nombre, país o deporte"
                />
              </div>

              <div
                className="pl-prefs-sport-tabs"
                role="tablist"
                aria-label="Filtrar ligas por deporte"
                aria-orientation="horizontal"
                {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
              >
                {sportTabs.map((tab) => {
                  const selected = leagueSportFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      className="pl-prefs-sport-tab"
                      data-prefs-sport-tab={tab.key}
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setLeagueSportFilter(tab.key)}
                      onKeyDown={(e) =>
                        handleRovingTablistKeyDown(
                          e,
                          sportTabs.map((item) => item.key),
                          tab.key,
                          setLeagueSportFilter,
                        )
                      }
                      {...(selected
                        ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                        : {})}
                    >
                      <span>{tab.label}</span>
                      <span className="pl-prefs-sport-tab-count num">{tab.count}</span>
                    </button>
                  );
                })}
              </div>

              {groupedLeagues.length === 0 ? (
                <SofascoreEmptyState
                  title="No encontramos competencias con ese filtro"
                  description={
                    leagueSearch.trim()
                      ? "Prueba otro nombre, país o deporte, o activa «Ver en pausa»."
                      : "Activa «Ver en pausa» para mostrar ligas fuera de temporada."
                  }
                  actionLabel="Mostrar todas las ligas"
                  onAction={() => {
                    setLeagueSearch("");
                    setLeagueSportFilter("all");
                  }}
                />
              ) : (
                <div className="pl-prefs-sport-list" role="group" aria-label="Ligas por deporte y país">
                  {groupedLeagues.map(({ sport, countries, selectedCount }) => (
                    <section
                      key={sport.key}
                      className="pl-prefs-sport-group"
                      data-prefs-sport-group={sport.key}
                    >
                      <header className="pl-prefs-sport-head">
                        <h3 className="pl-prefs-sport-title">{sport.label}</h3>
                        <span className="pl-prefs-sport-meta num">
                          {selectedCount} {selectedCount === 1 ? "activa" : "activas"}
                        </span>
                      </header>
                      <div className="pl-prefs-country-list">
                        {countries.map(({ country, items }) => {
                          const flag = resolveCountryAccordionFlag(country);
                          const selectedInCountry = items.filter((league) =>
                            favoriteLeagues.includes(league.id),
                          ).length;
                          const forceOpen = leagueSearch.trim().length > 0;
                          return (
                            <details
                              key={`${sport.key}-${country}`}
                              className="pl-prefs-country-acc"
                              data-prefs-country-group={country}
                              open={forceOpen ? true : undefined}
                            >
                              <summary className="pl-prefs-country-row">
                                <span className="pl-prefs-country-lead">
                                  {flag ? (
                                    <span className="pl-prefs-country-flag" aria-hidden="true">
                                      <img
                                        src={resolveThemedPackUrl(flag.src, iconBase)}
                                        srcSet={resolveThemedPackSrcSet(flag.srcSet, iconBase)}
                                        width={22}
                                        height={16}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    </span>
                                  ) : (
                                    <span className="pl-prefs-country-flag-fallback" aria-hidden="true">
                                      <MaestroIcon name="globe" size={16} />
                                    </span>
                                  )}
                                  <span className="pl-prefs-country-name">{country}</span>
                                </span>
                                <span className="pl-prefs-country-trail">
                                  <span className="pl-prefs-country-count num">
                                    {selectedInCountry > 0
                                      ? `${selectedInCountry}/${items.length}`
                                      : items.length}
                                  </span>
                                  <span className="pl-prefs-country-chev" aria-hidden="true">
                                    <MaestroIcon name="chevronLeft" size={14} />
                                  </span>
                                </span>
                              </summary>
                              <div className="pl-prefs-country-body">
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
                                        {isSelected ? (
                                          <MaestroIcon name="check" size={12} />
                                        ) : null}
                                        {!league.active ? (
                                          <span className="pl-prefs-pause-tag">En pausa</span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {lastLeagueWarn ? (
                <p role="alert" className="pl-acct-prefs-warn" data-last-league-warning="">
                  Deja al menos una liga activa.
                </p>
              ) : null}
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

          <div id="pl-prefs-soporte" className="space-y-4">
            <SettingsGroup title="Bienestar">
              <SettingsRow
                icon="responsible-play"
                title="Juego responsable"
                subtitle="Pausa voluntaria de 24 h, 7 o 30 días, límites y líneas de ayuda +18"
                value={formatPauseChoiceLabel(prefs.pauseChoice)}
                href="/app/juego-responsable"
                dataAttr="prefs-responsible-play-row"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/app/juego-responsable");
                }}
              />
            </SettingsGroup>

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

      <TopLayerModalDialog
        open={generalModal !== null && generalModalMeta !== null}
        onClose={() => setGeneralModal(null)}
        ariaLabelledBy={modalTitleId}
        maxWidth={generalModalMeta?.maxWidth ?? "32rem"}
        dialogClassName="pl-prefs-modal"
        scrollContainerRef={prefsModalBodyRef}
      >
        {generalModal && generalModalMeta ? (
          <div className="pl-prefs-modal-shell" data-prefs-general-modal={generalModal}>
            <header className="pl-prefs-modal-head pl-sheet-drag-zone">
              <div className="min-w-0">
                <h2 id={modalTitleId} className="pl-prefs-modal-title">
                  {generalModalMeta.title}
                </h2>
                <p className="pl-prefs-modal-sub">{generalModalMeta.subtitle}</p>
              </div>
              <button
                type="button"
                className="pl-prefs-modal-close"
                aria-label="Cerrar ventana"
                onClick={() => setGeneralModal(null)}
              >
                <MaestroIcon name="x" size={16} />
              </button>
            </header>

            <div ref={prefsModalBodyRef} className="pl-prefs-modal-body">
              {generalModal === "theme" ? (
                <div className="space-y-4" data-prefs-modal-theme="">
                  <div className="pl-prefs-modal-row">
                    <b id={themeLabelId} className="pl-acct-prefs-row-title">
                      Apariencia
                    </b>
                    <PrefsSegment
                      labelledBy={themeLabelId}
                      value={prefs.themeMode}
                      onChange={handleThemeChange}
                      dataAttr="data-theme-mode-opt"
                      options={[
                        { value: "dark", label: "Oscuro" },
                        { value: "light", label: "Claro" },
                        { value: "system", label: "Sistema" },
                      ]}
                    />
                  </div>
                  <p className="pl-acct-prefs-lead m-0">
                    {prefs.themeMode === "system"
                      ? `Sistema (actualmente ${systemTheme === "light" ? "claro" : "oscuro"}). Cambiará automáticamente cuando ajustes el tema de tu dispositivo.`
                      : `Usando tema ${prefs.themeMode === "light" ? "claro" : "oscuro"} en todas las pantallas de PitchLab.`}
                  </p>
                </div>
              ) : null}

              {generalModal === "timezone" ? (
                <div className="space-y-3" data-prefs-modal-timezone="">
                  {deviceTimezone ? (
                    <button
                      type="button"
                      className="pl-prefs-tz-auto-btn"
                      data-tz-use-device=""
                      aria-pressed={prefs.timezone === deviceTimezone}
                      onClick={() => handleTimezoneChange(deviceTimezone)}
                    >
                      <span className="pl-prefs-tz-auto-lead">
                        <MaestroIcon name="globe" size={15} />
                        <span>
                          Usar horario de este dispositivo ·{" "}
                          <strong>{formatTimezoneShortLabel(deviceTimezone)}</strong>
                        </span>
                      </span>
                      <span className="pl-prefs-tz-clock num">
                        {tzReferenceNow
                          ? formatCurrentTimeInTimezone(deviceTimezone, tzReferenceNow)
                          : ""}
                      </span>
                    </button>
                  ) : null}

                  <div className="pl-prefs-league-search">
                    <MaestroIcon name="search" size={14} />
                    <input
                      type="search"
                      enterKeyHint="search"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="pl-acct-search-input"
                      data-tz-search=""
                      value={tzSearch}
                      onChange={(e) => {
                        setTzSearch(e.target.value);
                        setTzVisibleCount(TZ_VISIBLE_PAGE);
                      }}
                      placeholder="Buscar ciudad, país, zona o UTC (Tokio, Madrid, UTC+9…)"
                      aria-label="Buscar cualquier zona horaria del mundo"
                    />
                  </div>

                  {!tzSearch.trim() && tzRegionTabs.length > 1 ? (
                    <div
                      className="pl-prefs-sport-tabs"
                      role="tablist"
                      aria-label="Filtrar zonas horarias por región"
                      aria-orientation="horizontal"
                      {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
                    >
                      {tzRegionTabs.map((tab) => {
                        const selected = tzRegion === tab.key;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            role="tab"
                            className="pl-prefs-sport-tab"
                            aria-selected={selected}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => {
                              setTzRegion(tab.key);
                              setTzVisibleCount(TZ_VISIBLE_PAGE);
                            }}
                            onKeyDown={(e) =>
                              handleRovingTablistKeyDown(
                                e,
                                tzRegionTabs.map((item) => item.key),
                                tab.key,
                                (next) => {
                                  setTzRegion(next);
                                  setTzVisibleCount(TZ_VISIBLE_PAGE);
                                },
                              )
                            }
                            {...(selected
                              ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                              : {})}
                          >
                            <span>{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {filteredTimezones.length === 0 ? (
                    <SofascoreEmptyState
                      title="No encontramos esa zona horaria"
                      description="Busca por ciudad, país, identificador IANA (ej. Asia/Tokyo) o desplazamiento UTC."
                      actionLabel="Ver todas las zonas"
                      onAction={() => {
                        setTzSearch("");
                        setTzRegion("all");
                        setTzVisibleCount(TZ_VISIBLE_PAGE);
                      }}
                    />
                  ) : (
                    <>
                      <div
                        className="pl-prefs-tz-list"
                        role="radiogroup"
                        aria-labelledby={modalTitleId}
                        id={tzSelectId}
                      >
                        {filteredTimezones.slice(0, tzVisibleCount).map((opt) => {
                          const checked = opt.value === prefs.timezone;
                          const localClock = tzReferenceNow
                            ? formatCurrentTimeInTimezone(opt.value, tzReferenceNow)
                            : "";
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="radio"
                              aria-checked={checked}
                              data-tz-option={opt.value}
                              className="pl-prefs-tz-option"
                              onClick={() => handleTimezoneChange(opt.value)}
                            >
                              <span className="pl-prefs-tz-copy">
                                <span className="pl-prefs-tz-name">{opt.city}</span>
                                <span className="pl-prefs-tz-utc">
                                  {opt.value === "UTC" ? "UTC" : `${opt.value} · ${opt.region}`}
                                </span>
                              </span>
                              <span className="pl-prefs-tz-meta num">
                                {localClock ? <span className="pl-prefs-tz-clock">{localClock}</span> : null}
                                {opt.offsetLabel ? (
                                  <span className="pl-prefs-tz-offset">{opt.offsetLabel}</span>
                                ) : null}
                                {checked ? <MaestroIcon name="check" size={14} /> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {filteredTimezones.length > tzVisibleCount ? (
                        <div className="flex justify-center pt-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setTzVisibleCount((n) => n + TZ_VISIBLE_PAGE)}
                          >
                            Ver más zonas ({filteredTimezones.length - tzVisibleCount} restantes)
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {generalModal === "odds" ? (
                <div className="space-y-4" data-prefs-modal-odds="">
                  <div className="pl-prefs-modal-row">
                    <div className="pl-acct-prefs-row-copy">
                      <b id={oddsLabelId} className="pl-acct-prefs-row-title">
                        Formato de momio
                      </b>
                      <span className="pl-acct-prefs-row-detail num">{oddsPreview.detail}</span>
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
                  <div className="pl-prefs-modal-preview num" data-odds-format-preview="">
                    <span>Ejemplo de momio justo:</span>
                    <strong>{oddsPreview.sampleFair}</strong>
                  </div>
                </div>
              ) : null}

              {generalModal === "books" ? (
                <div className="space-y-4" data-preferred-books-section="">
                  <div className="flex flex-wrap items-start justify-between gap-2.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="pl-acct-prefs-lead m-0">
                        Mostramos primero el mejor momio capturado entre tus casas frente al momio
                        justo de Spacetime v5.1 ({boundedPreferredBooks.length}/
                        {MAX_PREFERRED_BOOKMAKERS_PREF} activas, sin enlaces de afiliado).
                      </p>
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
                      Límite de {MAX_PREFERRED_BOOKMAKERS_PREF} casas preferidas alcanzado.
                      Desactiva una para elegir otra.
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
              ) : null}

              {generalModal === "views" ? (
                <div className="space-y-4" data-saved-views-prefs="">
                  <p className="pl-acct-prefs-lead m-0">
                    Guarda combinaciones de filtros para Explorar picks (hasta{" "}
                    {MAX_SAVED_VIEWS_PREF}) y fija tus favoritas como acceso directo en Inicio.
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
                        <label htmlFor={viewSportSelectId} className="pl-acct-field-label">
                          Deporte
                        </label>
                        <select
                          id={viewSportSelectId}
                          value={newViewSport}
                          onChange={(e) =>
                            setNewViewSport(e.target.value as AccountSavedViewSport)
                          }
                          className="pl-acct-input pl-prefs-native-select"
                        >
                          {SAVED_VIEW_SPORT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
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
              ) : null}

              {generalModal === "alerts" ? (
                <div className="pl-acct-prefs-rows" data-prefs-modal-alerts="">
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
              ) : null}
            </div>

            <footer className="pl-prefs-modal-foot">
              <span className="pl-acct-autosave">
                <span className="pl-acct-autosave-dot" aria-hidden="true" />
                <span>Se guarda automáticamente</span>
              </span>
              <Button type="button" variant="primary" size="sm" onClick={() => setGeneralModal(null)}>
                Listo
              </Button>
            </footer>
          </div>
        ) : null}
      </TopLayerModalDialog>

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
