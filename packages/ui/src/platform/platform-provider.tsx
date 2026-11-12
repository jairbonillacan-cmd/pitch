"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import {
  containsExternalLink,
  journalRecord,
  redactDatasetForVisitor,
} from "./access-guard";

/** Claves de almacenamiento local (versión en el nombre para poder migrar). */
const STORAGE_KEYS = {
  journal: "pl-journal-v1",
  watchlist: "pl-watchlist-v1",
  ownPosts: "pl-own-posts-v1",
} as const;

function readStoredArray<T>(key: string, isItem: (v: unknown) => v is T): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch (err) {
    void err;
    return [];
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    void err;
  }
}

function isJournalEntry(v: unknown): v is JournalEntry {
  const e = v as Partial<JournalEntry> | null;
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.pickId === "string" &&
    typeof e.units === "number" &&
    typeof e.userDecimal === "number" &&
    (e.status === "pending" || e.status === "won" || e.status === "lost")
  );
}

function isOwnSocialPost(v: unknown): v is SocialPost {
  const p = v as Partial<SocialPost> | null;
  return !!p && typeof p.id === "string" && typeof p.body === "string" && !p.isExample && Array.isArray(p.comments);
}

interface ServerJournalRow {
  id: string;
  pickId: string;
  gameId: string;
  leagueLabel: string;
  matchLabel: string;
  pickLabel: string;
  origin: string;
  units: string;
  userDecimal: string;
  fairDecimal: string;
  clvPct: string | null;
  status: string;
  note: string | null;
  sealedAt: string;
}

const SEAL_ERRORS: Record<string, string> = {
  partido_iniciado: "El partido ya empezó: no se puede sellar.",
  unidades_invalidas: "Las unidades deben estar entre 0.25u y 5u.",
  momio_invalido: "Momio inválido.",
  ya_sellado: "Ese pick ya estaba sellado en tu Bitácora.",
};

function fromServerRow(row: ServerJournalRow): JournalEntry {
  const origins: JournalEntry["origin"][] = ["Spacetime Suite", "Parlay Combinado", "Player Prop", "Propio"];
  return {
    id: row.id,
    pickId: row.pickId,
    gameId: row.gameId,
    leagueLabel: row.leagueLabel,
    matchLabel: row.matchLabel,
    pickLabel: row.pickLabel,
    origin: origins.includes(row.origin as JournalEntry["origin"]) ? (row.origin as JournalEntry["origin"]) : "Propio",
    units: Number(row.units),
    userDecimal: Number(row.userDecimal),
    fairDecimal: Number(row.fairDecimal),
    clvPct: row.clvPct === null ? 0 : Number(row.clvPct),
    status: row.status === "won" || row.status === "lost" ? row.status : "pending",
    sealedAt: new Date(row.sealedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }),
    sealedAtIso: new Date(row.sealedAt).toISOString(),
    note: row.note ?? undefined,
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch (err) {
    void err;
    return null;
  }
}

async function postJson(url: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    void err;
    return null;
  }
}

async function sealOnServer(entry: JournalEntry): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const res = await postJson("/api/me/journal", {
    pickId: entry.pickId,
    gameId: entry.gameId,
    leagueLabel: entry.leagueLabel,
    matchLabel: entry.matchLabel,
    pickLabel: entry.pickLabel,
    origin: entry.origin,
    units: entry.units,
    userDecimal: entry.userDecimal,
    fairDecimal: entry.fairDecimal,
    note: entry.note,
  });
  if (!res) return { ok: false };
  if (res.status === 401 || res.status === 503) return { ok: false, reason: "sin_sesion" };
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; reason?: string };
  return { ok: Boolean(json.ok), id: json.id, reason: json.reason };
}

function formatClvBadge(avgClvPct: number | null): string {
  if (avgClvPct === null) return "CLV —";
  return `CLV ${avgClvPct >= 0 ? "+" : ""}${avgClvPct.toFixed(1)} %`;
}
import {
  buildSmartAutoParlay,
  checkParlayCompatibility,
  computeParlaySummary,
} from "./parlay-engine";
import { INITIAL_SOCIAL_POSTS } from "./spacetime-catalog";
import { attachExamplePostPicks } from "./community-examples";
import type {
  JournalEntry,
  MatchPick,
  OddsFormat,
  ParlayLeg,
  ParlaySummary,
  PlatformDataset,
  PlatformGame,
  RiskBand,
  SocialPost,
  ViewerRole,
} from "./types";

export interface ShareTicketPayload {
  kind: "pick" | "parlay" | "tipstar";
  title: string;
  subtitle: string;
  leagueLabel: string;
  pickLabel: string;
  probability: number;
  fairDecimal: number;
  marketDecimal: number;
  units: number;
  gameStatus: "NS" | "FT" | "LIVE";
  promoCode?: string;
  tipstarHandle?: string;
  originBadge?: string;
}

export interface ToastMessage {
  id: string;
  tone: "default" | "success" | "warning" | "danger";
  text: string;
}

export interface PinUnlockResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

/** Quién es el socio con cuenta. Con el PIN de la beta no hay identidad (null). */
export interface ViewerIdentity {
  handle: string;
  displayName: string;
  initials: string;
  referralCode: string | null;
}

/** Usuario propio: el de la cuenta o, en la beta con PIN, el de ejemplo según el rol. */
export function ownHandleFor(identity: ViewerIdentity | null, role: ViewerRole): string {
  if (identity) return identity.handle;
  return role === "tipstar" ? "sofia_nfl" : "socio_pl";
}

export interface PlatformContextValue {
  rawDataset: PlatformDataset;
  dataset: PlatformDataset;
  viewerRole: ViewerRole;
  setViewerRole: (role: ViewerRole) => void;
  allowRoleSimulation: boolean;
  /** Cuentas reales (Better Auth) activas en el servidor. */
  accountsEnabled: boolean;
  /** Socio con cuenta (nombre, @usuario, iniciales y código); null con PIN o visitante. */
  viewerIdentity: ViewerIdentity | null;
  updateViewerIdentity: (profile: Pick<ViewerIdentity, "displayName" | "handle">) => void;
  oddsFormat: OddsFormat;
  setOddsFormat: (fmt: OddsFormat) => void;
  auraColors: readonly [string, string];
  setAuraFromGame: (game: PlatformGame | undefined) => void;

  parlayLegs: ParlayLeg[];
  allowSgp: boolean;
  setAllowSgp: (v: boolean) => void;
  parlayStakeUnits: number;
  setParlayStakeUnits: (u: number) => void;
  parlaySummary: ParlaySummary;
  addPickToParlay: (pick: MatchPick) => boolean;
  removePickFromParlay: (pickId: string) => void;
  clearParlay: () => void;
  generateAutoParlay: (opts: {
    leagues: readonly LeagueId[];
    risk: RiskBand;
    legCount: number;
    allowSgp: boolean;
  }) => number;

  journal: JournalEntry[];
  sealPickToJournal: (
    pick: MatchPick,
    units: number,
    userDecimal: number,
    note?: string,
  ) => void;
  sealParlayToJournal: (note?: string) => void;
  exportJournalCsv: () => string;

  socialPosts: SocialPost[];
  publishSocialPost: (payload: {
    leagueLabel: string;
    matchLabel: string;
    pickBadge: string;
    originType: "Spacetime Suite" | "Bitácora Propia";
    body: string;
    /** Pick adjunto: se publica con la publicación y se registra en la bitácora. */
    pick?: { matchPick: MatchPick; units: number; userDecimal: number };
  }) => { ok: boolean; error?: string };
  addSocialComment: (postId: string, body: string) => { ok: boolean; error?: string };
  toggleSocialLike: (postId: string) => void;
  blockedSpamAttempts: number;

  watchlistGameIds: string[];
  toggleWatchlistGame: (gameId: string) => void;
  favoriteLeagues: LeagueId[];
  setFavoriteLeagues: (leagues: LeagueId[]) => void;
  riskPreference: RiskBand;
  setRiskPreference: (risk: RiskBand) => void;

  referralPaidFriends: number;
  simulateFriendFirstPayment: () => void;
  month1NoCardMode: boolean;
  setMonth1NoCardMode: (v: boolean) => void;
  tipstarWeeklyPickOrigin: "spacetime" | "bitacora";
  setTipstarWeeklyPickOrigin: (v: "spacetime" | "bitacora") => void;
  selectedTipstarPickId: string;
  setSelectedTipstarPickId: (id: string) => void;

  composerPick: MatchPick | null;
  openComposer: (pick: MatchPick) => void;
  closeComposer: () => void;

  shareTicket: ShareTicketPayload | null;
  openShareTicket: (payload: ShareTicketPayload) => void;
  closeShareTicket: () => void;

  cmdkOpen: boolean;
  setCmdkOpen: (v: boolean) => void;

  betaPinOpen: boolean;
  betaPinNextPath: string;
  openBetaPin: (nextPath?: string) => void;
  closeBetaPin: () => void;
  submitBetaPin: (code: string, nextOverride?: string) => Promise<PinUnlockResult>;
  logoutSession: () => Promise<void>;

  toasts: ToastMessage[];
  pushToast: (text: string, tone?: ToastMessage["tone"]) => void;
  navigateTo: (href: string) => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

/* ---------- Contextos pequeños ----------
   Un solo contexto hacía que cualquier cambio (un clic en «Parlay», pasar el cursor sobre una
   tarjeta) redibujara todas las vistas y tarjetas. Las piezas calientes leen de aquí:
   - Núcleo: datos y preferencias que casi no cambian.
   - Acciones: funciones con identidad estable (nunca provocan redibujos).
   - Aura: colores del fondo (solo los usa el escenario).
   - Bitácora: picks sellados.
   - Parlay: un almacén externo; cada tarjeta se suscribe solo a «¿este pick está dentro?». */
export interface PlatformCoreValue {
  rawDataset: PlatformDataset;
  dataset: PlatformDataset;
  viewerRole: ViewerRole;
  allowRoleSimulation: boolean;
  accountsEnabled: boolean;
  viewerIdentity: ViewerIdentity | null;
  oddsFormat: OddsFormat;
  favoriteLeagues: LeagueId[];
  riskPreference: RiskBand;
  month1NoCardMode: boolean;
}

type AnyFn = (...args: never[]) => unknown;
type ActionKey = {
  [K in keyof PlatformContextValue]: PlatformContextValue[K] extends AnyFn ? K : never;
}[keyof PlatformContextValue];
export type PlatformActions = Pick<PlatformContextValue, ActionKey>;

const ACTION_KEYS = [
  "setViewerRole",
  "updateViewerIdentity",
  "setOddsFormat",
  "setAuraFromGame",
  "setAllowSgp",
  "setParlayStakeUnits",
  "addPickToParlay",
  "removePickFromParlay",
  "clearParlay",
  "generateAutoParlay",
  "sealPickToJournal",
  "sealParlayToJournal",
  "exportJournalCsv",
  "publishSocialPost",
  "addSocialComment",
  "toggleSocialLike",
  "toggleWatchlistGame",
  "setFavoriteLeagues",
  "setRiskPreference",
  "simulateFriendFirstPayment",
  "setMonth1NoCardMode",
  "setTipstarWeeklyPickOrigin",
  "setSelectedTipstarPickId",
  "openComposer",
  "closeComposer",
  "openShareTicket",
  "closeShareTicket",
  "setCmdkOpen",
  "openBetaPin",
  "closeBetaPin",
  "submitBetaPin",
  "logoutSession",
  "pushToast",
  "navigateTo",
] as const satisfies readonly ActionKey[];
// Si falta alguna acción en la lista, esto no compila.
type MissingActionKey = Exclude<ActionKey, (typeof ACTION_KEYS)[number]>;
const ACTION_KEYS_COMPLETE: [MissingActionKey] extends [never] ? true : MissingActionKey = true;
void ACTION_KEYS_COMPLETE;

const PlatformCoreContext = createContext<PlatformCoreValue | null>(null);
const PlatformActionsContext = createContext<PlatformActions | null>(null);
const AuraContext = createContext<readonly [string, string]>([
  "var(--pl-aura-default-home)",
  "var(--pl-aura-default-away)",
]);
const JournalContext = createContext<JournalEntry[]>([]);

/** Almacén externo con los ids de los picks del parlay. */
function createParlayIdStore() {
  let ids = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    set(next: Set<string>) {
      ids = next;
      for (const l of listeners) l();
    },
    has: (id: string) => ids.has(id),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
type ParlayIdStore = ReturnType<typeof createParlayIdStore>;
const ParlayIdStoreContext = createContext<ParlayIdStore | null>(null);

function required<T>(value: T | null, hook: string): T {
  if (value === null) throw new Error(`${hook} debe usarse dentro de <PlatformProvider>.`);
  return value;
}

export function usePlatformCore(): PlatformCoreValue {
  return required(useContext(PlatformCoreContext), "usePlatformCore");
}
export function usePlatformActions(): PlatformActions {
  return required(useContext(PlatformActionsContext), "usePlatformActions");
}
export function useAuraColors(): readonly [string, string] {
  return useContext(AuraContext);
}
export function useJournalEntries(): JournalEntry[] {
  return useContext(JournalContext);
}
/** true si el pick está en el parlay. Solo redibuja este componente cuando eso cambia. */
export function useIsPickInParlay(pickId: string | undefined): boolean {
  const store = required(useContext(ParlayIdStoreContext), "useIsPickInParlay");
  return useSyncExternalStore(
    store.subscribe,
    () => (pickId ? store.has(pickId) : false),
    () => false,
  );
}

export function PlatformProvider({
  dataset: rawDataset,
  initialRole = "visitor",
  allowRoleSimulation = false,
  accountsEnabled = false,
  viewerIdentity: initialViewerIdentity = null,
  serverMonth1NoCardMode,
  onNavigate,
  onSubmitPinOverride,
  onLogoutOverride,
  children,
}: {
  dataset: PlatformDataset;
  initialRole?: ViewerRole;
  allowRoleSimulation?: boolean;
  accountsEnabled?: boolean;
  viewerIdentity?: ViewerIdentity | null;
  /** Valor de la bandera en la base (cuando hay cuentas); manda sobre el navegador. */
  serverMonth1NoCardMode?: boolean;
  onNavigate?: (href: string) => void;
  onSubmitPinOverride?: (code: string, nextPath: string) => Promise<PinUnlockResult>;
  onLogoutOverride?: () => Promise<void>;
  children: React.ReactNode;
}): React.JSX.Element {
  const [viewerRole, setViewerRoleState] = useState<ViewerRole>(initialRole);
  const [viewerIdentity, setViewerIdentity] = useState(initialViewerIdentity);
  const [oddsFormat, setOddsFormatState] = useState<OddsFormat>("american");
  const [parlayLegs, setParlayLegs] = useState<ParlayLeg[]>([]);
  const [allowSgp, setAllowSgp] = useState<boolean>(false);
  const [parlayStakeUnits, setParlayStakeUnits] = useState<number>(1.0);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>(() =>
    attachExamplePostPicks(INITIAL_SOCIAL_POSTS, rawDataset.games),
  );
  const updateViewerIdentity = useCallback((profile: Pick<ViewerIdentity, "displayName" | "handle">) => {
    if (!viewerIdentity) return;
    const words = profile.displayName.trim().split(/\s+/);
    const first = words[0] ?? "";
    const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : (first[1] ?? "");
    const initials = ((first[0] ?? "") + last).toUpperCase() || "PL";
    setViewerIdentity({ ...viewerIdentity, ...profile, initials });

    const renameAuthor = <T extends { authorHandle: string; authorName: string }>(item: T): T =>
      item.authorHandle === viewerIdentity.handle
        ? { ...item, authorHandle: profile.handle, authorName: profile.displayName }
        : item;
    setSocialPosts((posts) => posts.map((post) => post.isExample ? post : {
      ...renameAuthor(post),
      comments: post.comments.map(renameAuthor),
    }));
  }, [viewerIdentity]);

  const [blockedSpamAttempts, setBlockedSpamAttempts] = useState<number>(0);
  const [watchlistGameIds, setWatchlistGameIds] = useState<string[]>([]);
  const [favoriteLeagues, setFavoriteLeaguesState] = useState<LeagueId[]>(() =>
    rawDataset.leagues.slice(0, 3).map((l) => l.league),
  );
  const [riskPreference, setRiskPreferenceState] = useState<RiskBand>("medio");
  const [referralPaidFriends, setReferralPaidFriends] = useState<number>(0);
  const [month1NoCardMode, setMonth1NoCardMode] = useState<boolean>(serverMonth1NoCardMode ?? true);
  const [tipstarWeeklyPickOrigin, setTipstarWeeklyPickOrigin] = useState<
    "spacetime" | "bitacora"
  >("spacetime");
  const [selectedTipstarPickId, setSelectedTipstarPickId] = useState<string>(
    rawDataset.tipstarWeeklyPickId || rawDataset.dailyPromoPickId,
  );

  const [composerPick, setComposerPick] = useState<MatchPick | null>(null);
  const [shareTicket, setShareTicket] = useState<ShareTicketPayload | null>(null);
  const [cmdkOpen, setCmdkOpen] = useState<boolean>(false);
  const [betaPinOpen, setBetaPinOpen] = useState<boolean>(false);
  const [betaPinNextPath, setBetaPinNextPath] = useState<string>("/app");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const defaultGame = useMemo(
    () => rawDataset.games.find((g) => g.status !== "FT") ?? rawDataset.games[0],
    [rawDataset.games],
  );

  const resolveColorsForGame = useCallback(
    (game: PlatformGame | undefined): readonly [string, string] => {
      if (!game) {
        return ["var(--pl-aura-default-home)", "var(--pl-aura-default-away)"];
      }
      const homePair = getTeamColors(game.league, game.home.slug);
      const awayPair = getTeamColors(game.league, game.away.slug);
      return [
        homePair?.[0] ?? "var(--pl-aura-default-home)",
        awayPair?.[0] ?? "var(--pl-aura-default-away)",
      ];
    },
    [],
  );

  const [auraColors, setAuraColors] = useState<readonly [string, string]>(() =>
    resolveColorsForGame(defaultGame),
  );

  const setAuraFromGame = useCallback(
    (game: PlatformGame | undefined) => {
      setAuraColors(resolveColorsForGame(game));
    },
    [resolveColorsForGame],
  );

  // Hidratar preferencias persistidas en cliente
  useEffect(() => {
    try {
      const savedFmt = window.localStorage.getItem("pl-odds-fmt");
      if (savedFmt === "decimal" || savedFmt === "american") {
        setOddsFormatState(savedFmt);
      }
      const savedRisk = window.localStorage.getItem("pl-risk-pref");
      if (
        savedRisk === "conservador" ||
        savedRisk === "medio" ||
        savedRisk === "arriesgado"
      ) {
        setRiskPreferenceState(savedRisk);
      }
      const savedNoCard = window.localStorage.getItem("pl-month1-nocard");
      if (serverMonth1NoCardMode === undefined && savedNoCard === "0") {
        setMonth1NoCardMode(false);
      }
      if (allowRoleSimulation) {
        const savedRole = window.localStorage.getItem("pl-sim-role");
        if (
          savedRole === "visitor" ||
          savedRole === "member" ||
          savedRole === "tipstar" ||
          savedRole === "admin"
        ) {
          setViewerRoleState(savedRole);
        }
      }
    } catch (err) {
      void err;
    }
  }, [allowRoleSimulation]);

  // Datos del socio en este navegador (hasta que exista la base de datos de F4).
  const [userDataLoaded, setUserDataLoaded] = useState<boolean>(false);
  useEffect(() => {
    const savedJournal = readStoredArray<JournalEntry>(STORAGE_KEYS.journal, isJournalEntry);
    if (savedJournal.length > 0) setJournal(savedJournal);
    const savedWatch = readStoredArray<string>(STORAGE_KEYS.watchlist, (v): v is string => typeof v === "string");
    if (savedWatch.length > 0) setWatchlistGameIds(savedWatch);
    const ownPosts = readStoredArray<SocialPost>(STORAGE_KEYS.ownPosts, isOwnSocialPost);
    if (ownPosts.length > 0) {
      setSocialPosts((prev) => [...ownPosts, ...prev.filter((p) => !ownPosts.some((o) => o.id === p.id))]);
    }
    setUserDataLoaded(true);
  }, []);

  // Con cuenta y sesión, la base es la fuente de verdad de vigilancia y bitácora.
  useEffect(() => {
    if (!accountsEnabled) return;
    void (async () => {
      const watch = await getJson<{ gameIds?: string[] }>("/api/me/watchlist");
      if (watch?.gameIds) setWatchlistGameIds(watch.gameIds);
      const journalRes = await getJson<{ entries?: ServerJournalRow[] }>("/api/me/journal");
      if (journalRes?.entries) setJournal(journalRes.entries.map(fromServerRow));
      const refs = await getJson<{ paidFriends?: number }>("/api/me/referrals");
      if (typeof refs?.paidFriends === "number") setReferralPaidFriends(refs.paidFriends);
    })();
  }, [accountsEnabled]);
  useEffect(() => {
    if (userDataLoaded) writeStored(STORAGE_KEYS.journal, journal.slice(0, 500));
  }, [journal, userDataLoaded]);
  useEffect(() => {
    if (userDataLoaded) writeStored(STORAGE_KEYS.watchlist, watchlistGameIds);
  }, [watchlistGameIds, userDataLoaded]);
  useEffect(() => {
    if (userDataLoaded) {
      writeStored(
        STORAGE_KEYS.ownPosts,
        socialPosts.filter((p) => !p.isExample).slice(0, 100),
      );
    }
  }, [socialPosts, userDataLoaded]);

  // Atajo global Cmd+K / Ctrl+K y Escape
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCmdkOpen((prev) => !prev);
      } else if (event.key === "Escape") {
        setCmdkOpen(false);
        setComposerPick(null);
        setShareTicket(null);
        setBetaPinOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pushToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "default") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3600);
    },
    [],
  );

  const setViewerRole = useCallback(
    (role: ViewerRole) => {
      setViewerRoleState(role);
      try {
        window.localStorage.setItem("pl-sim-role", role);
      } catch (err) {
        void err;
      }
    },
    [],
  );

  const setOddsFormat = useCallback((fmt: OddsFormat) => {
    setOddsFormatState(fmt);
    try {
      window.localStorage.setItem("pl-odds-fmt", fmt);
    } catch (err) {
      void err;
    }
  }, []);

  const setFavoriteLeagues = useCallback((leagues: LeagueId[]) => {
    setFavoriteLeaguesState(leagues);
    try {
      window.localStorage.setItem("pl-fav-leagues", JSON.stringify(leagues));
    } catch (err) {
      void err;
    }
  }, []);

  const setRiskPreference = useCallback((risk: RiskBand) => {
    setRiskPreferenceState(risk);
    try {
      window.localStorage.setItem("pl-risk-pref", risk);
    } catch (err) {
      void err;
    }
  }, []);

  const handleSetMonth1NoCard = useCallback(
    (v: boolean) => {
      setMonth1NoCardMode(v);
      if (accountsEnabled) {
        // Con cuentas, la bandera vive en la base y aplica a toda la plataforma (solo fundador).
        void postJson("/api/admin/flags", { key: "month1_no_card_mode", value: v }).then((res) => {
          if (!res || !res.ok) {
            setMonth1NoCardMode(!v);
            pushToast("Solo el equipo fundador puede cambiar la política de prueba.", "warning");
          }
        });
      } else {
        try {
          window.localStorage.setItem("pl-month1-nocard", v ? "1" : "0");
        } catch (err) {
          void err;
        }
      }
      pushToast(
        v
          ? "Modo Lanzamiento Mes 1 activo: registro gratis sin pedir tarjeta."
          : "Modo Mes 2 activo: prueba gratis con verificación de tarjeta $0 MXN.",
        "success",
      );
    },
    [pushToast, accountsEnabled],
  );

  const dataset = useMemo(() => {
    if (viewerRole === "visitor") {
      return rawDataset.isServerRedactedForVisitor
        ? rawDataset
        : redactDatasetForVisitor(rawDataset);
    }
    return rawDataset;
  }, [rawDataset, viewerRole]);

  const parlaySummary = useMemo(
    () => computeParlaySummary(parlayLegs, parlayStakeUnits),
    [parlayLegs, parlayStakeUnits],
  );

  const addPickToParlay = useCallback(
    (pick: MatchPick): boolean => {
      const check = checkParlayCompatibility(parlayLegs, pick, allowSgp);
      if (!check.allowed) {
        pushToast(check.reason ?? "Selección no compatible.", "warning");
        return false;
      }
      setParlayLegs((prev) => [...prev, { pick }]);
      pushToast(`Agregado al Parlay: ${pick.label}`, "success");
      return true;
    },
    [parlayLegs, allowSgp, pushToast],
  );

  const removePickFromParlay = useCallback((pickId: string) => {
    setParlayLegs((prev) => prev.filter((l) => l.pick.id !== pickId));
  }, []);

  const clearParlay = useCallback(() => {
    setParlayLegs([]);
  }, []);

  const generateAutoParlay = useCallback(
    (opts: {
      leagues: readonly LeagueId[];
      risk: RiskBand;
      legCount: number;
      allowSgp: boolean;
    }): number => {
      setAllowSgp(opts.allowSgp);
      const built = buildSmartAutoParlay(dataset.games, {
        ...opts,
        viewerRole,
      });
      setParlayLegs(built);
      if (built.length > 0) {
        pushToast(
          `Parlay ${opts.risk} generado con ${built.length} selecciones compatibles.`,
          "success",
        );
      } else {
        pushToast(
          "No hay suficientes partidos abiertos con esos filtros.",
          "warning",
        );
      }
      return built.length;
    },
    [dataset.games, viewerRole, pushToast],
  );

  const sealPickToJournal = useCallback(
    (pick: MatchPick, units: number, userDecimal: number, note?: string) => {
      const pFair = 1 / Math.max(1.04, pick.fairDecimal);
      const pUser = 1 / Math.max(1.04, userDecimal);
      const clvPct = Math.round((pFair - pUser) * 1000) / 10;
      const entry: JournalEntry = {
        id: `j-${Date.now()}`,
        pickId: pick.id,
        gameId: pick.gameId,
        leagueLabel: pick.leagueLabel,
        matchLabel: pick.matchLabel,
        pickLabel: pick.label,
        origin: "Spacetime Suite",
        units: Math.max(0.25, Math.min(5, units)),
        userDecimal,
        fairDecimal: pick.fairDecimal,
        clvPct,
        status:
          pick.gameStatus === "FT"
            ? pick.result === "miss"
              ? "lost"
              : "won"
            : "pending",
        sealedAt: "Sellado ahora",
        sealedAtIso: new Date().toISOString(),
        note,
      };
      setJournal((prev) => [entry, ...prev]);
      setComposerPick(null);
      pushToast(`Pick registrado en tu bitácora (${entry.units}u).`, "success");
      // Con cuenta: el servidor sella con la hora de inicio oficial y una huella SHA-256.
      if (accountsEnabled && entry.status === "pending") {
        void sealOnServer(entry).then((res) => {
          if (res.ok && res.id) {
            setJournal((prev) => prev.map((j) => (j.id === entry.id ? { ...j, id: res.id! } : j)));
          } else if (res.reason && res.reason !== "sin_sesion") {
            setJournal((prev) => prev.filter((j) => j.id !== entry.id));
            pushToast(SEAL_ERRORS[res.reason] ?? "No se pudo sellar el pick.", "warning");
          }
        });
      }
    },
    [pushToast, accountsEnabled],
  );

  const sealParlayToJournal = useCallback(
    (note?: string) => {
      if (parlaySummary.legs.length < 2) {
        pushToast("Agrega al menos 2 selecciones para sellar un Parlay.", "warning");
        return;
      }
      const entry: JournalEntry = {
        id: `j-parlay-${Date.now()}`,
        pickId: parlaySummary.legs.map((l) => l.pick.id).join("+"),
        gameId: parlaySummary.legs[0]!.pick.gameId,
        leagueLabel: "Combinada Multi-Liga",
        matchLabel: `${parlaySummary.legs.length} selecciones${parlaySummary.hasSgpCorrelation ? " · SGP" : ""}`,
        pickLabel: parlaySummary.legs.map((l) => l.pick.label).join(" + "),
        origin: "Parlay Combinado",
        units: parlaySummary.stakeUnits,
        userDecimal: parlaySummary.bookDecimal,
        fairDecimal: parlaySummary.fairDecimal,
        clvPct: parlaySummary.edgePts,
        status: "pending",
        sealedAt: "Sellado ahora",
        sealedAtIso: new Date().toISOString(),
        note: note ?? "Armador Inteligente Geodesic v2.0",
      };
      setJournal((prev) => [entry, ...prev]);
      pushToast(
        `Boleto combinado de ${parlaySummary.legs.length} selecciones sellado en Bitácora.`,
        "success",
      );
    },
    [parlaySummary, pushToast],
  );

  const exportJournalCsv = useCallback((): string => {
    const header =
      "Fecha,Liga,Partido,Seleccion,Origen,Unidades,CuotaUsuario,CuotaJusta,CLV_Pts,Estado";
    const lines = journal.map((j) =>
      [
        `"${j.sealedAt}"`,
        `"${j.leagueLabel}"`,
        `"${j.matchLabel}"`,
        `"${j.pickLabel.replace(/"/g, '""')}"`,
        `"${j.origin}"`,
        j.units.toFixed(2),
        j.userDecimal.toFixed(2),
        j.fairDecimal.toFixed(2),
        j.clvPct.toFixed(1),
        j.status,
      ].join(","),
    );
    const csv = [header, ...lines].join("\n");
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pitchlab-bitacora-verificada.csv";
      a.click();
      URL.revokeObjectURL(url);
      pushToast("Bitácora exportada en CSV auditado.", "success");
    } catch (err) {
      void err;
    }
    return csv;
  }, [journal, pushToast]);

  const publishSocialPost = useCallback(
    (payload: {
      leagueLabel: string;
      matchLabel: string;
      pickBadge: string;
      originType: "Spacetime Suite" | "Bitácora Propia";
      body: string;
      pick?: { matchPick: MatchPick; units: number; userDecimal: number };
    }): { ok: boolean; error?: string } => {
      if (viewerRole === "visitor") {
        return {
          ok: false,
          error: "La comunidad es para socios.",
        };
      }
      const trimmed = payload.body.trim();
      if (trimmed.length < 8) {
        return { ok: false, error: "Escribe al menos una frase sobre tu pick." };
      }
      const myHandle = ownHandleFor(viewerIdentity, viewerRole);
      const repeated = socialPosts
        .filter((p) => p.authorHandle === myHandle)
        .slice(0, 5)
        .some((p) => p.body.trim().toLowerCase() === trimmed.toLowerCase());
      if (repeated) {
        setBlockedSpamAttempts((n) => n + 1);
        return { ok: false, error: "Ya publicaste ese mismo texto." };
      }
      if (containsExternalLink(trimmed)) {
        setBlockedSpamAttempts((n) => n + 1);
        pushToast(
          "Enlace externo bloqueado: por seguridad anti-spam no se permiten links ni grupos externos.",
          "danger",
        );
        return {
          ok: false,
          error: "Enlaces externos (Telegram, WhatsApp, URLs) bloqueados automáticamente.",
        };
      }
      const newPost: SocialPost = {
        id: `sp-${Date.now()}`,
        authorHandle: ownHandleFor(viewerIdentity, viewerRole),
        authorName:
          viewerIdentity?.displayName ?? (viewerRole === "tipstar" ? "Sofía Méndez" : "Socio PitchLab"),
        roleBadge:
          viewerRole === "tipstar" ? "Tipstar Oficial" : "Socio Pase PitchLab Ultra",
        avatarGradVar:
          viewerRole === "tipstar" ? "var(--avatar-grad-1)" : "var(--avatar-grad-4)",
        verifiedRecord:
          viewerRole === "tipstar" ? "+18.4u · 142 picks" : journalRecord(journal).label,
        clvBadge:
          viewerRole === "tipstar"
            ? "CLV +4.2 %"
            : formatClvBadge(journalRecord(journal).avgClvPct),
        // Publicar como tipstar usa el perfil de ejemplo @sofia_nfl.
        isExample: viewerRole === "tipstar",
        leagueLabel: payload.leagueLabel,
        matchLabel: payload.matchLabel,
        pickBadge: payload.pickBadge,
        originType: payload.originType,
        createdAt: "Ahora mismo",
        body: trimmed,
        likes: 0,
        likedByMe: false,
        comments: [],
        pick: payload.pick
          ? {
              pickId: payload.pick.matchPick.id,
              gameId: payload.pick.matchPick.gameId,
              label: payload.pick.matchPick.label,
              units: payload.pick.units,
              userDecimal: payload.pick.userDecimal,
              fairDecimal: payload.pick.matchPick.fairDecimal,
              modelProbability: payload.pick.matchPick.p,
              status:
                payload.pick.matchPick.gameStatus === "FT"
                  ? payload.pick.matchPick.result === "miss"
                    ? "lost"
                    : "won"
                  : "open",
            }
          : undefined,
      };
      setSocialPosts((prev) => [newPost, ...prev]);
      if (payload.pick) {
        sealPickToJournal(payload.pick.matchPick, payload.pick.units, payload.pick.userDecimal);
      }
      pushToast("Publicado en Comunidad.", "success");
      return { ok: true };
    },
    [viewerRole, viewerIdentity, pushToast, journal, socialPosts, sealPickToJournal],
  );

  const addSocialComment = useCallback(
    (postId: string, body: string): { ok: boolean; error?: string } => {
      if (viewerRole === "visitor") {
        return { ok: false, error: "Activa Pase PitchLab Ultra para comentar." };
      }
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: "Escribe un comentario." };
      }
      if (containsExternalLink(trimmed)) {
        setBlockedSpamAttempts((n) => n + 1);
        pushToast("Enlace externo bloqueado por el filtro anti-spam.", "danger");
        return { ok: false, error: "No se permiten enlaces externos." };
      }
      setSocialPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [
                  ...post.comments,
                  {
                    id: `sc-${Date.now()}`,
                    authorHandle: ownHandleFor(viewerIdentity, viewerRole),
                    authorName:
                      viewerIdentity?.displayName ??
                      (viewerRole === "tipstar" ? "Sofía Méndez" : "Socio Pase PitchLab Ultra"),
                    verifiedBadge:
                      viewerRole === "tipstar"
                        ? "Perfil de ejemplo"
                        : journalRecord(journal).label,
                    createdAt: "Ahora",
                    body: trimmed,
                  },
                ],
              }
            : post,
        ),
      );
      pushToast("Respuesta agregada al hilo.", "success");
      return { ok: true };
    },
    [viewerRole, viewerIdentity, pushToast, journal],
  );

  const toggleSocialLike = useCallback((postId: string) => {
    setSocialPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByMe: !p.likedByMe,
              likes: p.likedByMe ? Math.max(0, p.likes - 1) : p.likes + 1,
            }
          : p,
      ),
    );
  }, []);

  const toggleWatchlistGame = useCallback(
    (gameId: string) => {
      setWatchlistGameIds((prev) => {
        const exists = prev.includes(gameId);
        pushToast(
          exists
            ? "Partido retirado de tu vigilancia."
            : "Partido en vigilancia: te avisaremos si aparece valor nuevo.",
          "default",
        );
        if (accountsEnabled) void postJson("/api/me/watchlist", { gameId, watched: !exists });
        return exists ? prev.filter((id) => id !== gameId) : [...prev, gameId];
      });
    },
    [pushToast, accountsEnabled],
  );

  const simulateFriendFirstPayment = useCallback(() => {
    setReferralPaidFriends((prev) => {
      const next = prev + 1;
      pushToast(
        next === 5
          ? "¡Insignia Embajador desbloqueada! +15 días por tu amigo y +30 días extra acumulados."
          : "¡Referido verificado! Ambos recibieron +15 días gratis en su Pase PitchLab Ultra.",
        "success",
      );
      return next;
    });
  }, [pushToast]);

  const navigateTo = useCallback(
    (href: string) => {
      if (onNavigate) {
        onNavigate(href);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    },
    [onNavigate],
  );

  const openBetaPin = useCallback((nextPath: string = "/app") => {
    setBetaPinNextPath(nextPath);
    setBetaPinOpen(true);
  }, []);

  const closeBetaPin = useCallback(() => {
    setBetaPinOpen(false);
  }, []);

  const submitBetaPin = useCallback(
    async (code: string, nextOverride?: string): Promise<PinUnlockResult> => {
      const targetNext = nextOverride ?? betaPinNextPath ?? "/app";
      if (onSubmitPinOverride) {
        return onSubmitPinOverride(code, targetNext);
      }
      try {
        const res = await fetch("/api/beta/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, next: targetNext }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          redirectTo?: string;
        };
        if (res.ok && data.ok) {
          const redirectTo = data.redirectTo ?? targetNext;
          setBetaPinOpen(false);
          navigateTo(redirectTo);
          return { ok: true, redirectTo };
        }
        return {
          ok: false,
          error:
            data.error ?? "Código incorrecto. Si tienes invitación, escríbenos.",
        };
      } catch (err) {
        void err;
        return {
          ok: false,
          error: "No pudimos verificar el código. Intenta de nuevo.",
        };
      }
    },
    [betaPinNextPath, navigateTo, onSubmitPinOverride],
  );

  const logoutSession = useCallback(async () => {
    if (onLogoutOverride) {
      await onLogoutOverride();
      return;
    }
    try {
      await fetch("/api/beta/logout", { method: "POST" });
    } catch (err) {
      void err;
    }
    if (accountsEnabled) {
      try {
        await fetch("/api/auth/sign-out", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
      } catch (err) {
        void err;
      }
    }
    navigateTo("/");
  }, [accountsEnabled, navigateTo, onLogoutOverride]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      rawDataset,
      dataset,
      viewerRole,
      setViewerRole,
      allowRoleSimulation,
      accountsEnabled,
      viewerIdentity,
      updateViewerIdentity,
      oddsFormat,
      setOddsFormat,
      auraColors,
      setAuraFromGame,
      parlayLegs,
      allowSgp,
      setAllowSgp,
      parlayStakeUnits,
      setParlayStakeUnits,
      parlaySummary,
      addPickToParlay,
      removePickFromParlay,
      clearParlay,
      generateAutoParlay,
      journal,
      sealPickToJournal,
      sealParlayToJournal,
      exportJournalCsv,
      socialPosts,
      publishSocialPost,
      addSocialComment,
      toggleSocialLike,
      blockedSpamAttempts,
      watchlistGameIds,
      toggleWatchlistGame,
      favoriteLeagues,
      setFavoriteLeagues,
      riskPreference,
      setRiskPreference,
      referralPaidFriends,
      simulateFriendFirstPayment,
      month1NoCardMode,
      setMonth1NoCardMode: handleSetMonth1NoCard,
      tipstarWeeklyPickOrigin,
      setTipstarWeeklyPickOrigin,
      selectedTipstarPickId,
      setSelectedTipstarPickId,
      composerPick,
      openComposer: setComposerPick,
      closeComposer: () => setComposerPick(null),
      shareTicket,
      openShareTicket: setShareTicket,
      closeShareTicket: () => setShareTicket(null),
      cmdkOpen,
      setCmdkOpen,
      betaPinOpen,
      betaPinNextPath,
      openBetaPin,
      closeBetaPin,
      submitBetaPin,
      logoutSession,
      toasts,
      pushToast,
      navigateTo,
    }),
    [
      rawDataset,
      dataset,
      viewerRole,
      setViewerRole,
      allowRoleSimulation,
      accountsEnabled,
      viewerIdentity,
      updateViewerIdentity,
      oddsFormat,
      setOddsFormat,
      auraColors,
      setAuraFromGame,
      parlayLegs,
      allowSgp,
      parlayStakeUnits,
      parlaySummary,
      addPickToParlay,
      removePickFromParlay,
      clearParlay,
      generateAutoParlay,
      journal,
      sealPickToJournal,
      sealParlayToJournal,
      exportJournalCsv,
      socialPosts,
      publishSocialPost,
      addSocialComment,
      toggleSocialLike,
      blockedSpamAttempts,
      watchlistGameIds,
      toggleWatchlistGame,
      favoriteLeagues,
      setFavoriteLeagues,
      riskPreference,
      setRiskPreference,
      referralPaidFriends,
      simulateFriendFirstPayment,
      month1NoCardMode,
      handleSetMonth1NoCard,
      tipstarWeeklyPickOrigin,
      selectedTipstarPickId,
      composerPick,
      shareTicket,
      cmdkOpen,
      betaPinOpen,
      betaPinNextPath,
      openBetaPin,
      closeBetaPin,
      submitBetaPin,
      logoutSession,
      toasts,
      pushToast,
      navigateTo,
    ],
  );

  // Acciones estables: cada una llama a la versión más reciente guardada en una ref.
  const latestRef = useRef(value);
  latestRef.current = value;
  const actions = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const key of ACTION_KEYS) {
      out[key] = (...args: unknown[]) =>
        (latestRef.current[key] as unknown as (...a: unknown[]) => unknown)(...args);
    }
    return out as unknown as PlatformActions;
  }, []);

  const core = useMemo<PlatformCoreValue>(
    () => ({
      rawDataset,
      dataset,
      viewerRole,
      allowRoleSimulation,
      accountsEnabled,
      viewerIdentity,
      oddsFormat,
      favoriteLeagues,
      riskPreference,
      month1NoCardMode,
    }),
    [
      rawDataset,
      dataset,
      viewerRole,
      allowRoleSimulation,
      accountsEnabled,
      viewerIdentity,
      oddsFormat,
      favoriteLeagues,
      riskPreference,
      month1NoCardMode,
    ],
  );

  const [parlayIdStore] = useState(createParlayIdStore);
  useLayoutEffect(() => {
    parlayIdStore.set(new Set(parlayLegs.map((l) => l.pick.id)));
  }, [parlayIdStore, parlayLegs]);

  return (
    <PlatformActionsContext.Provider value={actions}>
      <PlatformCoreContext.Provider value={core}>
        <ParlayIdStoreContext.Provider value={parlayIdStore}>
          <JournalContext.Provider value={journal}>
            <AuraContext.Provider value={auraColors}>
              <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
            </AuraContext.Provider>
          </JournalContext.Provider>
        </ParlayIdStoreContext.Provider>
      </PlatformCoreContext.Provider>
    </PlatformActionsContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error("usePlatform debe usarse dentro de <PlatformProvider>.");
  }
  return ctx;
}

/**
 * Agrega partidos a los datos de una página concreta (p. ej. los terminados en Resultados).
 * El layout solo manda los partidos por jugar; cada pantalla pide lo que le falta.
 */
export function PlatformGamesSupplement({
  games,
  children,
}: {
  games: readonly PlatformGame[];
  children: React.ReactNode;
}): React.JSX.Element {
  const full = usePlatform();
  const core = usePlatformCore();

  const merge = useCallback(
    (base: PlatformDataset): PlatformDataset => {
      if (games.length === 0) return base;
      const known = new Set(base.games.map((g) => g.id));
      const extra = games.filter((g) => !known.has(g.id));
      return extra.length === 0 ? base : { ...base, games: [...base.games, ...extra] };
    },
    [games],
  );

  const patchedCore = useMemo<PlatformCoreValue>(
    () => ({ ...core, dataset: merge(core.dataset), rawDataset: merge(core.rawDataset) }),
    [core, merge],
  );
  const patchedFull = useMemo<PlatformContextValue>(
    () => ({ ...full, dataset: patchedCore.dataset, rawDataset: patchedCore.rawDataset }),
    [full, patchedCore],
  );

  return (
    <PlatformCoreContext.Provider value={patchedCore}>
      <PlatformContext.Provider value={patchedFull}>{children}</PlatformContext.Provider>
    </PlatformCoreContext.Provider>
  );
}
