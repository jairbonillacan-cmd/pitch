import {
  DEFAULT_STORED_PREFS_V1,
  formatKickoffByTimezone,
  sanitizeCsvCell,
} from "./club/account/account-helpers";
import { isCredibleClvPct, isParlayClvEntry } from "./record-stats";
import type {
  JournalEntry,
  PlatformDataset,
  PlatformGame,
  SocialPost,
  ViewerRole,
} from "./types";

export const STORAGE_KEYS = {
  journal: "pl-journal-v1",
  watchlist: "pl-watchlist-v1",
  followAlerts: "pl-follow-alerts-v1",
  ownPosts: "pl-own-posts-v1",
} as const;

export const MAX_PARLAY_LEGS = 6;

export interface FollowAlerts {
  kickoff: boolean;
  goals: boolean;
  final: boolean;
}

export const DEFAULT_FOLLOW_ALERTS: FollowAlerts = {
  kickoff: true,
  goals: true,
  final: true,
};

export interface ShareTicketLegItem {
  label: string;
  matchLabel: string;
  p: number | null;
  fairDecimal: number | null;
  marketDecimal?: number | null;
  kickoffLocal?: string;
  status?: "won" | "lost" | "push" | "pending";
  scoreLabel?: string | null;
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
  revealLegs?: boolean;
  settlementStatus?: "pending" | "won" | "lost" | "push";
  netUnits?: number | null;
  sealedAtLabel?: string | null;
  bookLabel?: string | null;
  legSummaryLabel?: string | null;
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

export interface ViewerIdentity {
  handle: string;
  displayName: string;
  initials: string;
  referralCode: string | null;
  avatarUrl?: string | null;
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

export function readStoredArray<T>(key: string, isItem: (v: unknown) => v is T): T[] {
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

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    void err;
  }
}

export function isJournalEntry(v: unknown): v is JournalEntry {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const id: unknown = Reflect.get(v, "id");
  const pickId: unknown = Reflect.get(v, "pickId");
  const gameId: unknown = Reflect.get(v, "gameId");
  const leagueLabel: unknown = Reflect.get(v, "leagueLabel");
  const matchLabel: unknown = Reflect.get(v, "matchLabel");
  const pickLabel: unknown = Reflect.get(v, "pickLabel");
  const units: unknown = Reflect.get(v, "units");
  const userDecimal: unknown = Reflect.get(v, "userDecimal");
  const fairDecimal: unknown = Reflect.get(v, "fairDecimal");
  const status: unknown = Reflect.get(v, "status");
  return (
    typeof id === "string" &&
    typeof pickId === "string" &&
    typeof gameId === "string" &&
    typeof leagueLabel === "string" &&
    typeof matchLabel === "string" &&
    typeof pickLabel === "string" &&
    typeof units === "number" &&
    Number.isFinite(units) &&
    typeof userDecimal === "number" &&
    Number.isFinite(userDecimal) &&
    (fairDecimal === undefined ||
      (typeof fairDecimal === "number" && Number.isFinite(fairDecimal))) &&
    (status === "pending" || status === "won" || status === "lost" || status === "void")
  );
}

export function isOwnSocialPost(v: unknown): v is SocialPost {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const id: unknown = Reflect.get(v, "id");
  const body: unknown = Reflect.get(v, "body");
  const authorHandle: unknown = Reflect.get(v, "authorHandle");
  const authorName: unknown = Reflect.get(v, "authorName");
  const isExample: unknown = Reflect.get(v, "isExample");
  const comments: unknown = Reflect.get(v, "comments");
  return (
    typeof id === "string" &&
    typeof body === "string" &&
    typeof authorHandle === "string" &&
    typeof authorName === "string" &&
    !isExample &&
    Array.isArray(comments)
  );
}

export function sanitizeFollowAlerts(raw: Record<string, unknown>): Record<string, FollowAlerts> {
  const out: Record<string, FollowAlerts> = {};
  for (const [gameId, value] of Object.entries(raw)) {
    if (!/^[a-zA-Z0-9._-]{1,128}$/.test(gameId) || !value || typeof value !== "object") continue;
    const kickoffVal: unknown = Reflect.get(value, "kickoff");
    const goalsVal: unknown = Reflect.get(value, "goals");
    const finalVal: unknown = Reflect.get(value, "final");
    out[gameId] = {
      kickoff: kickoffVal !== false,
      goals: goalsVal !== false,
      final: finalVal !== false,
    };
  }
  return out;
}

export function formatClvBadge(avgClvPct: number | null): string {
  if (avgClvPct === null) return "Ventaja —";
  return `Ventaja ${avgClvPct >= 0 ? "+" : ""}${avgClvPct.toFixed(1)} %`;
}

export function ownHandleFor(identity: ViewerIdentity | null, role: ViewerRole): string {
  if (identity) return identity.handle;
  return role === "tipster" ? "sofia_nfl" : "socio_pl";
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

export function buildJournalCsvContent(journal: readonly JournalEntry[]): string {
  const header =
    "Fecha,Liga,Partido,Seleccion,Origen,Unidades,CuotaUsuario,CuotaJusta,Ventaja_Pts,Estado";
  const lines = journal.map((j) => {
    const rawClv = j.clvPct;
    const clvCell = isCredibleClvPct(rawClv, isParlayClvEntry(j)) ? rawClv.toFixed(1) : "";
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
  return [header, ...lines].join("\n");
}

export function mergeSupplementalDataset(
  base: PlatformDataset,
  games: readonly PlatformGame[],
  applyTz: boolean,
  userTimezone: string,
): PlatformDataset {
  if (games.length === 0) return base;
  const incomingById = new Map<string, PlatformGame>();
  for (const g of games) {
    const localized =
      applyTz && userTimezone && userTimezone !== DEFAULT_STORED_PREFS_V1.timezone
        ? (() => {
            const ko = formatKickoffByTimezone(g.kickoffUtc, g.kickoffLocal, userTimezone);
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
    const hasRicherPreGame = Boolean(
      (incoming.spacetime && !existing.spacetime) ||
        (incoming.confidenceDetail && !existing.confidenceDetail) ||
        incoming.picks.length > existing.picks.length ||
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
  for (const [, g] of incomingById) {
    if (!seen.has(g.id)) {
      extras.push(g);
      changed = true;
    }
  }
  return changed ? { ...base, games: extras.length > 0 ? [...mergedGames, ...extras] : mergedGames } : base;
}
