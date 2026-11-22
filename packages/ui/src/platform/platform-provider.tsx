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
import { parseStrictFiniteNumber, type LeagueId } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import {
  containsExternalLink,
  journalRecord,
  redactDatasetForVisitor,
} from "./access-guard";
import { sanitizeCsvCell } from "./club/account/account-helpers";
import {
  buildParlayMatchSummary,
  buildParlayPickSummary,
  normalizePickLabelWithUnit,
  sanitizeJournalDisplayNote,
} from "./club/record/record-audit-helpers";
import { sanitizeInternalHref } from "./navigation-helpers";
import type {
  DaySelection,
  LeagueFilter,
  SportFilter,
} from "./club/home/home-model";

/** Claves de almacenamiento local (versión en el nombre para poder migrar). */
const STORAGE_KEYS = {
  journal: "pl-journal-v1",
  watchlist: "pl-watchlist-v1",
  followAlerts: "pl-follow-alerts-v1",
  ownPosts: "pl-own-posts-v1",
} as const;

const MAX_PARLAY_LEGS = 6;
const MAX_EXPORT_CLV_PCT = 50;
const MIN_EXPORT_CLV_PCT = -60;

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
    typeof e === "object" &&
    typeof e.id === "string" &&
    typeof e.pickId === "string" &&
    typeof e.gameId === "string" &&
    typeof e.leagueLabel === "string" &&
    typeof e.matchLabel === "string" &&
    typeof e.pickLabel === "string" &&
    typeof e.units === "number" &&
    Number.isFinite(e.units) &&
    typeof e.userDecimal === "number" &&
    Number.isFinite(e.userDecimal) &&
    (e.fairDecimal === undefined ||
      (typeof e.fairDecimal === "number" && Number.isFinite(e.fairDecimal))) &&
    (e.status === "pending" || e.status === "won" || e.status === "lost" || e.status === "void")
  );
}

function isOwnSocialPost(v: unknown): v is SocialPost {
  const p = v as Partial<SocialPost> | null;
  return (
    !!p &&
    typeof p === "object" &&
    typeof p.id === "string" &&
    typeof p.body === "string" &&
    typeof p.authorHandle === "string" &&
    typeof p.authorName === "string" &&
    !p.isExample &&
    Array.isArray(p.comments)
  );
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
  closingDecimal?: string | null;
  status: string;
  pickKind?: string | null;
  parlayLegs?: JournalEntry["parlayLegs"] | null;
  parlayLegResults?: JournalEntry["parlayLegResults"] | null;
  note: string | null;
  sealedAt: string;
  settledAt?: string | null;
}

const SEAL_ERRORS: Record<string, string> = {
  partido_iniciado: "El partido ya empezó: no se puede sellar.",
  unidades_invalidas: "Las unidades deben estar entre 0.25u y 5u.",
  momio_invalido: "Momio inválido.",
  ya_sellado: "Ese pick ya estaba sellado en Mi récord.",
  parlay_invalido: "Las selecciones de este parlay ya no son compatibles o faltan en cartelera.",
};

function fromServerRow(row: ServerJournalRow): JournalEntry {
  const origins: JournalEntry["origin"][] = ["Spacetime Suite", "Parlay Combinado", "Player Prop", "Propio"];
  const status: JournalEntry["status"] =
    row.status === "won" || row.status === "lost" || row.status === "void" ? row.status : "pending";
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
    clvPct:
      row.clvPct === null ? undefined : (parseStrictFiniteNumber(row.clvPct) ?? undefined),
    closingDecimal: row.closingDecimal ? Number(row.closingDecimal) : null,
    status,
    pickKind: row.pickKind === "parlay" ? "parlay" : "single",
    ...(Array.isArray(row.parlayLegs) ? { parlayLegs: row.parlayLegs } : {}),
    ...(Array.isArray(row.parlayLegResults) ? { parlayLegResults: row.parlayLegResults } : {}),
    sealedAt: new Date(row.sealedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }),
    sealedAtIso: new Date(row.sealedAt).toISOString(),
    settledAtIso: row.settledAt ? new Date(row.settledAt).toISOString() : null,
    note: row.note ?? undefined,
  };
}

export interface FollowAlerts {
  kickoff: boolean;
  goals: boolean;
  final: boolean;
}

export const DEFAULT_FOLLOW_ALERTS: FollowAlerts = { kickoff: true, goals: true, final: true };

function sanitizeFollowAlerts(raw: Record<string, unknown>): Record<string, FollowAlerts> {
  const out: Record<string, FollowAlerts> = {};
  for (const [gameId, value] of Object.entries(raw)) {
    if (!/^[a-zA-Z0-9._-]{1,128}$/.test(gameId) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    out[gameId] = {
      kickoff: v.kickoff !== false,
      goals: v.goals !== false,
      final: v.final !== false,
    };
  }
  return out;
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
    pickKind: entry.pickKind ?? "single",
    ...(entry.pickKind === "parlay" && entry.parlayLegs
      ? { parlayLegs: entry.parlayLegs.map((l) => ({ gameId: l.gameId, pickId: l.pickId })) }
      : {}),
    note: entry.note,
  });
  if (!res) return { ok: false };
  if (res.status === 401 || res.status === 503) return { ok: false, reason: "sin_sesion" };
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; reason?: string };
  return { ok: Boolean(json.ok), id: json.id, reason: json.reason };
}

function formatClvBadge(avgClvPct: number | null): string {
  if (avgClvPct === null) return "Ventaja —";
  return `Ventaja ${avgClvPct >= 0 ? "+" : ""}${avgClvPct.toFixed(1)} %`;
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
import { reparentDeletedComment } from "./club/comment-tree";
import { INITIAL_SOCIAL_POSTS } from "./spacetime-catalog";
import { attachExamplePostPicks } from "./community-examples";
import {
  DEFAULT_STORED_PREFS_V1,
  formatKickoffByTimezone,
  readStoredPrefs,
  writeStoredPrefs,
  type ServerProfileSummary,
} from "./club/account/account-helpers";
import {
  DEFAULT_PREFERRED_BOOKS,
  sanitizePreferredBooks,
} from "./bookmakers";
import {
  readSavedScreenerViews,
  sanitizeSavedScreenerViews,
  writeSavedScreenerViews,
  type SavedScreenerView,
} from "./screener-views";
import { triggerHaptic } from "./navigation-helpers";
import type {
  JournalEntry,
  MatchPick,
  OddsFormat,
  ParlayLeg,
  ParlaySummary,
  PaymentMode,
  PlatformDataset,
  PlatformGame,
  RiskBand,
  SocialPost,
  SocialReportReason,
  ViewerRole,
  ViewerVia,
} from "./types";

export interface ShareTicketLegItem {
  label: string;
  matchLabel: string;
  p: number;
  fairDecimal: number;
  marketDecimal?: number | null;
  kickoffLocal?: string;
}

export interface ShareTicketPayload {
  kind: "pick" | "parlay" | "tipster";
  title: string;
  subtitle: string;
  leagueLabel: string;
  pickLabel: string;
  probability: number;
  fairDecimal: number;
  marketDecimal: number;
  units: number;
  gameStatus: "NS" | "FT" | "LIVE";
  legs?: ShareTicketLegItem[];
  /** Solo para tarjetas editoriales oficiales (Parlay del día), nunca para picks individuales privados pre-kickoff. */
  revealLegs?: boolean;
  promoCode?: string;
  tipsterHandle?: string;
  originBadge?: string;
  pickSlug?: string;
}

export interface ToastMessage {
  id: string;
  tone: "default" | "success" | "warning" | "danger";
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
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
  return role === "tipster" ? "sofia_nfl" : "socio_pl";
}

export interface SocialFeedScope {
  following?: boolean;
  author?: string;
  gameId?: string;
  leagueLabel?: string;
  openPickOnly?: boolean;
  sort?: "recent" | "most_commented";
}

export interface SocialFeedPageState {
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
}

export function socialScopeKey(scope?: SocialFeedScope): string {
  if (scope?.author) return `author:${scope.author.trim().toLowerCase()}`;
  if (scope?.gameId) return `game:${scope.gameId.trim()}`;
  if (scope?.following) return "following";
  if (scope?.leagueLabel || scope?.openPickOnly || scope?.sort === "most_commented") {
    return `feed:${scope.leagueLabel ?? "all"}:${scope.openPickOnly ? "open" : "all"}:${scope.sort ?? "recent"}`;
  }
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
  /** Vía de acceso autenticada (`account`, `beta` o `none`). */
  viewerVia: ViewerVia;
  /** Modo de cobro activo (`transfer` en Beta 1.0 o `stripe`). */
  paymentMode: PaymentMode;
  /** Socio con cuenta (nombre, @usuario, iniciales y código); null con PIN o visitante. */
  viewerIdentity: ViewerIdentity | null;
  /** Tiene sesión de cuenta iniciada (aunque su prueba o pase haya vencido). */
  hasAccountSession: boolean;
  /** Sesión real autenticada con cookie de Better Auth (excluye PIN beta y visitante). */
  hasAccountSessionAuth: boolean;
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
    /** Partidos de donde elegir (p. ej. los días que ve el Inicio); sin él, toda la jornada. */
    games?: readonly PlatformGame[];
  }) => number;
  /** Reemplaza el boleto por estas selecciones (las incompatibles se omiten); devuelve cuántas entraron. */
  loadParlayPicks: (
    picks: readonly MatchPick[],
    options?: { allowSgp?: boolean; label?: string },
  ) => number;

  journal: JournalEntry[];
  sealPickToJournal: (
    pick: MatchPick,
    units: number,
    userDecimal: number,
    note?: string,
  ) => void;
  sealParlayToJournal: (note?: string, userDecimalOverride?: number | null) => void;
  exportJournalCsv: () => string;

  socialPosts: SocialPost[];
  publishSocialPost: (payload: {
    leagueLabel: string;
    gameId?: string;
    matchLabel: string;
    pickBadge: string;
    originType: "Spacetime Suite" | "Bitácora Propia";
    body: string;
    /** Pick adjunto: se publica con la publicación y se registra en la bitácora si es nuevo. */
    pick?: { matchPick: MatchPick; units: number; userDecimal: number; sealedEntryId?: string };
  }) => { ok: boolean; error?: string };
  addSocialComment: (
    postId: string,
    body: string,
    parentCommentId?: string | null,
  ) => { ok: boolean; error?: string; pending?: boolean };
  deleteSocialComment: (postId: string, commentId: string) => void;
  toggleSocialCommentHelpful: (postId: string, commentId: string) => void;
  loadAllPostComments: (postId: string) => Promise<void>;
  recordSocialPostCopy: (postId: string) => void;
  toggleSocialLike: (postId: string) => void;
  /** Borra una publicación propia (solo las guardadas en el servidor). */
  deleteSocialPost: (postId: string) => void;
  /** Vuelve a pedir el feed compartido (con filtros/orden opcionales). */
  refreshSocialFeed: (scope?: SocialFeedScope) => void;
  /** Trae las publicaciones recientes de quienes sigue el socio. */
  loadFollowingSocialPosts: () => void;
  /** Trae las publicaciones de un socio para su perfil. */
  loadSocialPostsByAuthor: (handle: string) => void;
  /** Trae las publicaciones ligadas a un partido por su `gameId`. */
  loadMatchSocialPosts: (gameId: string) => Promise<void>;
  /** Pide publicaciones más viejas al servidor (`?before=…&limit=30`) para el feed, siguiendo, partido o perfil. */
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
  /** Avisos por partido de «Siguiendo» (inicio, goles, final). Sin entrada = todos encendidos. */
  followAlerts: Record<string, FollowAlerts>;
  setFollowAlerts: (gameId: string, alerts: FollowAlerts) => void;
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
  preferredBooks: string[];
  setPreferredBooks: (books: string[]) => void;
  savedScreenerViews: SavedScreenerView[];
  setSavedScreenerViews: (views: SavedScreenerView[]) => void;

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
  tipsterWeeklyPickOrigin: "spacetime" | "bitacora";
  setTipsterWeeklyPickOrigin: (v: "spacetime" | "bitacora") => void;
  selectedTipsterPickId: string;
  setSelectedTipsterPickId: (id: string) => void;

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
  pushToast: (text: string, tone?: ToastMessage["tone"], options?: ToastOptions) => void;
  dismissToast: (id: string) => void;
  setToastPaused: (id: string, paused: boolean) => void;
  navigateTo: (href: string) => void;
  /** Precarga bajo demanda (touch/hover) deduplicada en memoria (ADR-053). */
  prefetchRoute: (href: string) => void;
  /** Solicita el resto del horizonte diferido del shell si aún no llegó (`/api/shell/extend`). */
  requestFullShell: () => void;
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
  viewerVia: ViewerVia;
  paymentMode: PaymentMode;
  viewerIdentity: ViewerIdentity | null;
  hasAccountSession: boolean;
  hasAccountSessionAuth: boolean;
  upgradeHref: string;
  oddsFormat: OddsFormat;
  favoriteLeagues: LeagueId[];
  riskPreference: RiskBand;
  userTimezone: string;
  showMxnBalance: boolean;
  unitMxn: number;
  preferredBooks: string[];
  savedScreenerViews: SavedScreenerView[];
  month1NoCardMode: boolean;
  referralPaidFriends: number;
  memberReferralsSnapshot: (ServerProfileSummary & {
    referralCode: string | null;
    paidFriends: number;
    pendingFriends: number;
  }) | null;
  tipsterWeeklyPickOrigin: "spacetime" | "bitacora";
  selectedTipsterPickId: string;
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
  "loadParlayPicks",
  "sealPickToJournal",
  "sealParlayToJournal",
  "exportJournalCsv",
  "publishSocialPost",
  "addSocialComment",
  "deleteSocialComment",
  "toggleSocialCommentHelpful",
  "loadAllPostComments",
  "recordSocialPostCopy",
  "toggleSocialLike",
  "deleteSocialPost",
  "refreshSocialFeed",
  "loadFollowingSocialPosts",
  "loadSocialPostsByAuthor",
  "loadMatchSocialPosts",
  "loadOlderSocialPosts",
  "ensureSocialPostLoaded",
  "reportSocialContent",
  "toggleWatchlistGame",
  "setFollowAlerts",
  "setFavoriteLeagues",
  "setRiskPreference",
  "setUserTimezone",
  "setShowMxnBalance",
  "setUnitMxn",
  "setPreferredBooks",
  "setSavedScreenerViews",
  "simulateFriendFirstPayment",
  "setMonth1NoCardMode",
  "setTipsterWeeklyPickOrigin",
  "setSelectedTipsterPickId",
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
  "dismissToast",
  "setToastPaused",
  "navigateTo",
  "prefetchRoute",
  "requestFullShell",
] as const satisfies readonly ActionKey[];
// Si falta alguna acción en la lista, esto no compila.
type MissingActionKey = Exclude<ActionKey, (typeof ACTION_KEYS)[number]>;
const ACTION_KEYS_COMPLETE: [MissingActionKey] extends [never] ? true : MissingActionKey = true;
void ACTION_KEYS_COMPLETE;

const DEFAULT_AURA_COLORS: readonly [string, string] = [
  "var(--pl-aura-default-home)",
  "var(--pl-aura-default-away)",
];

function createAuraStore(initial: readonly [string, string] = DEFAULT_AURA_COLORS) {
  let colors = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => colors,
    set(next: readonly [string, string]) {
      if (colors[0] === next[0] && colors[1] === next[1]) return;
      colors = next;
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
type AuraStore = ReturnType<typeof createAuraStore>;
const defaultAuraStore = createAuraStore();

const PlatformCoreContext = createContext<PlatformCoreValue | null>(null);
const PlatformActionsContext = createContext<PlatformActions | null>(null);
const AuraStoreContext = createContext<AuraStore>(defaultAuraStore);
const JournalContext = createContext<JournalEntry[]>([]);
const WatchlistContext = createContext<string[]>([]);

export interface ParlayStateValue {
  parlayLegs: ParlayLeg[];
  allowSgp: boolean;
  parlayStakeUnits: number;
  parlaySummary: ParlaySummary;
}
export interface SocialStateValue {
  socialPosts: SocialPost[];
  socialFeedPages: Readonly<Record<string, SocialFeedPageState>>;
  socialOnServer: boolean;
  blockedSpamAttempts: number;
}
export interface OverlayStateValue {
  composerPick: MatchPick | null;
  shareTicket: ShareTicketPayload | null;
  cmdkOpen: boolean;
  betaPinOpen: boolean;
  betaPinNextPath: string;
  toasts: ToastMessage[];
}

const ParlayStateContext = createContext<ParlayStateValue | null>(null);
const SocialStateContext = createContext<SocialStateValue | null>(null);
const OverlayStateContext = createContext<OverlayStateValue | null>(null);
const FollowAlertsContext = createContext<Record<string, FollowAlerts>>({});

export interface HomeNavFilterValue {
  sport: SportFilter;
  hasExplicitSport: boolean;
  league: LeagueFilter;
  chosenDay: DaySelection | null;
  todayOverride: string | null;
  pickSport: (next: SportFilter) => void;
  setLeague: (next: LeagueFilter) => void;
  setChosenDay: (next: DaySelection | null) => void;
  setTodayOverride: (next: string | null) => void;
  resetFilters: (targetDay?: string) => void;
}
const HomeNavFilterContext = createContext<HomeNavFilterValue | null>(null);

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
export function useOptionalPlatformCore(): PlatformCoreValue | null {
  return useContext(PlatformCoreContext);
}
export function usePlatformActions(): PlatformActions {
  return required(useContext(PlatformActionsContext), "usePlatformActions");
}
export function useOptionalPlatformActions(): PlatformActions | null {
  return useContext(PlatformActionsContext);
}
export function useAuraColors(): readonly [string, string] {
  const store = useContext(AuraStoreContext);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
export function useJournalEntries(): JournalEntry[] {
  return useContext(JournalContext);
}
export function useWatchlistGameIds(): string[] {
  return useContext(WatchlistContext);
}
export function useFollowAlerts(): Record<string, FollowAlerts> {
  return useContext(FollowAlertsContext);
}
export function useParlayState(): ParlayStateValue {
  return required(useContext(ParlayStateContext), "useParlayState");
}
export function useSocialState(): SocialStateValue {
  return required(useContext(SocialStateContext), "useSocialState");
}
export function useOverlayState(): OverlayStateValue {
  return required(useContext(OverlayStateContext), "useOverlayState");
}
export function useHomeNavFilter(): HomeNavFilterValue {
  return required(useContext(HomeNavFilterContext), "useHomeNavFilter");
}
export function useOptionalHomeNavFilter(): HomeNavFilterValue | null {
  return useContext(HomeNavFilterContext);
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
  viewerVia,
  paymentMode = "transfer",
  viewerIdentity: initialViewerIdentity = null,
  serverMonth1NoCardMode,
  initialWatchlistGameIds,
  initialShareTicket = null,
  initialCmdkOpen = false,
  onNavigate,
  onPrefetchRoute,
  onRequestFullShell,
  onSubmitPinOverride,
  onLogoutOverride,
  children,
}: {
  dataset: PlatformDataset;
  initialRole?: ViewerRole;
  allowRoleSimulation?: boolean;
  accountsEnabled?: boolean;
  viewerVia?: ViewerVia;
  paymentMode?: PaymentMode;
  viewerIdentity?: ViewerIdentity | null;
  /** Valor de la bandera en la base (cuando hay cuentas); manda sobre el navegador. */
  serverMonth1NoCardMode?: boolean;
  /** Partidos pre-cargados en vigilancia (pruebas y Storybook). */
  initialWatchlistGameIds?: readonly string[];
  /** Boleto inicial abierto en ShareTicketModal (pruebas y Storybook). */
  initialShareTicket?: ShareTicketPayload | null;
  /** Estado inicial de CommandPaletteModal (pruebas y Storybook). */
  initialCmdkOpen?: boolean;
  onNavigate?: (href: string) => void;
  onPrefetchRoute?: (href: string) => void;
  onRequestFullShell?: () => void;
  onSubmitPinOverride?: (code: string, nextPath: string) => Promise<PinUnlockResult>;
  onLogoutOverride?: () => Promise<void>;
  children: React.ReactNode;
}): React.JSX.Element {
  const [viewerRole, setViewerRoleState] = useState<ViewerRole>(initialRole);
  const [viewerIdentity, setViewerIdentity] = useState(initialViewerIdentity);
  // Marca de hidratación: las pruebas de navegador esperan a que React tenga los controles
  // conectados antes de hacer clic (un clic sobre el HTML del servidor se pierde).
  useEffect(() => {
    document.documentElement.dataset.plHydrated = "1";
  }, []);
  const effectiveViewerVia: ViewerVia = viewerVia ?? (viewerIdentity ? "account" : "none");
  const hasAccountSession = Boolean(viewerIdentity);
  const hasAccountSessionAuth = Boolean(accountsEnabled && effectiveViewerVia === "account");
  const upgradeHref = hasAccountSession ? "/app/account?tab=plan" : "/signup";
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
  const [watchlistGameIds, setWatchlistGameIds] = useState<string[]>(() =>
    initialWatchlistGameIds ? [...initialWatchlistGameIds] : [],
  );
  const [followAlerts, setFollowAlertsState] = useState<Record<string, FollowAlerts>>({});
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
  const [preferredBooks, setPreferredBooksState] = useState<string[]>(() => [
    ...DEFAULT_PREFERRED_BOOKS,
  ]);
  const [savedScreenerViews, setSavedScreenerViewsState] = useState<SavedScreenerView[]>([]);
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
    !hasAccountSessionAuth,
  );
  const [month1NoCardMode, setMonth1NoCardMode] = useState<boolean>(serverMonth1NoCardMode ?? true);
  const [tipsterWeeklyPickOrigin, setTipsterWeeklyPickOrigin] = useState<
    "spacetime" | "bitacora"
  >("spacetime");
  const [selectedTipsterPickId, setSelectedTipsterPickId] = useState<string>(
    rawDataset.tipsterWeeklyPickId || rawDataset.dailyPromoPickId,
  );

  const [composerPick, setComposerPick] = useState<MatchPick | null>(null);
  const [shareTicket, setShareTicket] = useState<ShareTicketPayload | null>(initialShareTicket);
  const [cmdkOpen, setCmdkOpen] = useState<boolean>(initialCmdkOpen);
  const [betaPinOpen, setBetaPinOpen] = useState<boolean>(false);
  const [betaPinNextPath, setBetaPinNextPath] = useState<string>("/app");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [homeSport, setHomeSportState] = useState<SportFilter>("all");
  const [hasExplicitHomeSport, setHasExplicitHomeSport] = useState<boolean>(false);
  const [homeLeague, setHomeLeagueState] = useState<LeagueFilter>("all");
  const [homeChosenDay, setHomeChosenDayState] = useState<DaySelection | null>(null);
  const [homeTodayOverride, setHomeTodayOverride] = useState<string | null>(null);

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

  const [auraStore] = useState(() => createAuraStore(resolveColorsForGame(defaultGame)));

  const setAuraFromGame = useCallback(
    (game: PlatformGame | undefined) => {
      auraStore.set(resolveColorsForGame(game));
    },
    [auraStore, resolveColorsForGame],
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
        try {
          const knownLeagueIds = new Set<string>([
            "liga-mx",
            "nfl",
            "nba",
            "nhl",
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
        } catch (err) {
          void err;
        }
      }
      const storedPrefs = readStoredPrefs();
      setUserTimezoneState(storedPrefs.timezone);
      setShowMxnBalanceState(storedPrefs.showMxnBalance);
      setUnitMxnState(storedPrefs.unitMxn);
      setPreferredBooksState(sanitizePreferredBooks(storedPrefs.preferredBooks));
      setSavedScreenerViewsState(readSavedScreenerViews());
      const savedNoCard = window.localStorage.getItem("pl-month1-nocard");
      if (serverMonth1NoCardMode === undefined && savedNoCard === "0") {
        setMonth1NoCardMode(false);
      }
      if (allowRoleSimulation) {
        const savedRole = window.localStorage.getItem("pl-sim-role");
        if (
          savedRole === "visitor" ||
          savedRole === "member" ||
          savedRole === "tipster" ||
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
    try {
      const rawAlerts = window.localStorage.getItem(STORAGE_KEYS.followAlerts);
      const parsedAlerts = rawAlerts ? (JSON.parse(rawAlerts) as unknown) : null;
      if (parsedAlerts && typeof parsedAlerts === "object") {
        setFollowAlertsState(sanitizeFollowAlerts(parsedAlerts as Record<string, unknown>));
      }
    } catch (err) {
      void err;
    }
    const ownPosts = readStoredArray<SocialPost>(STORAGE_KEYS.ownPosts, isOwnSocialPost);
    if (ownPosts.length > 0) {
      setSocialPosts((prev) => [...ownPosts, ...prev.filter((p) => !ownPosts.some((o) => o.id === p.id))]);
    }
    setUserDataLoaded(true);
  }, []);

  // Con cuenta y sesión, la base es la fuente de verdad de vigilancia y bitácora.
  useEffect(() => {
    if (!hasAccountSessionAuth) {
      setMemberReferralsLoaded(true);
      return;
    }
    let active = true;
    setMemberReferralsLoaded(false);
    void (async () => {
      const watch = await getJson<{ gameIds?: string[]; follows?: { gameId: string; alerts: FollowAlerts }[] }>(
        "/api/me/watchlist",
      );
      if (active && watch?.gameIds) setWatchlistGameIds(watch.gameIds);
      if (active && Array.isArray(watch?.follows)) {
        setFollowAlertsState(
          sanitizeFollowAlerts(Object.fromEntries(watch.follows.map((f) => [f.gameId, f.alerts]))),
        );
      }
      const journalRes = await getJson<{ entries?: ServerJournalRow[] }>("/api/me/journal");
      if (active && journalRes?.entries) setJournal(journalRes.entries.map(fromServerRow));
      const prefsRes = await getJson<{
        preferences?: { preferredBooks?: string[]; savedViews?: unknown };
      }>("/api/me/preferences");
      if (active && Array.isArray(prefsRes?.preferences?.preferredBooks)) {
        const syncedBooks = sanitizePreferredBooks(prefsRes.preferences.preferredBooks);
        setPreferredBooksState(syncedBooks);
        writeStoredPrefs({ ...readStoredPrefs(), preferredBooks: syncedBooks });
      }
      if (active && Array.isArray(prefsRes?.preferences?.savedViews)) {
        const syncedViews = sanitizeSavedScreenerViews(prefsRes.preferences.savedViews);
        setSavedScreenerViewsState(syncedViews);
        writeSavedScreenerViews(syncedViews);
      }
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
          isTipster: Boolean(refs.isTipster),
        });
      }
      if (active) setMemberReferralsLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [hasAccountSessionAuth]);
  useEffect(() => {
    if (userDataLoaded) writeStored(STORAGE_KEYS.journal, journal.slice(0, 500));
  }, [journal, userDataLoaded]);
  useEffect(() => {
    if (userDataLoaded) writeStored(STORAGE_KEYS.watchlist, watchlistGameIds);
  }, [watchlistGameIds, userDataLoaded]);
  useEffect(() => {
    if (!userDataLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.followAlerts, JSON.stringify(followAlerts));
    } catch (err) {
      void err;
    }
  }, [followAlerts, userDataLoaded]);
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

  const lastToastRef = useRef<{ text: string; tone: string; at: number }>({
    text: "",
    tone: "",
    at: 0,
  });

  const toastTimersRef = useRef<
    Map<string, { timerId: number | null; remainingMs: number; startedAt: number }>
  >(new Map());

  const dismissToast = useCallback((id: string) => {
    const entry = toastTimersRef.current.get(id);
    if (entry?.timerId !== null && entry?.timerId !== undefined) {
      window.clearTimeout(entry.timerId);
    }
    toastTimersRef.current.delete(id);
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const setToastPaused = useCallback((id: string, paused: boolean) => {
    const entry = toastTimersRef.current.get(id);
    if (!entry) return;
    if (paused) {
      if (entry.timerId !== null) {
        window.clearTimeout(entry.timerId);
        const elapsed = Date.now() - entry.startedAt;
        entry.remainingMs = Math.max(800, entry.remainingMs - elapsed);
        entry.timerId = null;
      }
      return;
    }
    if (entry.timerId === null) {
      entry.startedAt = Date.now();
      entry.timerId = window.setTimeout(() => {
        toastTimersRef.current.delete(id);
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, entry.remainingMs);
    }
  }, []);

  const pushToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "default", options?: ToastOptions) => {
      const now = Date.now();
      if (
        !options?.actionLabel &&
        lastToastRef.current.text === text &&
        lastToastRef.current.tone === tone &&
        now - lastToastRef.current.at < 200
      ) {
        return;
      }
      lastToastRef.current = { text, tone, at: now };
      const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
      const durationMs = options?.durationMs ?? (options?.actionLabel ? 5000 : 3600);
      setToasts((prev) => [
        ...prev.slice(-3),
        {
          id,
          tone,
          text,
          ...(options?.actionLabel ? { actionLabel: options.actionLabel } : {}),
          ...(options?.onAction ? { onAction: options.onAction } : {}),
        },
      ]);
      const timerId = window.setTimeout(() => {
        toastTimersRef.current.delete(id);
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, durationMs);
      toastTimersRef.current.set(id, { timerId, remainingMs: durationMs, startedAt: now });
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

  const setFavoriteLeagues = useCallback(
    (leagues: LeagueId[]) => {
      const prevLeagues = favoriteLeagues;
      setFavoriteLeaguesState(leagues);
      try {
        window.localStorage.setItem("pl-fav-leagues", JSON.stringify(leagues));
      } catch (err) {
        void err;
      }
      if (leagues.length < prevLeagues.length) {
        pushToast("Liga quitada de tus favoritas.", "default", {
          actionLabel: "Deshacer",
          onAction: () => {
            setFavoriteLeaguesState(prevLeagues);
            try {
              window.localStorage.setItem("pl-fav-leagues", JSON.stringify(prevLeagues));
            } catch (err) {
              void err;
            }
          },
        });
      }
    },
    [favoriteLeagues, pushToast],
  );

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

  const setPreferredBooks = useCallback((books: string[]) => {
    const clean = sanitizePreferredBooks(books);
    setPreferredBooksState(clean);
    writeStoredPrefs({ ...readStoredPrefs(), preferredBooks: clean });
  }, []);

  const setSavedScreenerViews = useCallback(
    (views: SavedScreenerView[]) => {
      const clean = sanitizeSavedScreenerViews(views);
      setSavedScreenerViewsState(clean);
      writeSavedScreenerViews(clean);
      if (hasAccountSessionAuth) {
        void fetch("/api/me/preferences", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ savedViews: clean }),
        }).catch((err) => {
          void err;
        });
      }
    },
    [hasAccountSessionAuth],
  );

  const handleSetMonth1NoCard = useCallback(
    (v: boolean) => {
      setMonth1NoCardMode(v);
      if (hasAccountSessionAuth) {
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
    [pushToast, hasAccountSessionAuth],
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
          ...(g.parlayCandidates
            ? { parlayCandidates: g.parlayCandidates.map((p) => ({ ...p, kickoffLocal: ko })) }
            : {}),
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
      if (parlayLegs.some((l) => l.pick.id === pick.id)) {
        pushToast("Esa selección ya está en tu parlay.", "warning");
        return false;
      }
      if (parlayLegs.length >= MAX_PARLAY_LEGS) {
        pushToast(`El parlay admite máximo ${MAX_PARLAY_LEGS} selecciones.`, "warning");
        return false;
      }
      const check = checkParlayCompatibility(parlayLegs, pick, allowSgp);
      if (!check.allowed) {
        pushToast(check.reason ?? "Selección no compatible.", "warning");
        return false;
      }
      setParlayLegs((prev) => [...prev, { pick }]);
      triggerHaptic(8);
      pushToast(`Agregado al Parlay: ${pick.label}`, "success");
      return true;
    },
    [parlayLegs, allowSgp, pushToast],
  );

  const removePickFromParlay = useCallback(
    (pickId: string) => {
      const idx = parlayLegs.findIndex((l) => l.pick.id === pickId);
      if (idx === -1) return;
      const removed = parlayLegs[idx]!;
      setParlayLegs((prev) => prev.filter((l) => l.pick.id !== pickId));
      triggerHaptic(6);
      pushToast(`Quitaste «${removed.pick.label}» del parlay.`, "default", {
        actionLabel: "Deshacer",
        onAction: () => {
          setParlayLegs((prev) => {
            if (prev.length >= MAX_PARLAY_LEGS || prev.some((l) => l.pick.id === removed.pick.id)) {
              return prev;
            }
            const copy = [...prev];
            copy.splice(Math.min(idx, copy.length), 0, removed);
            return copy;
          });
        },
      });
    },
    [parlayLegs, pushToast],
  );

  const clearParlay = useCallback(() => {
    if (parlayLegs.length === 0) return;
    const snapshot = [...parlayLegs];
    setParlayLegs([]);
    triggerHaptic(8);
    pushToast(
      `Boleto vaciado (${snapshot.length} ${snapshot.length === 1 ? "selección" : "selecciones"}).`,
      "default",
      {
        actionLabel: "Deshacer",
        onAction: () => {
          setParlayLegs(snapshot.slice(0, MAX_PARLAY_LEGS));
        },
      },
    );
  }, [parlayLegs, pushToast]);

  const generateAutoParlay = useCallback(
    (opts: {
      leagues: readonly LeagueId[];
      risk: RiskBand;
      legCount: number;
      allowSgp: boolean;
      games?: readonly PlatformGame[];
    }): number => {
      setAllowSgp(opts.allowSgp);
      const { games, ...rest } = opts;
      const clampedLegCount = Math.max(2, Math.min(MAX_PARLAY_LEGS, rest.legCount));
      const built = buildSmartAutoParlay(games ?? dataset.games, {
        ...rest,
        legCount: clampedLegCount,
        viewerRole,
      }).slice(0, MAX_PARLAY_LEGS);
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

  const loadParlayPicks = useCallback(
    (
      picks: readonly MatchPick[],
      options?: { allowSgp?: boolean; label?: string },
    ): number => {
      const nextAllowSgp = options?.allowSgp ?? false;
      const accepted: ParlayLeg[] = [];
      let truncatedByCap = false;
      for (const pick of picks) {
        if (accepted.length >= MAX_PARLAY_LEGS) {
          truncatedByCap = true;
          break;
        }
        if (checkParlayCompatibility(accepted, pick, nextAllowSgp).allowed) {
          accepted.push({ pick });
        }
      }
      if (accepted.length > 0) {
        const replaced = parlayLegs.length > 0;
        setAllowSgp(nextAllowSgp);
        setParlayLegs(accepted);
        const skipped = picks.length - accepted.length;
        const skippedNote = truncatedByCap
          ? ` (máximo ${MAX_PARLAY_LEGS} selecciones por parlay)`
          : skipped > 0
            ? ` (${skipped} ya no se podían agregar)`
            : "";
        pushToast(
          `${options?.label ?? "Parlay"} cargado con ${accepted.length} ${accepted.length === 1 ? "selección" : "selecciones"}` +
            skippedNote +
            (replaced ? ". Reemplazó tu boleto anterior." : "."),
          "success",
        );
      } else {
        pushToast(
          "No hay selecciones compatibles disponibles para cargar al boleto.",
          "warning",
        );
      }
      return accepted.length;
    },
    [parlayLegs.length, pushToast],
  );

  const sealPickToJournal = useCallback(
    (pick: MatchPick, units: number, userDecimal: number, note?: string) => {
      const pFair = 1 / Math.max(1.04, pick.fairDecimal);
      const pUser = 1 / Math.max(1.04, userDecimal);
      const clvPct = Math.round((pFair - pUser) * 1000) / 10;
      const linkedGame = dataset.games.find((g) => g.id === pick.gameId);
      const normalizedPickLabel = normalizePickLabelWithUnit({
        pickLabel: pick.label,
        market: pick.market,
        leagueLabel: pick.leagueLabel,
        sport: linkedGame?.sport ?? null,
      });
      const entry: JournalEntry = {
        id: `j-${Date.now()}`,
        pickId: pick.id,
        gameId: pick.gameId,
        leagueLabel: pick.leagueLabel,
        matchLabel: pick.matchLabel,
        pickLabel: normalizedPickLabel,
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
        note: sanitizeJournalDisplayNote(note) ?? undefined,
      };
      setJournal((prev) => [entry, ...prev]);
      setComposerPick(null);
      triggerHaptic(10);
      pushToast(`Pick registrado en tu bitácora (${entry.units}u).`, "success");
      if (hasAccountSessionAuth && entry.status === "pending") {
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
    [dataset.games, pushToast, hasAccountSessionAuth],
  );

  const sealParlayToJournal = useCallback(
    (note?: string, userDecimalOverride?: number | null) => {
      if (parlaySummary.legs.length < 2) {
        pushToast("Agrega al menos 2 selecciones para sellar un Parlay.", "warning");
        return;
      }
      if (parlaySummary.legs.length > MAX_PARLAY_LEGS) {
        pushToast(
          `Un parlay admite máximo ${MAX_PARLAY_LEGS} selecciones. Quita alguna antes de sellar.`,
          "warning",
        );
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
      const rawPickIds = parlaySummary.legs.map((l) => l.pick.id).sort();
      const canonicalPickId = `parlay:${rawPickIds.join("+")}`;
      const normalizedLegs = parlaySummary.legs.map((l) => {
        const game = gamesById.get(l.pick.gameId);
        const shortMatchLabel = game
          ? `${game.home.shortName} vs ${game.away.shortName}`
          : l.pick.matchLabel;
        const normalizedPickLabel = normalizePickLabelWithUnit({
          pickLabel: l.pick.label,
          market: l.pick.market,
          leagueLabel: l.pick.leagueLabel,
          sport: game?.sport ?? null,
        });
        return {
          pick: l.pick,
          sport: game?.sport ?? null,
          shortMatchLabel,
          normalizedPickLabel,
        };
      });
      const uniqueLeagues = new Set(
        normalizedLegs.map((l) => l.pick.leagueLabel.trim()).filter(Boolean),
      );
      const cleanNote = sanitizeJournalDisplayNote(note) ?? undefined;
      const resolvedUserDecimal =
        typeof userDecimalOverride === "number" &&
        Number.isFinite(userDecimalOverride) &&
        userDecimalOverride > 1.01
          ? userDecimalOverride
          : parlaySummary.bookDecimal;
      const resolvedClvPct =
        Number.isFinite(parlaySummary.fairDecimal) &&
        parlaySummary.fairDecimal > 1 &&
        Number.isFinite(resolvedUserDecimal) &&
        resolvedUserDecimal > 1
          ? Math.round((1 / parlaySummary.fairDecimal - 1 / resolvedUserDecimal) * 1000) / 10
          : parlaySummary.edgePts;
      const entry: JournalEntry = {
        id: `j-parlay-${Date.now()}`,
        pickId: canonicalPickId,
        gameId: earliestGameId,
        leagueLabel:
          uniqueLeagues.size === 1
            ? (Array.from(uniqueLeagues)[0] ?? "Combinada Multi-Liga")
            : "Combinada Multi-Liga",
        matchLabel: buildParlayMatchSummary(
          normalizedLegs.map((l) => ({
            matchLabel: l.pick.matchLabel,
            shortMatchLabel: l.shortMatchLabel,
          })),
          parlaySummary.hasSgpCorrelation,
        ),
        pickLabel: buildParlayPickSummary(
          normalizedLegs.map((l) => ({
            matchLabel: l.pick.matchLabel,
            shortMatchLabel: l.shortMatchLabel,
            pickLabel: l.normalizedPickLabel,
            market: l.pick.market,
            leagueLabel: l.pick.leagueLabel,
            sport: l.sport,
          })),
        ),
        origin: "Parlay Combinado",
        units: Math.max(0.25, Math.min(5, parlaySummary.stakeUnits)),
        userDecimal: resolvedUserDecimal,
        fairDecimal: parlaySummary.fairDecimal,
        clvPct: resolvedClvPct,
        status: "pending",
        pickKind: "parlay",
        parlayLegs: normalizedLegs.map((l) => ({
          pickId: l.pick.id,
          gameId: l.pick.gameId,
          leagueLabel: l.pick.leagueLabel,
          matchLabel: l.pick.matchLabel,
          pickLabel: l.normalizedPickLabel,
          market: l.pick.market,
          selection: l.pick.selectionKey,
          line: l.pick.line ?? null,
          p: l.pick.p,
          fairDecimal: l.pick.fairDecimal,
        })),
        sealedAt: "Sellado ahora",
        sealedAtIso: new Date().toISOString(),
        note: cleanNote,
      };
      setJournal((prev) => [entry, ...prev]);
      triggerHaptic(10);
      pushToast(
        `Boleto combinado de ${parlaySummary.legs.length} selecciones sellado en Bitácora.`,
        "success",
      );
      if (hasAccountSessionAuth) {
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
    [parlaySummary, dataset.games, hasAccountSessionAuth, pushToast],
  );

  const exportJournalCsv = useCallback((): string => {
    const header =
      "Fecha,Liga,Partido,Seleccion,Origen,Unidades,CuotaUsuario,CuotaJusta,Ventaja_Pts,Estado";
    const lines = journal.map((j) => {
      const clvCell =
        typeof j.clvPct === "number" &&
        Number.isFinite(j.clvPct) &&
        j.clvPct <= MAX_EXPORT_CLV_PCT &&
        j.clvPct >= MIN_EXPORT_CLV_PCT
          ? j.clvPct.toFixed(1)
          : "";
      return [
        `"${sanitizeCsvCell(j.sealedAt)}"`,
        `"${sanitizeCsvCell(j.leagueLabel)}"`,
        `"${sanitizeCsvCell(j.matchLabel)}"`,
        `"${sanitizeCsvCell(j.pickLabel)}"`,
        `"${sanitizeCsvCell(j.origin)}"`,
        j.units.toFixed(2),
        j.userDecimal.toFixed(2),
        j.fairDecimal.toFixed(2),
        clvCell,
        `"${sanitizeCsvCell(j.status)}"`,
      ].join(",");
    });
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
      gameId?: string;
      matchLabel: string;
      pickBadge: string;
      originType: "Spacetime Suite" | "Bitácora Propia";
      body: string;
      pick?: { matchPick: MatchPick; units: number; userDecimal: number; sealedEntryId?: string };
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
      const resolvedGameId = payload.pick?.matchPick.gameId ?? payload.gameId;
      const existingSealed = payload.pick
        ? journal.find(
            (j) =>
              (payload.pick?.sealedEntryId ? j.id === payload.pick.sealedEntryId : j.pickId === payload.pick?.matchPick.id),
          )
        : undefined;
      const existingUuid = existingSealed && /^[0-9a-f-]{36}$/i.test(existingSealed.id) ? existingSealed.id : undefined;

      const newPost: SocialPost = {
        id: `sp-${Date.now()}`,
        authorHandle: myHandle,
        authorName:
          viewerIdentity?.displayName ?? (viewerRole === "tipster" ? "Sofía Méndez" : "Socio PitchLab"),
        authorAvatarUrl: viewerRole === "tipster" ? null : (viewerIdentity?.avatarUrl ?? null),
        authorIsTipster: viewerRole === "tipster",
        roleBadge:
          viewerRole === "tipster" ? "Tipster Oficial" : "Socio Pase PitchLab Ultra",
        avatarGradVar:
          viewerRole === "tipster" ? "var(--avatar-grad-1)" : "var(--avatar-grad-4)",
        verifiedRecord:
          viewerRole === "tipster" ? "+18.4u · 142 picks" : journalRecord(journal).label,
        clvBadge:
          viewerRole === "tipster"
            ? "Ventaja +4.2 %"
            : formatClvBadge(journalRecord(journal).avgClvPct),
        // Publicar como tipster usa el perfil de ejemplo @sofia_nfl.
        isExample: viewerRole === "tipster",
        leagueLabel: payload.leagueLabel,
        gameId: resolvedGameId,
        matchLabel: payload.matchLabel,
        pickBadge: payload.pickBadge,
        originType: payload.originType,
        createdAt: "Ahora mismo",
        body: trimmed,
        likes: 0,
        likedByMe: false,
        comments: [],
        commentsCount: 0,
        copiesCount: 0,
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
                existingSealed?.status === "won"
                  ? "won"
                  : existingSealed?.status === "lost"
                    ? "lost"
                    : payload.pick.matchPick.gameStatus === "FT"
                      ? payload.pick.matchPick.result === "miss"
                        ? "lost"
                        : "won"
                      : "open",
            }
          : undefined,
      };

      // Preparamos el registro en bitácora si aún no existe para ligar su UUID en la publicación.
      let sealedEntryToSync: JournalEntry | null = null;
      if (payload.pick && !payload.pick.sealedEntryId && !existingSealed) {
        const mp = payload.pick.matchPick;
        const pFair = 1 / Math.max(1.04, mp.fairDecimal);
        const pUser = 1 / Math.max(1.04, payload.pick.userDecimal);
        const clvPct = Math.round((pFair - pUser) * 1000) / 10;
        const linkedSocialGame = rawDataset.games.find((g) => g.id === mp.gameId);
        const normalizedSocialPickLabel = normalizePickLabelWithUnit({
          pickLabel: mp.label,
          market: mp.market,
          leagueLabel: mp.leagueLabel,
          sport: linkedSocialGame?.sport ?? null,
        });
        sealedEntryToSync = {
          id: `j-${Date.now()}`,
          pickId: mp.id,
          gameId: mp.gameId,
          leagueLabel: mp.leagueLabel,
          matchLabel: mp.matchLabel,
          pickLabel: normalizedSocialPickLabel,
          origin: payload.originType === "Spacetime Suite" ? "Spacetime Suite" : "Propio",
          units: Math.max(0.25, Math.min(5, payload.pick.units)),
          userDecimal: payload.pick.userDecimal,
          fairDecimal: mp.fairDecimal,
          clvPct,
          status:
            mp.gameStatus === "FT" ? (mp.result === "miss" ? "lost" : "won") : "pending",
          sealedAt: "Sellado ahora",
          sealedAtIso: new Date().toISOString(),
        };
        setJournal((prev) => [sealedEntryToSync!, ...prev]);
        setComposerPick(null);
      }

      if (socialOnServer && !newPost.isExample) {
        // Se ve al instante; el servidor la confirma (o la quita con su motivo).
        const tempId = `tmp-${Date.now()}`;
        setSocialPosts((prev) => [{ ...newPost, id: tempId, isMine: true }, ...prev]);
        void (async () => {
          let resolvedSealedId = payload.pick?.sealedEntryId ?? existingUuid;
          if (!resolvedSealedId && sealedEntryToSync && hasAccountSessionAuth && sealedEntryToSync.status === "pending") {
            const sealRes = await sealOnServer(sealedEntryToSync);
            if (sealRes.ok && sealRes.id) {
              resolvedSealedId = sealRes.id;
              setJournal((prev) =>
                prev.map((j) => (j.id === sealedEntryToSync!.id ? { ...j, id: sealRes.id! } : j)),
              );
            } else if (sealRes.reason && sealRes.reason !== "sin_sesion") {
              setJournal((prev) => prev.filter((j) => j.id !== sealedEntryToSync!.id));
            }
          }
          const res = await postJson("/api/social/posts", {
            body: trimmed,
            leagueLabel: payload.leagueLabel,
            gameId: resolvedGameId,
            matchLabel: payload.matchLabel,
            pickBadge: payload.pickBadge,
            originType: payload.originType,
            sealedJournalEntryId: resolvedSealedId,
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
            pushToast("Publicado en Comunidad.", "success");
          } else {
            setSocialPosts((prev) => prev.filter((p) => p.id !== tempId));
            pushToast(data?.error ?? "No pudimos publicar. Revisa tu conexión.", "danger");
          }
        })();
        return { ok: true };
      }

      setSocialPosts((prev) => [newPost, ...prev]);
      pushToast("Publicado en Comunidad.", "success");
      return { ok: true };
    },
    [viewerRole, viewerIdentity, pushToast, journal, socialPosts, socialOnServer, hasAccountSessionAuth, rawDataset.games],
  );

  const addSocialComment = useCallback(
    (
      postId: string,
      body: string,
      parentCommentId?: string | null,
    ): { ok: boolean; error?: string; pending?: boolean } => {
      if (viewerRole === "visitor") {
        return { ok: false, error: "Activa Pase PitchLab Ultra para comentar." };
      }
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: "Escribe un comentario." };
      }
      if (trimmed.length > 400) {
        return { ok: false, error: "Máximo 400 caracteres." };
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
      const cleanParentArg = typeof parentCommentId === "string" && parentCommentId.trim() ? parentCommentId.trim() : null;
      const clickedParent = cleanParentArg ? target?.comments.find((c) => c.id === cleanParentArg) : undefined;
      if (clickedParent?.pending) {
        return { ok: false, error: "Espera a que se guarde ese comentario antes de responderle." };
      }
      const resolvedParentId = clickedParent ? clickedParent.id : null;
      const replyToHandle = clickedParent ? clickedParent.authorHandle : null;
      const needsServerSync = Boolean(socialOnServer && target?.fromServer);
      const tempId = `${needsServerSync ? "pending" : "local"}-sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      setSocialPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                commentsCount: (post.commentsCount ?? post.comments.length) + 1,
                comments: [
                  ...post.comments,
                  {
                    id: tempId,
                    parentCommentId: resolvedParentId,
                    replyToHandle,
                    authorHandle: ownHandleFor(viewerIdentity, viewerRole),
                    authorName:
                      viewerIdentity?.displayName ??
                      (viewerRole === "tipster" ? "Sofía Méndez" : "Socio Pase PitchLab Ultra"),
                    authorAvatarUrl: viewerRole === "tipster" ? null : (viewerIdentity?.avatarUrl ?? null),
                    verifiedBadge:
                      viewerRole === "tipster"
                        ? "Perfil de ejemplo"
                        : journalRecord(journal).label,
                    createdAt: "Ahora",
                    body: trimmed,
                    fromServer: needsServerSync,
                    pending: needsServerSync,
                    isMine: true,
                    helpfulCount: 0,
                    helpfulByMe: false,
                  },
                ],
              }
            : post,
        ),
      );

      if (needsServerSync) {
        void (async () => {
          const res = await postJson(`/api/social/posts/${postId}/comments`, {
            body: trimmed,
            ...(resolvedParentId ? { parentCommentId: resolvedParentId } : {}),
          });
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
            pushToast("Respuesta agregada al hilo.", "success");
          } else {
            setSocialPosts((prev) =>
              prev.map((p) =>
                p.id === postId
                  ? {
                      ...p,
                      commentsCount: Math.max(0, (p.commentsCount ?? p.comments.length) - 1),
                      comments: p.comments.filter((c) => c.id !== tempId),
                    }
                  : p,
              ),
            );
            pushToast(data?.error ?? "No pudimos guardar tu comentario.", "danger");
          }
        })();
        return { ok: true, pending: true };
      }

      pushToast("Respuesta agregada al hilo.", "success");
      return { ok: true };
    },
    [viewerRole, viewerIdentity, pushToast, journal, socialPosts, socialOnServer],
  );

  const deleteSocialComment = useCallback(
    (postId: string, commentId: string) => {
      const targetPost = socialPosts.find((p) => p.id === postId);
      const targetComment = targetPost?.comments.find((c) => c.id === commentId);
      if (!targetPost || !targetComment || !targetComment.isMine || targetComment.pending) return;

      const snapshotComments = targetPost.comments;
      const snapshotCount = targetPost.commentsCount ?? targetPost.comments.length;

      setSocialPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                commentsCount: Math.max(0, (p.commentsCount ?? p.comments.length) - 1),
                comments: reparentDeletedComment(p.comments, commentId),
              }
            : p,
        ),
      );

      if (!socialOnServer || !targetComment.fromServer) {
        pushToast("Comentario borrado.", "default");
        return;
      }

      void (async () => {
        try {
          const res = await fetch(`/api/social/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
            method: "DELETE",
            credentials: "same-origin",
          });
          if (!res.ok) throw new Error(String(res.status));
          pushToast("Comentario borrado.", "default");
        } catch (err) {
          void err;
          setSocialPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, comments: snapshotComments, commentsCount: snapshotCount } : p)),
          );
          pushToast("No pudimos borrar tu comentario.", "danger");
        }
      })();
    },
    [socialPosts, socialOnServer, pushToast],
  );

  const toggleSocialCommentHelpful = useCallback(
    (postId: string, commentId: string) => {
      if (viewerRole === "visitor") return;
      const targetPost = socialPosts.find((p) => p.id === postId);
      const targetComment = targetPost?.comments.find((c) => c.id === commentId);
      if (!targetPost || !targetComment || targetComment.pending) return;

      const nextHelpful = !targetComment.helpfulByMe;
      const prevCount = targetComment.helpfulCount ?? 0;
      const nextCount = nextHelpful ? prevCount + 1 : Math.max(0, prevCount - 1);

      setSocialPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                comments: p.comments.map((c) =>
                  c.id === commentId ? { ...c, helpfulByMe: nextHelpful, helpfulCount: nextCount } : c,
                ),
              }
            : p,
        ),
      );

      if (!socialOnServer || !targetComment.fromServer) return;
      void (async () => {
        try {
          const res = await fetch(
            `/api/social/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
            {
              method: "PUT",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ helpful: nextHelpful }),
            },
          );
          const data = (await res.json().catch(() => null)) as { helpfulCount?: number; helpfulByMe?: boolean } | null;
          if (!res.ok || typeof data?.helpfulCount !== "number") throw new Error(String(res.status));
          setSocialPosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    comments: p.comments.map((c) =>
                      c.id === commentId
                        ? { ...c, helpfulCount: data.helpfulCount, helpfulByMe: Boolean(data.helpfulByMe) }
                        : c,
                    ),
                  }
                : p,
            ),
          );
        } catch (err) {
          void err;
          setSocialPosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    comments: p.comments.map((c) =>
                      c.id === commentId
                        ? { ...c, helpfulCount: prevCount, helpfulByMe: Boolean(targetComment.helpfulByMe) }
                        : c,
                    ),
                  }
                : p,
            ),
          );
        }
      })();
    },
    [viewerRole, socialPosts, socialOnServer],
  );

  const loadAllPostComments = useCallback(
    async (postId: string): Promise<void> => {
      if (!hasAccountSessionAuth || !postId) return;
      const data = await getJson<{ comments?: ServerSocialComment[]; commentsCount?: number }>(
        `/api/social/posts/${encodeURIComponent(postId)}/comments?limit=200`,
      );
      if (!data?.comments) return;
      const now = new Date();
      const mapped = data.comments.map((c) => fromServerComment(c, now));
      const total = typeof data.commentsCount === "number" ? Math.max(data.commentsCount, mapped.length) : mapped.length;
      setSocialPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments: mapped, commentsCount: total } : p)),
      );
    },
    [hasAccountSessionAuth],
  );

  const recordSocialPostCopy = useCallback(
    (postId: string) => {
      const target = socialPosts.find((p) => p.id === postId);
      if (!target || target.isMine || isPendingPost(target)) return;
      setSocialPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, copiesCount: (p.copiesCount ?? 0) + 1 } : p)),
      );
      if (!socialOnServer || !target.fromServer) return;
      void (async () => {
        const res = await postJson(`/api/social/posts/${encodeURIComponent(postId)}/copy`, {});
        const data = res
          ? ((await res.json().catch(() => null)) as { copiesCount?: number } | null)
          : null;
        if (res?.ok && typeof data?.copiesCount === "number") {
          setSocialPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, copiesCount: data.copiesCount } : p)),
          );
        }
      })();
    },
    [socialPosts, socialOnServer],
  );

  const toggleSocialLike = useCallback(
    (postId: string) => {
      const target = socialPosts.find((p) => p.id === postId);
      if (!target || isPendingPost(target)) return;
      const liked = !target.likedByMe;
      triggerHaptic(6);
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

  const buildFeedParams = useCallback((limit: number, scope?: SocialFeedScope, before?: string | null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set("before", before);
    if (scope?.following) params.set("following", "1");
    if (scope?.author) params.set("author", scope.author.trim().toLowerCase());
    if (scope?.gameId) params.set("gameId", scope.gameId.trim());
    if (scope?.leagueLabel && scope.leagueLabel !== "all") params.set("league", scope.leagueLabel);
    if (scope?.openPickOnly) params.set("openPick", "1");
    if (scope?.sort === "most_commented") params.set("sort", "most_commented");
    return params;
  }, []);

  const refreshSocialFeed = useCallback(
    (scope?: SocialFeedScope) => {
      if (!hasAccountSessionAuth) return;
      void (async () => {
        const params = buildFeedParams(50, scope);
        const data = await getJson<{ posts?: ServerSocialPost[] }>(`/api/social/posts?${params.toString()}`);
        if (!data?.posts) return;
        const now = new Date();
        const incoming = data.posts.map((p) => fromServerPost(p, rawDataset.games, now));
        const incomingOldest = data.posts.at(-1)?.createdAt ?? null;
        const key = socialScopeKey(scope);
        const prevPage = socialFeedPagesRef.current[key];
        const keepOlderCursor = Boolean(prevPage?.cursor && incomingOldest && prevPage.cursor < incomingOldest);
        updateFeedPage(
          key,
          keepOlderCursor
            ? { cursor: prevPage!.cursor, hasMore: prevPage!.hasMore, loading: false }
            : { cursor: incomingOldest, hasMore: data.posts.length >= 50, loading: false },
        );
        setSocialOnServer(true);
        const mergeMode = key === "feed" ? "feed" : "extra";
        setSocialPosts((prev) => mergeSocialPosts(prev, incoming, mergeMode));
      })();
    },
    [buildFeedParams, hasAccountSessionAuth, rawDataset.games, updateFeedPage],
  );

  const loadFollowingSocialPosts = useCallback(() => {
    if (!hasAccountSessionAuth) return;
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
  }, [hasAccountSessionAuth, rawDataset.games, updateFeedPage]);

  const loadSocialPostsByAuthor = useCallback(
    (handle: string) => {
      const clean = handle.trim().toLowerCase();
      if (!hasAccountSessionAuth || !clean) return;
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
    [hasAccountSessionAuth, rawDataset.games, updateFeedPage],
  );

  const loadMatchSocialPosts = useCallback(
    async (gameId: string): Promise<void> => {
      const clean = gameId.trim();
      if (!hasAccountSessionAuth || !clean) return;
      const data = await getJson<{ posts?: ServerSocialPost[] }>(
        `/api/social/posts?limit=30&gameId=${encodeURIComponent(clean)}`,
      );
      if (!data?.posts) return;
      const now = new Date();
      const incoming = data.posts.map((p) => fromServerPost(p, rawDataset.games, now));
      const incomingOldest = data.posts.at(-1)?.createdAt ?? null;
      const key = `game:${clean}`;
      const prevPage = socialFeedPagesRef.current[key];
      const keepOlderCursor = Boolean(prevPage?.cursor && incomingOldest && prevPage.cursor < incomingOldest);
      updateFeedPage(
        key,
        keepOlderCursor
          ? { cursor: prevPage!.cursor, hasMore: prevPage!.hasMore, loading: false }
          : { cursor: incomingOldest, hasMore: data.posts.length >= 30, loading: false },
      );
      setSocialOnServer(true);
      setSocialPosts((prev) => mergeSocialPosts(prev, incoming, "extra"));
    },
    [hasAccountSessionAuth, rawDataset.games, updateFeedPage],
  );

  const loadOlderSocialPosts = useCallback(
    async (scope?: SocialFeedScope): Promise<boolean> => {
      if (!hasAccountSessionAuth) return false;
      const key = socialScopeKey(scope);
      const current = socialFeedPagesRef.current[key];
      if (current?.loading || current?.hasMore === false) return false;

      let cursor = current?.cursor ?? null;
      if (!cursor) {
        const cleanAuthor = scope?.author?.trim().toLowerCase() ?? null;
        const cleanGame = scope?.gameId?.trim() ?? null;
        cursor = socialPosts.reduce<string | null>((oldest, p) => {
          if (!p.fromServer || p.isExample || !p.createdAtIso) return oldest;
          if (cleanAuthor && p.authorHandle.toLowerCase() !== cleanAuthor) return oldest;
          if (cleanGame && (p.pick?.gameId ?? p.gameId) !== cleanGame) return oldest;
          if (scope?.leagueLabel && scope.leagueLabel !== "all" && p.leagueLabel !== scope.leagueLabel) return oldest;
          return !oldest || p.createdAtIso < oldest ? p.createdAtIso : oldest;
        }, null);
      }
      if (!cursor) {
        updateFeedPage(key, { cursor: null, hasMore: false, loading: false });
        return false;
      }

      updateFeedPage(key, { cursor, hasMore: current?.hasMore ?? true, loading: true });
      const params = buildFeedParams(30, scope, cursor);

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
    [buildFeedParams, hasAccountSessionAuth, rawDataset.games, socialPosts, updateFeedPage],
  );

  const ensureSocialPostLoaded = useCallback(
    (postId: string) => {
      if (!hasAccountSessionAuth || !postId) return;
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
    [hasAccountSessionAuth, rawDataset.games, socialPosts],
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
    if (!hasAccountSessionAuth) return;
    refreshSocialFeed();
    const onVisible = (): void => {
      if (document.visibilityState === "visible") refreshSocialFeed();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [hasAccountSessionAuth, refreshSocialFeed]);

  const toggleWatchlistGame = useCallback(
    (gameId: string) => {
      const exists = watchlistGameIds.includes(gameId);
      triggerHaptic(8);
      setWatchlistGameIds((prev) =>
        prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId],
      );
      if (exists) {
        pushToast("Dejaste de seguir este partido.", "default", {
          actionLabel: "Deshacer",
          onAction: () => {
            setWatchlistGameIds((prev) => (prev.includes(gameId) ? prev : [...prev, gameId]));
            if (hasAccountSessionAuth) {
              void postJson("/api/me/watchlist", { gameId, watched: true });
            }
          },
        });
      } else {
        pushToast("Siguiendo: te avisamos del inicio, los goles y el final.", "default");
      }
      if (hasAccountSessionAuth) {
        void postJson("/api/me/watchlist", { gameId, watched: !exists }).then((res) => {
          if (!res || !res.ok) {
            // Rollback silencioso ante error de red (ADR-053 UI optimista)
            setWatchlistGameIds((prev) =>
              exists
                ? prev.includes(gameId)
                  ? prev
                  : [...prev, gameId]
                : prev.filter((id) => id !== gameId),
            );
          }
        });
      }
    },
    [watchlistGameIds, pushToast, hasAccountSessionAuth],
  );

  const setFollowAlerts = useCallback(
    (gameId: string, alerts: FollowAlerts) => {
      setFollowAlertsState((prev) => ({ ...prev, [gameId]: alerts }));
      setWatchlistGameIds((prev) => (prev.includes(gameId) ? prev : [...prev, gameId]));
      if (hasAccountSessionAuth) void postJson("/api/me/watchlist", { gameId, watched: true, alerts });
    },
    [hasAccountSessionAuth],
  );

  const simulateFriendFirstPayment = useCallback(() => {
    setReferralPaidFriends((prev) => {
      const next = prev + 1;
      pushToast(
        next === 5
          ? "¡Insignia Embajador desbloqueada! +7 días por tu amigo y +30 días extra acumulados."
          : "¡Referido verificado! Ambos recibieron +7 días gratis en su Pase PitchLab Ultra.",
        "success",
      );
      return next;
    });
  }, [pushToast]);

  const navigateTo = useCallback(
    (href: string) => {
      const safeHref = sanitizeInternalHref(href);
      if (!safeHref) return;
      if (onNavigate) {
        onNavigate(safeHref);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(safeHref);
      }
    },
    [onNavigate],
  );

  const prefetchRoute = useCallback(
    (href: string) => {
      const safeHref = sanitizeInternalHref(href);
      if (!safeHref) return;
      if (onPrefetchRoute) {
        onPrefetchRoute(safeHref);
      }
    },
    [onPrefetchRoute],
  );

  const requestFullShell = useCallback(() => {
    if (onRequestFullShell) {
      onRequestFullShell();
    }
  }, [onRequestFullShell]);

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
    if (hasAccountSessionAuth) {
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
  }, [hasAccountSessionAuth, navigateTo, onLogoutOverride]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      rawDataset,
      dataset,
      viewerRole,
      setViewerRole,
      allowRoleSimulation,
      accountsEnabled,
      viewerVia: effectiveViewerVia,
      paymentMode,
      viewerIdentity,
      hasAccountSession,
      hasAccountSessionAuth,
      upgradeHref,
      updateViewerIdentity,
      oddsFormat,
      setOddsFormat,
      auraColors: auraStore.get(),
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
      loadParlayPicks,
      journal,
      sealPickToJournal,
      sealParlayToJournal,
      exportJournalCsv,
      socialPosts,
      publishSocialPost,
      addSocialComment,
      deleteSocialComment,
      toggleSocialCommentHelpful,
      loadAllPostComments,
      recordSocialPostCopy,
      toggleSocialLike,
      deleteSocialPost,
      refreshSocialFeed,
      loadFollowingSocialPosts,
      loadSocialPostsByAuthor,
      loadMatchSocialPosts,
      loadOlderSocialPosts,
      socialFeedPages,
      ensureSocialPostLoaded,
      reportSocialContent,
      socialOnServer,
      blockedSpamAttempts,
      watchlistGameIds,
      toggleWatchlistGame,
      followAlerts,
      setFollowAlerts,
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
      preferredBooks,
      setPreferredBooks,
      savedScreenerViews,
      setSavedScreenerViews,
      referralPaidFriends,
      memberReferralsSnapshot,
      memberReferralsLoaded,
      simulateFriendFirstPayment,
      month1NoCardMode,
      setMonth1NoCardMode: handleSetMonth1NoCard,
      tipsterWeeklyPickOrigin,
      setTipsterWeeklyPickOrigin,
      selectedTipsterPickId,
      setSelectedTipsterPickId,
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
      dismissToast,
      setToastPaused,
      navigateTo,
      prefetchRoute,
      requestFullShell,
    }),
    [
      rawDataset,
      dataset,
      viewerRole,
      setViewerRole,
      allowRoleSimulation,
      accountsEnabled,
      effectiveViewerVia,
      paymentMode,
      viewerIdentity,
      hasAccountSession,
      hasAccountSessionAuth,
      upgradeHref,
      updateViewerIdentity,
      oddsFormat,
      setOddsFormat,
      auraStore,
      setAuraFromGame,
      parlayLegs,
      allowSgp,
      parlayStakeUnits,
      parlaySummary,
      addPickToParlay,
      removePickFromParlay,
      clearParlay,
      generateAutoParlay,
      loadParlayPicks,
      journal,
      sealPickToJournal,
      sealParlayToJournal,
      exportJournalCsv,
      socialPosts,
      publishSocialPost,
      addSocialComment,
      deleteSocialComment,
      toggleSocialCommentHelpful,
      loadAllPostComments,
      recordSocialPostCopy,
      toggleSocialLike,
      deleteSocialPost,
      refreshSocialFeed,
      loadFollowingSocialPosts,
      loadSocialPostsByAuthor,
      loadMatchSocialPosts,
      loadOlderSocialPosts,
      socialFeedPages,
      ensureSocialPostLoaded,
      reportSocialContent,
      socialOnServer,
      blockedSpamAttempts,
      watchlistGameIds,
      toggleWatchlistGame,
      followAlerts,
      setFollowAlerts,
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
      preferredBooks,
      setPreferredBooks,
      savedScreenerViews,
      setSavedScreenerViews,
      referralPaidFriends,
      memberReferralsSnapshot,
      memberReferralsLoaded,
      simulateFriendFirstPayment,
      month1NoCardMode,
      handleSetMonth1NoCard,
      tipsterWeeklyPickOrigin,
      selectedTipsterPickId,
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
      dismissToast,
      setToastPaused,
      navigateTo,
      prefetchRoute,
      requestFullShell,
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
      viewerVia: effectiveViewerVia,
      paymentMode,
      viewerIdentity,
      hasAccountSession,
      hasAccountSessionAuth,
      upgradeHref,
      oddsFormat,
      favoriteLeagues,
      riskPreference,
      userTimezone,
      showMxnBalance,
      unitMxn,
      preferredBooks,
      savedScreenerViews,
      month1NoCardMode,
      referralPaidFriends,
      memberReferralsSnapshot,
      tipsterWeeklyPickOrigin,
      selectedTipsterPickId,
    }),
    [
      rawDataset,
      dataset,
      viewerRole,
      allowRoleSimulation,
      accountsEnabled,
      effectiveViewerVia,
      paymentMode,
      viewerIdentity,
      hasAccountSession,
      hasAccountSessionAuth,
      upgradeHref,
      oddsFormat,
      favoriteLeagues,
      riskPreference,
      userTimezone,
      showMxnBalance,
      unitMxn,
      preferredBooks,
      savedScreenerViews,
      month1NoCardMode,
      referralPaidFriends,
      memberReferralsSnapshot,
      tipsterWeeklyPickOrigin,
      selectedTipsterPickId,
    ],
  );

  const pickHomeSport = useCallback((next: SportFilter) => {
    setHasExplicitHomeSport(true);
    setHomeSportState(next);
    setHomeLeagueState("all");
  }, []);
  const resetHomeFilters = useCallback((targetDay?: string) => {
    if (targetDay !== undefined) setHomeChosenDayState(targetDay);
    setHasExplicitHomeSport(true);
    setHomeSportState("all");
    setHomeLeagueState("all");
  }, []);
  const homeNavFilter = useMemo<HomeNavFilterValue>(
    () => ({
      sport: homeSport,
      hasExplicitSport: hasExplicitHomeSport,
      league: homeLeague,
      chosenDay: homeChosenDay,
      todayOverride: homeTodayOverride,
      pickSport: pickHomeSport,
      setLeague: setHomeLeagueState,
      setChosenDay: setHomeChosenDayState,
      setTodayOverride: setHomeTodayOverride,
      resetFilters: resetHomeFilters,
    }),
    [
      homeSport,
      hasExplicitHomeSport,
      homeLeague,
      homeChosenDay,
      homeTodayOverride,
      pickHomeSport,
      resetHomeFilters,
    ],
  );

  const parlayState = useMemo<ParlayStateValue>(
    () => ({
      parlayLegs,
      allowSgp,
      parlayStakeUnits,
      parlaySummary,
    }),
    [parlayLegs, allowSgp, parlayStakeUnits, parlaySummary],
  );

  const socialState = useMemo<SocialStateValue>(
    () => ({
      socialPosts,
      socialFeedPages,
      socialOnServer,
      blockedSpamAttempts,
    }),
    [socialPosts, socialFeedPages, socialOnServer, blockedSpamAttempts],
  );

  const overlayState = useMemo<OverlayStateValue>(
    () => ({
      composerPick,
      shareTicket,
      cmdkOpen,
      betaPinOpen,
      betaPinNextPath,
      toasts,
    }),
    [composerPick, shareTicket, cmdkOpen, betaPinOpen, betaPinNextPath, toasts],
  );

  const [parlayIdStore] = useState(createParlayIdStore);
  useLayoutEffect(() => {
    parlayIdStore.set(new Set(parlayLegs.map((l) => l.pick.id)));
  }, [parlayIdStore, parlayLegs]);

  return (
    <PlatformActionsContext.Provider value={actions}>
      <PlatformCoreContext.Provider value={core}>
        <ParlayIdStoreContext.Provider value={parlayIdStore}>
          <ParlayStateContext.Provider value={parlayState}>
            <SocialStateContext.Provider value={socialState}>
              <OverlayStateContext.Provider value={overlayState}>
                <JournalContext.Provider value={journal}>
                  <WatchlistContext.Provider value={watchlistGameIds}>
                    <FollowAlertsContext.Provider value={followAlerts}>
                      <AuraStoreContext.Provider value={auraStore}>
                        <HomeNavFilterContext.Provider value={homeNavFilter}>
                          <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
                        </HomeNavFilterContext.Provider>
                      </AuraStoreContext.Provider>
                    </FollowAlertsContext.Provider>
                  </WatchlistContext.Provider>
                </JournalContext.Provider>
              </OverlayStateContext.Provider>
            </SocialStateContext.Provider>
          </ParlayStateContext.Provider>
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
 * Agrega o enriquece partidos puntuales (p. ej. terminados en Resultados o `preGame` completo
 * en la ficha de partido) sobre los datos recortados del shell compartido.
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
      const incomingById = new Map<string, PlatformGame>();
      for (const g of games) {
        const localized =
          applyTz && core.userTimezone && core.userTimezone !== DEFAULT_STORED_PREFS_V1.timezone
            ? (() => {
                const ko = formatKickoffByTimezone(g.kickoffUtc, g.kickoffLocal, core.userTimezone);
                return ko === g.kickoffLocal
                  ? g
                  : {
                      ...g,
                      kickoffLocal: ko,
                      picks: g.picks.map((p) => ({ ...p, kickoffLocal: ko })),
                      ...(g.parlayCandidates
                        ? { parlayCandidates: g.parlayCandidates.map((p) => ({ ...p, kickoffLocal: ko })) }
                        : {}),
                    };
              })()
            : g;
        incomingById.set(g.id, localized);
      }

      let changed = false;
      const seen = new Set<string>();
      const mergedGames = base.games.map((existing) => {
        seen.add(existing.id);
        const incoming = incomingById.get(existing.id);
        if (!incoming) return existing;
        // Reemplaza la copia ligera del shell si el suplemento trae `preGame` enriquecido
        // (bajas, síntesis, alineaciones o contexto completo para la ficha individual).
        const hasRicherPreGame = Boolean(
          (incoming.spacetime && !existing.spacetime) ||
            (incoming.confidenceDetail && !existing.confidenceDetail) ||
            (incoming.picks.length > existing.picks.length) ||
            (incoming.picks.some((p) => p.rationale) && !existing.picks.some((p) => p.rationale)) ||
            (incoming.preGame &&
              ((incoming.preGame.absences?.length ?? 0) > (existing.preGame?.absences?.length ?? 0) ||
                (incoming.preGame.cortexSynthesis && !existing.preGame?.cortexSynthesis) ||
                (incoming.preGame.tacticalKeys?.length ?? 0) > (existing.preGame?.tacticalKeys?.length ?? 0) ||
                (incoming.preGame.probableLineups && !existing.preGame?.probableLineups) ||
                (incoming.preGame.matchContext?.weather && !existing.preGame?.matchContext?.weather))),
        );
        if (!hasRicherPreGame) return existing;
        changed = true;
        return incoming;
      });

      const extras: PlatformGame[] = [];
      for (const [id, g] of incomingById) {
        if (!seen.has(id)) {
          extras.push(g);
          changed = true;
        }
      }
      return changed ? { ...base, games: extras.length > 0 ? [...mergedGames, ...extras] : mergedGames } : base;
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
