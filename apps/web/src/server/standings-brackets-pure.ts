import {
  canonicalTeamHref,
  cleanTeamRouteSlug,
  isSafePublicLabel,
  sportHasDraw,
  type LeagueCapabilityContract,
  type LeagueSnapshot,
  type PlatformSport,
  type StandingFormToken,
} from "@pitchlab/contracts";
import type { ProductLeague } from "./snapshots";

export type StandingsZoneTone = "ucl" | "uel" | "uecl" | "warn" | "rel";

export interface StandingsZoneDef {
  readonly id: string;
  readonly label: string;
  readonly tone: StandingsZoneTone;
  readonly startRank: number;
  readonly endRank: number;
  readonly scope: "league" | "conference";
}

export interface StandingsSplitRow {
  readonly rank: number;
  readonly teamId: string;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly teamHref: string;
  readonly conference: string | null;
  readonly division: string | null;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly overtimeLosses?: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly goalDiff: number;
  readonly points: number;
  readonly winPct: number | null;
  readonly gamesBehind: string | null;
  readonly seed: number | null;
  readonly form: readonly StandingFormToken[];
  readonly zoneId: string | null;
  readonly zoneLabel: string | null;
  readonly zoneTone: StandingsZoneTone | null;
}

export interface LeagueStandingsSplitsPayload {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly season: string;
  readonly roundLabel: string;
  readonly updatedAt: string;
  readonly hasRelegationZones: boolean;
  readonly hasConferences: boolean;
  readonly conferences: readonly string[];
  readonly total: readonly StandingsSplitRow[];
  readonly home: readonly StandingsSplitRow[];
  readonly away: readonly StandingsSplitRow[];
  readonly zones: readonly StandingsZoneDef[];
}

export type BracketMode = "active_knockout" | "projected_seeding";

export type BracketFormat =
  | "liga_mx_liguilla"
  | "uefa_knockout"
  | "conmebol_knockout"
  | "nba_playoffs"
  | "generic_knockout";

export interface BracketTeamSlot {
  readonly teamId: string | null;
  readonly teamSlug: string | null;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly seed: number | null;
  readonly conference: string | null;
  readonly gamesBehind: string | null;
  readonly teamHref: string | null;
  readonly placeholder: string | null;
}

export interface BracketLegDetail {
  readonly legNumber: number;
  readonly matchSlug: string;
  readonly dateIso: string;
  readonly status: "NS" | "LIVE" | "FT";
  readonly homeTeamSlug: string;
  readonly awayTeamSlug: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly extraTimeScore: { readonly home: number; readonly away: number } | null;
  readonly penaltyShootout: { readonly home: number; readonly away: number } | null;
  readonly href: string;
}

export interface BracketTie {
  readonly id: string;
  readonly roundKey: string;
  readonly conference: string | null;
  readonly slotIndex: number;
  readonly teamA: BracketTeamSlot;
  readonly teamB: BracketTeamSlot;
  readonly aggregateA: number | null;
  readonly aggregateB: number | null;
  readonly penaltiesA: number | null;
  readonly penaltiesB: number | null;
  readonly seriesWinsA: number | null;
  readonly seriesWinsB: number | null;
  readonly bestOf: number | null;
  readonly legs: readonly BracketLegDetail[];
  readonly status: "projected" | "scheduled" | "in_progress" | "decided";
  readonly winnerSide: "A" | "B" | null;
  readonly winnerTeamSlug: string | null;
  readonly note: string | null;
}

export interface BracketRound {
  readonly key: string;
  readonly label: string;
  readonly order: number;
  readonly twoLegged: boolean;
  readonly bestOf: number | null;
  readonly ties: readonly BracketTie[];
}

export interface BracketConferenceSection {
  readonly conference: string;
  readonly label: string;
  readonly playIn: readonly BracketTie[];
  readonly rounds: readonly BracketRound[];
}

export interface LeagueKnockoutBracketPayload {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly season: string;
  readonly updatedAt: string;
  readonly mode: BracketMode;
  readonly format: BracketFormat;
  readonly hasRelegationZones: boolean;
  readonly rounds: readonly BracketRound[];
  readonly conferences: readonly BracketConferenceSection[];
  readonly finalsTie: BracketTie | null;
  readonly championSlug: string | null;
  readonly championName: string | null;
}

export interface TeamMetaRecord {
  readonly teamId: string;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly conference: string | null;
  readonly division: string | null;
  readonly snapshotSeed: number | null;
  readonly snapshotGamesBehind: string | null;
}

export interface UnifiedMatchRecord {
  readonly dedupeKey: string;
  readonly matchSlug: string;
  readonly href: string;
  readonly dateIso: string;
  readonly dayKey: string;
  readonly round: string | null;
  readonly stageName: string | null;
  readonly status: "NS" | "LIVE" | "FT";
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeSlug: string;
  readonly awaySlug: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly extraTimeScore: { readonly home: number; readonly away: number } | null;
  readonly penaltyShootout: { readonly home: number; readonly away: number } | null;
  readonly overtime: boolean;
}

export interface KnockoutRoundMeta {
  readonly key: string;
  readonly label: string;
  readonly order: number;
  readonly twoLegged: boolean;
  readonly bestOf: number | null;
}

export const SLUG_ALIASES: Readonly<Record<string, string>> = {
  "atlas-guadalajara": "atlas",
  "deportivo-guadalajara": "chivas",
  chivas: "chivas",
  guadalajara: "chivas",
  "gallos-blancos": "queretaro",
  juarez: "fc-juarez",
  "uanl-tigres": "tigres-uanl",
  "deportivo-toluca": "toluca",
  bournemouth: "afc-bournemouth",
  athletic: "athletic-club",
  celta: "celta-vigo",
  "espanyol-barcelona": "espanyol",
  "real-racing-santander": "racing-santander",
  atalanta: "atalanta-bc",
  inter: "internazionale-milano",
  lens: "racing-lens",
  strasbourg: "strasbourg-alsace",
  "estac-troyes": "es-troyes",
};

export const UEFA_LEAGUE_PHASE_COMPETITIONS: ReadonlySet<string> = new Set([
  "champions-league",
  "europa-league",
  "conference-league",
]);

export const CONMEBOL_CUP_COMPETITIONS: ReadonlySet<string> = new Set([
  "libertadores",
  "sudamericana",
]);

export const US_BEST_OF_SERIES_SPORTS: ReadonlySet<PlatformSport> = new Set([
  "baseball",
  "basketball",
  "ice-hockey",
]);

const FOOTBALL_KNOCKOUT_ROUNDS: Readonly<Record<string, KnockoutRoundMeta>> = {
  play_in: { key: "play_in", label: "Play-In", order: 10, twoLegged: false, bestOf: 1 },
  knockout_playoffs: {
    key: "knockout_playoffs",
    label: "Playoffs eliminatorios",
    order: 15,
    twoLegged: true,
    bestOf: null,
  },
  round_of_16: {
    key: "round_of_16",
    label: "Octavos de final",
    order: 20,
    twoLegged: true,
    bestOf: null,
  },
  quarterfinals: {
    key: "quarterfinals",
    label: "Cuartos de final",
    order: 30,
    twoLegged: true,
    bestOf: null,
  },
  semifinals: {
    key: "semifinals",
    label: "Semifinales",
    order: 40,
    twoLegged: true,
    bestOf: null,
  },
  final: {
    key: "final",
    label: "Final",
    order: 50,
    twoLegged: false,
    bestOf: 1,
  },
};

const EXCLUDED_KNOCKOUT_TERMS: readonly string[] = [
  "qualification",
  "clasificacion",
  "league phase",
  "fase final",
  "fase de grupos",
  "group stage",
  "temporada regular",
  "regular season",
  "preseason",
  "pretemporada",
  "spring training",
  "jornada",
  "semana",
  "third place",
  "tercer puesto",
  "tercer lugar",
];

const FINAL_STAGE_RE =
  /^(?:gran\s+)?final(?:\s+(?:ida|vuelta))?$|^serie\s+mundial$|^finals?$|^super\s+bowl$|^stanley\s+cup\s+finals?$/;

export function canonicalSlug(rawTeamIdOrSlug: string): string {
  const clean = cleanTeamRouteSlug(rawTeamIdOrSlug);
  return SLUG_ALIASES[clean] ?? clean;
}

export function sanitizeLabel(raw: string | null | undefined, fallback: string): string {
  if (raw) {
    const trimmed = raw.trim();
    if (trimmed && isSafePublicLabel(trimmed)) return trimmed;
  }
  return fallback;
}

export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeIsoUtc(raw: string): string {
  const trimmed = raw.trim();
  const ms = Date.parse(trimmed);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  const utcMs = Date.parse(`${trimmed}Z`);
  if (Number.isFinite(utcMs)) return new Date(utcMs).toISOString();
  return trimmed;
}

export function resolveOrCreateTeamMeta(
  league: ProductLeague,
  registry: Map<string, TeamMetaRecord>,
  rawTeamId: string,
): TeamMetaRecord {
  const slug = cleanTeamRouteSlug(rawTeamId);
  const canon = canonicalSlug(slug);
  const existing = registry.get(canon);
  if (existing) return existing;
  const fallbackName = humanizeSlug(slug);
  const created: TeamMetaRecord = {
    teamId: `${league}.${slug}`,
    teamSlug: slug,
    name: fallbackName,
    shortName: fallbackName,
    code: slug.slice(0, 3).toUpperCase(),
    conference: null,
    division: null,
    snapshotSeed: null,
    snapshotGamesBehind: null,
  };
  registry.set(canon, created);
  return created;
}

export function resolveStandingsZonesForLeague(
  league: ProductLeague,
  capability: LeagueCapabilityContract,
  totalTeams: number,
): StandingsZoneDef[] {
  if (totalTeams < 4) return [];

  const clamp = (rawZones: readonly StandingsZoneDef[]): StandingsZoneDef[] =>
    rawZones
      .filter((z) => {
        if (!capability.hasRelegationZones && (z.tone === "rel" || /descenso/i.test(z.label))) {
          return false;
        }
        return z.startRank <= totalTeams;
      })
      .map((z) => ({
        ...z,
        endRank: Math.min(z.endRank, totalTeams),
      }))
      .filter((z) => z.endRank >= z.startRank);

  if (league === "liga-mx") {
    return clamp([
      {
        id: "liguilla-direct",
        label: "Liguilla directa (Cuartos de final)",
        tone: "ucl",
        startRank: 1,
        endRank: 6,
        scope: "league",
      },
      {
        id: "play-in",
        label: "Play-In (7.º–10.º)",
        tone: "warn",
        startRank: 7,
        endRank: 10,
        scope: "league",
      },
    ]);
  }

  if (league === "premier-league") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4, scope: "league" },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5, scope: "league" },
      ...(totalTeams >= 18
        ? [
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams,
              scope: "league" as const,
            },
          ]
        : []),
    ]);
  }

  if (league === "laliga" || league === "serie-a") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4, scope: "league" },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5, scope: "league" },
      { id: "uecl", label: "Conference League", tone: "uecl", startRank: 6, endRank: 6, scope: "league" },
      ...(totalTeams >= 18
        ? [
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams,
              scope: "league" as const,
            },
          ]
        : []),
    ]);
  }

  if (league === "bundesliga") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4, scope: "league" },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5, scope: "league" },
      { id: "uecl", label: "Conference League", tone: "uecl", startRank: 6, endRank: 6, scope: "league" },
      ...(totalTeams >= 16
        ? [
            {
              id: "playoff-rel",
              label: "Playoff de permanencia",
              tone: "warn" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams - 2,
              scope: "league" as const,
            },
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 1,
              endRank: totalTeams,
              scope: "league" as const,
            },
          ]
        : []),
    ]);
  }

  if (league === "ligue-1") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 3, scope: "league" },
      { id: "ucl-q", label: "Clasificación Liga de Campeones", tone: "uel", startRank: 4, endRank: 4, scope: "league" },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5, scope: "league" },
      { id: "uecl", label: "Conference League", tone: "uecl", startRank: 6, endRank: 6, scope: "league" },
      ...(totalTeams >= 16
        ? [
            {
              id: "playoff-rel",
              label: "Playoff de permanencia",
              tone: "warn" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams - 2,
              scope: "league" as const,
            },
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 1,
              endRank: totalTeams,
              scope: "league" as const,
            },
          ]
        : []),
    ]);
  }

  if (UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)) {
    return clamp([
      { id: "r16", label: "Octavos de final directos", tone: "ucl", startRank: 1, endRank: 8, scope: "league" },
      { id: "ko-playoffs", label: "Playoffs eliminatorios", tone: "uel", startRank: 9, endRank: 24, scope: "league" },
    ]);
  }

  if (capability.sport === "basketball") {
    return clamp([
      { id: "po", label: "Playoffs directos", tone: "ucl", startRank: 1, endRank: 6, scope: "conference" },
      { id: "play-in", label: "Torneo Play-In", tone: "warn", startRank: 7, endRank: 10, scope: "conference" },
    ]);
  }

  if (capability.sport === "ice-hockey") {
    return clamp([
      { id: "po", label: "Clasificación a Playoffs", tone: "ucl", startRank: 1, endRank: 8, scope: "conference" },
    ]);
  }

  if (capability.sport === "american-football") {
    return clamp([
      { id: "po", label: "Clasificación a Playoffs", tone: "ucl", startRank: 1, endRank: 7, scope: "conference" },
    ]);
  }

  if (capability.sport === "baseball") {
    return clamp([
      { id: "div", label: "Líderes divisionales", tone: "ucl", startRank: 1, endRank: 3, scope: "conference" },
      { id: "wc", label: "Comodín (Wild Card)", tone: "uel", startRank: 4, endRank: 6, scope: "conference" },
    ]);
  }

  if (CONMEBOL_CUP_COMPETITIONS.has(league)) {
    return clamp([
      { id: "knockout", label: "Fase eliminatoria", tone: "ucl", startRank: 1, endRank: Math.min(8, totalTeams), scope: "league" },
    ]);
  }

  if (capability.hasRelegationZones && totalTeams >= 12) {
    return clamp([
      { id: "top", label: "Zona continental", tone: "ucl", startRank: 1, endRank: 4, scope: "league" },
      {
        id: "rel",
        label: "Descenso",
        tone: "rel",
        startRank: totalTeams - 2,
        endRank: totalTeams,
        scope: "league",
      },
    ]);
  }

  return [];
}

function normalizeKnockoutLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildNormalizedStageParts(
  roundRaw: string | null,
  stageRaw: string | null,
): { readonly parts: readonly string[]; readonly combined: string } | null {
  const stageNorm = normalizeKnockoutLabel(stageRaw);
  const roundNorm = normalizeKnockoutLabel(roundRaw);
  const parts: string[] = [];
  if (stageNorm) parts.push(stageNorm);
  if (roundNorm && roundNorm !== stageNorm) parts.push(roundNorm);
  if (parts.length === 0) return null;
  const combined = parts.join(" ");
  for (const term of EXCLUDED_KNOCKOUT_TERMS) {
    if (combined.includes(term)) return null;
  }
  return { parts, combined };
}

export function classifyKnockoutStageKey(
  league: ProductLeague,
  roundRaw: string | null,
  stageRaw: string | null,
  hasLeaguePhaseMatches: boolean,
): KnockoutRoundMeta | null {
  const normalized = buildNormalizedStageParts(roundRaw, stageRaw);
  if (!normalized) return null;
  const { parts, combined } = normalized;

  if (/\bplay[-\s]?in\b/.test(combined)) {
    return FOOTBALL_KNOCKOUT_ROUNDS.play_in!;
  }
  if (/\bround of 16\b|\boctavos\b|\bcomodines\b|\bwild\s*card\b/.test(combined)) {
    return FOOTBALL_KNOCKOUT_ROUNDS.round_of_16!;
  }
  if (/\bquarter[-\s]?final|\bcuartos\b|\bserie divisional\b/.test(combined)) {
    return FOOTBALL_KNOCKOUT_ROUNDS.quarterfinals!;
  }
  if (/\bsemi[-\s]?final|\bserie de campeonato\b/.test(combined)) {
    return FOOTBALL_KNOCKOUT_ROUNDS.semifinals!;
  }
  if (parts.some((part) => FINAL_STAGE_RE.test(part)) || FINAL_STAGE_RE.test(combined)) {
    const isTwoLegged = league === "liga-mx";
    return {
      ...FOOTBALL_KNOCKOUT_ROUNDS.final!,
      twoLegged: isTwoLegged,
      bestOf: isTwoLegged ? null : FOOTBALL_KNOCKOUT_ROUNDS.final!.bestOf,
    };
  }
  if (
    !hasLeaguePhaseMatches &&
    /\bplayoff\s*round\b|\bronda.*playoff\b|\bknockout.*playoff\b/.test(combined)
  ) {
    return FOOTBALL_KNOCKOUT_ROUNDS.knockout_playoffs!;
  }
  return null;
}

export function classifyUsSeriesStageKey(
  sport: PlatformSport,
  roundRaw: string | null,
  stageRaw: string | null,
): KnockoutRoundMeta | null {
  const normalized = buildNormalizedStageParts(roundRaw, stageRaw);
  if (!normalized) return null;
  const { parts, combined } = normalized;

  if (/\bplay[-\s]?in\b/.test(combined)) {
    return {
      key: "play_in",
      label: "Play-In",
      order: 10,
      twoLegged: false,
      bestOf: 1,
    };
  }

  if (sport === "baseball") {
    if (/\bcomodines\b|\bwild\s*card\b/.test(combined)) {
      return {
        key: "round_of_16",
        label: "Serie de Comodines",
        order: 20,
        twoLegged: false,
        bestOf: 3,
      };
    }
    if (
      /\bserie\s+divisional\b|\bdivision\s+series\b|\b(?:alds|nlds)\b|\bquarter[-\s]?final|\bcuartos\b/.test(
        combined,
      )
    ) {
      return {
        key: "quarterfinals",
        label: "Serie Divisional",
        order: 30,
        twoLegged: false,
        bestOf: 5,
      };
    }
    if (
      /\bserie\s+de\s+campeonato\b|\bchampionship\s+series\b|\b(?:alcs|nlcs)\b|\bsemi[-\s]?final/.test(
        combined,
      )
    ) {
      return {
        key: "semifinals",
        label: "Serie de Campeonato",
        order: 40,
        twoLegged: false,
        bestOf: 7,
      };
    }
    if (
      parts.some((part) => FINAL_STAGE_RE.test(part) || /^world\s+series$/.test(part)) ||
      FINAL_STAGE_RE.test(combined) ||
      /^world\s+series$/.test(combined)
    ) {
      return {
        key: "final",
        label: "Serie Mundial",
        order: 50,
        twoLegged: false,
        bestOf: 7,
      };
    }
    return null;
  }

  if (
    /\b(?:first|1st)\s+round\b|\bprimera\s+ronda\b|\bround\s+of\s+16\b|\boctavos\b|\bwild\s*card\b|\bcomodines\b/.test(
      combined,
    )
  ) {
    return {
      key: "first_round",
      label: "Primera ronda",
      order: 20,
      twoLegged: false,
      bestOf: 7,
    };
  }
  if (
    /\b(?:conference|conferencia)\s+semi|\bsemifinal(?:es)?\s+de\s+conferencia\b|\b(?:second|2nd)\s+round\b|\bsegunda\s+ronda\b|\bquarter[-\s]?final|\bcuartos\b/.test(
      combined,
    )
  ) {
    return {
      key: "quarterfinals",
      label: "Semifinales de conferencia",
      order: 30,
      twoLegged: false,
      bestOf: 7,
    };
  }
  if (
    /\b(?:conference|conferencia)\s+final|\bfinal(?:es)?\s+de\s+conferencia\b|\bsemi[-\s]?final/.test(
      combined,
    )
  ) {
    return {
      key: "semifinals",
      label: "Finales de conferencia",
      order: 40,
      twoLegged: false,
      bestOf: 7,
    };
  }
  if (
    parts.some((part) => FINAL_STAGE_RE.test(part) || /^nba\s+finals?$/.test(part)) ||
    FINAL_STAGE_RE.test(combined) ||
    /^nba\s+finals?$/.test(combined)
  ) {
    return {
      key: "final",
      label: sport === "ice-hockey" ? "Final de la Stanley Cup" : "Finales NBA",
      order: 50,
      twoLegged: false,
      bestOf: 7,
    };
  }
  return null;
}

function slotFromStanding(row: StandingsSplitRow, seedOverride?: number): BracketTeamSlot {
  return {
    teamId: row.teamId,
    teamSlug: row.teamSlug,
    name: row.name,
    shortName: row.shortName,
    code: row.code,
    seed: seedOverride ?? row.seed ?? row.rank,
    conference: row.conference,
    gamesBehind: row.gamesBehind,
    teamHref: row.teamHref,
    placeholder: null,
  };
}

function slotFromMeta(
  league: ProductLeague,
  meta: TeamMetaRecord,
  seed: number | null,
): BracketTeamSlot {
  return {
    teamId: meta.teamId,
    teamSlug: meta.teamSlug,
    name: meta.name,
    shortName: meta.shortName,
    code: meta.code,
    seed: seed ?? meta.snapshotSeed,
    conference: meta.conference,
    gamesBehind: meta.snapshotGamesBehind,
    teamHref: canonicalTeamHref(league, meta.teamSlug),
    placeholder: null,
  };
}

function placeholderSlot(label: string, conference: string | null = null): BracketTeamSlot {
  return {
    teamId: null,
    teamSlug: null,
    name: label,
    shortName: label,
    code: "TBD",
    seed: null,
    conference,
    gamesBehind: null,
    teamHref: null,
    placeholder: label,
  };
}

function projectedTie(input: {
  readonly id: string;
  readonly roundKey: string;
  readonly conference?: string | null;
  readonly slotIndex: number;
  readonly teamA: BracketTeamSlot;
  readonly teamB: BracketTeamSlot;
  readonly bestOf: number | null;
  readonly note?: string | null;
}): BracketTie {
  return {
    id: input.id,
    roundKey: input.roundKey,
    conference: input.conference ?? null,
    slotIndex: input.slotIndex,
    teamA: input.teamA,
    teamB: input.teamB,
    aggregateA: null,
    aggregateB: null,
    penaltiesA: null,
    penaltiesB: null,
    seriesWinsA: null,
    seriesWinsB: null,
    bestOf: input.bestOf,
    legs: [],
    status: "projected",
    winnerSide: null,
    winnerTeamSlug: null,
    note: input.note ?? null,
  };
}

export function buildActiveFootballBracket(
  league: ProductLeague,
  leagueLabel: string,
  snapshot: LeagueSnapshot | null,
  registry: Map<string, TeamMetaRecord>,
  allMatches: readonly UnifiedMatchRecord[],
  capability: LeagueCapabilityContract,
  regularSplits?: LeagueStandingsSplitsPayload | null,
): LeagueKnockoutBracketPayload | null {
  const hasLeaguePhaseMatches =
    UEFA_LEAGUE_PHASE_COMPETITIONS.has(league) &&
    allMatches.some((m) =>
      `${m.round ?? ""} ${m.stageName ?? ""}`.toLowerCase().includes("league phase"),
    );

  const matchesByRound = new Map<string, { meta: KnockoutRoundMeta; matches: UnifiedMatchRecord[] }>();
  for (const match of allMatches) {
    const stageMeta = classifyKnockoutStageKey(
      league,
      match.round,
      match.stageName,
      hasLeaguePhaseMatches,
    );
    if (!stageMeta) continue;
    let bucket = matchesByRound.get(stageMeta.key);
    if (!bucket) {
      bucket = { meta: stageMeta, matches: [] };
      matchesByRound.set(stageMeta.key, bucket);
    }
    bucket.matches.push(match);
  }

  if (matchesByRound.size === 0) return null;

  const sortedRounds = Array.from(matchesByRound.values()).sort(
    (a, b) => a.meta.order - b.meta.order,
  );

  const teamsInNextRoundByKey = new Map<string, Set<string>>();
  for (let idx = 0; idx < sortedRounds.length - 1; idx += 1) {
    const currentKey = sortedRounds[idx]!.meta.key;
    const nextMatches = sortedRounds[idx + 1]!.matches;
    const nextTeams = new Set<string>();
    for (const m of nextMatches) {
      nextTeams.add(canonicalSlug(m.homeSlug));
      nextTeams.add(canonicalSlug(m.awaySlug));
    }
    teamsInNextRoundByKey.set(currentKey, nextTeams);
  }

  const regularSeasonRankByCanon = new Map<string, number>();
  if (league === "liga-mx" && regularSplits) {
    for (const row of regularSplits.total) {
      regularSeasonRankByCanon.set(canonicalSlug(row.teamSlug), row.rank);
    }
  }

  const rounds: BracketRound[] = sortedRounds.map((bucket) => {
    const grouped = new Map<string, UnifiedMatchRecord[]>();
    for (const m of bucket.matches) {
      const hCanon = canonicalSlug(m.homeSlug);
      const aCanon = canonicalSlug(m.awaySlug);
      const pairKey = hCanon < aCanon ? `${hCanon}|${aCanon}` : `${aCanon}|${hCanon}`;
      const list = grouped.get(pairKey) ?? [];
      list.push(m);
      grouped.set(pairKey, list);
    }

    const nextRoundTeams = teamsInNextRoundByKey.get(bucket.meta.key) ?? new Set<string>();
    const pairs = Array.from(grouped.values()).sort((a, b) =>
      a[0]!.dateIso.localeCompare(b[0]!.dateIso),
    );

    const ties: BracketTie[] = pairs.map((legMatches, slotIdx) => {
      legMatches.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
      const firstLeg = legMatches[0]!;
      const metaA = resolveOrCreateTeamMeta(league, registry, firstLeg.homeTeamId);
      const metaB = resolveOrCreateTeamMeta(league, registry, firstLeg.awayTeamId);
      const canonA = canonicalSlug(metaA.teamSlug);
      const canonB = canonicalSlug(metaB.teamSlug);

      let aggregateA = 0;
      let aggregateB = 0;
      let finishedLegs = 0;
      let inProgressLegs = 0;
      let penaltiesA: number | null = null;
      let penaltiesB: number | null = null;

      const legs: BracketLegDetail[] = legMatches.slice(0, 2).map((leg, idx) => {
        const legNumber: 1 | 2 = idx === 0 ? 1 : 2;
        const legHomeIsA = canonicalSlug(leg.homeSlug) === canonA;
        if (leg.status === "FT" && leg.homeScore !== null && leg.awayScore !== null) {
          finishedLegs += 1;
          if (legHomeIsA) {
            aggregateA += leg.homeScore;
            aggregateB += leg.awayScore;
          } else {
            aggregateA += leg.awayScore;
            aggregateB += leg.homeScore;
          }
        } else if (leg.status === "LIVE") {
          inProgressLegs += 1;
        }
        if (leg.penaltyShootout) {
          if (legHomeIsA) {
            penaltiesA = leg.penaltyShootout.home;
            penaltiesB = leg.penaltyShootout.away;
          } else {
            penaltiesA = leg.penaltyShootout.away;
            penaltiesB = leg.penaltyShootout.home;
          }
        }

        return {
          legNumber,
          matchSlug: leg.matchSlug,
          dateIso: leg.dateIso,
          status: leg.status,
          homeTeamSlug: leg.homeSlug,
          awayTeamSlug: leg.awaySlug,
          homeScore: leg.homeScore,
          awayScore: leg.awayScore,
          extraTimeScore: leg.extraTimeScore,
          penaltyShootout: leg.penaltyShootout,
          href: leg.href,
        };
      });

      const expectedLegs = bucket.meta.twoLegged ? 2 : 1;
      const allKnownLegsFinished = finishedLegs === legs.length && legs.length > 0;
      const hasAdvancementProof =
        nextRoundTeams.has(canonA) !== nextRoundTeams.has(canonB);
      const isDecided =
        (allKnownLegsFinished && legs.length >= expectedLegs) ||
        (allKnownLegsFinished && hasAdvancementProof) ||
        (allKnownLegsFinished && penaltiesA !== null && penaltiesB !== null);

      let winnerSide: "A" | "B" | null = null;
      let tiebreakBySeed = false;
      if (isDecided) {
        if (aggregateA > aggregateB) {
          winnerSide = "A";
        } else if (aggregateB > aggregateA) {
          winnerSide = "B";
        } else if (penaltiesA !== null && penaltiesB !== null && penaltiesA !== penaltiesB) {
          winnerSide = penaltiesA > penaltiesB ? "A" : "B";
        } else if (nextRoundTeams.has(canonA) && !nextRoundTeams.has(canonB)) {
          winnerSide = "A";
        } else if (nextRoundTeams.has(canonB) && !nextRoundTeams.has(canonA)) {
          winnerSide = "B";
        } else if (
          league === "liga-mx" &&
          bucket.meta.key !== "final" &&
          bucket.meta.twoLegged &&
          legs.length >= expectedLegs
        ) {
          const rankA = regularSeasonRankByCanon.get(canonA) ?? null;
          const rankB = regularSeasonRankByCanon.get(canonB) ?? null;
          if (rankA !== null && rankB !== null && rankA !== rankB) {
            winnerSide = rankA < rankB ? "A" : "B";
            tiebreakBySeed = true;
          }
        }
      }

      const resolvedDecided = isDecided && winnerSide !== null;
      const status: BracketTie["status"] =
        inProgressLegs > 0
          ? "in_progress"
          : resolvedDecided
            ? "decided"
            : finishedLegs > 0
              ? "in_progress"
              : "scheduled";

      const note =
        penaltiesA !== null && penaltiesB !== null
          ? `Definida en penales (${penaltiesA}-${penaltiesB})`
          : tiebreakBySeed
            ? "Avanza por mejor posición en tabla general"
            : legs.length === 2
              ? "Serie a ida y vuelta"
              : legs.length === 1 && !bucket.meta.twoLegged
                ? "Partido único"
                : null;

      return {
        id: `${league}:${bucket.meta.key}:${slotIdx + 1}`,
        roundKey: bucket.meta.key,
        conference: null,
        slotIndex: slotIdx + 1,
        teamA: slotFromMeta(league, metaA, null),
        teamB: slotFromMeta(league, metaB, null),
        aggregateA: finishedLegs > 0 ? aggregateA : null,
        aggregateB: finishedLegs > 0 ? aggregateB : null,
        penaltiesA,
        penaltiesB,
        seriesWinsA: null,
        seriesWinsB: null,
        bestOf: bucket.meta.bestOf,
        legs,
        status,
        winnerSide,
        winnerTeamSlug:
          winnerSide === "A" ? metaA.teamSlug : winnerSide === "B" ? metaB.teamSlug : null,
        note,
      };
    });

    return {
      key: bucket.meta.key,
      label: bucket.meta.label,
      order: bucket.meta.order,
      twoLegged: bucket.meta.twoLegged,
      bestOf: bucket.meta.bestOf,
      ties,
    };
  });

  const finalRound = rounds.find((r) => r.key === "final") ?? null;
  const finalsTie = finalRound?.ties[0] ?? null;
  const championSlot =
    finalsTie?.winnerSide === "A"
      ? finalsTie.teamA
      : finalsTie?.winnerSide === "B"
        ? finalsTie.teamB
        : null;

  const format: BracketFormat =
    league === "liga-mx"
      ? "liga_mx_liguilla"
      : UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)
        ? "uefa_knockout"
        : CONMEBOL_CUP_COMPETITIONS.has(league)
          ? "conmebol_knockout"
          : "generic_knockout";

  return {
    league,
    leagueLabel,
    sport: capability.sport,
    season: snapshot?.seasonLabel ?? "2026",
    updatedAt: snapshot?.updatedAt ?? new Date().toISOString(),
    mode: "active_knockout",
    format,
    hasRelegationZones: capability.hasRelegationZones,
    rounds,
    conferences: [],
    finalsTie,
    championSlug: championSlot?.teamSlug ?? null,
    championName: championSlot?.name ?? null,
  };
}

export function buildActiveUsSeriesBracket(
  league: ProductLeague,
  leagueLabel: string,
  snapshot: LeagueSnapshot | null,
  registry: Map<string, TeamMetaRecord>,
  allMatches: readonly UnifiedMatchRecord[],
  capability: LeagueCapabilityContract,
): LeagueKnockoutBracketPayload | null {
  const matchesByRound = new Map<string, { meta: KnockoutRoundMeta; matches: UnifiedMatchRecord[] }>();
  for (const match of allMatches) {
    const stageMeta = classifyUsSeriesStageKey(
      capability.sport,
      match.round,
      match.stageName,
    );
    if (!stageMeta) continue;
    let bucket = matchesByRound.get(stageMeta.key);
    if (!bucket) {
      bucket = { meta: stageMeta, matches: [] };
      matchesByRound.set(stageMeta.key, bucket);
    }
    bucket.matches.push(match);
  }

  if (matchesByRound.size === 0) return null;

  const sortedRounds = Array.from(matchesByRound.values()).sort(
    (a, b) => a.meta.order - b.meta.order,
  );

  const teamsInNextRoundByKey = new Map<string, Set<string>>();
  for (let idx = 0; idx < sortedRounds.length - 1; idx += 1) {
    const currentKey = sortedRounds[idx]!.meta.key;
    const nextMatches = sortedRounds[idx + 1]!.matches;
    const nextTeams = new Set<string>();
    for (const m of nextMatches) {
      nextTeams.add(canonicalSlug(m.homeSlug));
      nextTeams.add(canonicalSlug(m.awaySlug));
    }
    teamsInNextRoundByKey.set(currentKey, nextTeams);
  }

  const rounds: BracketRound[] = sortedRounds.map((bucket) => {
    const grouped = new Map<string, UnifiedMatchRecord[]>();
    for (const m of bucket.matches) {
      const hCanon = canonicalSlug(m.homeSlug);
      const aCanon = canonicalSlug(m.awaySlug);
      const pairKey = hCanon < aCanon ? `${hCanon}|${aCanon}` : `${aCanon}|${hCanon}`;
      const list = grouped.get(pairKey) ?? [];
      list.push(m);
      grouped.set(pairKey, list);
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    }

    const nextRoundTeams = teamsInNextRoundByKey.get(bucket.meta.key) ?? new Set<string>();
    const pairs = Array.from(grouped.values()).sort((a, b) =>
      a[0]!.dateIso.localeCompare(b[0]!.dateIso),
    );
    const bestOf = bucket.meta.bestOf ?? 7;
    const winsToClinch = Math.floor(bestOf / 2) + 1;

    const ties: BracketTie[] = pairs.map((seriesMatches, slotIdx) => {
      const firstGame = seriesMatches[0]!;
      const metaA = resolveOrCreateTeamMeta(league, registry, firstGame.homeTeamId);
      const metaB = resolveOrCreateTeamMeta(league, registry, firstGame.awayTeamId);
      const canonA = canonicalSlug(metaA.teamSlug);
      const canonB = canonicalSlug(metaB.teamSlug);

      let seriesWinsA = 0;
      let seriesWinsB = 0;
      let finishedGames = 0;
      let inProgressGames = 0;

      const legs: BracketLegDetail[] = seriesMatches.map((game, idx) => {
        const legHomeIsA = canonicalSlug(game.homeSlug) === canonA;
        if (game.status === "FT" && game.homeScore !== null && game.awayScore !== null) {
          finishedGames += 1;
          const scoreA = legHomeIsA ? game.homeScore : game.awayScore;
          const scoreB = legHomeIsA ? game.awayScore : game.homeScore;
          if (scoreA > scoreB) {
            seriesWinsA += 1;
          } else if (scoreB > scoreA) {
            seriesWinsB += 1;
          }
        } else if (game.status === "LIVE") {
          inProgressGames += 1;
        }

        return {
          legNumber: idx + 1,
          matchSlug: game.matchSlug,
          dateIso: game.dateIso,
          status: game.status,
          homeTeamSlug: game.homeSlug,
          awayTeamSlug: game.awaySlug,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          extraTimeScore: game.extraTimeScore,
          penaltyShootout: game.penaltyShootout,
          href: game.href,
        };
      });

      const allKnownGamesFinished = finishedGames === legs.length && legs.length > 0;
      const hasClinched = seriesWinsA >= winsToClinch || seriesWinsB >= winsToClinch;
      const hasAdvancementProof =
        nextRoundTeams.has(canonA) !== nextRoundTeams.has(canonB);
      const isDecided =
        hasClinched || (allKnownGamesFinished && hasAdvancementProof);

      let winnerSide: "A" | "B" | null = null;
      if (isDecided) {
        if (hasClinched) {
          if (seriesWinsA > seriesWinsB) {
            winnerSide = "A";
          } else if (seriesWinsB > seriesWinsA) {
            winnerSide = "B";
          }
        } else if (nextRoundTeams.has(canonA) && !nextRoundTeams.has(canonB)) {
          winnerSide = "A";
        } else if (nextRoundTeams.has(canonB) && !nextRoundTeams.has(canonA)) {
          winnerSide = "B";
        } else if (seriesWinsA > seriesWinsB) {
          winnerSide = "A";
        } else if (seriesWinsB > seriesWinsA) {
          winnerSide = "B";
        }
      }

      const resolvedDecided = isDecided && winnerSide !== null;
      const status: BracketTie["status"] =
        inProgressGames > 0 && !hasClinched
          ? "in_progress"
          : resolvedDecided
            ? "decided"
            : finishedGames > 0
              ? "in_progress"
              : "scheduled";

      const note =
        bestOf === 1
          ? "Partido único"
          : resolvedDecided && finishedGames > 0
            ? `Serie al mejor de ${bestOf} (${seriesWinsA}-${seriesWinsB})`
            : `Al mejor de ${bestOf} partidos`;

      const sharedConference =
        metaA.conference && metaA.conference === metaB.conference ? metaA.conference : null;

      return {
        id: `${league}:${bucket.meta.key}:${slotIdx + 1}`,
        roundKey: bucket.meta.key,
        conference: sharedConference,
        slotIndex: slotIdx + 1,
        teamA: slotFromMeta(league, metaA, null),
        teamB: slotFromMeta(league, metaB, null),
        aggregateA: null,
        aggregateB: null,
        penaltiesA: null,
        penaltiesB: null,
        seriesWinsA: finishedGames > 0 ? seriesWinsA : null,
        seriesWinsB: finishedGames > 0 ? seriesWinsB : null,
        bestOf,
        legs,
        status,
        winnerSide,
        winnerTeamSlug:
          winnerSide === "A" ? metaA.teamSlug : winnerSide === "B" ? metaB.teamSlug : null,
        note,
      };
    });

    return {
      key: bucket.meta.key,
      label: bucket.meta.label,
      order: bucket.meta.order,
      twoLegged: false,
      bestOf,
      ties,
    };
  });

  const finalRound = rounds.find((r) => r.key === "final") ?? null;
  const finalsTie = finalRound?.ties[0] ?? null;
  const championSlot =
    finalsTie?.winnerSide === "A"
      ? finalsTie.teamA
      : finalsTie?.winnerSide === "B"
        ? finalsTie.teamB
        : null;

  const format: BracketFormat = league === "nba" ? "nba_playoffs" : "generic_knockout";

  return {
    league,
    leagueLabel,
    sport: capability.sport,
    season: snapshot?.seasonLabel ?? "2026",
    updatedAt: snapshot?.updatedAt ?? new Date().toISOString(),
    mode: "active_knockout",
    format,
    hasRelegationZones: capability.hasRelegationZones,
    rounds,
    conferences: [],
    finalsTie,
    championSlug: championSlot?.teamSlug ?? null,
    championName: championSlot?.name ?? null,
  };
}

export function buildProjectedLigaMxBracket(
  splits: LeagueStandingsSplitsPayload,
): LeagueKnockoutBracketPayload | null {
  if (splits.total.length < 10) return null;
  const seed = (pos: number): BracketTeamSlot => slotFromStanding(splits.total[pos - 1]!, pos);

  const playInTies: BracketTie[] = [
    projectedTie({
      id: "liga-mx:play_in:1",
      roundKey: "play_in",
      slotIndex: 1,
      teamA: seed(7),
      teamB: seed(8),
      bestOf: 1,
      note: "Ganador avanza como 7.º a Cuartos; perdedor juega repechaje final",
    }),
    projectedTie({
      id: "liga-mx:play_in:2",
      roundKey: "play_in",
      slotIndex: 2,
      teamA: seed(9),
      teamB: seed(10),
      bestOf: 1,
      note: "Ganador avanza al juego decisivo por el 8.º lugar",
    }),
    projectedTie({
      id: "liga-mx:play_in:3",
      roundKey: "play_in",
      slotIndex: 3,
      teamA: placeholderSlot("Perdedor 7.º vs 8.º"),
      teamB: placeholderSlot("Ganador 9.º vs 10.º"),
      bestOf: 1,
      note: "Ganador entra como 8.º sembrado a Cuartos de final",
    }),
  ];

  const qfTies: BracketTie[] = [
    projectedTie({
      id: "liga-mx:quarterfinals:1",
      roundKey: "quarterfinals",
      slotIndex: 1,
      teamA: seed(1),
      teamB: placeholderSlot("Ganador Play-In (8.º)"),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
    projectedTie({
      id: "liga-mx:quarterfinals:2",
      roundKey: "quarterfinals",
      slotIndex: 2,
      teamA: seed(2),
      teamB: placeholderSlot("Ganador Play-In (7.º)"),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
    projectedTie({
      id: "liga-mx:quarterfinals:3",
      roundKey: "quarterfinals",
      slotIndex: 3,
      teamA: seed(3),
      teamB: seed(6),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
    projectedTie({
      id: "liga-mx:quarterfinals:4",
      roundKey: "quarterfinals",
      slotIndex: 4,
      teamA: seed(4),
      teamB: seed(5),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
  ];

  const sfTies: BracketTie[] = [
    projectedTie({
      id: "liga-mx:semifinals:1",
      roundKey: "semifinals",
      slotIndex: 1,
      teamA: placeholderSlot("Ganador Cuartos 1"),
      teamB: placeholderSlot("Ganador Cuartos 4"),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
    projectedTie({
      id: "liga-mx:semifinals:2",
      roundKey: "semifinals",
      slotIndex: 2,
      teamA: placeholderSlot("Ganador Cuartos 2"),
      teamB: placeholderSlot("Ganador Cuartos 3"),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
  ];

  const finalTie = projectedTie({
    id: "liga-mx:final:1",
    roundKey: "final",
    slotIndex: 1,
    teamA: placeholderSlot("Ganador Semifinal 1"),
    teamB: placeholderSlot("Ganador Semifinal 2"),
    bestOf: null,
    note: "Final a ida y vuelta",
  });

  const rounds: BracketRound[] = [
    { key: "play_in", label: "Play-In", order: 10, twoLegged: false, bestOf: 1, ties: playInTies },
    {
      key: "quarterfinals",
      label: "Cuartos de final",
      order: 20,
      twoLegged: true,
      bestOf: null,
      ties: qfTies,
    },
    {
      key: "semifinals",
      label: "Semifinales",
      order: 30,
      twoLegged: true,
      bestOf: null,
      ties: sfTies,
    },
    {
      key: "final",
      label: "Final",
      order: 40,
      twoLegged: true,
      bestOf: null,
      ties: [finalTie],
    },
  ];

  return {
    league: "liga-mx",
    leagueLabel: splits.leagueLabel,
    sport: "football",
    season: splits.season,
    updatedAt: splits.updatedAt,
    mode: "projected_seeding",
    format: "liga_mx_liguilla",
    hasRelegationZones: false,
    rounds,
    conferences: [],
    finalsTie: finalTie,
    championSlug: null,
    championName: null,
  };
}

export function buildProjectedUefaOrCupBracket(
  splits: LeagueStandingsSplitsPayload,
): LeagueKnockoutBracketPayload | null {
  if (splits.total.length < 8) return null;
  const league = splits.league;
  const seed = (pos: number): BracketTeamSlot => slotFromStanding(splits.total[pos - 1]!, pos);
  const rounds: BracketRound[] = [];

  if (splits.total.length >= 24 && UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)) {
    const playoffPairs: Array<readonly [number, number]> = [
      [9, 24],
      [10, 23],
      [11, 22],
      [12, 21],
      [13, 20],
      [14, 19],
      [15, 18],
      [16, 17],
    ];
    rounds.push({
      key: "knockout_playoffs",
      label: "Playoffs eliminatorios",
      order: 15,
      twoLegged: true,
      bestOf: null,
      ties: playoffPairs.map(([a, b], idx) =>
        projectedTie({
          id: `${league}:knockout_playoffs:${idx + 1}`,
          roundKey: "knockout_playoffs",
          slotIndex: idx + 1,
          teamA: seed(a),
          teamB: seed(b),
          bestOf: null,
          note: "Serie a ida y vuelta",
        }),
      ),
    });

    rounds.push({
      key: "round_of_16",
      label: "Octavos de final",
      order: 20,
      twoLegged: true,
      bestOf: null,
      ties: [1, 2, 3, 4, 5, 6, 7, 8].map((topSeed, idx) =>
        projectedTie({
          id: `${league}:round_of_16:${idx + 1}`,
          roundKey: "round_of_16",
          slotIndex: idx + 1,
          teamA: seed(topSeed),
          teamB: placeholderSlot(`Ganador Playoff ${9 - topSeed}`),
          bestOf: null,
          note: "Serie a ida y vuelta",
        }),
      ),
    });
  } else if (splits.total.length >= 16) {
    const pairs: Array<readonly [number, number]> = [
      [1, 16],
      [8, 9],
      [4, 13],
      [5, 12],
      [2, 15],
      [7, 10],
      [3, 14],
      [6, 11],
    ];
    rounds.push({
      key: "round_of_16",
      label: "Octavos de final",
      order: 20,
      twoLegged: true,
      bestOf: null,
      ties: pairs.map(([a, b], idx) =>
        projectedTie({
          id: `${league}:round_of_16:${idx + 1}`,
          roundKey: "round_of_16",
          slotIndex: idx + 1,
          teamA: seed(a),
          teamB: seed(b),
          bestOf: null,
          note: "Serie a ida y vuelta",
        }),
      ),
    });
  }

  const qfTies: BracketTie[] = [1, 2, 3, 4].map((slot) =>
    projectedTie({
      id: `${league}:quarterfinals:${slot}`,
      roundKey: "quarterfinals",
      slotIndex: slot,
      teamA:
        rounds.length > 0
          ? placeholderSlot(`Ganador Octavos ${slot * 2 - 1}`)
          : seed(slot),
      teamB:
        rounds.length > 0
          ? placeholderSlot(`Ganador Octavos ${slot * 2}`)
          : seed(9 - slot),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
  );

  const sfTies: BracketTie[] = [1, 2].map((slot) =>
    projectedTie({
      id: `${league}:semifinals:${slot}`,
      roundKey: "semifinals",
      slotIndex: slot,
      teamA: placeholderSlot(`Ganador Cuartos ${slot * 2 - 1}`),
      teamB: placeholderSlot(`Ganador Cuartos ${slot * 2}`),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
  );

  const finalTie = projectedTie({
    id: `${league}:final:1`,
    roundKey: "final",
    slotIndex: 1,
    teamA: placeholderSlot("Ganador Semifinal 1"),
    teamB: placeholderSlot("Ganador Semifinal 2"),
    bestOf: 1,
    note: "Final a partido único",
  });

  rounds.push(
    {
      key: "quarterfinals",
      label: "Cuartos de final",
      order: 30,
      twoLegged: true,
      bestOf: null,
      ties: qfTies,
    },
    {
      key: "semifinals",
      label: "Semifinales",
      order: 40,
      twoLegged: true,
      bestOf: null,
      ties: sfTies,
    },
    {
      key: "final",
      label: "Final",
      order: 50,
      twoLegged: false,
      bestOf: 1,
      ties: [finalTie],
    },
  );

  const format: BracketFormat = UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)
    ? "uefa_knockout"
    : CONMEBOL_CUP_COMPETITIONS.has(league)
      ? "conmebol_knockout"
      : "generic_knockout";

  return {
    league,
    leagueLabel: splits.leagueLabel,
    sport: splits.sport,
    season: splits.season,
    updatedAt: splits.updatedAt,
    mode: "projected_seeding",
    format,
    hasRelegationZones: splits.hasRelegationZones,
    rounds,
    conferences: [],
    finalsTie: finalTie,
    championSlug: null,
    championName: null,
  };
}

export function buildProjectedNbaBracket(
  leagueLabel: string,
  snapshot: LeagueSnapshot | null,
  splits: LeagueStandingsSplitsPayload | null,
): LeagueKnockoutBracketPayload | null {
  const conferenceBuckets = new Map<string, BracketTeamSlot[]>();

  if (snapshot?.standings && snapshot.standings.length >= 20) {
    for (const row of snapshot.standings) {
      const conf = row.conference ? sanitizeLabel(row.conference, "") : "";
      if (!conf) continue;
      const slug = cleanTeamRouteSlug(row.teamId);
      const safeName = sanitizeLabel(row.name, humanizeSlug(slug));
      const safeShort = sanitizeLabel(row.shortName, safeName);
      const safeCode = sanitizeLabel(row.code, slug.slice(0, 3).toUpperCase());
      const list = conferenceBuckets.get(conf) ?? [];
      list.push({
        teamId: `nba.${slug}`,
        teamSlug: slug,
        name: safeName,
        shortName: safeShort,
        code: safeCode,
        seed: row.seed ?? null,
        conference: conf,
        gamesBehind: row.gamesBehind ?? null,
        teamHref: canonicalTeamHref("nba", slug),
        placeholder: null,
      });
      conferenceBuckets.set(conf, list);
    }
  } else if (splits && splits.total.length >= 20) {
    for (const row of splits.total) {
      if (!row.conference) continue;
      const list = conferenceBuckets.get(row.conference) ?? [];
      list.push(slotFromStanding(row));
      conferenceBuckets.set(row.conference, list);
    }
  }

  const orderedConfNames = Array.from(conferenceBuckets.keys()).sort((a, b) => {
    if (a === "Este") return -1;
    if (b === "Este") return 1;
    if (a === "Oeste") return -1;
    if (b === "Oeste") return 1;
    return a.localeCompare(b, "es-MX");
  });

  if (orderedConfNames.length < 2) return null;

  const conferences: BracketConferenceSection[] = [];
  const allPlayIn: BracketTie[] = [];
  const allFirstRound: BracketTie[] = [];
  const allConfSemis: BracketTie[] = [];
  const allConfFinals: BracketTie[] = [];

  for (const confName of orderedConfNames) {
    const rawSlots = (conferenceBuckets.get(confName) ?? [])
      .slice()
      .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
    if (rawSlots.length < 10) return null;

    const confKey = cleanTeamRouteSlug(confName);
    const seed = (pos: number): BracketTeamSlot => ({
      ...rawSlots[pos - 1]!,
      seed: rawSlots[pos - 1]!.seed ?? pos,
    });

    const playIn: BracketTie[] = [
      projectedTie({
        id: `nba:${confKey}:play_in:1`,
        roundKey: "play_in",
        conference: confName,
        slotIndex: 1,
        teamA: seed(7),
        teamB: seed(8),
        bestOf: 1,
        note: "Ganador entra como sembrado #7",
      }),
      projectedTie({
        id: `nba:${confKey}:play_in:2`,
        roundKey: "play_in",
        conference: confName,
        slotIndex: 2,
        teamA: seed(9),
        teamB: seed(10),
        bestOf: 1,
        note: "Juego de eliminación directa",
      }),
      projectedTie({
        id: `nba:${confKey}:play_in:3`,
        roundKey: "play_in",
        conference: confName,
        slotIndex: 3,
        teamA: placeholderSlot(`Perdedor 7.º vs 8.º (${confName})`, confName),
        teamB: placeholderSlot(`Ganador 9.º vs 10.º (${confName})`, confName),
        bestOf: 1,
        note: "Ganador entra como sembrado #8",
      }),
    ];

    const firstRound: BracketTie[] = [
      projectedTie({
        id: `nba:${confKey}:first_round:1`,
        roundKey: "first_round",
        conference: confName,
        slotIndex: 1,
        teamA: seed(1),
        teamB: placeholderSlot(`Ganador Play-In #8 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
      projectedTie({
        id: `nba:${confKey}:first_round:2`,
        roundKey: "first_round",
        conference: confName,
        slotIndex: 2,
        teamA: seed(4),
        teamB: seed(5),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
      projectedTie({
        id: `nba:${confKey}:first_round:3`,
        roundKey: "first_round",
        conference: confName,
        slotIndex: 3,
        teamA: seed(3),
        teamB: seed(6),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
      projectedTie({
        id: `nba:${confKey}:first_round:4`,
        roundKey: "first_round",
        conference: confName,
        slotIndex: 4,
        teamA: seed(2),
        teamB: placeholderSlot(`Ganador Play-In #7 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
    ];

    const confSemis: BracketTie[] = [
      projectedTie({
        id: `nba:${confKey}:conf_semifinals:1`,
        roundKey: "conf_semifinals",
        conference: confName,
        slotIndex: 1,
        teamA: placeholderSlot(`Ganador 1 vs 8 (${confName})`, confName),
        teamB: placeholderSlot(`Ganador 4 vs 5 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
      projectedTie({
        id: `nba:${confKey}:conf_semifinals:2`,
        roundKey: "conf_semifinals",
        conference: confName,
        slotIndex: 2,
        teamA: placeholderSlot(`Ganador 3 vs 6 (${confName})`, confName),
        teamB: placeholderSlot(`Ganador 2 vs 7 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
    ];

    const confFinal: BracketTie[] = [
      projectedTie({
        id: `nba:${confKey}:conf_finals:1`,
        roundKey: "conf_finals",
        conference: confName,
        slotIndex: 1,
        teamA: placeholderSlot(`Ganador Semifinal 1 (${confName})`, confName),
        teamB: placeholderSlot(`Ganador Semifinal 2 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
    ];

    allPlayIn.push(...playIn);
    allFirstRound.push(...firstRound);
    allConfSemis.push(...confSemis);
    allConfFinals.push(...confFinal);

    conferences.push({
      conference: confName,
      label: `Conferencia ${confName}`,
      playIn,
      rounds: [
        {
          key: "first_round",
          label: "Primera ronda",
          order: 20,
          twoLegged: false,
          bestOf: 7,
          ties: firstRound,
        },
        {
          key: "conf_semifinals",
          label: "Semifinales de conferencia",
          order: 30,
          twoLegged: false,
          bestOf: 7,
          ties: confSemis,
        },
        {
          key: "conf_finals",
          label: "Final de conferencia",
          order: 40,
          twoLegged: false,
          bestOf: 7,
          ties: confFinal,
        },
      ],
    });
  }

  const finalsTie = projectedTie({
    id: "nba:finals:1",
    roundKey: "finals",
    conference: null,
    slotIndex: 1,
    teamA: placeholderSlot(`Campeón Conferencia ${orderedConfNames[0]!}`, orderedConfNames[0]!),
    teamB: placeholderSlot(`Campeón Conferencia ${orderedConfNames[1]!}`, orderedConfNames[1]!),
    bestOf: 7,
    note: "Finales NBA al mejor de 7 partidos",
  });

  const rounds: BracketRound[] = [
    { key: "play_in", label: "Torneo Play-In", order: 10, twoLegged: false, bestOf: 1, ties: allPlayIn },
    {
      key: "first_round",
      label: "Primera ronda",
      order: 20,
      twoLegged: false,
      bestOf: 7,
      ties: allFirstRound,
    },
    {
      key: "conf_semifinals",
      label: "Semifinales de conferencia",
      order: 30,
      twoLegged: false,
      bestOf: 7,
      ties: allConfSemis,
    },
    {
      key: "conf_finals",
      label: "Finales de conferencia",
      order: 40,
      twoLegged: false,
      bestOf: 7,
      ties: allConfFinals,
    },
    {
      key: "finals",
      label: "Finales NBA",
      order: 50,
      twoLegged: false,
      bestOf: 7,
      ties: [finalsTie],
    },
  ];

  return {
    league: "nba",
    leagueLabel,
    sport: "basketball",
    season: snapshot?.seasonLabel ?? splits?.season ?? "2026-27",
    updatedAt: snapshot?.updatedAt ?? splits?.updatedAt ?? new Date().toISOString(),
    mode: "projected_seeding",
    format: "nba_playoffs",
    hasRelegationZones: false,
    rounds,
    conferences,
    finalsTie,
    championSlug: null,
    championName: null,
  };
}

export function selectBracketBuilderOrProjected(
  league: ProductLeague,
  leagueLabel: string,
  snapshot: LeagueSnapshot | null,
  registry: Map<string, TeamMetaRecord>,
  allMatches: readonly UnifiedMatchRecord[],
  capability: LeagueCapabilityContract,
  getRegularSplits: () => LeagueStandingsSplitsPayload | null,
): LeagueKnockoutBracketPayload | null {
  if (US_BEST_OF_SERIES_SPORTS.has(capability.sport)) {
    const activeSeries = buildActiveUsSeriesBracket(
      league,
      leagueLabel,
      snapshot,
      registry,
      allMatches,
      capability,
    );
    if (activeSeries) return activeSeries;
    if (league === "nba") {
      return buildProjectedNbaBracket(leagueLabel, snapshot, getRegularSplits());
    }
    return null;
  }

  const regularSplits = league === "liga-mx" ? getRegularSplits() : null;
  const active = buildActiveFootballBracket(
    league,
    leagueLabel,
    snapshot,
    registry,
    allMatches,
    capability,
    regularSplits,
  );
  if (active) return active;
  if (league === "liga-mx") {
    const splits = regularSplits ?? getRegularSplits();
    return splits ? buildProjectedLigaMxBracket(splits) : null;
  }
  if (capability.hasStandingsTable && sportHasDraw(capability.sport)) {
    const splits = getRegularSplits();
    return splits ? buildProjectedUefaOrCupBracket(splits) : null;
  }
  return null;
}
