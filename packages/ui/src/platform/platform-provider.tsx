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
import { sanitizeCsvCell } from "./club/account/account-helpers";

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
  fromServerComment,
  fromServerPost,
  isPendingPost,
  mergeSocialPosts,
  type ServerSocialComment,
  type ServerSocialPost,
} from "./social-sync";
import {
  buildSmartAutoParlay,
  checkParlayCompatibility,
  computeParlaySummary,
} from "./parlay-engine";
import { INITIAL_SOCIAL_POSTS } from "./spacetime-catalog";
import { attachExamplePostPicks } from "./community-examples";
import {
  DEFAULT_STORED_PREFS_V1,
  formatKickoffByTimezone,
  readStoredPrefs,
  writeStoredPrefs,
  type ServerProfileSummary,
} from "./club/account/account-helpers";
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
  SocialReportReason,
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
  pickSlug?: string;
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
  avatarUrl?: string | null;
}

/** Usuario propio: el de la cuenta o, en la beta con PIN, el de ejemplo según el rol. */
export function ownHandleFor(identity: ViewerIdentity | null, role: ViewerRole): string {
  if (identity) return identity.handle;
  return role === "tipstar" ? "sofia_nfl" : "socio_pl";
}

export interface SocialFeedScope {
  following?: boolean;
  author?: string;
}

export interface SocialFeedPageState {
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
}

export function socialScopeKey(scope?: SocialFeedScope): string {
  if (scope?.author) return `author:${scope.author.trim().toLowerCase()}`;
  if (scope?.following) return "following";
  return "feed";
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
  /** Tiene sesión de cuenta iniciada (aunque su prueba o pase haya vencido). */
  hasAccountSession: boolean;
  /** Ruta de activación o alta según si ya tiene cuenta iniciada. */
  upgradeHref: string;
  updateViewerIdentity: (
    profile: Pick<ViewerIdentity, "displayName" | "handle"> & { avatarUrl?: string | null },
  ) => void;
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
  /** Borra una publicación propia (solo las guardadas en el servidor). */
  deleteSocialPost: (postId: string) => void;
  /** Vuelve a pedir el feed compartido (al abrir Comunidad o volver a la pestaña). */
  refreshSocialFeed: () => void;
  /** Trae las publicaciones recientes de quienes sigue el socio. */
  loadFollowingSocialPosts: () => void;
  /** Trae las publicaciones de un socio para su perfil. */
  loadSocialPostsByAuthor: (handle: string) => void;
  /** Pide publicaciones más viejas al servidor (`?before=…&limit=30`) para el feed, siguiendo o perfil. */
  loadOlderSocialPosts: (scope?: SocialFeedScope) => Promise<boolean>;
  /** Estado de paginación por ámbito (`feed`, `following`, `author:<handle>`). */
  socialFeedPages: Readonly<Record<string, SocialFeedPageState>>;
  /** Garantiza que una publicación concreta esté cargada (p. ej. al abrir un aviso). */
  ensureSocialPostLoaded: (postId: string) => void;
  /** Reporta una publicación o comentario ajeno en Comunidad. */
  reportSocialContent: (input: {
    postId?: string;
    commentId?: string;
    reason: SocialReportReason;
  }) => Promise<{ ok: boolean; autoHidden?: boolean; error?: string }>;
  /** true cuando Comunidad viene del servidor (la ven todos los socios). */
  socialOnServer: boolean;
  blockedSpamAttempts: number;

  watchlistGameIds: string[];
  toggleWatchlistGame: (gameId: string) => void;
  favoriteLeagues: LeagueId[];
  setFavoriteLeagues: (leagues: LeagueId[]) => void;
  riskPreference: RiskBand;
  setRiskPreference: (risk: RiskBand) => void;
  userTimezone: string;
  setUserTimezone: (tz: string) => void;
  showMxnBalance: boolean;
  setShowMxnBalance: (show: boolean) => void;
  unitMxn: number;
  setUnitMxn: (unit: number) => void;

  referralPaidFriends: number;
  memberReferralsSnapshot: (ServerProfileSummary & {
    referralCode: string | null;
    paidFriends: number;
    pendingFriends: number;
  }) | null;
  memberReferralsLoaded: boolean;
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
  hasAccountSession: boolean;
  upgradeHref: string;
  oddsFormat: OddsFormat;
  favoriteLeagues: LeagueId[];
  riskPreference: RiskBand;
  userTimezone: string;
  showMxnBalance: boolean;
  unitMxn: number;
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
  "deleteSocialPost",
  "refreshSocialFeed",
  "loadFollowingSocialPosts",
  "loadSocialPostsByAuthor",
  "loadOlderSocialPosts",
  "ensureSocialPostLoaded",
  "reportSocialContent",
  "toggleWatchlistGame",
  "setFavoriteLeagues",
  "setRiskPreference",
  "setUserTimezone",
  "setShowMxnBalance",
  "setUnitMxn",
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
  // Con cuentas, Comunidad vive en el servidor; sin ellas (PIN de beta), en este navegador.
  const [socialOnServer, setSocialOnServer] = useState<boolean>(false);
  const [socialFeedPages, setSocialFeedPages] = useState<Record<string, SocialFeedPageState>>({});
  const socialFeedPagesRef = useRef<Record<string, SocialFeedPageState>>({});
  const updateFeedPage = useCallback((key: string, next: SocialFeedPageState) => {
    socialFeedPagesRef.current = { ...socialFeedPagesRef.current, [key]: next };
    setSocialFeedPages(socialFeedPagesRef.current);
  }, []);
  const updateViewerIdentity = useCallback(
    (profile: Pick<ViewerIdentity, "displayName" | "handle"> & { avatarUrl?: string | null }) => {
      if (!viewerIdentity) return;
      const words = profile.displayName.trim().split(/\s+/);
      const first = words[0] ?? "";
      const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : (first[1] ?? "");
      const initials = ((first[0] ?? "") + last).toUpperCase() || "PL";
      const nextAvatarUrl = profile.avatarUrl !== undefined ? profile.avatarUrl : viewerIdentity.avatarUrl;
      setViewerIdentity({ ...viewerIdentity, ...profile, avatarUrl: nextAvatarUrl, initials });

      const renameAuthor = <
        T extends { authorHandle: string; authorName: string; authorAvatarUrl?: string | null },
      >(
        item: T,
      ): T =>
        item.authorHandle === viewerIdentity.handle
          ? {
              ...item,
              authorHandle: profile.handle,
              authorName: profile.displayName,
              ...(profile.avatarUrl !== undefined ? { authorAvatarUrl: profile.avatarUrl } : {}),
            }
          : item;
      setSocialPosts((posts) =>
        posts.map((post) =>
          post.isExample
            ? post
            : {
                ...renameAuthor(post),
                comments: post.comments.map(renameAuthor),
              },
        ),
      );
    },
    [viewerIdentity],
  );

  const [blockedSpamAttempts, setBlockedSpamAttempts] = useState<number>(0);
  const [watchlistGameIds, setWatchlistGameIds] = useState<string[]>([]);
  const [favoriteLeagues, setFavoriteLeaguesState] = useState<LeagueId[]>(() =>
    rawDataset.leagues.slice(0, 3).map((l) => l.league),
  );
  const [riskPreference, setRiskPreferenceState] = useState<RiskBand>("medio");
  const [userTimezone, setUserTimezoneState] = useState<string>(
    DEFAULT_STORED_PREFS_V1.timezone,
  );
  const [showMxnBalance, setShowMxnBalanceState] = useState<boolean>(
    DEFAULT_STORED_PREFS_V1.showMxnBalance,
  );
  const [unitMxn, setUnitMxnState] = useState<number>(
    DEFAULT_STORED_PREFS_V1.unitMxn,
  );
  const [referralPaidFriends, setReferralPaidFriends] = useState<number>(0);
  const [memberReferralsSnapshot, setMemberReferralsSnapshot] = useState<
    | (ServerProfileSummary & {
        referralCode: string | null;
        paidFriends: number;
        pendingFriends: number;
      })
    | null
  >(null);
  const [memberReferralsLoaded, setMemberReferralsLoaded] = useState<boolean>(
    !accountsEnabled,
  );
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
      const rawFavLeagues = window.localStorage.getItem("pl-fav-leagues");
      if (rawFavLeagues) {
        const knownLeagueIds = new Set<string>([
          "liga-mx",
          "nfl",
          "premier-league",
          "laliga",
          "bundesliga",
          "serie-a",
          "ligue-1",
          ...rawDataset.leagues.map((l) => l.league),
        ]);
        const parsedLeagues: unknown = JSON.parse(rawFavLeagues);
        if (Array.isArray(parsedLeagues)) {
          const validLeagues = parsedLeagues.filter(
            (id): id is LeagueId => typeof id === "string" && knownLeagueIds.has(id),
          );
          if (validLeagues.length > 0) {
            setFavoriteLeaguesState(Array.from(new Set(validLeagues)));
          }
        }
      }
      const storedPrefs = readStoredPrefs();
      setUserTimezoneState(storedPrefs.timezone);
      setShowMxnBalanceState(storedPrefs.showMxnBalance);
      setUnitMxnState(storedPrefs.unitMxn);
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
      } else {
        window.localStorage.removeItem("pl-sim-role");
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
    if (!accountsEnabled) {
      setMemberReferralsLoaded(true);
      return;
    }
    let active = true;
    setMemberReferralsLoaded(false);
    void (async () => {
      const watch = await getJson<{ gameIds?: string[] }>("/api/me/watchlist");
      if (active && watch?.gameIds) setWatchlistGameIds(watch.gameIds);
      const journalRes = await getJson<{ entries?: ServerJournalRow[] }>("/api/me/journal");
      if (active && journalRes?.entries) setJournal(journalRes.entries.map(fromServerRow));
      const refs = await getJson<
        ServerProfileSummary & {
          referralCode?: string | null;
          paidFriends?: number;
          pendingFriends?: number;
        }
      >("/api/me/referrals");
      if (active && refs) {
        const paid = typeof refs.paidFriends === "number" ? refs.paidFriends : 0;
        const pending = typeof refs.pendingFriends === "number" ? refs.pendingFriends : 0;
        setReferralPaidFriends(paid);
        setMemberReferralsSnapshot({
          referralCode: refs.referralCode ?? null,
          paidFriends: paid,
          pendingFriends: pending,
          handle: refs.handle ?? null,
          displayName: refs.displayName ?? null,
          email: refs.email ?? null,
          isTipstar: Boolean(refs.isTipstar),
        });
      }
      if (active) setMemberReferralsLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [accountsEnabled]);
  useEffect(() => {
    if (userDataLoaded) writeStored(STORAGE_KEYS.journal, journal.slice(0, 500));
  }, [journal, userDataLoaded]);
  useEffect(() => {
    if (userDataLoaded) writeStored(STORAGE_KEYS.watchlist, watchlistGameIds);
  }, [watchlistGameIds, userDataLoaded]);
  useEffect(() => {
    if (userDataLoaded && !socialOnServer) {
      writeStored(
        STORAGE_KEYS.ownPosts,
        socialPosts.filter((p) => !p.isExample).slice(0, 100),
      );
    }
  }, [socialPosts, userDataLoaded, socialOnServer]);

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
      if (!allowRoleSimulation) return;
      setViewerRoleState(role);
      try {
        window.localStorage.setItem("pl-sim-role", role);
      } catch (err) {
        void err;
      }
    },
    [allowRoleSimulation],
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

  const setUserTimezone = useCallback((tz: string) => {
    const trimmed = tz.trim() || DEFAULT_STORED_PREFS_V1.timezone;
    setUserTimezoneState(trimmed);
    writeStoredPrefs({ ...readStoredPrefs(), timezone: trimmed });
  }, []);

  const setShowMxnBalance = useCallback((show: boolean) => {
    setShowMxnBalanceState(show);
    writeStoredPrefs({ ...readStoredPrefs(), showMxnBalance: show });
  }, []);

  const setUnitMxn = useCallback((unit: number) => {
    if (!Number.isFinite(unit) || unit < 10) return;
    const clamped = Math.min(100_000, Math.round(unit));
    setUnitMxnState(clamped);
    writeStoredPrefs({ ...readStoredPrefs(), unitMxn: clamped });
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
    const base =
      viewerRole === "visitor"
        ? rawDataset.isServerRedactedForVisitor
          ? rawDataset
          : redactDatasetForVisitor(rawDataset)
        : rawDataset;
    if (!userTimezone || userTimezone === DEFAULT_STORED_PREFS_V1.timezone) {
      return base;
    }
    return {
      ...base,
      games: base.games.map((g) => {
        const ko = formatKickoffByTimezone(g.kickoffUtc, g.kickoffLocal, userTimezone);
        if (ko === g.kickoffLocal) return g;
        return {
          ...g,
          kickoffLocal: ko,
          picks: g.picks.map((p) => ({ ...p, kickoffLocal: ko })),
        };
      }),
    };
  }, [rawDataset, userTimezone, viewerRole]);

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
      const gamesById = new Map(dataset.games.map((g) => [g.id, g]));
      let earliestGameId = parlaySummary.legs[0]!.pick.gameId;
      let earliestTs = Number.POSITIVE_INFINITY;
      for (const leg of parlaySummary.legs) {
        const game = gamesById.get(leg.pick.gameId);
        const ts = game ? Date.parse(game.kickoffUtc) : Number.NaN;
        if (Number.isFinite(ts) && ts < earliestTs) {
          earliestTs = ts;
          earliestGameId = leg.pick.gameId;
        }
      }
      const entry: JournalEntry = {
        id: `j-parlay-${Date.now()}`,
        pickId: parlaySummary.legs.map((l) => l.pick.id).join("+"),
        gameId: earliestGameId,
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
      if (accountsEnabled) {
        void sealOnServer(entry).then((res) => {
          if (res.ok && res.id) {
            setJournal((prev) => prev.map((j) => (j.id === entry.id ? { ...j, id: res.id! } : j)));
          } else if (res.reason && res.reason !== "sin_sesion") {
            setJournal((prev) => prev.filter((j) => j.id !== entry.id));
            pushToast(SEAL_ERRORS[res.reason] ?? "No se pudo sellar el parlay.", "warning");
          }
        });
      }
    },
    [parlaySummary, dataset.games, accountsEnabled, pushToast],
  );

  const exportJournalCsv = useCallback((): string => {
    const header =
      "Fecha,Liga,Partido,Seleccion,Origen,Unidades,CuotaUsuario,CuotaJusta,CLV_Pts,Estado";
    const lines = journal.map((j) =>
      [
        `"${sanitizeCsvCell(j.sealedAt)}"`,
        `"${sanitizeCsvCell(j.leagueLabel)}"`,
        `"${sanitizeCsvCell(j.matchLabel)}"`,
        `"${sanitizeCsvCell(j.pickLabel)}"`,
        `"${sanitizeCsvCell(j.origin)}"`,
        j.units.toFixed(2),
        j.userDecimal.toFixed(2),
        j.fairDecimal.toFixed(2),
        j.clvPct.toFixed(1),
        `"${sanitizeCsvCell(j.status)}"`,
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
        authorAvatarUrl: viewerRole === "tipstar" ? null : (viewerIdentity?.avatarUrl ?? null),
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
      if (socialOnServer && !newPost.isExample) {
        // Se ve al instante; el servidor la confirma (o la quita con su motivo).
        const tempId = `tmp-${Date.now()}`;
        setSocialPosts((prev) => [{ ...newPost, id: tempId, isMine: true }, ...prev]);
        void (async () => {
          const res = await postJson("/api/social/posts", {
            body: trimmed,
            leagueLabel: payload.leagueLabel,
            matchLabel: payload.matchLabel,
            pickBadge: payload.pickBadge,
            originType: payload.originType,
            gameId: payload.pick?.matchPick.gameId,
            pick: newPost.pick
              ? {
                  pickId: newPost.pick.pickId,
                  gameId: newPost.pick.gameId,
                  label: newPost.pick.label,
                  units: newPost.pick.units,
                  userDecimal: newPost.pick.userDecimal,
                  fairDecimal: newPost.pick.fairDecimal,
                  modelProbability: newPost.pick.modelProbability,
                }
              : undefined,
          });
          const data = res
            ? ((await res.json().catch(() => null)) as { post?: ServerSocialPost; error?: string } | null)
            : null;
          if (res?.ok && data?.post?.authorHandle) {
            const saved = fromServerPost(data.post, rawDataset.games, new Date());
            setSocialPosts((prev) => prev.map((p) => (p.id === tempId ? saved : p)));
          } else {
            setSocialPosts((prev) => prev.filter((p) => p.id !== tempId));
            pushToast(data?.error ?? "No pudimos publicar. Revisa tu conexión.", "danger");
          }
        })();
      } else {
        setSocialPosts((prev) => [newPost, ...prev]);
      }
      if (payload.pick) {
        sealPickToJournal(payload.pick.matchPick, payload.pick.units, payload.pick.userDecimal);
      }
      pushToast("Publicado en Comunidad.", "success");
      return { ok: true };
    },
    [viewerRole, viewerIdentity, pushToast, journal, socialPosts, sealPickToJournal, socialOnServer, rawDataset.games],
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
      const target = socialPosts.find((p) => p.id === postId);
      if (target && isPendingPost(target)) {
        return { ok: false, error: "Espera a que termine de publicarse." };
      }
      const tempId = `sc-${Date.now()}`;
      if (socialOnServer && target?.fromServer) {
        void (async () => {
          const res = await postJson(`/api/social/posts/${postId}/comments`, { body: trimmed });
          const data = res
            ? ((await res.json().catch(() => null)) as { comment?: ServerSocialComment; error?: string } | null)
            : null;
          if (res?.ok && data?.comment) {
            const saved = fromServerComment(data.comment, new Date());
            setSocialPosts((prev) =>
              prev.map((p) =>
                p.id === postId ? { ...p, comments: p.comments.map((c) => (c.id === tempId ? saved : c)) } : p,
              ),
            );
          } else {
            setSocialPosts((prev) =>
              prev.map((p) => (p.id === postId ? { ...p, comments: p.comments.filter((c) => c.id !== tempId) } : p)),
            );
            pushToast(data?.error ?? "No pudimos guardar tu comentario.", "danger");
          }
        })();
      }
      setSocialPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [
                  ...post.comments,
                  {
                    id: tempId,
                    authorHandle: ownHandleFor(viewerIdentity, viewerRole),
                    authorName:
                      viewerIdentity?.displayName ??
                      (viewerRole === "tipstar" ? "Sofía Méndez" : "Socio Pase PitchLab Ultra"),
                    authorAvatarUrl: viewerRole === "tipstar" ? null : (viewerIdentity?.avatarUrl ?? null),
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
    [viewerRole, viewerIdentity, pushToast, journal, socialPosts, socialOnServer],
  );

  const toggleSocialLike = useCallback(
    (postId: string) => {
      const target = socialPosts.find((p) => p.id === postId);
      if (!target || isPendingPost(target)) return;
      const liked = !target.likedByMe;
      setSocialPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likedByMe: liked, likes: liked ? p.likes + 1 : Math.max(0, p.likes - 1) } : p,
        ),
      );
      if (!socialOnServer || !target.fromServer) return;
      void (async () => {
        try {
          const res = await fetch(`/api/social/posts/${postId}/like`, {
            method: "PUT",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ liked }),
          });
          const data = (await res.json().catch(() => null)) as { likes?: number } | null;
          const likes = data?.likes;
          if (!res.ok || typeof likes !== "number") throw new Error(String(res.status));
          setSocialPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likes, likedByMe: liked } : p)));
        } catch (err) {
          void err;
          setSocialPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, likedByMe: target.likedByMe, likes: target.likes } : p)),
          );
        }
      })();
    },
    [socialPosts, socialOnServer],
  );

  const deleteSocialPost = useCallback(
    (postId: string) => {
      const target = socialPosts.find((p) => p.id === postId);
      if (!target?.fromServer || !target.isMine) return;
      setSocialPosts((prev) => prev.filter((p) => p.id !== postId));
      void (async () => {
        try {
          const res = await fetch(`/api/social/posts/${postId}`, { method: "DELETE", credentials: "same-origin" });
          if (!res.ok) throw new Error(String(res.status));
          pushToast("Publicación borrada.", "default");
        } catch (err) {
          void err;
          setSocialPosts((prev) => mergeSocialPosts(prev, [target], "extra"));
          pushToast("No pudimos borrarla. Inténtalo de nuevo.", "danger");
        }
      })();
    },
    [socialPosts, pushToast],
  );

  const refreshSocialFeed = useCallback(() => {
    if (!accountsEnabled) return;
    void (async () => {
      const data = await getJson<{ posts?: ServerSocialPost[] }>("/api/social/posts?limit=50");
      if (!data?.posts) return;
      const now = new Date();
      const incoming = data.posts.map((p) => fromServerPost(p, rawDataset.games, now));
      const incomingOldest = data.posts.at(-1)?.createdAt ?? null;
      const prevPage = socialFeedPagesRef.current.feed;
      const keepOlderCursor = Boolean(prevPage?.cursor && incomingOldest && prevPage.cursor < incomingOldest);
      updateFeedPage(
        "feed",
        keepOlderCursor
          ? { cursor: prevPage!.cursor, hasMore: prevPage!.hasMore, loading: false }
          : { cursor: incomingOldest, hasMore: data.posts.length >= 50, loading: false },
      );
      setSocialOnServer(true);
      setSocialPosts((prev) => mergeSocialPosts(prev, incoming, "feed"));
    })();
  }, [accountsEnabled, rawDataset.games, updateFeedPage]);

  const loadFollowingSocialPosts = useCallback(() => {
    if (!accountsEnabled) return;
    void (async () => {
      const data = await getJson<{ posts?: ServerSocialPost[] }>("/api/social/posts?following=1&limit=50");
      if (!data?.posts) return;
      const now = new Date();
      const incoming = data.posts.map((p) => fromServerPost(p, rawDataset.games, now));
      const incomingOldest = data.posts.at(-1)?.createdAt ?? null;
      const prevPage = socialFeedPagesRef.current.following;
      const keepOlderCursor = Boolean(prevPage?.cursor && incomingOldest && prevPage.cursor < incomingOldest);
      updateFeedPage(
        "following",
        keepOlderCursor
          ? { cursor: prevPage!.cursor, hasMore: prevPage!.hasMore, loading: false }
          : { cursor: incomingOldest, hasMore: data.posts.length >= 50, loading: false },
      );
      setSocialOnServer(true);
      setSocialPosts((prev) => mergeSocialPosts(prev, incoming, "extra"));
    })();
  }, [accountsEnabled, rawDataset.games, updateFeedPage]);

  const loadSocialPostsByAuthor = useCallback(
    (handle: string) => {
      const clean = handle.trim().toLowerCase();
      if (!accountsEnabled || !clean) return;
      void (async () => {
        const data = await getJson<{ posts?: ServerSocialPost[] }>(
          `/api/social/posts?limit=50&author=${encodeURIComponent(clean)}`,
        );
        if (!data?.posts) return;
        const now = new Date();
        const incoming = data.posts.map((p) => fromServerPost(p, rawDataset.games, now));
        const incomingOldest = data.posts.at(-1)?.createdAt ?? null;
        const key = `author:${clean}`;
        const prevPage = socialFeedPagesRef.current[key];
        const keepOlderCursor = Boolean(prevPage?.cursor && incomingOldest && prevPage.cursor < incomingOldest);
        updateFeedPage(
          key,
          keepOlderCursor
            ? { cursor: prevPage!.cursor, hasMore: prevPage!.hasMore, loading: false }
            : { cursor: incomingOldest, hasMore: data.posts.length >= 50, loading: false },
        );
        setSocialOnServer(true);
        setSocialPosts((prev) => mergeSocialPosts(prev, incoming, "extra"));
      })();
    },
    [accountsEnabled, rawDataset.games, updateFeedPage],
  );

  const loadOlderSocialPosts = useCallback(
    async (scope?: SocialFeedScope): Promise<boolean> => {
      if (!accountsEnabled) return false;
      const key = socialScopeKey(scope);
      const current = socialFeedPagesRef.current[key];
      if (current?.loading || current?.hasMore === false) return false;

      let cursor = current?.cursor ?? null;
      if (!cursor) {
        const cleanAuthor = scope?.author?.trim().toLowerCase() ?? null;
        cursor = socialPosts.reduce<string | null>((oldest, p) => {
          if (!p.fromServer || p.isExample || !p.createdAtIso) return oldest;
          if (cleanAuthor && p.authorHandle.toLowerCase() !== cleanAuthor) return oldest;
          return !oldest || p.createdAtIso < oldest ? p.createdAtIso : oldest;
        }, null);
      }
      if (!cursor) {
        updateFeedPage(key, { cursor: null, hasMore: false, loading: false });
        return false;
      }

      updateFeedPage(key, { cursor, hasMore: current?.hasMore ?? true, loading: true });
      const params = new URLSearchParams({ before: cursor, limit: "30" });
      if (scope?.following) params.set("following", "1");
      if (scope?.author) params.set("author", scope.author.trim().toLowerCase());

      const data = await getJson<{ posts?: ServerSocialPost[] }>(`/api/social/posts?${params.toString()}`);
      if (!data?.posts) {
        updateFeedPage(key, { cursor, hasMore: current?.hasMore ?? true, loading: false });
        return false;
      }

      const incoming = data.posts.map((p) => fromServerPost(p, rawDataset.games, new Date()));
      const nextCursor = data.posts.at(-1)?.createdAt ?? cursor;
      const nextHasMore = data.posts.length >= 30;
      setSocialOnServer(true);
      if (incoming.length > 0) {
        setSocialPosts((prev) => mergeSocialPosts(prev, incoming, "extra"));
      }
      updateFeedPage(key, { cursor: nextCursor, hasMore: nextHasMore, loading: false });
      return incoming.length > 0;
    },
    [accountsEnabled, rawDataset.games, socialPosts, updateFeedPage],
  );

  const ensureSocialPostLoaded = useCallback(
    (postId: string) => {
      if (!accountsEnabled || !postId) return;
      if (socialPosts.some((p) => p.id === postId)) return;
      void (async () => {
        const data = await getJson<{ post?: ServerSocialPost }>(
          `/api/social/posts/${encodeURIComponent(postId)}`,
        );
        if (!data?.post) return;
        const saved = fromServerPost(data.post, rawDataset.games, new Date());
        setSocialOnServer(true);
        setSocialPosts((prev) => mergeSocialPosts(prev, [saved], "extra"));
      })();
    },
    [accountsEnabled, rawDataset.games, socialPosts],
  );

  const reportSocialContent = useCallback(
    async (input: {
      postId?: string;
      commentId?: string;
      reason: SocialReportReason;
    }): Promise<{ ok: boolean; autoHidden?: boolean; error?: string }> => {
      if (viewerRole === "visitor") {
        return { ok: false, error: "Inicia sesión para reportar contenido." };
      }
      if (!socialOnServer) {
        pushToast("Reporte enviado al equipo de moderación.", "success");
        return { ok: true, autoHidden: false };
      }
      const res = await postJson("/api/social/reports", input);
      const data = res
        ? ((await res.json().catch(() => null)) as { ok?: boolean; autoHidden?: boolean; error?: string } | null)
        : null;
      if (!res?.ok || !data?.ok) {
        return { ok: false, error: data?.error ?? "No se pudo enviar el reporte." };
      }
      if (data.autoHidden) {
        if (input.postId) {
          setSocialPosts((prev) => prev.filter((p) => p.id !== input.postId));
        } else if (input.commentId) {
          setSocialPosts((prev) =>
            prev.map((p) => ({
              ...p,
              comments: p.comments.filter((c) => c.id !== input.commentId),
            })),
          );
        }
      }
      pushToast(
        data.autoHidden
          ? "Reporte recibido. El contenido se ocultó mientras se revisa."
          : "Reporte enviado al equipo de moderación.",
        "success",
      );
      return { ok: true, autoHidden: Boolean(data.autoHidden) };
    },
    [viewerRole, socialOnServer, pushToast],
  );

  // Feed compartido: al entrar y cada vez que la persona vuelve a la pestaña.
  useEffect(() => {
    if (!accountsEnabled) return;
    refreshSocialFeed();
    const onVisible = (): void => {
      if (document.visibilityState === "visible") refreshSocialFeed();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [accountsEnabled, refreshSocialFeed]);

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

  const hasAccountSession = Boolean(viewerIdentity);
  const upgradeHref = hasAccountSession ? "/app/account?tab=plan" : "/signup";

  const value = useMemo<PlatformContextValue>(
    () => ({
      rawDataset,
      dataset,
      viewerRole,
      setViewerRole,
      allowRoleSimulation,
      accountsEnabled,
      viewerIdentity,
      hasAccountSession,
      upgradeHref,
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
      deleteSocialPost,
      refreshSocialFeed,
      loadFollowingSocialPosts,
      loadSocialPostsByAuthor,
      loadOlderSocialPosts,
      socialFeedPages,
      ensureSocialPostLoaded,
      reportSocialContent,
      socialOnServer,
      blockedSpamAttempts,
      watchlistGameIds,
      toggleWatchlistGame,
      favoriteLeagues,
      setFavoriteLeagues,
      riskPreference,
      setRiskPreference,
      userTimezone,
      setUserTimezone,
      showMxnBalance,
      setShowMxnBalance,
      unitMxn,
      setUnitMxn,
      referralPaidFriends,
      memberReferralsSnapshot,
      memberReferralsLoaded,
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
      hasAccountSession,
      upgradeHref,
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
      deleteSocialPost,
      refreshSocialFeed,
      loadFollowingSocialPosts,
      loadSocialPostsByAuthor,
      loadOlderSocialPosts,
      socialFeedPages,
      ensureSocialPostLoaded,
      reportSocialContent,
      socialOnServer,
      blockedSpamAttempts,
      watchlistGameIds,
      toggleWatchlistGame,
      favoriteLeagues,
      setFavoriteLeagues,
      riskPreference,
      setRiskPreference,
      userTimezone,
      setUserTimezone,
      showMxnBalance,
      setShowMxnBalance,
      unitMxn,
      setUnitMxn,
      referralPaidFriends,
      memberReferralsSnapshot,
      memberReferralsLoaded,
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
      hasAccountSession,
      upgradeHref,
      oddsFormat,
      favoriteLeagues,
      riskPreference,
      userTimezone,
      showMxnBalance,
      unitMxn,
      month1NoCardMode,
    }),
    [
      rawDataset,
      dataset,
      viewerRole,
      allowRoleSimulation,
      accountsEnabled,
      viewerIdentity,
      hasAccountSession,
      upgradeHref,
      oddsFormat,
      favoriteLeagues,
      riskPreference,
      userTimezone,
      showMxnBalance,
      unitMxn,
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
    (base: PlatformDataset, applyTz: boolean): PlatformDataset => {
      if (games.length === 0) return base;
      const known = new Set(base.games.map((g) => g.id));
      const extraRaw = games.filter((g) => !known.has(g.id));
      if (extraRaw.length === 0) return base;
      const extra =
        applyTz && core.userTimezone && core.userTimezone !== DEFAULT_STORED_PREFS_V1.timezone
          ? extraRaw.map((g) => {
              const ko = formatKickoffByTimezone(g.kickoffUtc, g.kickoffLocal, core.userTimezone);
              return ko === g.kickoffLocal
                ? g
                : { ...g, kickoffLocal: ko, picks: g.picks.map((p) => ({ ...p, kickoffLocal: ko })) };
            })
          : extraRaw;
      return { ...base, games: [...base.games, ...extra] };
    },
    [core.userTimezone, games],
  );

  const patchedCore = useMemo<PlatformCoreValue>(
    () => ({ ...core, dataset: merge(core.dataset, true), rawDataset: merge(core.rawDataset, false) }),
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
