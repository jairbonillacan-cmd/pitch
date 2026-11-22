"use client";

import React, { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  COMPETITION_BY_ID,
  canonicalGameHref,
  canonicalTeamHref,
  getLeagueCapability,
  isBlockedMarketQuoteBook,
  isKnockoutCupCompetition,
  isLivePhaseActive,
  isNationalCompetition,
  isPermittedMarketQuoteBook,
  isSafePublicLabel,
  parseStrictFiniteNumber,
  sportForLeague,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
  type LiveMatchDetail,
  type LiveScoreboardEntry,
  type PlatformSport,
  type StandingRow,
} from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import {
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreTabs,
  type SofascoreTabItem,
} from "../../components/ui/primitives";
import { AtomicFormStrip } from "../atomic";
import { normalizeBookKey, resolvePreferredBookQuote } from "../bookmakers";
import { RefereeRigorBadge } from "../components/RefereeRigorBadge";
import { useSafeEffect } from "../hooks";
import { buildLeagueRefereeDirectory, type RefereeRigorTier } from "../referee-stats";
import {
  KnockoutBracketSvgPanel,
  type LeagueAttackDefenseTeamData,
  type LeagueKnockoutBracketData,
  type LeagueStandingsSplitsData,
  type StandingsSplitKey,
  type StandingsSplitRow,
} from "./StandingsBracketsSection";
import type { LeagueRefereeRankingData, RefereeProfileTier } from "./RefereesClubView";
import {
  resolveThemedPackSrcSet,
  resolveThemedPackUrl,
  usePackIconBase,
} from "../../pack-icon-theme";
import {
  LeagueBadge,
  TeamBadge,
  parseUserOdds,
} from "../../sports";
import {
  decimalToAmericanInt,
  formatOddsValue,
  getSessionWatermark,
  isPickUnlocked,
  isPreGameIntelUnlocked,
} from "../access-guard";
import { resolveCircularCountryFlag } from "../country-flags";
import {
  CrestPedestal,
  MaestroIcon,
  StackedAvatars,
} from "../components/MaestroPrimitives";
import { MatchList } from "../components/MatchList";
import { PlLeagueSelect } from "../components/PlSelect";
import { groupMatchesByDayAndLeague } from "./home/home-model";
import type { CortexSectionView } from "./match/CortexAnalysisCard";
import {
  MatchBreadcrumb,
  MatchHeroScoreboard,
  MatchLeftRail,
} from "./match/MatchHeroAndRail";
import { MatchPicksEvidenceBoard } from "./match/MatchPicksEvidenceBoard";
import { MatchTabPanel, MatchTabs, useMatchUrlTab } from "./match/MatchTabs";
import { PreMatchModule } from "./match/PreMatchModule";
import {
  SportOutlookCard,
  platformGameToSportOutlook,
} from "./match/sport-outlook";
import { useLiveMatch, useLiveScoreboard } from "../live/live-store";

const LazyLiveMatchPanelView = lazy(() =>
  import("../live/LiveMatchCenter").then((m) => ({ default: m.LiveMatchPanelView })),
);
const LazyCortexAnalysisCard = lazy(() =>
  import("./match/CortexAnalysisCard").then((m) => ({ default: m.CortexAnalysisCard })),
);
const LazyMatchNumbersPanel = lazy(() =>
  import("./match/MatchNumbersPanel").then((m) => ({ default: m.MatchNumbersPanel })),
);
const LazyMatchMoneyPanel = lazy(() =>
  import("./match/MatchMoneyPanel").then((m) => ({ default: m.MatchMoneyPanel })),
);
const LazyMatchContextPanel = lazy(() =>
  import("./match/MatchContextPanel").then((m) => ({ default: m.MatchContextPanel })),
);

function MatchTabFallback(): React.JSX.Element {
  return (
    <div
      className="pl-skel-card rounded-2xl p-5 space-y-3"
      role="status"
      aria-busy="true"
      aria-label="Cargando análisis del partido"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="pl-skel-bar h-5 w-44 rounded-lg" />
        <div className="pl-skel-bar h-6 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="pl-skel-bar h-24 rounded-xl" />
        <div className="pl-skel-bar h-24 rounded-xl" />
      </div>
      <div className="pl-skel-bar h-16 rounded-xl" />
    </div>
  );
}
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import {
  useJournalEntries,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
  useSocialState,
} from "../platform-provider";
import {
  SocialReportDialog,
  ownIdentityFor,
  useFollowedTopics,
  useFollowing,
  type SocialReportTarget,
} from "./community-ui";
import {
  SOCIAL_POST_MAX_CHARS,
  SocialPostCard,
  copyPostPickToJournal,
  copyPostPickToParlay,
  isPlainClick,
  resolvePostAuthor,
  shareSocialPost,
} from "./SocialPostCard";
import type {
  LeagueNewsArticleSummary,
  LeagueNewsCategory,
  LeagueNewsItem,
  MatchPick,
  MatchTabKey,
  PlatformDataset,
  PlatformGame,
  PlatformGameDetail,
  PlatformLeagueSummary,
  PlatformMarketRow,
  RiskBand,
  ViewerRole,
} from "../types";
import { shortDateLabel } from "./home/home-model";

export type LeagueHubSectionKey =
  | "tabla"
  | "eliminatorias"
  | "estadisticas"
  | "partidos"
  | "equipos"
  | "arbitros"
  | "noticias";

export interface LeagueSeasonProgressData {
  readonly seasonLabel: string;
  readonly periodLabel: string;
  readonly startDateIso: string | null;
  readonly endDateIso: string | null;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly playedRounds: number;
  readonly totalRounds: number;
  readonly pct: number;
  readonly progressSummary: string;
}

export interface LeagueStatLeaderEntryData {
  readonly rank: number;
  readonly playerSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly teamHref: string;
  readonly playerHref: string;
  readonly positionLabel: string;
  readonly appearances: number;
  readonly primaryValue: number;
  readonly primaryFormatted: string;
  readonly secondaryLabel: string | null;
}

export interface LeagueStatLeaderCategoryData {
  readonly key: string;
  readonly label: string;
  readonly unitLabel: string;
  readonly entries: readonly LeagueStatLeaderEntryData[];
}

export interface LeagueTeamStatLeaderEntryData {
  readonly rank: number;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly teamHref: string;
  readonly played: number;
  readonly primaryValue: number;
  readonly primaryFormatted: string;
  readonly secondaryLabel: string | null;
}

export interface LeagueStatLeadersData {
  readonly playerCategories: readonly LeagueStatLeaderCategoryData[];
  readonly teamAttack: readonly LeagueTeamStatLeaderEntryData[];
  readonly teamDefense: readonly LeagueTeamStatLeaderEntryData[];
  readonly scoringUnitPlural: string;
}

export interface LeagueTitleCandidateData {
  readonly rank: number;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly teamHref: string;
  readonly currentRank: number;
  readonly played: number;
  readonly points: number;
  readonly winPct: number | null;
  readonly titleProbPct: number;
  readonly fairDecimal: number;
  readonly netRatingLabel: string;
}

export interface LeagueTitleProjectionData {
  readonly titleLabel: string;
  readonly subtitle: string;
  readonly candidates: readonly LeagueTitleCandidateData[];
}

export interface LeagueHubCapabilitiesData {
  readonly sport: PlatformSport;
  readonly tier: "tier1_core" | "tier1_major_cup" | "tier2_expansion";
  readonly hasStandingsTable: boolean;
  readonly hasKnockoutBracket: boolean;
  readonly hasRelegationZones: boolean;
  readonly hasReferees: boolean;
  readonly hasPlayerProps: boolean;
}

export interface LeagueAttackDefenseTableData {
  readonly league: string;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly season: string;
  readonly updatedAt: string;
  readonly leagueSize: number;
  readonly teams: readonly LeagueAttackDefenseTeamData[];
}

export interface LeagueHubEnrichmentData {
  readonly league: string;
  readonly leagueLabel: string;
  readonly capabilities: LeagueHubCapabilitiesData;
  readonly seasonProgress: LeagueSeasonProgressData;
  readonly standingsSplits: LeagueStandingsSplitsData | null;
  readonly bracket: LeagueKnockoutBracketData | null;
  readonly attackDefense: LeagueAttackDefenseTableData | null;
  readonly statLeaders: LeagueStatLeadersData;
  readonly titleProjection: LeagueTitleProjectionData | null;
  readonly refereeRanking: LeagueRefereeRankingData | null;
}

const LEAGUE_SECTIONS: ReadonlyArray<{ key: LeagueHubSectionKey; label: string }> = [
  { key: "tabla", label: "Clasificaciones" },
  { key: "eliminatorias", label: "Eliminatorias" },
  { key: "estadisticas", label: "Estadísticas" },
  { key: "partidos", label: "Partidos" },
  { key: "equipos", label: "Equipos" },
  { key: "arbitros", label: "Árbitros" },
  { key: "noticias", label: "Noticias" },
];

const INITIAL_STANDINGS_ROWS = 20;
const INITIAL_LEFT_MATCHES = 6;
const INITIAL_DIRECTORY_TEAMS = 24;
const INITIAL_REFEREE_ROWS = 15;

const LEAGUE_COUNTRY_META: Readonly<Record<string, { country: string; slug: string | null }>> = {
  ...Object.fromEntries(
    Object.values(COMPETITION_BY_ID).map((c) => [
      c.id,
      { country: c.country, slug: c.countrySlug },
    ]),
  ),
  "la-liga": { country: "España", slug: "espana" },
  ncaaf: { country: "Estados Unidos", slug: "estados-unidos" },
};

const LEAGUE_SPORT_CRUMB: Readonly<Record<string, string>> = {
  football: "Fútbol",
  "american-football": "Fútbol americano",
  basketball: "Basquetbol",
  "ice-hockey": "Hockey",
  baseball: "Béisbol",
};

function formatSlashDateFull(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay);
  if (!m) return isoDay;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function safePublicText(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed || !isSafePublicLabel(trimmed)) return fallback;
  return trimmed;
}

type NearestScrollIntoViewOptions = ScrollIntoViewOptions & {
  readonly container?: "all" | "nearest";
};

function scrollLeagueTabIntoView(element: HTMLButtonElement | null): void {
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

function extractRoundOrder(label: string): number {
  const match = /(\d{1,3})/.exec(label);
  if (!match) return 999;
  const parsed = parseStrictFiniteNumber(match[1]);
  return parsed ?? 999;
}

interface CompactMatchGroup {
  readonly id: string;
  readonly label: string;
  readonly games: readonly PlatformGame[];
}

function groupLeagueCompactMatches(
  games: readonly PlatformGame[],
  mode: "date" | "round",
): CompactMatchGroup[] {
  if (games.length === 0) return [];
  const buckets = new Map<string, { label: string; sortKey: string; order: number; games: PlatformGame[] }>();

  for (const g of games) {
    if (mode === "round") {
      const roundLabel = safePublicText(g.round, shortDateLabel(g.dayId));
      const key = roundLabel.toLowerCase();
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          label: roundLabel,
          sortKey: g.dayId,
          order: extractRoundOrder(roundLabel),
          games: [g],
        });
      } else {
        existing.games.push(g);
        if (g.dayId < existing.sortKey) existing.sortKey = g.dayId;
      }
    } else {
      const key = g.dayId;
      const existing = buckets.get(key);
      const hasOpen = g.status !== "FT";
      if (!existing) {
        buckets.set(key, {
          label: hasOpen ? shortDateLabel(g.dayId) : `${shortDateLabel(g.dayId)} · FT`,
          sortKey: g.dayId,
          order: 0,
          games: [g],
        });
      } else {
        existing.games.push(g);
        if (hasOpen && existing.label.endsWith("· FT")) {
          existing.label = shortDateLabel(g.dayId);
        }
      }
    }
  }

  return Array.from(buckets.entries())
    .sort(([, a], [, b]) => {
      if (mode === "round" && a.order !== b.order) return a.order - b.order;
      return a.sortKey.localeCompare(b.sortKey);
    })
    .map(([id, info]) => ({
      id,
      label: info.label,
      games: info.games.slice().sort((x, y) => x.kickoffUtc.localeCompare(y.kickoffUtc)),
    }));
}

function resolveFeaturedOutcomeBookQuote(
  game: PlatformGame,
  side: "home" | "draw" | "away",
  preferredBooks: readonly string[],
): { readonly bookLabel: string; readonly decimal: number } | null {
  const matchKeys =
    side === "home"
      ? ["home", "1", "local", "h"]
      : side === "draw"
        ? ["draw", "x", "empate", "d"]
        : ["away", "2", "visita", "visitante", "a"];

  for (const pk of game.picks) {
    const sel = pk.selectionKey.trim().toLowerCase();
    const grp = pk.marketGroup.trim().toLowerCase();
    const isMoneylineOr1x2 =
      grp.includes("1x2") ||
      grp.includes("ganador") ||
      grp.includes("moneyline") ||
      grp.includes("resultado");
    if (!isMoneylineOr1x2) continue;
    if (!matchKeys.some((k) => sel === k || sel.endsWith(`_${k}`) || sel.endsWith(`:${k}`))) {
      continue;
    }
    const quote = resolvePreferredBookQuote(pk.bookQuotes, preferredBooks);
    if (quote) {
      return { bookLabel: quote.bookLabel, decimal: quote.decimal };
    }
  }

  const mkt = game.spacetime?.market;
  if (mkt) {
    const bookKey = normalizeBookKey(mkt.bookLabel);
    if (
      !isBlockedMarketQuoteBook(bookKey, mkt.bookLabel) &&
      isPermittedMarketQuoteBook(bookKey, mkt.bookLabel)
    ) {
      const dec =
        side === "home"
          ? mkt.odds.home
          : side === "draw"
            ? mkt.odds.draw
            : mkt.odds.away;
      if (typeof dec === "number" && Number.isFinite(dec) && dec > 1.01) {
        return { bookLabel: mkt.bookLabel, decimal: dec };
      }
    }
  }

  return null;
}

const NEWS_CATEGORY_FILTERS: ReadonlyArray<{
  key: LeagueNewsCategory | "all";
  label: string;
}> = [
  { key: "all", label: "Todas" },
  { key: "jornada", label: "Actualidad y tabla" },
  { key: "lesiones", label: "Parte médico" },
  { key: "analisis", label: "Claves y análisis" },
  { key: "mercado", label: "Mercado" },
  { key: "resultados", label: "Resultados" },
];

function normalizeLeagueSection(raw: string | null | undefined): LeagueHubSectionKey {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "tabla" || v === "posiciones" || v === "clasificacion" || v === "clasificaciones" || v === "standings") {
    return "tabla";
  }
  if (v === "eliminatorias" || v === "llaves" || v === "playoffs" || v === "bracket" || v === "liguilla") {
    return "eliminatorias";
  }
  if (v === "estadisticas" || v === "stats" || v === "lideres") {
    return "estadisticas";
  }
  if (v === "noticias" || v === "news") return "noticias";
  if (v === "equipos" || v === "selecciones" || v === "teams") return "equipos";
  if (v === "arbitros" || v === "referees") return "arbitros";
  return "partidos";
}

function buildFallbackLeagueNews(
  leagueSummary: PlatformLeagueSummary,
  leagueGames: readonly PlatformGame[],
  viewerRole: ViewerRole,
): LeagueNewsItem[] {
  const items: LeagueNewsItem[] = [];
  const league = leagueSummary.league;

  if (leagueSummary.standings.length >= 2) {
    const leader = leagueSummary.standings[0]!;
    const second = leagueSummary.standings[1]!;
    const gap = leader.points - second.points;
    const leaderSlug = leader.teamId.includes(".")
      ? leader.teamId.split(".").slice(1).join(".")
      : leader.teamId;
    items.push({
      id: `${league}-fb-leader`,
      category: "jornada",
      categoryLabel: "Tabla y liderato",
      title: `${leader.name} lidera ${leagueSummary.label} con ${leader.points} puntos`,
      summary:
        gap > 0
          ? `Suma ${leader.won}G-${leader.drawn}E-${leader.lost}P en ${leader.played} partidos, con +${gap} pts sobre ${second.name}.`
          : `Comparte la cima en puntos (${leader.points}) junto a ${second.name} en ${leader.played} partidos.`,
      publishedAtLabel: "Jornada vigente",
      badge: `1.º · ${leader.points} pts`,
      team: {
        slug: leaderSlug,
        name: leader.name,
        logoUrl: leader.logoUrl,
      },
      href: canonicalTeamHref(league, leaderSlug),
      ctaLabel: `Ver perfil de ${leader.shortName || leader.name}`,
    });
  }

  for (const g of leagueGames) {
    if (items.length >= 8) break;
    const intelUnlocked = g.status === "FT" || isPreGameIntelUnlocked(g, viewerRole);
    if (intelUnlocked && g.preGame.absences.length > 0 && g.status !== "FT") {
      const sample = g.preGame.absences
        .slice(0, 2)
        .map((a) => `${a.player} (${a.status}${a.impactNote ? ` · ${a.impactNote}` : ""})`)
        .join("; ");
      items.push({
        id: `${league}-fb-abs-${g.id}`,
        category: "lesiones",
        categoryLabel: "Parte médico",
        title: `Disponibilidad rumbo a ${g.home.shortName} vs ${g.away.shortName}`,
        summary: sample,
        publishedAtLabel: `${shortDateLabel(g.dayId)} · ${g.kickoffLocal}`,
        badge: `${g.preGame.absences.length} reportes`,
        team: {
          slug: g.home.slug,
          name: g.home.name,
          logoUrl: g.home.logoUrl,
        },
        href: canonicalGameHref(league, g),
        ctaLabel: "Ver partido",
      });
    } else if (intelUnlocked && g.status !== "FT" && g.preGame.cortexSynthesis) {
      items.push({
        id: `${league}-fb-ana-${g.id}`,
        category: "analisis",
        categoryLabel: "Claves del modelo",
        title: `${g.home.name} vs ${g.away.name} (${shortDateLabel(g.dayId)} · ${g.kickoffLocal})`,
        summary: g.preGame.cortexSynthesis,
        publishedAtLabel: `${shortDateLabel(g.dayId)} · ${g.kickoffLocal}`,
        badge: g.round,
        team: {
          slug: g.home.slug,
          name: g.home.name,
          logoUrl: g.home.logoUrl,
        },
        href: canonicalGameHref(league, g),
        ctaLabel: "Ver análisis y picks",
      });
    } else if (g.status === "FT" && g.score) {
      items.push({
        id: `${league}-fb-ft-${g.id}`,
        category: "resultados",
        categoryLabel: "Resultado verificado FT",
        title: `${g.home.shortName} ${g.score.home} – ${g.score.away} ${g.away.shortName}`,
        summary: `Marcador oficial cerrado en ${g.venue || leagueSummary.label}.`,
        publishedAtLabel: `${shortDateLabel(g.dayId)} · ${g.kickoffLocal}`,
        badge: "Final FT",
        team: {
          slug: g.score.away > g.score.home ? g.away.slug : g.home.slug,
          name: g.score.away > g.score.home ? g.away.name : g.home.name,
          logoUrl: g.score.away > g.score.home ? g.away.logoUrl : g.home.logoUrl,
        },
        href: canonicalGameHref(league, g),
        ctaLabel: "Ver resultado",
      });
    }
  }

  return items;
}

export interface LeagueStandingsSplitMeta {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: ReadonlyArray<"G" | "E" | "P">;
}

export interface LeagueStandingsMeta {
  formBySlug: Readonly<Record<string, ReadonlyArray<"G" | "E" | "P">>>;
  homeBySlug?: Readonly<Record<string, LeagueStandingsSplitMeta>>;
  awayBySlug?: Readonly<Record<string, LeagueStandingsSplitMeta>>;
}

type StandingsZoneTone = "ucl" | "uel" | "uecl" | "warn" | "rel";

interface StandingsZoneDef {
  id: string;
  label: string;
  tone: StandingsZoneTone;
  startRank: number;
  endRank: number;
}

export function resolveLeagueStandingsZones(
  league: string,
  sport: string,
  totalTeams: number,
): StandingsZoneDef[] {
  if (totalTeams < 4) return [];
  const clamp = (zones: StandingsZoneDef[]) =>
    zones
      .filter((z) => z.startRank <= totalTeams)
      .map((z) => ({ ...z, endRank: Math.min(z.endRank, totalTeams) }))
      .filter((z) => z.endRank >= z.startRank);

  if (league === "bundesliga") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4 },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5 },
      {
        id: "uecl",
        label: "Clasificación para la Conference League",
        tone: "uecl",
        startRank: 6,
        endRank: 6,
      },
      ...(totalTeams >= 16
        ? [
            {
              id: "playoff-rel",
              label: "Playoffs Descenso",
              tone: "warn" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams - 2,
            },
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 1,
              endRank: totalTeams,
            },
          ]
        : []),
    ]);
  }

  if (league === "premier-league") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4 },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5 },
      ...(totalTeams >= 18
        ? [
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams,
            },
          ]
        : []),
    ]);
  }

  if (league === "laliga" || league === "la-liga" || league === "serie-a") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4 },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5 },
      {
        id: "uecl",
        label: "Clasificación para la Conference League",
        tone: "uecl",
        startRank: 6,
        endRank: 6,
      },
      ...(totalTeams >= 18
        ? [
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams,
            },
          ]
        : []),
    ]);
  }

  if (league === "ligue-1") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 3 },
      {
        id: "ucl-q",
        label: "Clasificación Liga de Campeones",
        tone: "uel",
        startRank: 4,
        endRank: 4,
      },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5 },
      {
        id: "uecl",
        label: "Clasificación para la Conference League",
        tone: "uecl",
        startRank: 6,
        endRank: 6,
      },
      ...(totalTeams >= 16
        ? [
            {
              id: "playoff-rel",
              label: "Playoffs Descenso",
              tone: "warn" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams - 2,
            },
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 1,
              endRank: totalTeams,
            },
          ]
        : []),
    ]);
  }

  if (league === "liga-mx") {
    return clamp([
      { id: "liguilla", label: "Liguilla (Cuartos de final)", tone: "ucl", startRank: 1, endRank: 8 },
    ]);
  }

  if (league === "champions-league" || league === "europa-league" || league === "conference-league") {
    return clamp([
      { id: "r16", label: "Octavos de final", tone: "ucl", startRank: 1, endRank: 8 },
      { id: "ko", label: "Playoffs eliminatorios", tone: "uel", startRank: 9, endRank: 24 },
      ...(totalTeams >= 25
        ? [{ id: "out", label: "Eliminación", tone: "rel" as const, startRank: 25, endRank: totalTeams }]
        : []),
    ]);
  }

  if (sport === "basketball") {
    if (totalTeams > 16) return [];
    return clamp([
      { id: "po", label: "Playoffs directos", tone: "ucl", startRank: 1, endRank: 6 },
      ...(totalTeams >= 10
        ? [{ id: "pi", label: "Torneo Play-In", tone: "warn" as const, startRank: 7, endRank: 10 }]
        : []),
    ]);
  }

  if (sport === "ice-hockey") {
    if (totalTeams > 16) return [];
    return clamp([
      { id: "po", label: "Clasificación a Playoffs", tone: "ucl", startRank: 1, endRank: 8 },
    ]);
  }

  if (sport === "american-football") {
    if (totalTeams > 16) return [];
    return clamp([
      { id: "po", label: "Clasificación a Playoffs", tone: "ucl", startRank: 1, endRank: Math.min(7, totalTeams) },
    ]);
  }

  if (sport === "baseball") {
    if (totalTeams > 16) return [];
    return clamp([
      { id: "div", label: "Líderes divisionales", tone: "ucl", startRank: 1, endRank: 3 },
      { id: "wc", label: "Comodín (Wild Card)", tone: "uel", startRank: 4, endRank: 6 },
    ]);
  }

  if (league === "amistosos" || isNationalCompetition(league)) {
    if (league === "amistosos" || totalTeams > 6) return [];
    return clamp([
      { id: "qual", label: "Clasificación a fase final", tone: "ucl", startRank: 1, endRank: Math.min(2, totalTeams) },
    ]);
  }

  return [];
}

function resolveLeagueTieBreakers(
  league: string,
  sport: string,
  scoringPlural: string,
): { intro: string; items: string[] } {
  const unitCap = scoringPlural.charAt(0).toUpperCase() + scoringPlural.slice(1);
  if (league === "amistosos") {
    return {
      intro: "Tabla acumulada de resultados en encuentros internacionales amistosos (sin plazas eliminatorias):",
      items: [`Diferencia de ${scoringPlural}`, `${unitCap} a favor`],
    };
  }
  if (league === "liga-mx") {
    return {
      intro: "Los 8 mejores clasifican directo a Cuartos de final de la Liguilla (sin Play-In ni descenso). Criterios de desempate:",
      items: [
        "Diferencia de goles",
        "Goles a favor",
        "Goles anotados como visitante",
        "Enfrentamiento directo",
      ],
    };
  }
  if (league === "laliga" || league === "la-liga") {
    return {
      intro: "Si dos o más clubes empatan en puntos al final de la temporada, los criterios de desempate son:",
      items: [
        "Enfrentamiento directo (puntos y diferencia de goles entre los implicados)",
        "Diferencia de goles general",
        "Goles a favor",
      ],
    };
  }
  if (league === "serie-a") {
    return {
      intro: "En caso de empate en puntos (el título y el descenso se definen por partido de desempate cuando hay igualdad entre dos equipos):",
      items: [
        "Enfrentamiento directo (puntos y diferencia de goles)",
        "Diferencia de goles general",
        "Goles a favor",
      ],
    };
  }
  if (league === "premier-league") {
    return {
      intro: "En caso de empate en puntos (las plazas europeas adicionales dependen de las copas nacionales):",
      items: ["Diferencia de goles", "Goles a favor", "Enfrentamiento directo"],
    };
  }
  if (league === "bundesliga" || league === "ligue-1") {
    return {
      intro: "Si dos equipos terminan igualados en puntos, los criterios de desempate son:",
      items: ["Diferencia de goles", "Goles a favor", "Enfrentamiento directo"],
    };
  }
  if (league === "champions-league" || league === "europa-league" || league === "conference-league") {
    const roundsLabel = league === "conference-league" ? "6 jornadas" : "8 jornadas";
    return {
      intro: `En la fase de liga (36 clubes, ${roundsLabel}), el desempate sigue el reglamento UEFA:`,
      items: ["Diferencia de goles", "Goles a favor", "Goles como visitante", "Número de victorias"],
    };
  }
  if (sport === "ice-hockey") {
    return {
      intro: "Criterios de desempate en temporada regular NHL:",
      items: [
        "Victorias en tiempo reglamentario (RW)",
        "Victorias en tiempo reglamentario y tiempo extra (ROW)",
        "Diferencia de goles",
      ],
    };
  }
  if (sport === "basketball" || sport === "american-football" || sport === "baseball") {
    return {
      intro: "Criterios principales de desempate en clasificación:",
      items: [
        "Porcentaje de victorias",
        "Enfrentamiento directo",
        `Diferencia de ${scoringPlural}`,
      ],
    };
  }
  return {
    intro: "Si dos selecciones o equipos están empatados en la clasificación, se utilizan los siguientes criterios de desempate:",
    items: [`Diferencia de ${scoringPlural}`, `${unitCap} a favor`, "Enfrentamiento directo"],
  };
}

export function LeagueHubClubView({
  leagueId,
  initialNews,
  initialSection,
  standingsMeta,
  initialStandings,
  enrichment,
}: {
  leagueId: LeagueId;
  initialNews?: readonly LeagueNewsItem[];
  initialSection?: LeagueHubSectionKey;
  standingsMeta?: LeagueStandingsMeta | null;
  initialStandings?: readonly StandingRow[];
  enrichment?: LeagueHubEnrichmentData | null;
}): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, favoriteLeagues, preferredBooks } = usePlatformCore();
  const { setFavoriteLeagues, pushToast, navigateTo } = usePlatformActions();
  const { topics, toggleLeague: toggleFollowedLeague } = useFollowedTopics();
  const iconBase = usePackIconBase();
  const liveSnap = useLiveScoreboard(true);

  const baseLeagueSummary =
    dataset.leagues.find((l) => l.league === leagueId) ?? dataset.leagues[0]!;
  const leagueSummary = useMemo(
    () =>
      initialStandings && initialStandings.length > 0
        ? { ...baseLeagueSummary, standings: [...initialStandings] }
        : baseLeagueSummary,
    [baseLeagueSummary, initialStandings],
  );

  const hasEnrichedStandings = Boolean(
    enrichment?.standingsSplits && enrichment.standingsSplits.total.length > 0,
  );
  const hasAnyStandings = hasEnrichedStandings || leagueSummary.standings.length > 0;
  const defaultSection: LeagueHubSectionKey =
    initialSection ?? (hasAnyStandings ? "tabla" : "partidos");

  const [dayFilter, setDayFilter] = useState<string>("all");
  const [section, setSection] = useState<LeagueHubSectionKey>(defaultSection);
  const [standingsSplit, setStandingsSplit] = useState<StandingsSplitKey>("total");
  const [standingsConference, setStandingsConference] = useState<string>("auto");
  const [showAllStandings, setShowAllStandings] = useState<boolean>(false);
  const [matchGroupMode, setMatchGroupMode] = useState<"date" | "round">("date");
  const [showAllLeftMatches, setShowAllLeftMatches] = useState<boolean>(false);
  const [statCategoryKey, setStatCategoryKey] = useState<string>("auto");
  const [teamQuery, setTeamQuery] = useState<string>("");
  const [showAllTeams, setShowAllTeams] = useState<boolean>(false);
  const [refereeTier, setRefereeTier] = useState<RefereeRigorTier | RefereeProfileTier | "all">("all");
  const [showAllReferees, setShowAllReferees] = useState<boolean>(false);
  const [newsCategory, setNewsCategory] = useState<LeagueNewsCategory | "all">("all");
  const [selectedNewsItem, setSelectedNewsItem] = useState<LeagueNewsItem | null>(null);
  const [loadedNewsSummary, setLoadedNewsSummary] = useState<LeagueNewsArticleSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const newsSummaryCacheRef = useRef<Map<string, LeagueNewsArticleSummary>>(new Map());
  const summaryAbortRef = useRef<AbortController | null>(null);
  const newsDialogTitleId = useId();
  const sectionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const conferenceRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const standingsPanelRef = useRef<HTMLDivElement | null>(null);

  useSafeEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("vista") ?? params.get("tab");
    if (raw) {
      setSection(normalizeLeagueSection(raw));
    } else if (!initialSection) {
      setSection(hasAnyStandings ? "tabla" : "partidos");
    }
  }, [leagueId, initialSection, hasAnyStandings]);

  useSafeEffect(() => {
    setStandingsConference("auto");
    setStandingsSplit("total");
    setShowAllStandings(false);
    setShowAllLeftMatches(false);
    setShowAllTeams(false);
    setShowAllReferees(false);
    setStatCategoryKey("auto");
  }, [leagueId]);

  useSafeEffect(() => () => summaryAbortRef.current?.abort(), []);

  const selectSection = (next: LeagueHubSectionKey) => {
    setSection(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("vista", next);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  };

  const isNational = isNationalCompetition(leagueSummary.league);
  const leagueSport = sportForLeague(leagueSummary.league);
  const hasDraw = sportHasDraw(leagueSport);
  const scoringUnit = sportScoringUnit(leagueSport);
  const contractCapability = useMemo(
    () => getLeagueCapability(String(leagueSummary.league)) ?? null,
    [leagueSummary.league],
  );
  const supportsStandings =
    enrichment?.capabilities.hasStandingsTable ??
    contractCapability?.hasStandingsTable ??
    hasAnyStandings;
  const supportsKnockout =
    Boolean(enrichment?.bracket) &&
    (enrichment?.capabilities.hasKnockoutBracket ?? contractCapability?.hasKnockoutBracket ?? false);
  const supportsReferees =
    enrichment?.capabilities.hasReferees ??
    Boolean(contractCapability?.providers.referees && leagueSport === "football");

  const leagueGames = useMemo(
    () => dataset.games.filter((g) => g.league === leagueSummary.league),
    [dataset.games, leagueSummary.league],
  );
  const leagueReferees = useMemo(
    () => buildLeagueRefereeDirectory(dataset.games, leagueSummary.league),
    [dataset.games, leagueSummary.league],
  );
  const serverReferees = useMemo(
    () => enrichment?.refereeRanking?.referees ?? [],
    [enrichment?.refereeRanking],
  );
  const hasServerReferees = supportsReferees && serverReferees.length > 0;
  const hasFallbackReferees = supportsReferees && !hasServerReferees && leagueReferees.length > 0;
  const hasRefereesTab = hasServerReferees || hasFallbackReferees;

  const filteredServerReferees = useMemo(
    () =>
      refereeTier === "all"
        ? serverReferees
        : serverReferees.filter((r) => r.tier === refereeTier),
    [serverReferees, refereeTier],
  );
  const filteredFallbackReferees = useMemo(
    () =>
      refereeTier === "all"
        ? leagueReferees
        : leagueReferees.filter((r) => r.rigorTier === refereeTier),
    [leagueReferees, refereeTier],
  );

  const dayOptions = useMemo(() => {
    const byDay = new Map<string, { label: string; hasOpen: boolean }>();
    for (const g of leagueGames) {
      const existing = byDay.get(g.dayId);
      const isOpen = g.status !== "FT";
      if (!existing) {
        byDay.set(g.dayId, { label: g.dayLabel, hasOpen: isOpen });
      } else if (isOpen && !existing.hasOpen) {
        existing.hasOpen = true;
      }
    }
    const sortedDays = Array.from(byDay.entries())
      .sort(([aId], [bId]) => aId.localeCompare(bId))
      .map(([id, info]) => ({
        id,
        label: info.hasOpen ? info.label : `${info.label} (FT)`,
      }));
    return [{ id: "all", label: "Toda la jornada" }, ...sortedDays];
  }, [leagueGames]);

  const filteredGames = useMemo(
    () =>
      dayFilter === "all"
        ? leagueGames
        : leagueGames.filter((g) => g.dayId === dayFilter),
    [leagueGames, dayFilter],
  );

  const upcoming = filteredGames.filter((g) => g.status !== "FT");
  const finished = filteredGames.filter((g) => g.status === "FT");
  const upcomingGroups = useMemo(() => groupMatchesByDayAndLeague(upcoming), [upcoming]);
  const finishedGroups = useMemo(() => groupMatchesByDayAndLeague(finished), [finished]);

  const leftCompactGames = useMemo(() => {
    const ordered = leagueGames.slice().sort((a, b) => {
      const aLive = String(a.status) === "LIVE" ? 0 : a.status === "NS" ? 1 : 2;
      const bLive = String(b.status) === "LIVE" ? 0 : b.status === "NS" ? 1 : 2;
      if (aLive !== bLive) return aLive - bLive;
      return a.kickoffUtc.localeCompare(b.kickoffUtc);
    });
    return showAllLeftMatches ? ordered : ordered.slice(0, INITIAL_LEFT_MATCHES);
  }, [leagueGames, showAllLeftMatches]);

  const leftMatchGroups = useMemo(
    () => groupLeagueCompactMatches(leftCompactGames, matchGroupMode),
    [leftCompactGames, matchGroupMode],
  );

  const directoryTeams = useMemo(() => {
    const directoryFromDataset = (dataset.teams ?? []).filter(
      (t) => t.league === leagueSummary.league,
    );
    if (directoryFromDataset.length > 0) return directoryFromDataset;
    if (enrichment?.standingsSplits && enrichment.standingsSplits.total.length > 0) {
      return enrichment.standingsSplits.total.map((row) => ({
        slug: row.teamSlug,
        name: row.name,
        shortName: row.shortName,
        href: row.teamHref,
      }));
    }
    const fallbackMap = new Map<
      string,
      { slug: string; name: string; shortName: string; href: string }
    >();
    for (const g of leagueGames) {
      for (const side of [g.home, g.away]) {
        if (!fallbackMap.has(side.slug)) {
          fallbackMap.set(side.slug, {
            slug: side.slug,
            name: side.name,
            shortName: side.shortName,
            href: canonicalTeamHref(leagueSummary.league, side.slug),
          });
        }
      }
    }
    return [...fallbackMap.values()].sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
  }, [dataset.teams, enrichment?.standingsSplits, leagueSummary.league, leagueGames]);

  const newsItems = useMemo<readonly LeagueNewsItem[]>(() => {
    if (initialNews && initialNews.length > 0) return initialNews;
    return buildFallbackLeagueNews(leagueSummary, leagueGames, viewerRole);
  }, [initialNews, leagueSummary, leagueGames, viewerRole]);

  const filteredNews = useMemo(
    () =>
      newsCategory === "all"
        ? newsItems
        : newsItems.filter((item) => item.category === newsCategory),
    [newsItems, newsCategory],
  );

  const availableNewsCategories = useMemo(() => {
    const present = new Set(newsItems.map((n) => n.category));
    return NEWS_CATEGORY_FILTERS.filter((f) => f.key === "all" || present.has(f.key));
  }, [newsItems]);

  const closeNewsModal = () => {
    summaryAbortRef.current?.abort();
    summaryAbortRef.current = null;
    setSelectedNewsItem(null);
    setSummaryLoading(false);
  };

  const openNewsSummary = async (item: LeagueNewsItem) => {
    summaryAbortRef.current?.abort();
    summaryAbortRef.current = null;
    setSelectedNewsItem(item);

    if (item.preloadedSummary) {
      setLoadedNewsSummary(item.preloadedSummary);
      setSummaryLoading(false);
      return;
    }

    const cached = newsSummaryCacheRef.current.get(item.id);
    if (cached) {
      setLoadedNewsSummary(cached);
      setSummaryLoading(false);
      return;
    }

    setLoadedNewsSummary(null);
    if (!item.summaryHref) {
      setSummaryLoading(false);
      return;
    }

    const controller = new AbortController();
    summaryAbortRef.current = controller;
    setSummaryLoading(true);
    try {
      const res = await fetch(item.summaryHref, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        if (!controller.signal.aborted) setSummaryLoading(false);
        return;
      }
      const data = (await res.json()) as LeagueNewsArticleSummary;
      if (controller.signal.aborted) return;
      newsSummaryCacheRef.current.set(item.id, data);
      setLoadedNewsSummary(data);
    } catch (err) {
      if (controller.signal.aborted) return;
      void err;
    } finally {
      if (!controller.signal.aborted) {
        setSummaryLoading(false);
      }
    }
  };

  const hubPath = `/app/${leagueSummary.league}`;
  const countryMeta = LEAGUE_COUNTRY_META[leagueSummary.league] ?? {
    country: "Internacional",
    slug: null,
  };
  const countryFlag = resolveCircularCountryFlag(countryMeta.slug, countryMeta.country);

  const isLeagueFavorited =
    favoriteLeagues.includes(leagueSummary.league) ||
    topics.leagues.includes(leagueSummary.league);

  const handleToggleFavoriteLeague = () => {
    const inFavs = favoriteLeagues.includes(leagueSummary.league);
    const inTopics = topics.leagues.includes(leagueSummary.league);
    if (inFavs || inTopics) {
      if (inFavs && favoriteLeagues.length > 1) {
        setFavoriteLeagues(favoriteLeagues.filter((item) => item !== leagueSummary.league));
      }
      if (inTopics) {
        toggleFollowedLeague(leagueSummary.league);
      }
      pushToast(`Dejaste de seguir ${leagueSummary.label}.`, "default");
    } else {
      setFavoriteLeagues([...favoriteLeagues, leagueSummary.league]);
      if (!inTopics) toggleFollowedLeague(leagueSummary.league);
      pushToast(`Ahora sigues ${leagueSummary.label}.`, "success");
    }
  };

  const seasonProgress = useMemo(() => {
    if (enrichment?.seasonProgress) {
      return enrichment.seasonProgress;
    }
    const sortedDays = [...new Set(leagueGames.map((g) => g.dayId))].sort();
    const startLabel = sortedDays[0]
      ? shortDateLabel(sortedDays[0])
      : leagueSummary.season || "Inicio";
    const endLabel = sortedDays[sortedDays.length - 1]
      ? shortDateLabel(sortedDays[sortedDays.length - 1])
      : leagueSummary.roundLabel || "Cierre";

    let pct = 38;
    let playedRounds = 0;
    let totalRounds = 1;
    if (leagueSummary.standings.length > 1) {
      const avgPlayed =
        leagueSummary.standings.reduce((acc, s) => acc + s.played, 0) /
        leagueSummary.standings.length;
      const leagueKey = String(leagueSummary.league);
      totalRounds =
        leagueKey === "conference-league"
          ? 6
          : leagueKey === "champions-league" || leagueKey === "europa-league"
            ? 8
            : leagueKey === "liga-mx"
              ? 17
              : leagueSport === "american-football"
                ? 17
                : leagueSport === "basketball" || leagueSport === "ice-hockey"
                  ? 82
                  : leagueSport === "baseball"
                    ? 162
                    : isNational
                      ? Math.max(6, Math.ceil(avgPlayed))
                      : Math.max(10, (leagueSummary.standings.length - 1) * 2);
      playedRounds = Math.round(avgPlayed);
      pct = Math.max(6, Math.min(100, Math.round((avgPlayed / Math.max(1, totalRounds)) * 100)));
    } else if (leagueSummary.totalGames > 0) {
      playedRounds = leagueSummary.finishedCount;
      totalRounds = leagueSummary.totalGames;
      pct = Math.max(
        8,
        Math.min(100, Math.round((leagueSummary.finishedCount / leagueSummary.totalGames) * 100)),
      );
    }
    return {
      seasonLabel: leagueSummary.season || "2026",
      periodLabel: leagueSummary.roundLabel || "",
      startDateIso: sortedDays[0] ?? null,
      endDateIso: sortedDays[sortedDays.length - 1] ?? null,
      startLabel,
      endLabel,
      playedRounds,
      totalRounds,
      pct,
      progressSummary: `${pct}% de la temporada`,
    };
  }, [enrichment?.seasonProgress, isNational, leagueGames, leagueSport, leagueSummary]);

  const recentFormBySlug = useMemo(() => {
    const map = new Map<string, Array<"G" | "E" | "P">>();
    const ftSorted = [...leagueGames]
      .filter((g) => g.status === "FT" && g.score)
      .sort((a, b) => a.dayId.localeCompare(b.dayId));
    for (const g of ftSorted) {
      const hs = g.score!.home;
      const as = g.score!.away;
      const hRes: "G" | "E" | "P" = hs > as ? "G" : hs < as ? "P" : "E";
      const aRes: "G" | "E" | "P" = as > hs ? "G" : as < hs ? "P" : "E";
      map.set(g.home.slug, [...(map.get(g.home.slug) ?? []), hRes].slice(-5));
      map.set(g.away.slug, [...(map.get(g.away.slug) ?? []), aRes].slice(-5));
    }
    return map;
  }, [leagueGames]);

  const expectedForBySlug = useMemo(() => {
    const map = new Map<string, number>();
    if (!enrichment?.attackDefense) return map;
    for (const team of enrichment.attackDefense.teams) {
      if (team.expectedGoalsFor.value !== null && Number.isFinite(team.expectedGoalsFor.value)) {
        map.set(team.teamSlug, team.expectedGoalsFor.value);
      }
    }
    return map;
  }, [enrichment?.attackDefense]);

  const standingsLogoBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of leagueSummary.standings) {
      const slug = row.teamId.includes(".") ? row.teamId.split(".").slice(1).join(".") : row.teamId;
      if (row.logoUrl && row.logoUrl.trim().length > 0) {
        map.set(slug, row.logoUrl.trim());
      }
    }
    return map;
  }, [leagueSummary.standings]);

  interface NormalizedStandingRow {
    readonly teamId: string;
    readonly slug: string;
    readonly name: string;
    readonly shortName: string;
    readonly logoUrl?: string;
    readonly conference?: string | null;
    readonly played: number;
    readonly won: number;
    readonly drawn: number;
    readonly lost: number;
    readonly otLosses?: number;
    readonly goalsFor: number;
    readonly goalsAgainst: number;
    readonly points: number;
    readonly winPct?: number | null;
    readonly gamesBehind?: string | null;
    readonly form: readonly string[];
    readonly expectedFor: number | null;
  }

  const displayedStandings = useMemo<readonly NormalizedStandingRow[]>(() => {
    const splits = enrichment?.standingsSplits;
    if (splits && splits.total.length > 0) {
      const sourceRows: readonly StandingsSplitRow[] =
        standingsSplit === "home"
          ? splits.home
          : standingsSplit === "away"
            ? splits.away
            : splits.total;
      return sourceRows.map((row) => ({
        teamId: row.teamId,
        slug: row.teamSlug,
        name: row.name,
        shortName: row.shortName,
        logoUrl: standingsLogoBySlug.get(row.teamSlug),
        conference: row.conference,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        otLosses: row.drawn,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        points: row.points,
        winPct: row.winPct,
        gamesBehind: row.gamesBehind,
        form: row.form,
        expectedFor: standingsSplit === "total" ? (expectedForBySlug.get(row.teamSlug) ?? null) : null,
      }));
    }

    const slugOf = (teamId: string) =>
      teamId.includes(".") ? teamId.split(".").slice(1).join(".") : teamId;

    return leagueSummary.standings.map((row) => {
      const slug = slugOf(row.teamId);
      const serverForm = standingsMeta?.formBySlug[slug];
      const rowForm: Array<"G" | "E" | "P"> = Array.isArray(row.form)
        ? row.form.map((t) => (t === "W" ? "G" : t === "L" ? "P" : "E"))
        : [];
      return {
        teamId: row.teamId,
        slug,
        name: row.name,
        shortName: row.shortName,
        logoUrl: row.logoUrl && row.logoUrl.trim().length > 0 ? row.logoUrl.trim() : undefined,
        conference: row.conference,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        otLosses: row.otLosses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        points: row.points,
        winPct: row.winPct,
        gamesBehind: row.gamesBehind,
        form:
          serverForm && serverForm.length > 0
            ? [...serverForm]
            : rowForm.length > 0
              ? rowForm
              : (recentFormBySlug.get(slug) ?? []),
        expectedFor: expectedForBySlug.get(slug) ?? null,
      };
    });
  }, [
    enrichment?.standingsSplits,
    expectedForBySlug,
    leagueSummary.standings,
    recentFormBySlug,
    standingsLogoBySlug,
    standingsMeta,
    standingsSplit,
  ]);

  const leaderRow = displayedStandings[0] ?? null;

  const conferenceTabs = useMemo(() => {
    const seen: string[] = [];
    for (const row of displayedStandings) {
      const c = row.conference?.trim();
      if (c && !seen.includes(c)) seen.push(c);
    }
    if (seen.length < 2) return [] as string[];
    const preferredOrder = ["AFC", "NFC", "Este", "Oeste", "Liga Americana", "Liga Nacional"];
    return seen.sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b, "es");
    });
  }, [displayedStandings]);

  const activeConference = useMemo(() => {
    if (conferenceTabs.length < 2) return "all";
    if (standingsConference === "all") return "all";
    if (standingsConference !== "auto" && conferenceTabs.includes(standingsConference)) {
      return standingsConference;
    }
    return conferenceTabs[0]!;
  }, [conferenceTabs, standingsConference]);

  const scopedStandings = useMemo(() => {
    if (activeConference === "all") return displayedStandings;
    return displayedStandings.filter((r) => r.conference === activeConference);
  }, [activeConference, displayedStandings]);

  const visibleStandings = useMemo(
    () =>
      showAllStandings
        ? scopedStandings
        : scopedStandings.slice(0, INITIAL_STANDINGS_ROWS),
    [scopedStandings, showAllStandings],
  );

  const standingsZones = useMemo(
    () =>
      standingsSplit === "total"
        ? resolveLeagueStandingsZones(leagueSummary.league, leagueSport, scopedStandings.length)
        : [],
    [scopedStandings.length, leagueSport, leagueSummary.league, standingsSplit],
  );

  const standingsTieBreakers = useMemo(
    () => resolveLeagueTieBreakers(leagueSummary.league, leagueSport, scoringUnit.plural),
    [leagueSport, leagueSummary.league, scoringUnit.plural],
  );

  const featuredMatch = useMemo(() => {
    const liveMap = new Map<string, LiveScoreboardEntry>();
    if (liveSnap.data) {
      for (const e of liveSnap.data.entries) {
        liveMap.set(e.gameId, e);
      }
    }
    const liveGame = leagueGames.find((g) => {
      const e = liveMap.get(g.id);
      return (e ? isLivePhaseActive(e.phase) : false) || String(g.status) === "LIVE";
    });
    if (liveGame) {
      return { game: liveGame, liveEntry: liveMap.get(liveGame.id) ?? null, isLive: true };
    }
    const bestUpcoming = [...leagueGames]
      .filter((g) => g.status !== "FT")
      .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0))[0];
    if (bestUpcoming) {
      return { game: bestUpcoming, liveEntry: null, isLive: false };
    }
    const lastFt = leagueGames[0] ?? null;
    return lastFt ? { game: lastFt, liveEntry: null, isLive: false } : null;
  }, [leagueGames, liveSnap.data]);

  const statLeaders = enrichment?.statLeaders ?? null;
  const hasStatLeadersTab = Boolean(
    statLeaders &&
      (statLeaders.playerCategories.length > 0 ||
        statLeaders.teamAttack.length > 0 ||
        statLeaders.teamDefense.length > 0),
  );
  const activeStatCategory = useMemo(() => {
    if (!statLeaders || statLeaders.playerCategories.length === 0) return null;
    if (statCategoryKey !== "auto") {
      const matched = statLeaders.playerCategories.find((c) => c.key === statCategoryKey);
      if (matched) return matched;
    }
    return statLeaders.playerCategories[0] ?? null;
  }, [statLeaders, statCategoryKey]);

  const visibleSections = useMemo(
    () =>
      LEAGUE_SECTIONS.filter((tabDef) => {
        if (tabDef.key === "tabla") return supportsStandings || hasAnyStandings;
        if (tabDef.key === "eliminatorias") return supportsKnockout;
        if (tabDef.key === "estadisticas") return hasStatLeadersTab;
        if (tabDef.key === "arbitros") return hasRefereesTab;
        if (tabDef.key === "noticias") return newsItems.length > 0;
        if (tabDef.key === "equipos") {
          return (
            !hasAnyStandings ||
            isKnockoutCupCompetition(leagueSummary.league) ||
            isNational
          );
        }
        return true;
      }),
    [
      supportsStandings,
      hasAnyStandings,
      supportsKnockout,
      hasStatLeadersTab,
      hasRefereesTab,
      newsItems.length,
      leagueSummary.league,
      isNational,
    ],
  );

  const visibleSectionKeys = useMemo(
    () => new Set<LeagueHubSectionKey>(visibleSections.map((tab) => tab.key)),
    [visibleSections],
  );

  const conferenceOptions = useMemo(
    () => (conferenceTabs.length >= 2 ? [...conferenceTabs, "all"] : []),
    [conferenceTabs],
  );

  const handleConferenceKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    const total = conferenceOptions.length;
    if (total < 2) return;
    let targetIdx = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      targetIdx = (idx + 1) % total;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      targetIdx = (idx - 1 + total) % total;
    } else if (event.key === "Home") {
      targetIdx = 0;
    } else if (event.key === "End") {
      targetIdx = total - 1;
    }
    if (targetIdx < 0) return;
    event.preventDefault();
    const nextValue = conferenceOptions[targetIdx];
    if (!nextValue) return;
    setStandingsConference(nextValue);
    conferenceRadioRefs.current[targetIdx]?.focus();
  };

  const effectiveSection = useMemo<LeagueHubSectionKey>(() => {
    if (visibleSectionKeys.has(section)) {
      return section;
    }
    return visibleSections[0]?.key ?? "partidos";
  }, [section, visibleSectionKeys, visibleSections]);

  const totalOpenPicks = useMemo(
    () => leagueGames.reduce((sum, g) => sum + g.picks.length, 0),
    [leagueGames],
  );

  const handleSectionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    if (visibleSections.length === 0) return;
    const listEl = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
    const isRtl =
      listEl !== null &&
      typeof window !== "undefined" &&
      window.getComputedStyle(listEl).direction === "rtl";
    const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";
    const prevKey = isRtl ? "ArrowRight" : "ArrowLeft";

    let targetIdx = -1;
    if (event.key === nextKey) {
      targetIdx = (idx + 1) % visibleSections.length;
    } else if (event.key === prevKey) {
      targetIdx = (idx - 1 + visibleSections.length) % visibleSections.length;
    } else if (event.key === "Home") {
      targetIdx = 0;
    } else if (event.key === "End") {
      targetIdx = visibleSections.length - 1;
    }

    if (targetIdx < 0) return;
    event.preventDefault();
    const target = visibleSections[targetIdx];
    if (!target) return;
    selectSection(target.key);
    const node = sectionRefs.current[targetIdx] ?? null;
    node?.focus();
    scrollLeagueTabIntoView(node);
  };

  const splitTabItems = useMemo<readonly SofascoreTabItem[]>(
    () => [
      { id: "total", label: "Todos" },
      { id: "home", label: "Local" },
      { id: "away", label: "Visitante" },
    ],
    [],
  );

  const matchModeTabItems = useMemo<readonly SofascoreTabItem[]>(
    () => [
      { id: "date", label: "Por fecha" },
      { id: "round", label: "Por ronda" },
    ],
    [],
  );

  const jumpToFullStandings = () => {
    selectSection("tabla");
    setShowAllStandings(true);
    if (standingsPanelRef.current && typeof standingsPanelRef.current.scrollIntoView === "function") {
      standingsPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const titleProjection =
    viewerRole !== "visitor" ? (enrichment?.titleProjection ?? null) : null;

  return (
    <AtmosphereStage activePath={hubPath}>
      <ClubWorkspaceShell activePath={hubPath}>
        <div className="pl-lh-shell">
          <nav aria-label="Ruta de la liga" className="pl-team-crumb">
            <ol className="pl-team-crumb-list">
              <li>
                <a
                  href="/app"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/app");
                  }}
                  className="pl-team-crumb-link"
                >
                  {LEAGUE_SPORT_CRUMB[leagueSport] ?? "Deportes"}
                </a>
              </li>
              <li aria-hidden="true" className="pl-team-crumb-sep">
                ›
              </li>
              <li className="pl-team-crumb-text">{countryMeta.country}</li>
              <li aria-hidden="true" className="pl-team-crumb-sep">
                ›
              </li>
              <li aria-current="page" className="pl-team-crumb-current truncate">
                {leagueSummary.label}
              </li>
            </ol>
          </nav>

          <section
            className="pl-lh-hero pl-sf-card"
            data-league-hero={leagueSummary.league}
          >
            <div className="pl-lh-hero-inner">
              <div className="pl-lh-hero-top">
                <div className="pl-lh-hero-identity">
                  <span className="pl-lh-crest-well">
                    <LeagueBadge
                      league={leagueSummary.league}
                      label={leagueSummary.label}
                      logoUrl={leagueSummary.logoUrl || undefined}
                      size={56}
                    />
                  </span>

                  <div className="pl-lh-hero-copy">
                    <div className="pl-lh-title-row">
                      <h1 id="panel-league-name" className="pl-lh-title">
                        {leagueSummary.label}
                      </h1>
                      {seasonProgress.seasonLabel ? (
                        <span className="pl-lh-season-pill num">
                          {seasonProgress.seasonLabel}
                        </span>
                      ) : null}
                    </div>

                    <div className="pl-lh-subrow">
                      <span className="pl-team-country-chip">
                        {countryFlag ? (
                          <img
                            src={resolveThemedPackUrl(countryFlag.src, iconBase)}
                            srcSet={resolveThemedPackSrcSet(countryFlag.srcSet, iconBase)}
                            alt=""
                            aria-hidden="true"
                            width={18}
                            height={18}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            className="pl-team-country-flag"
                          />
                        ) : (
                          <MaestroIcon name="globe" size={16} />
                        )}
                        <span>{countryMeta.country}</span>
                      </span>

                      {seasonProgress.periodLabel ? (
                        <span className="pl-lh-meta-chip num">
                          {seasonProgress.periodLabel}
                        </span>
                      ) : null}

                      <span className="pl-lh-meta-stat num">
                        <strong>{leagueGames.length}</strong> partidos · {totalOpenPicks} picks
                      </span>

                      {dataset.leagues.length > 1 ? (
                        <div className="lg:hidden">
                          <PlLeagueSelect
                            leagues={dataset.leagues}
                            value={leagueSummary.league}
                            onChange={(next) => {
                              navigateTo(next === "all" ? "/app" : `/app/${next}`);
                            }}
                            allLabel="Todas las ligas (Hoy)"
                            ariaLabel="Cambiar liga"
                            size="sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="pl-lh-hero-actions">
                  <button
                    type="button"
                    className={`pl-lh-follow-btn ${isLeagueFavorited ? "is-on" : ""}`.trim()}
                    aria-pressed={isLeagueFavorited}
                    aria-label={
                      isLeagueFavorited
                        ? `Siguiendo ${leagueSummary.label} · dejar de seguir`
                        : `Seguir ${leagueSummary.label}`
                    }
                    onClick={handleToggleFavoriteLeague}
                  >
                    <MaestroIcon name={isLeagueFavorited ? "check" : "star"} size={14} />
                    <span>{isLeagueFavorited ? "Siguiendo" : "Seguir"}</span>
                  </button>
                </div>
              </div>

              <div
                className="pl-lh-progress"
                aria-label={`Avance de temporada: ${seasonProgress.progressSummary}`}
              >
                <div className="pl-lh-progress-track" aria-hidden="true">
                  <span
                    className="pl-lh-progress-fill"
                    style={{ width: `${seasonProgress.pct}%` }}
                  />
                </div>
                <div className="pl-lh-progress-meta num">
                  <span>{seasonProgress.startLabel}</span>
                  <span className="pl-lh-progress-summary">{seasonProgress.progressSummary}</span>
                  <span>{seasonProgress.endLabel}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="pl-lh-grid">
            <aside
              className="pl-lh-left-col"
              aria-label={`Destacado, proyección y partidos de ${leagueSummary.label}`}
            >
              {featuredMatch ? (
                <SofascoreCard
                  title={featuredMatch.isLive ? "En Vivo · Partido destacado" : "Partido destacado"}
                  meta={
                    featuredMatch.isLive ? (
                      <span className="pl-lh-live-pill">
                        <i aria-hidden="true" />
                        <span>
                          {featuredMatch.liveEntry?.phase === "halftime"
                            ? "Descanso"
                            : featuredMatch.liveEntry?.clock || "En juego"}
                        </span>
                      </span>
                    ) : featuredMatch.game.round ? (
                      <span>{safePublicText(featuredMatch.game.round, "")}</span>
                    ) : null
                  }
                  density="compact"
                  className="pl-lh-featured-card"
                >
                  <div className="pl-lh-featured-body" data-league-featured="">
                    <div className="pl-lh-featured-duel">
                      <a
                        href={canonicalTeamHref(leagueSummary.league, featuredMatch.game.home.slug)}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(canonicalTeamHref(leagueSummary.league, featuredMatch.game.home.slug));
                        }}
                        className="pl-lh-featured-team pl-team-link"
                      >
                        <TeamBadge
                          league={leagueSummary.league}
                          slug={featuredMatch.game.home.slug}
                          name={featuredMatch.game.home.name}
                          logoUrl={featuredMatch.game.home.logoUrl || undefined}
                          size={42}
                        />
                        <span className="truncate">
                          {featuredMatch.game.home.shortName || featuredMatch.game.home.name}
                        </span>
                      </a>

                      <div className="pl-lh-featured-center num">
                        {featuredMatch.isLive ? (
                          <>
                            <strong className="is-live">
                              {featuredMatch.liveEntry?.score?.home ?? featuredMatch.game.score?.home ?? 0} -{" "}
                              {featuredMatch.liveEntry?.score?.away ?? featuredMatch.game.score?.away ?? 0}
                            </strong>
                            <span className="is-live">En curso</span>
                          </>
                        ) : featuredMatch.game.status === "FT" && featuredMatch.game.score ? (
                          <>
                            <strong>
                              {featuredMatch.game.score.home} - {featuredMatch.game.score.away}
                            </strong>
                            <span>{formatSlashDateFull(featuredMatch.game.dayId)} · FT</span>
                          </>
                        ) : (
                          <>
                            <strong>{formatSlashDateFull(featuredMatch.game.dayId)}</strong>
                            <span>
                              {shortDateLabel(featuredMatch.game.dayId).split(" ")[0]},{" "}
                              {featuredMatch.game.kickoffLocal}
                            </span>
                          </>
                        )}
                      </div>

                      <a
                        href={canonicalTeamHref(leagueSummary.league, featuredMatch.game.away.slug)}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(canonicalTeamHref(leagueSummary.league, featuredMatch.game.away.slug));
                        }}
                        className="pl-lh-featured-team pl-team-link"
                      >
                        <TeamBadge
                          league={leagueSummary.league}
                          slug={featuredMatch.game.away.slug}
                          name={featuredMatch.game.away.name}
                          logoUrl={featuredMatch.game.away.logoUrl || undefined}
                          size={42}
                        />
                        <span className="truncate">
                          {featuredMatch.game.away.shortName || featuredMatch.game.away.name}
                        </span>
                      </a>
                    </div>

                    {featuredMatch.game.x12 &&
                    (featuredMatch.game.status === "FT" ||
                      isPreGameIntelUnlocked(featuredMatch.game, viewerRole)) ? (
                      <div className="pl-lh-featured-odds">
                        <span className="pl-lh-sublabel">
                          {hasDraw
                            ? "1X2 · Probabilidad Spacetime y momio justo"
                            : "Ganador · Probabilidad Spacetime y momio justo"}
                        </span>
                        <div
                          className={`pl-lh-outcomes ${hasDraw ? "is-three" : "is-two"} num`}
                        >
                          {(() => {
                            const [ph, pd, pa] = featuredMatch.game.x12!;
                            const items: ReadonlyArray<{
                              readonly code: string;
                              readonly side: "home" | "draw" | "away";
                              readonly p: number;
                            }> = hasDraw
                              ? [
                                  { code: "1", side: "home", p: ph },
                                  { code: "X", side: "draw", p: pd },
                                  { code: "2", side: "away", p: pa },
                                ]
                              : [
                                  { code: "1", side: "home", p: ph },
                                  { code: "2", side: "away", p: pa },
                                ];
                            const maxP = Math.max(...items.map((i) => i.p));
                            return items.map((it) => {
                              const fairDec = it.p > 0.01 ? 1 / it.p : 99;
                              const bookQuote = resolveFeaturedOutcomeBookQuote(
                                featuredMatch.game,
                                it.side,
                                preferredBooks,
                              );
                              return (
                                <div
                                  key={it.code}
                                  className={`pl-lh-outcome-box ${it.p === maxP ? "is-best" : ""}`.trim()}
                                >
                                  <div className="pl-lh-outcome-top">
                                    <span className="pl-lh-outcome-key">{it.code}</span>
                                    <strong>{Math.round(it.p * 100)}%</strong>
                                  </div>
                                  <span className="pl-lh-outcome-fair">
                                    Justo {formatOddsValue(fairDec, oddsFormat)}
                                  </span>
                                  {bookQuote ? (
                                    <span className="pl-lh-outcome-book">
                                      {bookQuote.bookLabel} {formatOddsValue(bookQuote.decimal, oddsFormat)}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : null}

                    {featuredMatch.game.picks[0] &&
                    isPickUnlocked(featuredMatch.game.picks[0], featuredMatch.game.status, viewerRole) ? (
                      <div className="pl-lh-featured-pick">
                        <span className="pl-lh-sublabel">Selección principal</span>
                        <div className="pl-lh-featured-pick-row">
                          <strong className="truncate">{featuredMatch.game.picks[0].label}</strong>
                          <span className="pl-sf-signal-pill is-positive num">
                            {Math.round(featuredMatch.game.picks[0].p * 100)}%
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <a
                      href={canonicalGameHref(leagueSummary.league, featuredMatch.game)}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(canonicalGameHref(leagueSummary.league, featuredMatch.game));
                      }}
                      className="pl-lh-action-link"
                    >
                      <span>Abrir estudio del partido</span>
                      <MaestroIcon name="arrowRight" size={14} />
                    </a>
                  </div>
                </SofascoreCard>
              ) : null}

              {titleProjection && titleProjection.candidates.length > 0 ? (
                <SofascoreCard
                  title={titleProjection.titleLabel}
                  meta="Spacetime"
                  density="compact"
                  className="pl-lh-title-card"
                >
                  <div className="pl-lh-title-proj" data-league-title-projection="">
                    <p className="pl-lh-muted-note">{titleProjection.subtitle}</p>
                    <ol className="pl-lh-proj-list">
                      {titleProjection.candidates.map((cand) => {
                        const maxProb = titleProjection.candidates[0]?.titleProbPct ?? 100;
                        const barWidth = Math.max(
                          8,
                          Math.min(100, Math.round((cand.titleProbPct / Math.max(1, maxProb)) * 100)),
                        );
                        return (
                          <li key={cand.teamSlug} className="pl-lh-proj-row">
                            <a
                              href={cand.teamHref}
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo(cand.teamHref);
                              }}
                              className="pl-lh-proj-link"
                            >
                              <div className="pl-lh-proj-head">
                                <span className="pl-lh-proj-team">
                                  <span className="pl-lh-proj-rank num">{cand.rank}</span>
                                  <TeamBadge
                                    league={leagueSummary.league}
                                    slug={cand.teamSlug}
                                    name={cand.name}
                                    logoUrl={standingsLogoBySlug.get(cand.teamSlug)}
                                    size={20}
                                  />
                                  <span className="truncate">{cand.shortName || cand.name}</span>
                                </span>
                                <span className="pl-lh-proj-vals num">
                                  <strong>{cand.titleProbPct.toFixed(1)}%</strong>
                                  <small>{formatOddsValue(cand.fairDecimal, oddsFormat)}</small>
                                </span>
                              </div>
                              <div className="pl-lh-flat-bar" aria-hidden="true">
                                <span style={{ width: `${barWidth}%` }} />
                              </div>
                            </a>
                          </li>
                        );
                      })}
                    </ol>
                    {hasAnyStandings ? (
                      <button
                        type="button"
                        className="pl-lh-action-btn"
                        onClick={jumpToFullStandings}
                      >
                        <span>Ver tabla completa</span>
                        <MaestroIcon name="arrowRight" size={14} />
                      </button>
                    ) : null}
                  </div>
                </SofascoreCard>
              ) : leaderRow ? (
                <SofascoreCard
                  title="Líder actual"
                  meta={seasonProgress.periodLabel || seasonProgress.seasonLabel}
                  density="compact"
                  className="pl-lh-title-card"
                >
                  <div className="pl-lh-title-proj">
                    <a
                      href={canonicalTeamHref(leagueSummary.league, leaderRow.slug)}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(canonicalTeamHref(leagueSummary.league, leaderRow.slug));
                      }}
                      className="pl-lh-leader-pill"
                    >
                      <TeamBadge
                        league={leagueSummary.league}
                        slug={leaderRow.slug}
                        name={leaderRow.name}
                        logoUrl={leaderRow.logoUrl || undefined}
                        size={26}
                      />
                      <span className="pl-lh-leader-copy">
                        <strong className="truncate">{leaderRow.name}</strong>
                        <small className="num">
                          {leagueSport === "football" || leagueSport === "ice-hockey"
                            ? `${leaderRow.points} pts · ${leaderRow.played} PJ`
                            : `${leaderRow.won}G-${leaderRow.lost}P · ${leaderRow.played} JJ`}
                        </small>
                      </span>
                    </a>
                    {viewerRole === "visitor" ? (
                      <p className="pl-lh-muted-note">
                        La proyección de campeón Spacetime se desbloquea con Pase Ultra.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="pl-lh-action-btn"
                      onClick={jumpToFullStandings}
                    >
                      <span>Ver tabla completa</span>
                      <MaestroIcon name="arrowRight" size={14} />
                    </button>
                  </div>
                </SofascoreCard>
              ) : null}

              {leagueGames.length > 0 ? (
                <SofascoreCard
                  title="Partidos"
                  meta={`${leagueGames.length} en corte`}
                  density="compact"
                  className="pl-lh-matches-card"
                >
                  <div className="pl-lh-compact-matches" data-league-compact-matches="">
                    <SofascoreTabs
                      items={matchModeTabItems}
                      value={matchGroupMode}
                      onChange={(next) => {
                        if (next === "date" || next === "round") {
                          setMatchGroupMode(next);
                        }
                      }}
                      variant="segmented"
                      ariaLabel="Agrupar partidos por fecha o por ronda"
                    />

                    <div className="pl-lh-match-groups">
                      {leftMatchGroups.map((group) => (
                        <div key={group.id} className="pl-lh-match-group">
                          <h3 className="pl-lh-match-group-title">{group.label}</h3>
                          <ul className="pl-lh-match-list">
                            {group.games.map((game) => {
                              const href = canonicalGameHref(leagueSummary.league, game);
                              const isLive = String(game.status) === "LIVE";
                              const isFt = game.status === "FT" && game.score !== undefined;
                              return (
                                <li key={game.id}>
                                  <a
                                    href={href}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      navigateTo(href);
                                    }}
                                    className="pl-lh-match-row"
                                  >
                                    <span
                                      className={`pl-lh-match-time num ${isLive ? "is-live" : ""}`.trim()}
                                    >
                                      {isLive ? "VIVO" : isFt ? "FT" : game.kickoffLocal}
                                    </span>
                                    <span className="pl-lh-match-teams">
                                      <span className="pl-lh-match-side">
                                        <TeamBadge
                                          league={leagueSummary.league}
                                          slug={game.home.slug}
                                          name={game.home.name}
                                          logoUrl={game.home.logoUrl || undefined}
                                          size={18}
                                        />
                                        <span className="truncate">
                                          {game.home.shortName || game.home.name}
                                        </span>
                                        {isFt || isLive ? (
                                          <strong className="pl-lh-match-score num">
                                            {game.score?.home ?? 0}
                                          </strong>
                                        ) : null}
                                      </span>
                                      <span className="pl-lh-match-side">
                                        <TeamBadge
                                          league={leagueSummary.league}
                                          slug={game.away.slug}
                                          name={game.away.name}
                                          logoUrl={game.away.logoUrl || undefined}
                                          size={18}
                                        />
                                        <span className="truncate">
                                          {game.away.shortName || game.away.name}
                                        </span>
                                        {isFt || isLive ? (
                                          <strong className="pl-lh-match-score num">
                                            {game.score?.away ?? 0}
                                          </strong>
                                        ) : null}
                                      </span>
                                    </span>
                                  </a>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>

                    {leagueGames.length > INITIAL_LEFT_MATCHES ? (
                      <div className="pl-lh-compact-actions">
                        <button
                          type="button"
                          className="pl-lh-action-btn"
                          onClick={() => setShowAllLeftMatches((prev) => !prev)}
                        >
                          <span>
                            {showAllLeftMatches
                              ? `Mostrar primeros ${INITIAL_LEFT_MATCHES}`
                              : `Ver todos los partidos (${leagueGames.length})`}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </SofascoreCard>
              ) : null}
            </aside>

            <div className="pl-lh-right-col">
              <div className="pl-lh-main-sheet pl-sf-card">
                <div className="pl-lh-tabs-nav">
                  <div
                    role="tablist"
                    aria-label={`Navegar en ${leagueSummary.label}`}
                    aria-orientation="horizontal"
                    className="pl-sf-tabs is-underline pl-lh-tablist"
                  >
                    {visibleSections.map((tabDef, index) => {
                      const isSelected = effectiveSection === tabDef.key;
                      const badgeCount =
                        tabDef.key === "partidos"
                          ? filteredGames.length
                          : tabDef.key === "tabla"
                            ? displayedStandings.length > 0
                              ? displayedStandings.length
                              : undefined
                            : tabDef.key === "arbitros"
                              ? hasServerReferees
                                ? serverReferees.length
                                : leagueReferees.length
                              : tabDef.key === "noticias"
                                ? newsItems.length
                                : tabDef.key === "equipos"
                                  ? directoryTeams.length
                                  : undefined;
                      return (
                        <button
                          key={tabDef.key}
                          ref={(el) => {
                            sectionRefs.current[index] = el;
                          }}
                          type="button"
                          role="tab"
                          id={`pl-league-tab-${tabDef.key}`}
                          data-league-section-tab={tabDef.key}
                          aria-selected={isSelected}
                          tabIndex={isSelected ? 0 : -1}
                          className="pl-sf-tab"
                          onClick={(event) => {
                            scrollLeagueTabIntoView(event.currentTarget);
                            selectSection(tabDef.key);
                          }}
                          onKeyDown={(e) => handleSectionKeyDown(e, index)}
                        >
                          <span className="pl-sf-tab-label">
                            {tabDef.key === "equipos" && isNational ? "Selecciones" : tabDef.label}
                          </span>
                          {badgeCount !== undefined ? (
                            <span className="pl-sf-tab-count num">{badgeCount}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {visibleSectionKeys.has("tabla") ? (
                  <div
                    ref={standingsPanelRef}
                    role="tabpanel"
                    id="pl-league-panel-tabla"
                    aria-labelledby="pl-league-tab-tabla"
                    className="pl-lh-tabpanel"
                    hidden={effectiveSection !== "tabla"}
                  >
                    {effectiveSection === "tabla" ? (
                      <div className="pl-lh-tabpanel-body">
                        {displayedStandings.length > 0 ? (
                          <section className="standings-block pl-st-sheet pl-lh-standings-sheet">
                            <div className="pl-lh-standings-controls">
                              {hasEnrichedStandings ? (
                                <SofascoreTabs
                                  items={splitTabItems}
                                  value={standingsSplit}
                                  onChange={(next) => {
                                    if (next === "total" || next === "home" || next === "away") {
                                      setStandingsSplit(next);
                                    }
                                  }}
                                  variant="segmented"
                                  ariaLabel="Filtrar clasificación general, local o visitante"
                                />
                              ) : null}

                              {conferenceOptions.length >= 2 ? (
                                <div className="pl-st-conf-bar">
                                  <div
                                    className="seg-well"
                                    role="radiogroup"
                                    aria-label="Filtrar clasificación por conferencia"
                                  >
                                    {conferenceOptions.map((confValue, confIdx) => {
                                      const checked = activeConference === confValue;
                                      return (
                                        <button
                                          key={confValue}
                                          ref={(el) => {
                                            conferenceRadioRefs.current[confIdx] = el;
                                          }}
                                          type="button"
                                          role="radio"
                                          aria-checked={checked}
                                          tabIndex={checked ? 0 : -1}
                                          className={`seg-btn ${checked ? "is-active" : ""}`.trim()}
                                          onClick={() => setStandingsConference(confValue)}
                                          onKeyDown={(e) => handleConferenceKeyDown(e, confIdx)}
                                        >
                                          {confValue === "all" ? "General" : confValue}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                          {(() => {
                            const firstZone = standingsZones.find((z) => z.startRank === 1) ?? null;
                            const isNfl = leagueSport === "american-football";
                            const isNba = leagueSport === "basketball";
                            const isNhl = leagueSport === "ice-hockey";
                            const isMlb = leagueSport === "baseball";
                            const showDrawCol = hasDraw || isNfl;
                            const showOtCol = isNhl;
                            const showPctCol = isNfl || isNba || isMlb;
                            const showGbCol = isNba || isMlb;
                            const showPtsCol = leagueSport === "football" || isNhl;
                            const showExpectedCol =
                              leagueSport === "football" &&
                              standingsSplit === "total" &&
                              visibleStandings.some((r) => r.expectedFor !== null);
                            const playedColLabel = isMlb ? "JJ" : "PJ";
                            const goalsColCode =
                              leagueSport === "football"
                                ? "GF:GC"
                                : isMlb
                                  ? "C:CA"
                                  : isNfl || isNba
                                    ? "PF:PC"
                                    : scoringUnit.short.toUpperCase();
                            const colCount =
                              8 +
                              (showDrawCol ? 1 : 0) +
                              (showOtCol ? 1 : 0) +
                              (showPctCol ? 1 : 0) +
                              (showGbCol ? 1 : 0) +
                              (showExpectedCol ? 1 : 0) +
                              (showPtsCol ? 1 : 0);

                            const formatWinPctCell = (row: NormalizedStandingRow) => {
                              const pct =
                                row.winPct ??
                                (row.played > 0 ? (row.won + 0.5 * row.drawn) / row.played : 0);
                              return pct >= 1 ? "1.000" : pct.toFixed(3).replace(/^0/, "");
                            };

                            return (
                              <>
                                <div
                                  className="pl-table-region pl-lh-table-region"
                                  tabIndex={0}
                                  role="region"
                                  aria-label={`Tabla de posiciones de ${leagueSummary.label}`}
                                >
                                  <table className="standings pl-league-table pl-st-table w-full text-left text-sm">
                                    <caption className="sr-only">
                                      Clasificación {standingsSplit} de {leagueSummary.label}
                                    </caption>
                                    <thead>
                                      <tr className="pl-st-head-row">
                                        <th
                                          scope="col"
                                          colSpan={2}
                                          className="pl-st-head-lead"
                                          data-zone-tone={firstZone?.tone}
                                        >
                                          {firstZone
                                            ? firstZone.label
                                            : isNational
                                              ? "Selección"
                                              : activeConference !== "all"
                                                ? activeConference
                                                : "Club"}
                                        </th>
                                        <th scope="col" className="pl-st-head-cell is-num">
                                          {playedColLabel}
                                        </th>
                                        <th scope="col" className="pl-st-head-cell is-num">
                                          G
                                        </th>
                                        {showDrawCol ? (
                                          <th scope="col" className="pl-st-head-cell is-num">
                                            E
                                          </th>
                                        ) : null}
                                        <th scope="col" className="pl-st-head-cell is-num">
                                          P
                                        </th>
                                        {showOtCol ? (
                                          <th scope="col" className="pl-st-head-cell is-num">
                                            TE
                                          </th>
                                        ) : null}
                                        {showPctCol ? (
                                          <th scope="col" className="pl-st-head-cell is-num">
                                            %V
                                          </th>
                                        ) : null}
                                        {showGbCol ? (
                                          <th scope="col" className="pl-st-head-cell is-num">
                                            JD
                                          </th>
                                        ) : null}
                                        <th scope="col" className="pl-st-head-cell is-num">
                                          DIF
                                        </th>
                                        <th scope="col" className="pl-st-head-cell is-num hidden sm:table-cell">
                                          {goalsColCode}
                                        </th>
                                        {showExpectedCol ? (
                                          <th scope="col" className="pl-st-head-cell is-num hidden xl:table-cell">
                                            G.esp
                                          </th>
                                        ) : null}
                                        <th scope="col" className="pl-st-head-cell is-center hidden md:table-cell">
                                          Últimos 5
                                        </th>
                                        {showPtsCol ? (
                                          <th scope="col" className="pl-st-head-cell is-num">
                                            PTS
                                          </th>
                                        ) : null}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {visibleStandings.map((row, idx) => {
                                        const rank = idx + 1;
                                        const dg = row.goalsFor - row.goalsAgainst;
                                        const activeZone =
                                          standingsZones.find(
                                            (z) => rank >= z.startRank && rank <= z.endRank,
                                          ) ?? null;
                                        const startsMidTableZone =
                                          activeZone && activeZone.startRank === rank && rank > 1
                                            ? activeZone
                                            : null;
                                        const endsActiveZone = Boolean(
                                          activeZone && rank === activeZone.endRank,
                                        );

                                        return (
                                          <React.Fragment key={`${standingsSplit}:${row.teamId}`}>
                                            {startsMidTableZone ? (
                                              <tr
                                                className="pl-st-zone-row"
                                                data-zone-tone={startsMidTableZone.tone}
                                              >
                                                <th
                                                  scope="colgroup"
                                                  colSpan={colCount}
                                                  className="pl-st-zone-cell"
                                                >
                                                  {startsMidTableZone.label}
                                                </th>
                                              </tr>
                                            ) : null}

                                            <tr
                                              className={`pl-st-row ${rank === 1 ? "is-leader" : ""}`.trim()}
                                              data-zone-tone={activeZone?.tone}
                                              data-zone-end={endsActiveZone ? "true" : undefined}
                                            >
                                              <td className="pl-st-rank-cell num">{rank}</td>
                                              <th scope="row" className="pl-st-team-cell">
                                                <a
                                                  href={canonicalTeamHref(leagueSummary.league, row.slug)}
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    navigateTo(canonicalTeamHref(leagueSummary.league, row.slug));
                                                  }}
                                                  className="pl-team-link pl-st-team-link"
                                                  title={`Ver perfil de ${row.name}`}
                                                >
                                                  <TeamBadge
                                                    league={leagueSummary.league}
                                                    slug={row.slug}
                                                    name={row.name}
                                                    logoUrl={row.logoUrl || undefined}
                                                    size={22}
                                                  />
                                                  <span className="truncate">{row.name}</span>
                                                </a>
                                              </th>
                                              <td className="pl-st-num-cell num">{row.played}</td>
                                              <td className="pl-st-num-cell num">{row.won}</td>
                                              {showDrawCol ? (
                                                <td className="pl-st-num-cell num">{row.drawn}</td>
                                              ) : null}
                                              <td className="pl-st-num-cell num">{row.lost}</td>
                                              {showOtCol ? (
                                                <td className="pl-st-num-cell num">{row.otLosses ?? 0}</td>
                                              ) : null}
                                              {showPctCol ? (
                                                <td className={`num ${showPtsCol ? "pl-st-num-cell" : "pl-st-pts-cell"}`}>
                                                  {formatWinPctCell(row)}
                                                </td>
                                              ) : null}
                                              {showGbCol ? (
                                                <td className="pl-st-num-cell num">{row.gamesBehind ?? "—"}</td>
                                              ) : null}
                                              <td className="pl-st-num-cell num">
                                                {dg > 0 ? `+${dg}` : dg}
                                              </td>
                                              <td className="pl-st-num-cell num hidden sm:table-cell">
                                                {row.goalsFor}:{row.goalsAgainst}
                                              </td>
                                              {showExpectedCol ? (
                                                <td className="pl-st-num-cell num hidden xl:table-cell">
                                                  {row.expectedFor !== null ? row.expectedFor.toFixed(2) : "—"}
                                                </td>
                                              ) : null}
                                              <td className="pl-st-form-cell hidden md:table-cell">
                                                <span data-form-squares="">
                                                  <AtomicFormStrip
                                                    form={row.form}
                                                    sport={leagueSport}
                                                    size="xs"
                                                    teamName={row.shortName || row.name}
                                                  />
                                                </span>
                                              </td>
                                              {showPtsCol ? (
                                                <td className="pl-st-pts-cell num">{row.points}</td>
                                              ) : null}
                                            </tr>
                                          </React.Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                                {scopedStandings.length > INITIAL_STANDINGS_ROWS ? (
                                  <div className="pl-lh-expand-row">
                                    <button
                                      type="button"
                                      className="pl-lh-action-btn"
                                      onClick={() => setShowAllStandings((prev) => !prev)}
                                    >
                                      <span>
                                        {showAllStandings
                                          ? `Mostrar primeros ${INITIAL_STANDINGS_ROWS}`
                                          : `Ver tabla completa (${scopedStandings.length} equipos)`}
                                      </span>
                                    </button>
                                  </div>
                                ) : null}

                                <details open className="pl-st-legend">
                                  <summary className="pl-st-legend-summary">
                                    <span>Reglas y leyenda</span>
                                    <MaestroIcon name="chevronDown" size={15} className="pl-st-legend-chev" />
                                  </summary>

                                  <div className="pl-st-legend-body">
                                    {standingsZones.length > 0 ? (
                                      <ul className="pl-st-legend-zones">
                                        {standingsZones.map((zone) => (
                                          <li key={zone.id} data-zone-tone={zone.tone}>
                                            <i aria-hidden="true" />
                                            <span>{zone.label}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}

                                    <div className="pl-st-legend-rules">
                                      <p>{standingsTieBreakers.intro}</p>
                                      <ol>
                                        {standingsTieBreakers.items.map((item, idx) => (
                                          <li key={item}>
                                            {idx + 1}. {item}
                                          </li>
                                        ))}
                                      </ol>
                                    </div>

                                    <dl className="pl-st-legend-glossary">
                                      <div>
                                        <dt>{playedColLabel}</dt>
                                        <dd>{isMlb ? "Juegos jugados" : "Partidos jugados"}</dd>
                                      </div>
                                      <div>
                                        <dt>G</dt>
                                        <dd>Victorias</dd>
                                      </div>
                                      {showDrawCol ? (
                                        <div>
                                          <dt>E</dt>
                                          <dd>Empates</dd>
                                        </div>
                                      ) : null}
                                      <div>
                                        <dt>P</dt>
                                        <dd>Derrotas</dd>
                                      </div>
                                      {showOtCol ? (
                                        <div>
                                          <dt>TE</dt>
                                          <dd>Derrotas en tiempo extra o penales (1 punto)</dd>
                                        </div>
                                      ) : null}
                                      {showPctCol ? (
                                        <div>
                                          <dt>%V</dt>
                                          <dd>Porcentaje de victorias</dd>
                                        </div>
                                      ) : null}
                                      {showGbCol ? (
                                        <div>
                                          <dt>JD</dt>
                                          <dd>Juegos detrás del líder</dd>
                                        </div>
                                      ) : null}
                                      <div>
                                        <dt>DIF</dt>
                                        <dd>Diferencia de {scoringUnit.plural}</dd>
                                      </div>
                                      <div>
                                        <dt>{goalsColCode}</dt>
                                        <dd>
                                          {scoringUnit.plural.charAt(0).toUpperCase() + scoringUnit.plural.slice(1)} a favor y en contra
                                        </dd>
                                      </div>
                                      <div>
                                        <dt>Últimos 5</dt>
                                        <dd>Racha de los últimos 5 encuentros (más reciente a la derecha)</dd>
                                      </div>
                                      {showPtsCol ? (
                                        <div>
                                          <dt>PTS</dt>
                                          <dd>Puntos</dd>
                                        </div>
                                      ) : null}
                                    </dl>
                                  </div>
                                </details>
                              </>
                            );
                          })()}
                        </section>
                      ) : (
                          <SofascoreEmptyState
                            title={`Clasificación · ${leagueSummary.label}`}
                            description="La clasificación actualizada aún no está disponible en el corte vigente de esta competición."
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {visibleSectionKeys.has("eliminatorias") && enrichment?.bracket ? (
                  <div
                    role="tabpanel"
                    id="pl-league-panel-eliminatorias"
                    aria-labelledby="pl-league-tab-eliminatorias"
                    className="pl-lh-tabpanel"
                    hidden={effectiveSection !== "eliminatorias"}
                  >
                    {effectiveSection === "eliminatorias" ? (
                      <div className="pl-lh-tabpanel-body">
                        <KnockoutBracketSvgPanel
                          bracket={enrichment.bracket}
                          onNavigate={navigateTo}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {visibleSectionKeys.has("estadisticas") && statLeaders ? (
                  <div
                    role="tabpanel"
                    id="pl-league-panel-estadisticas"
                    aria-labelledby="pl-league-tab-estadisticas"
                    className="pl-lh-tabpanel"
                    hidden={effectiveSection !== "estadisticas"}
                  >
                    {effectiveSection === "estadisticas" ? (
                      <div className="pl-lh-tabpanel-body pl-lh-stats-stack" data-league-stats="">
                        {statLeaders.playerCategories.length > 0 && activeStatCategory ? (
                          <section className="pl-lh-stats-block" aria-labelledby="league-player-leaders-heading">
                            <div className="pl-lh-stats-head">
                              <h2 id="league-player-leaders-heading" className="pl-lh-section-title">
                                Líderes individuales · {leagueSummary.label}
                              </h2>
                              <span className="pl-lh-meta-chip num">
                                Top {activeStatCategory.entries.length}
                              </span>
                            </div>

                            <SofascoreTabs
                              items={statLeaders.playerCategories.map((c) => ({
                                id: c.key,
                                label: c.label,
                              }))}
                              value={activeStatCategory.key}
                              onChange={(next) => setStatCategoryKey(next)}
                              variant="segmented"
                              ariaLabel="Categoría de líderes estadísticos"
                            />

                            <ol className="pl-lh-leaders-list">
                              {activeStatCategory.entries.map((entry) => (
                                <li key={`${activeStatCategory.key}:${entry.playerSlug}:${entry.teamSlug}`}>
                                  <a
                                    href={entry.playerHref}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      navigateTo(entry.playerHref);
                                    }}
                                    className="pl-lh-leader-row"
                                  >
                                    <span className="pl-lh-leader-rank num">{entry.rank}</span>
                                    <TeamBadge
                                      league={leagueSummary.league}
                                      slug={entry.teamSlug}
                                      name={entry.teamName}
                                      logoUrl={standingsLogoBySlug.get(entry.teamSlug)}
                                      size={24}
                                    />
                                    <span className="pl-lh-leader-info">
                                      <strong className="truncate">{entry.name}</strong>
                                      <small className="truncate">
                                        {entry.teamName}
                                        {entry.secondaryLabel ? ` · ${entry.secondaryLabel}` : ""}
                                      </small>
                                    </span>
                                    <span className="pl-lh-leader-stat num">
                                      <strong>{entry.primaryFormatted}</strong>
                                      <small>{activeStatCategory.unitLabel}</small>
                                    </span>
                                  </a>
                                </li>
                              ))}
                            </ol>
                          </section>
                        ) : null}

                        {statLeaders.teamAttack.length > 0 || statLeaders.teamDefense.length > 0 ? (
                          <section className="pl-lh-team-leaders-grid" aria-label="Líderes de ataque y defensa por equipo">
                            {statLeaders.teamAttack.length > 0 ? (
                              <div className="pl-lh-team-rank-card">
                                <h3 className="pl-lh-section-title">Mejor ataque</h3>
                                <p className="pl-lh-muted-note">
                                  Promedio de {statLeaders.scoringUnitPlural} anotados por partido
                                </p>
                                <ol className="pl-lh-team-rank-list">
                                  {statLeaders.teamAttack.map((team) => {
                                    const maxVal = statLeaders.teamAttack[0]?.primaryValue ?? 1;
                                    const widthPct = Math.max(
                                      14,
                                      Math.min(100, Math.round((team.primaryValue / Math.max(0.01, maxVal)) * 100)),
                                    );
                                    return (
                                      <li key={`att:${team.teamSlug}`}>
                                        <a
                                          href={team.teamHref}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            navigateTo(team.teamHref);
                                          }}
                                          className="pl-lh-team-rank-link"
                                        >
                                          <div className="pl-lh-proj-head">
                                            <span className="pl-lh-proj-team">
                                              <span className="pl-lh-proj-rank num">{team.rank}</span>
                                              <TeamBadge
                                                league={leagueSummary.league}
                                                slug={team.teamSlug}
                                                name={team.name}
                                                logoUrl={standingsLogoBySlug.get(team.teamSlug)}
                                                size={20}
                                              />
                                              <span className="truncate">{team.shortName || team.name}</span>
                                            </span>
                                            <span className="pl-lh-proj-vals num">
                                              <strong>{team.primaryFormatted}</strong>
                                              {team.secondaryLabel ? <small>{team.secondaryLabel}</small> : null}
                                            </span>
                                          </div>
                                          <div className="pl-lh-flat-bar" aria-hidden="true">
                                            <span style={{ width: `${widthPct}%` }} />
                                          </div>
                                        </a>
                                      </li>
                                    );
                                  })}
                                </ol>
                              </div>
                            ) : null}

                            {statLeaders.teamDefense.length > 0 ? (
                              <div className="pl-lh-team-rank-card">
                                <h3 className="pl-lh-section-title">Mejor defensa</h3>
                                <p className="pl-lh-muted-note">
                                  Menor promedio de {statLeaders.scoringUnitPlural} recibidos por partido
                                </p>
                                <ol className="pl-lh-team-rank-list">
                                  {statLeaders.teamDefense.map((team) => {
                                    const worstTop =
                                      statLeaders.teamDefense[statLeaders.teamDefense.length - 1]?.primaryValue ?? 1;
                                    const bestTop = statLeaders.teamDefense[0]?.primaryValue ?? 0.5;
                                    const span = Math.max(0.2, worstTop - bestTop + 0.35);
                                    const widthPct = Math.max(
                                      28,
                                      Math.min(100, Math.round((1 - (team.primaryValue - bestTop) / span) * 100)),
                                    );
                                    return (
                                      <li key={`def:${team.teamSlug}`}>
                                        <a
                                          href={team.teamHref}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            navigateTo(team.teamHref);
                                          }}
                                          className="pl-lh-team-rank-link"
                                        >
                                          <div className="pl-lh-proj-head">
                                            <span className="pl-lh-proj-team">
                                              <span className="pl-lh-proj-rank num">{team.rank}</span>
                                              <TeamBadge
                                                league={leagueSummary.league}
                                                slug={team.teamSlug}
                                                name={team.name}
                                                logoUrl={standingsLogoBySlug.get(team.teamSlug)}
                                                size={20}
                                              />
                                              <span className="truncate">{team.shortName || team.name}</span>
                                            </span>
                                            <span className="pl-lh-proj-vals num">
                                              <strong>{team.primaryFormatted}</strong>
                                              {team.secondaryLabel ? <small>{team.secondaryLabel}</small> : null}
                                            </span>
                                          </div>
                                          <div className="pl-lh-flat-bar is-defense" aria-hidden="true">
                                            <span style={{ width: `${widthPct}%` }} />
                                          </div>
                                        </a>
                                      </li>
                                    );
                                  })}
                                </ol>
                              </div>
                            ) : null}
                          </section>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {visibleSectionKeys.has("partidos") ? (
                  <div
                    role="tabpanel"
                    id="pl-league-panel-partidos"
                    aria-labelledby="pl-league-tab-partidos"
                    className="pl-lh-tabpanel"
                    hidden={effectiveSection !== "partidos"}
                  >
                    {effectiveSection === "partidos" ? (
                      <div className="pl-lh-tabpanel-body pl-lh-partidos-stack">
                        <div
                          id="day-chips"
                          className="seg-well max-w-full overflow-x-auto"
                          role="group"
                          aria-label="Filtrar partidos por día"
                        >
                          {dayOptions.map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              className="day-chip seg-btn shrink-0 min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9"
                              aria-pressed={dayFilter === d.id}
                              onClick={() => setDayFilter(d.id)}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>

                        {upcoming.length > 0 ? (
                          <section className="space-y-3 min-w-0">
                            <h2 className="pl-lh-section-title">
                              Próximos encuentros ({upcoming.length})
                            </h2>
                            <MatchList groups={upcomingGroups} hideLeagueHeader />
                          </section>
                        ) : finished.length > 0 && isNational ? (
                          <p className="pl-lh-muted-note">
                            Sin partidos próximos en el calendario actual de {leagueSummary.label}. Mostrando
                            resultados oficiales recientes del torneo.
                          </p>
                        ) : null}

                        {finished.length > 0 ? (
                          <section className="space-y-3 min-w-0">
                            <h2 className="pl-lh-section-title">
                              Resultados cerrados FT ({finished.length})
                            </h2>
                            <MatchList groups={finishedGroups} hideLeagueHeader />
                          </section>
                        ) : (
                          <SofascoreEmptyState
                            title="Sin marcadores cerrados aún"
                            description="Aún no hay marcadores cerrados (FT) registrados en este corte de la jornada."
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {visibleSectionKeys.has("noticias") ? (
                  <div
                    role="tabpanel"
                    id="pl-league-panel-noticias"
                    aria-labelledby="pl-league-tab-noticias"
                    className="pl-lh-tabpanel"
                    data-league-news=""
                    hidden={effectiveSection !== "noticias"}
                  >
                  {effectiveSection === "noticias" ? (
                    <div className="pl-lh-tabpanel-body">
                      <section
                        className="pl-lh-section-stack"
                        aria-labelledby="league-news-heading"
                      >
                        <div className="pl-lh-stats-head">
                          <div>
                            <h2 id="league-news-heading" className="pl-lh-section-title">
                              Noticias y novedades · {leagueSummary.label}
                            </h2>
                            <p className="pl-lh-muted-note">
                              Titulares actualizados de la liga, parte médico, pulso de mercado y claves del modelo.
                            </p>
                          </div>
                          <span className="pl-lh-meta-chip num">
                            {filteredNews.length} notas
                          </span>
                        </div>

                        {availableNewsCategories.length > 2 ? (
                          <div
                            className="pl-league-news-cats"
                            role="group"
                            aria-label="Filtrar noticias por categoría"
                          >
                            {availableNewsCategories.map((cat) => (
                              <button
                                key={cat.key}
                                type="button"
                                className="pl-lh-filter-chip"
                                aria-pressed={newsCategory === cat.key}
                                onClick={() => setNewsCategory(cat.key)}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {filteredNews.length === 0 ? (
                          <SofascoreEmptyState
                            title="Sin novedades en esta categoría"
                            description={`Aún no hay novedades publicadas en este corte de ${leagueSummary.label}.`}
                          />
                        ) : (
                          <div className="pl-league-news-grid">
                            {filteredNews.map((item) => (
                              <article key={item.id} className="pl-league-news-card">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="pl-pill pl-pill--info text-[11px]">
                                    {item.categoryLabel}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {item.badge ? (
                                      <span className="pl-pill text-[11px] num">{item.badge}</span>
                                    ) : null}
                                    <span className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
                                      {item.publishedAtLabel}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-start gap-2.5 min-w-0">
                                  {item.team ? (
                                    <TeamBadge
                                      league={leagueSummary.league}
                                      slug={item.team.slug}
                                      name={item.team.name}
                                      logoUrl={item.team.logoUrl || undefined}
                                      size={24}
                                    />
                                  ) : (
                                    <LeagueBadge
                                      league={leagueSummary.league}
                                      label={leagueSummary.label}
                                      logoUrl={leagueSummary.logoUrl || undefined}
                                      size={22}
                                    />
                                  )}
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <h3 className="m-0 text-sm font-extrabold leading-snug">
                                      {item.title}
                                    </h3>
                                    <p
                                      className="m-0 text-xs leading-relaxed"
                                      style={{ color: "var(--pl-text-secondary)" }}
                                    >
                                      {item.summary}
                                    </p>
                                  </div>
                                </div>

                                {item.href || item.summaryHref || item.preloadedSummary ? (
                                  <div className="flex flex-wrap justify-end gap-2 pt-1 mt-auto">
                                    {item.href ? (
                                      <a
                                        href={item.href}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          navigateTo(item.href!);
                                        }}
                                        className="pl-lh-inline-action"
                                      >
                                        <span>{item.ctaLabel ?? "Ver detalle"}</span>
                                        <MaestroIcon name="arrowRight" size={12} />
                                      </a>
                                    ) : null}
                                    {item.summaryHref || item.preloadedSummary ? (
                                      <button
                                        type="button"
                                        data-news-read-btn={item.id}
                                        onClick={() => void openNewsSummary(item)}
                                        className="pl-lh-inline-action"
                                      >
                                        <MaestroIcon name="eye" size={12} />
                                        <span>{item.readMoreLabel ?? "Leer nota"}</span>
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  ) : null}
                  </div>
                ) : null}

                {visibleSectionKeys.has("equipos") ? (
                  <div
                    role="tabpanel"
                    id="pl-league-panel-equipos"
                    aria-labelledby="pl-league-tab-equipos"
                    className="pl-lh-tabpanel"
                    hidden={effectiveSection !== "equipos"}
                  >
                    {effectiveSection === "equipos" ? (
                      <div className="pl-lh-tabpanel-body">
                        {directoryTeams.length > 0 ? (
                          <section
                            className="pl-lh-section-stack"
                            aria-labelledby="league-clubs-directory-heading"
                            data-league-teams-directory=""
                          >
                            <div className="pl-lh-stats-head">
                              <h2 id="league-clubs-directory-heading" className="pl-lh-section-title">
                                {isNational
                                  ? `Perfiles de selecciones · ${leagueSummary.label}`
                                  : `Perfiles de equipos · ${leagueSummary.label}`}
                              </h2>
                              <div className="pl-lh-dir-controls">
                                {directoryTeams.length > 16 ? (
                                  <input
                                    type="search"
                                    value={teamQuery}
                                    onChange={(e) => setTeamQuery(e.target.value)}
                                    placeholder={isNational ? "Filtrar selección..." : "Filtrar club..."}
                                    aria-label={`Filtrar ${isNational ? "selecciones" : "equipos"} en ${leagueSummary.label}`}
                                    className="pl-sf-search-input pl-lh-dir-search"
                                  />
                                ) : null}
                                <span className="pl-lh-meta-chip num">
                                  {directoryTeams.length} {isNational ? "selecciones" : "equipos"}
                                </span>
                              </div>
                            </div>

                            {(() => {
                              const q = teamQuery
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .trim()
                                .toLowerCase();
                              const matchedTeams = directoryTeams.filter((teamItem) => {
                                if (!q) return true;
                                const norm = (s: string) =>
                                  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                                return norm(teamItem.name).includes(q) || norm(teamItem.shortName).includes(q);
                              });
                              const visibleTeams =
                                showAllTeams || q.length > 0
                                  ? matchedTeams
                                  : matchedTeams.slice(0, INITIAL_DIRECTORY_TEAMS);

                              return (
                                <>
                                  <div className="pl-league-directory-grid">
                                    {visibleTeams.map((teamItem) => (
                                      <a
                                        key={teamItem.slug}
                                        href={canonicalTeamHref(leagueSummary.league, teamItem.slug)}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          navigateTo(canonicalTeamHref(leagueSummary.league, teamItem.slug));
                                        }}
                                        className="pl-team-dir-card no-underline"
                                      >
                                        <span className="pl-team-dir-main">
                                          <TeamBadge
                                            league={leagueSummary.league}
                                            slug={teamItem.slug}
                                            name={teamItem.name}
                                            logoUrl={standingsLogoBySlug.get(teamItem.slug)}
                                            size={28}
                                          />
                                          <span className="pl-team-dir-copy">
                                            <strong className="truncate">{teamItem.name}</strong>
                                            <small>{leagueSummary.label}</small>
                                          </span>
                                        </span>
                                        <MaestroIcon name="chevronRight" size={14} className="pl-team-dir-chev" />
                                      </a>
                                    ))}
                                  </div>

                                  {!q && matchedTeams.length > INITIAL_DIRECTORY_TEAMS ? (
                                    <div className="pl-lh-expand-row">
                                      <button
                                        type="button"
                                        className="pl-lh-action-btn"
                                        onClick={() => setShowAllTeams((prev) => !prev)}
                                      >
                                        <span>
                                          {showAllTeams
                                            ? `Mostrar primeros ${INITIAL_DIRECTORY_TEAMS}`
                                            : `Ver todos (${matchedTeams.length})`}
                                        </span>
                                      </button>
                                    </div>
                                  ) : null}
                                </>
                              );
                            })()}
                          </section>
                        ) : (
                          <SofascoreEmptyState
                            title="Sin equipos registrados"
                            description={`Aún no hay clubes cargados en el corte vigente de ${leagueSummary.label}.`}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {visibleSectionKeys.has("arbitros") ? (
                  <div
                    role="tabpanel"
                    id="pl-league-panel-arbitros"
                    aria-labelledby="pl-league-tab-arbitros"
                    className="pl-lh-tabpanel"
                    hidden={effectiveSection !== "arbitros"}
                  >
                    {effectiveSection === "arbitros" ? (
                      <div className="pl-lh-tabpanel-body">
                        <section
                          className="pl-lh-section-stack"
                          aria-labelledby="league-referees-heading"
                          data-league-referees-directory=""
                        >
                          <div className="pl-lh-stats-head">
                            <div>
                              <h2 id="league-referees-heading" className="pl-lh-section-title">
                                Árbitros y rigurosidad · {leagueSummary.label}
                              </h2>
                              <p className="pl-lh-muted-note">
                                {enrichment?.refereeRanking
                                  ? `Promedio ajustado por muestra (κ = ${enrichment.refereeRanking.kappa}) frente a la media de la liga (${enrichment.refereeRanking.leagueMeanYellow.toFixed(2)} amar./p).`
                                  : leagueReferees[0]
                                    ? `Promedio de amarillas ajustado por muestra frente a la media (${leagueReferees[0].leagueMeanYellow.toFixed(2)} amar./p).`
                                    : "Índice disciplinario arbitral de la competición."}
                              </p>
                            </div>
                            <a
                              href={`/app/${leagueSummary.league}/arbitros`}
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo(`/app/${leagueSummary.league}/arbitros`);
                              }}
                              className="pl-lh-inline-action"
                            >
                              <span>Directorio completo</span>
                              <MaestroIcon name="arrowRight" size={13} />
                            </a>
                          </div>

                          <div
                            className="pl-league-news-cats"
                            role="group"
                            aria-label="Filtrar árbitros por perfil de rigurosidad"
                          >
                            {(
                              [
                                { id: "all", label: "Todos" },
                                { id: "estricto", label: "Estrictos" },
                                { id: "promedio", label: "Promedio" },
                                { id: "permisivo", label: "Permisivos" },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                className="pl-lh-filter-chip"
                                aria-pressed={refereeTier === opt.id}
                                onClick={() => setRefereeTier(opt.id)}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {hasServerReferees ? (
                            filteredServerReferees.length === 0 ? (
                              <SofascoreEmptyState
                                title="Sin árbitros con ese perfil"
                                description="Prueba con otro filtro de rigurosidad arbitral."
                              />
                            ) : (
                              <>
                                <div
                                  className="pl-sf-table-wrap is-compact"
                                  tabIndex={0}
                                  role="region"
                                  aria-label={`Ranking arbitral de ${leagueSummary.label}`}
                                >
                                  <table className="pl-sf-table">
                                    <caption className="sr-only">
                                      Ranking de árbitros de {leagueSummary.label}
                                    </caption>
                                    <thead>
                                      <tr>
                                        <th scope="col" className="pl-sf-th is-end num">#</th>
                                        <th scope="col" className="pl-sf-th is-sticky-col">Árbitro</th>
                                        <th scope="col" className="pl-sf-th is-end num">PJ</th>
                                        <th scope="col" className="pl-sf-th is-end num">Amar./p</th>
                                        <th scope="col" className="pl-sf-th is-end num hidden sm:table-cell">Rojas/p</th>
                                        <th scope="col" className="pl-sf-th is-end num hidden md:table-cell">Pen./p</th>
                                        <th scope="col" className="pl-sf-th">Perfil</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(showAllReferees
                                        ? filteredServerReferees
                                        : filteredServerReferees.slice(0, INITIAL_REFEREE_ROWS)
                                      ).map((refItem) => (
                                        <tr key={refItem.slug} className="pl-sf-tr">
                                          <td className="pl-sf-td is-end num">{refItem.rank}</td>
                                          <th scope="row" className="pl-sf-td is-sticky-col">
                                            <a
                                              href={refItem.href}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                navigateTo(refItem.href);
                                              }}
                                              className="pl-lh-ref-link"
                                            >
                                              <span>{safePublicText(refItem.name, refItem.slug)}</span>
                                              {refItem.nextAssignment ? (
                                                <small>
                                                  Próx: {refItem.nextAssignment.homeTeam} vs {refItem.nextAssignment.awayTeam}
                                                </small>
                                              ) : null}
                                            </a>
                                          </th>
                                          <td className="pl-sf-td is-end num">{refItem.matches}</td>
                                          <td className="pl-sf-td is-end num">
                                            <strong>
                                              {refItem.ebYellow !== null ? refItem.ebYellow.toFixed(2) : "—"}
                                            </strong>
                                          </td>
                                          <td className="pl-sf-td is-end num hidden sm:table-cell">
                                            {refItem.ebRed !== null ? refItem.ebRed.toFixed(2) : "—"}
                                          </td>
                                          <td className="pl-sf-td is-end num hidden md:table-cell">
                                            {refItem.ebPenalties !== null ? refItem.ebPenalties.toFixed(2) : "—"}
                                          </td>
                                          <td className="pl-sf-td">
                                            <span
                                              className={`pl-sf-signal-pill is-compact ${
                                                refItem.tier === "estricto"
                                                  ? "is-negative"
                                                  : refItem.tier === "permisivo"
                                                    ? "is-positive"
                                                    : "is-neutral"
                                              }`}
                                            >
                                              {safePublicText(refItem.tierLabel, refItem.tier)}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {filteredServerReferees.length > INITIAL_REFEREE_ROWS ? (
                                  <div className="pl-lh-expand-row">
                                    <button
                                      type="button"
                                      className="pl-lh-action-btn"
                                      onClick={() => setShowAllReferees((prev) => !prev)}
                                    >
                                      <span>
                                        {showAllReferees
                                          ? `Mostrar primeros ${INITIAL_REFEREE_ROWS}`
                                          : `Mostrar todos los árbitros (${filteredServerReferees.length})`}
                                      </span>
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            )
                          ) : filteredFallbackReferees.length === 0 ? (
                            <p className="pl-lh-muted-note">
                              Ningún árbitro coincide con ese filtro en esta jornada.
                            </p>
                          ) : (
                            <>
                              <div className="pl-ref-dir-grid">
                                {(showAllReferees
                                  ? filteredFallbackReferees
                                  : filteredFallbackReferees.slice(0, INITIAL_REFEREE_ROWS)
                                ).map((refItem) => (
                                  <RefereeRigorBadge
                                    key={refItem.name}
                                    referee={refItem}
                                    variant="card"
                                    onNavigate={navigateTo}
                                  />
                                ))}
                              </div>

                              {filteredFallbackReferees.length > INITIAL_REFEREE_ROWS ? (
                                <div className="pl-lh-expand-row">
                                  <button
                                    type="button"
                                    className="pl-lh-action-btn"
                                    onClick={() => setShowAllReferees((prev) => !prev)}
                                  >
                                    <span>
                                      {showAllReferees
                                        ? `Mostrar primeros ${INITIAL_REFEREE_ROWS}`
                                        : `Mostrar todos los árbitros (${filteredFallbackReferees.length})`}
                                    </span>
                                  </button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </section>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <TopLayerModalDialog
          open={Boolean(selectedNewsItem)}
          onClose={closeNewsModal}
          ariaLabelledBy={newsDialogTitleId}
          maxWidth="38rem"
        >
          {selectedNewsItem ? (
            <div className="pl-news-reader w-full p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="pl-pill pl-pill--info text-[11px]">
                    {loadedNewsSummary?.categoryLabel ?? selectedNewsItem.categoryLabel}
                  </span>
                  {loadedNewsSummary?.byline || selectedNewsItem.badge ? (
                    <span className="pl-pill text-[11px] num">
                      {loadedNewsSummary?.byline ?? selectedNewsItem.badge}
                    </span>
                  ) : null}
                  <span className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
                    {loadedNewsSummary?.publishedAtLabel ?? selectedNewsItem.publishedAtLabel}
                  </span>
                </div>
                <button
                  type="button"
                  autoFocus
                  className="pl-btn-glass px-2.5 min-h-11 min-w-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 [@media(min-width:768px)_and_(pointer:fine)]:min-w-9 shrink-0 inline-flex items-center justify-center"
                  aria-label="Cerrar resumen de la nota"
                  onClick={closeNewsModal}
                >
                  <MaestroIcon name="x" size={14} />
                </button>
              </div>

              <div className="flex items-start gap-3 min-w-0">
                {selectedNewsItem.team ? (
                  <TeamBadge
                    league={leagueSummary.league}
                    slug={selectedNewsItem.team.slug}
                    name={selectedNewsItem.team.name}
                    logoUrl={selectedNewsItem.team.logoUrl || undefined}
                    size={32}
                  />
                ) : (
                  <LeagueBadge
                    league={leagueSummary.league}
                    label={leagueSummary.label}
                    logoUrl={leagueSummary.logoUrl || undefined}
                    size={28}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider block"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    Resumen de la nota · {leagueSummary.label}
                  </span>
                  <h2 id={newsDialogTitleId} className="m-0 text-lg sm:text-xl font-extrabold leading-snug">
                    {loadedNewsSummary?.title ?? selectedNewsItem.title}
                  </h2>
                </div>
              </div>

              <div className="pl-news-reader-body space-y-3">
                <p className="m-0 text-sm font-semibold leading-relaxed" style={{ color: "var(--pl-text)" }}>
                  {loadedNewsSummary?.lead || selectedNewsItem.summary}
                </p>

                {summaryLoading ? (
                  <div className="space-y-2 pt-1" role="status" aria-live="polite">
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Cargando resumen ampliado de la nota…
                    </p>
                    <div className="pl-news-skel" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                ) : loadedNewsSummary && loadedNewsSummary.paragraphs.length > 0 ? (
                  <div className="space-y-2.5">
                    {loadedNewsSummary.paragraphs.map((paragraph, idx) => (
                      <p
                        key={idx}
                        className="m-0 text-sm leading-relaxed"
                        style={{ color: "var(--pl-text-secondary)" }}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : null}

                {((loadedNewsSummary?.keyPoints ?? selectedNewsItem.summaryHighlights)?.length ?? 0) > 0 ? (
                  <div className="pt-2 hairline-t space-y-1.5">
                    <span className="text-[11px] font-bold block" style={{ color: "var(--pl-text-muted)" }}>
                      Protagonistas y claves
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(loadedNewsSummary?.keyPoints ?? selectedNewsItem.summaryHighlights ?? []).map((kp) => (
                        <span key={kp} className="pl-pill text-[11px]">
                          {kp}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 hairline-t">
                {selectedNewsItem.href ? (
                  <a
                    href={selectedNewsItem.href}
                    onClick={(e) => {
                      e.preventDefault();
                      const targetHref = selectedNewsItem.href!;
                      closeNewsModal();
                      navigateTo(targetHref);
                    }}
                    className="pl-btn-primary text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-10 px-4 inline-flex items-center gap-1.5 no-underline"
                  >
                    <span>{selectedNewsItem.ctaLabel ?? "Ver detalle en PitchLab"}</span>
                    <MaestroIcon name="arrowRight" size={12} />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={closeNewsModal}
                  className="pl-btn-glass text-xs min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-10 px-4"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : null}
        </TopLayerModalDialog>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MatchStudioClubView({
  leagueId,
  gameId,
  cortexSynthesisOverride,
  cortexSections,
  cortexHeadline,
  detail,
  leagueStandings,
  liveDetailOverride,
  initialTab = "resumen",
}: {
  leagueId: LeagueId;
  gameId: string;
  /** Resumen de Cortex IA redactado en servidor (LLM validado); si falta, se usa la plantilla. */
  cortexSynthesisOverride?: string | null;
  /** Análisis por secciones de Cortex IA (lo redacta el corte y llega en el snapshot). */
  cortexSections?: readonly CortexSectionView[] | null;
  /** Idea central del partido redactada por Cortex IA. */
  cortexHeadline?: string | null;
  /** Mercados, enfrentamientos y factores de este partido (el dataset del layout llega sin ellos). */
  detail?: PlatformGameDetail | null;
  /** Tabla general de la liga de este partido (evita enviar 57 tablas en el layout). */
  leagueStandings?: readonly StandingRow[];
  /** Snapshot en vivo inyectado para stories o pruebas deterministas. */
  liveDetailOverride?: LiveMatchDetail | null;
  /** Pestaña inicial resuelta en servidor desde `?tab=` para compartir enlaces. */
  initialTab?: MatchTabKey;
}): React.JSX.Element {
  const { dataset, viewerRole, viewerIdentity, hasAccountSessionAuth, oddsFormat, upgradeHref } = usePlatformCore();
  const { setSelectedTipsterPickId, publishSocialPost, addSocialComment, deleteSocialComment, toggleSocialCommentHelpful, loadAllPostComments, deleteSocialPost, toggleSocialLike, loadMatchSocialPosts, sealPickToJournal, recordSocialPostCopy, addPickToParlay, openComposer, navigateTo, pushToast } = usePlatformActions();
  const { parlaySummary } = useParlayState();
  const { socialPosts } = useSocialState();
  const journal = useJournalEntries();

  const follows = useFollowing();
  const [reportTarget, setReportTarget] = useState<SocialReportTarget | null>(null);
  const own = useMemo(
    () => ownIdentityFor(viewerRole, viewerIdentity),
    [viewerRole, viewerIdentity],
  );
  const parlayPickIds = useMemo(
    () => new Set(parlaySummary.legs.map((l) => l.pick.id)),
    [parlaySummary.legs],
  );

  const [activeTab, setActiveTab] = useMatchUrlTab(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<MatchTabKey>>(
    () => new Set([activeTab]),
  );
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(activeTab) ? prev : new Set([...prev, activeTab])));
  }, [activeTab]);
  const isTabMounted = (key: MatchTabKey) => activeTab === key || visitedTabs.has(key);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const handleSelectTabFromRail = (nextTab: MatchTabKey) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      workspaceRef.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    }
  };
  const [marketUserOddsRaw, setMarketUserOddsRaw] = useState<string>("");
  const [houseOddsByKey, setHouseOddsByKey] = useState<Record<string, string>>({});
  const [sealedMarketKeys, setSealedMarketKeys] = useState<Set<string>>(() => new Set());
  const [debateBody, setDebateBody] = useState<string>("");
  const [debateError, setDebateError] = useState<string>("");

  const game = useMemo(() => {
    const base =
      dataset.games.find((g) => g.id === gameId) ??
      dataset.games.find((g) => g.league === leagueId) ??
      dataset.games[0]!;
    return detail && base.id === gameId ? { ...base, ...detail } : base;
  }, [dataset.games, gameId, leagueId, detail]);

  useEffect(() => {
    void loadMatchSocialPosts(game.id);
  }, [game.id, loadMatchSocialPosts]);

  const liveSupported = game.sport !== "american-football" && game.league !== "nfl";
  const liveSnap = useLiveMatch(game.id, liveSupported && !liveDetailOverride);
  const liveDetail = liveDetailOverride ?? liveSnap.data;
  const hasLiveMomentum = Boolean(
    liveDetail && (liveDetail.momentum.length > 0 || liveDetail.incidents.length > 0),
  );
  const hasLiveIncidents = Boolean(liveDetail && liveDetail.incidents.length > 0);
  const isFinished = game.status === "FT" && game.score !== undefined;
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const intelUnlocked = isPreGameIntelUnlocked(game, viewerRole);

  const homePrimary =
    getTeamColors(game.league, game.home.slug)?.[0] ??
    "var(--pl-aura-default-home)";
  const awayPrimary =
    getTeamColors(game.league, game.away.slug)?.[0] ??
    "var(--pl-aura-default-away)";

  const studioPath = canonicalGameHref(game.league, game);
  const mainEngineName =
    game.picks[0]?.engineName ??
    (game.sport === "american-football"
      ? "PitchLab Minkowski v3.0"
      : game.sport === "basketball"
        ? "PitchLab Motor NBA"
        : game.sport === "ice-hockey"
          ? "PitchLab Motor NHL"
          : "PitchLab Tachyon v3.0");

  const activeMarkets = useMemo(() => {
    if (!intelUnlocked && !isFinished && game.markets.length === 0) return [];
    return detail?.markets && detail.markets.length > 0 ? detail.markets : game.markets;
  }, [detail?.markets, game.markets, intelUnlocked, isFinished]);

  const sportOutlook = useMemo(
    () => (isFinished ? null : platformGameToSportOutlook(game, detail)),
    [detail, game, isFinished],
  );

  const matchLabelShort = `${game.home.shortName} vs ${game.away.shortName}`;

  const matchDebatePosts = useMemo(() => {
    const homeShort = game.home.shortName.toLowerCase();
    const awayShort = game.away.shortName.toLowerCase();
    return socialPosts.filter((p) => {
      if (p.gameId === game.id || p.pick?.gameId === game.id) return true;
      if (!p.gameId && p.isExample) {
        const lower = p.matchLabel.toLowerCase();
        return lower.includes(homeShort) || lower.includes(awayShort);
      }
      return false;
    });
  }, [game.away.shortName, game.home.shortName, game.id, socialPosts]);

  const goProfile = (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    navigateTo(`/app/u/${handle}`);
  };

  const handlePublishDebate = (e: React.FormEvent) => {
    e.preventDefault();
    setDebateError("");
    const res = publishSocialPost({
      leagueLabel: game.leagueLabel,
      gameId: game.id,
      matchLabel: matchLabelShort,
      pickBadge: game.picks[0]?.categoryLabel ?? "Lectura Socio",
      originType: "Spacetime Suite",
      body: debateBody,
    });
    if (!res.ok) {
      setDebateError(res.error ?? "No se pudo publicar tu comentario.");
      return;
    }
    setDebateBody("");
  };

  const handleSealMarketRow = (
    m: PlatformMarketRow,
    idx: number,
    rowCustomOddsRaw?: string,
  ) => {
    const existingPick = game.picks.find((p) => p.label === m.label);
    if (existingPick) {
      openComposer(existingPick);
      return;
    }
    const effectiveRaw = rowCustomOddsRaw?.trim() || marketUserOddsRaw.trim();
    const parsedUserDec = effectiveRaw ? parseUserOdds(effectiveRaw) : null;
    const effectiveBookDec =
      parsedUserDec && parsedUserDec > 1 ? parsedUserDec : m.currentDecimal;
    const edgeForSeal =
      effectiveBookDec === null ? null : Math.round((m.p - 1 / effectiveBookDec) * 1000) / 10;
    const syntheticPick: MatchPick = {
      id: `${game.id}__mkt__${encodeURIComponent(m.group)}__${encodeURIComponent(m.selection)}`,
      gameId: game.id,
      league: game.league,
      leagueLabel: game.leagueLabel,
      matchLabel: `${game.home.name} vs ${game.away.name}`,
      kickoffLocal: game.kickoffLocal,
      gameStatus: game.status,
      slotIndex: idx + 10,
      category: "valor",
      categoryLabel: m.group,
      risk: m.p >= 0.68 ? "conservador" : m.p >= 0.52 ? "medio" : "arriesgado",
      engineKey: "geodesic",
      engineName: "Motor Spacetime",
      marketGroup: m.group,
      selectionKey: m.selection,
      market: m.market,
      ...(m.line !== undefined ? { line: m.line } : {}),
      conflictGroup: "independent",
      label: m.label,
      rationale: `Línea directa del panel de mercados (${(m.p * 100).toFixed(1)} % de probabilidad real).`,
      p: m.p,
      fairDecimal: m.fairDecimal,
      fairAmerican: m.fairAmerican,
      marketDecimal: effectiveBookDec,
      marketAmerican: effectiveBookDec === null ? null : decimalToAmericanInt(effectiveBookDec),
      edgePts: edgeForSeal,
      confidenceScore: game.confidenceScore,
      suggestedUnits: 1.0,
    };
    openComposer(syntheticPick);
  };

  const cortexSummaryText =
    cortexHeadline?.trim() ||
    cortexSections?.find((sec) => sec.key === "lectura")?.text ||
    cortexSynthesisOverride ||
    game.preGame.cortexSynthesis;

  return (
    <AtmosphereStage activePath={studioPath}>
      <ClubWorkspaceShell activePath={studioPath}>
        <MatchBreadcrumb game={game} onNavigate={navigateTo} />

        {/* Hero principal del encuentro */}
        <MatchHeroScoreboard
          game={game}
          homePrimary={homePrimary}
          awayPrimary={awayPrimary}
          intelUnlocked={intelUnlocked}
          liveDetail={liveDetail}
          onNavigate={navigateTo}
        />

        {/* Área de estudio en 2 columnas: Riel persistente + Espacio principal con pestañas */}
        <div className="pl-match-layout">
          <MatchLeftRail
            game={game}
            markets={activeMarkets}
            oddsFormat={oddsFormat}
            intelUnlocked={intelUnlocked}
            liveDetail={liveDetail}
            mainEngineName={mainEngineName}
            cortexSummaryText={cortexSummaryText}
            onSelectTab={handleSelectTabFromRail}
          />

          <section ref={workspaceRef} className="pl-match-workspace" aria-label="Análisis del partido">
            <MatchTabs
              idPrefix="pl-match"
              active={activeTab}
              onSelect={setActiveTab}
              tabs={[
                { key: "resumen", label: "Resumen", count: game.picks.length },
                { key: "ia", label: "Análisis IA" },
                {
                  key: "numeros",
                  label: "Números",
                  count: activeMarkets.length > 0 ? activeMarkets.length : undefined,
                },
                { key: "dinero", label: "¿Dónde está el dinero?" },
                { key: "contexto", label: "Contexto" },
              ]}
            />

            {/* Pestaña 1: Picks y Evidencia (tablero editorial + En vivo + Pre-Match) */}
            <MatchTabPanel idPrefix="pl-match" tabKey="resumen" active={activeTab}>
              {liveSupported || liveDetailOverride ? (
                <Suspense fallback={<MatchTabFallback />}>
                  <LazyLiveMatchPanelView
                    game={game}
                    detail={liveDetail}
                    loading={liveDetailOverride ? false : liveSnap.loading}
                    error={liveDetailOverride ? false : liveSnap.error}
                    showFollow={false}
                    hideMomentum={hasLiveMomentum}
                    hideTimeline={hasLiveIncidents}
                    hideScoreboard
                  />
                </Suspense>
              ) : null}

              <MatchPicksEvidenceBoard
                game={game}
                markets={activeMarkets}
                v5={detail?.v5 ?? null}
                catalog={detail?.picksCatalog ?? null}
              />

              {isFinished ? null : <PreMatchModule game={game} detail={detail} />}
              {sportOutlook ? (
                <SportOutlookCard outlook={sportOutlook} oddsFormat={oddsFormat} />
              ) : null}

              {/* Factores clave del análisis */}
              <section
                className="glass-card glass-ring rounded-2xl p-5 space-y-3.5"
                aria-labelledby="resumen-factors-heading"
                data-summary-factors=""
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 id="resumen-factors-heading" className="m-0 text-base font-extrabold">
                      Factores del partido
                    </h2>
                    <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
                      Señales cuantitativas que explican las probabilidades del modelo.
                    </p>
                  </div>
                </div>

                {!intelUnlocked && !isFinished ? (
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Los factores cuantitativos del encuentro están reservados para socios con Pase PitchLab Ultra.
                  </p>
                ) : game.factors.length > 0 ? (
                  <div className="pl-factors-grid" data-factor-count={game.factors.length}>
                    {game.factors.map((factor) => (
                      <article key={`${factor.label}-${factor.value}`} className="pl-factor-item">
                        <span className="pl-factor-label">{factor.label}</span>
                        <strong className="pl-factor-value num">{factor.value}</strong>
                        {factor.sub ? (
                          <span className="pl-factor-sub">{factor.sub}</span>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Los factores detallados aparecerán cuando el partido acumule señales adicionales.
                  </p>
                )}
              </section>
            </MatchTabPanel>

        {/* Pestaña 2: Análisis IA (Pronóstico estructurado de Cortex IA + Análisis editorial + Señales) */}
        <MatchTabPanel idPrefix="pl-match" tabKey="ia" active={activeTab}>
          {isTabMounted("ia") ? (
            <Suspense fallback={<MatchTabFallback />}>
              <LazyCortexAnalysisCard
            game={game}
            synthesis={
              cortexSections?.find((sec) => sec.key === "lectura")?.text ??
              cortexSynthesisOverride ??
              (game.preGame.cortexSynthesis?.trim()
                ? game.preGame.cortexSynthesis
                : (detail?.v5?.verifiedSummaryEs ?? ""))
            }
            unlocked={intelUnlocked || isFinished || !hasForecast}
            sections={cortexSections}
            headline={cortexHeadline}
            onAddPickToParlay={(pk) => {
              addPickToParlay(pk);
              pushToast(`«${pk.label}» agregado a tu parlay.`, "success");
            }}
            inParlayPickIds={parlayPickIds}
            onUpgrade={() => navigateTo(upgradeHref)}
            sideSlot={
              intelUnlocked &&
              hasForecast &&
              ((game.spacetime?.drivers.length ?? 0) > 0 ||
                game.preGame.tacticalKeys.length > 0) ? (
                <div
                  className="glass-card glass-ring rounded-2xl p-4 space-y-3 min-w-0"
                  data-cortex-signals=""
                >
                  <h2 className="m-0 text-sm font-extrabold">Señales del modelo</h2>

                  {(game.spacetime?.drivers.length ?? 0) > 0 ? (() => {
                    const drivers = game.spacetime!.drivers;
                    const maxImpact = Math.max(
                      0.0001,
                      ...drivers.map((d) => Math.abs(d.impactLogit)),
                    );
                    return (
                      <div className="space-y-1.5">
                        <h3 className="pl-cortex-label">Lo que más mueve el pronóstico</h3>
                        <ul className="pl-cortex-drivers">
                          {drivers.slice(0, 4).map((d) => (
                            <li key={d.label}>
                              <span className="text-xs">{d.label}</span>
                              <span className="pl-cortex-impact" aria-hidden="true">
                                <span
                                  style={{
                                    width: `${Math.round((Math.abs(d.impactLogit) / maxImpact) * 100)}%`,
                                    background:
                                      d.impactLogit >= 0
                                        ? "var(--pl-success)"
                                        : "var(--pl-warning)",
                                  }}
                                />
                              </span>
                              <span
                                className="text-[11px] num"
                                style={{ color: "var(--pl-text-muted)" }}
                              >
                                {d.impactLogit >= 0
                                  ? `a favor de ${game.home.shortName}`
                                  : `a favor de ${game.away.shortName}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })() : null}

                  {game.preGame.tacticalKeys.length > 0 ? (
                    <div className="space-y-1.5 pt-2 hairline-t">
                      <h3 className="pl-cortex-label">Claves rápidas</h3>
                      <ul className="pl-cortex-list text-xs">
                        {game.preGame.tacticalKeys.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null
            }
          />
            </Suspense>
          ) : null}
        </MatchTabPanel>

        {/* Pestaña 3: Números esperados, mercados y simulador */}
        <MatchTabPanel idPrefix="pl-match" tabKey="numeros" active={activeTab}>
          {isTabMounted("numeros") ? (
            <Suspense fallback={<MatchTabFallback />}>
              <LazyMatchNumbersPanel
            game={game}
            markets={activeMarkets}
            oddsFormat={oddsFormat}
            watermark={getSessionWatermark(viewerRole, viewerIdentity)}
            unlocked={intelUnlocked}
            isFinished={isFinished}
            canSeal={viewerRole !== "visitor"}
            outlook={detail?.outlook ?? null}
            v5={detail?.v5 ?? null}
            sealedKeys={sealedMarketKeys}
            globalHouseOddRaw={marketUserOddsRaw}
            houseOddsByKey={houseOddsByKey}
            onGlobalHouseOddChange={setMarketUserOddsRaw}
            onHouseOddChange={(key, value) =>
              setHouseOddsByKey((prev) => ({ ...prev, [key]: value }))
            }
            onSealRow={(row, rowKey) => {
              setSealedMarketKeys((prev) => {
                const next = new Set(prev);
                next.add(rowKey);
                return next;
              });
              handleSealMarketRow(row, sealedMarketKeys.size, houseOddsByKey[rowKey]);
            }}
          />
            </Suspense>
          ) : null}
        </MatchTabPanel>

        {/* Pestaña 4: ¿Dónde está el dinero? (flujo de mercado vs. modelo + comparativa de cuotas) */}
        <MatchTabPanel idPrefix="pl-match" tabKey="dinero" active={activeTab}>
          {isTabMounted("dinero") ? (
            <Suspense fallback={<MatchTabFallback />}>
              <LazyMatchMoneyPanel
            game={game}
            markets={activeMarkets}
            oddsFormat={oddsFormat}
            unlocked={intelUnlocked}
            isFinished={isFinished}
            onOpenNumbers={() => setActiveTab("numeros")}
            onAddPickToParlay={
              viewerRole !== "visitor"
                ? (pk) => {
                    addPickToParlay(pk);
                    pushToast(`«${pk.label}» agregado a tu parlay.`, "success");
                  }
                : undefined
            }
            inParlayPickIds={parlayPickIds}
          />
            </Suspense>
          ) : null}
        </MatchTabPanel>

        {/* Pestaña 5: Contexto (equipos, sede/H2H, bajas + opiniones lado a lado y tabla) */}
        <MatchTabPanel idPrefix="pl-match" tabKey="contexto" active={activeTab}>
          {isTabMounted("contexto") ? (
            <Suspense fallback={<MatchTabFallback />}>
              <LazyMatchContextPanel
            game={game}
            standings={
              leagueStandings && leagueStandings.length > 0
                ? [...leagueStandings]
                : (dataset.leagues.find((l) => l.league === game.league)?.standings ?? [])
            }
            unlocked={intelUnlocked}
            v5={detail?.v5 ?? null}
            opinionsSlot={
              <aside
                aria-label="Opiniones de socios sobre el partido"
                className="pl-ctx-card glass-lens glass-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="m-0 text-lg font-extrabold">Opiniones de socios</h2>
                  </div>
                  {matchDebatePosts.length > 0 ? (
                    <StackedAvatars
                      items={matchDebatePosts.slice(0, 3).map((post, idx) => ({
                        initials: post.authorHandle.slice(0, 2).toUpperCase(),
                        gradVar: post.avatarGradVar || `var(--avatar-grad-${(idx % 3) + 1})`,
                        label: `@${post.authorHandle}`,
                      }))}
                      extraCount={Math.max(0, matchDebatePosts.length - 3)}
                    />
                  ) : (
                    <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                      0 publicaciones
                    </span>
                  )}
                </div>

                {matchDebatePosts.length > 0 ? (
                  <div className="pl-studio-debate-list space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                    {matchDebatePosts.map((post) => (
                      <SocialPostCard
                        key={post.id}
                        variant="compact"
                        post={post}
                        author={resolvePostAuthor(post, own, [])}
                        own={own}
                        dataset={dataset}
                        journal={journal}
                        oddsFormat={oddsFormat}
                        following={follows.isFollowing(post.authorHandle)}
                        onToggleFollow={(handle) => {
                          const now = follows.toggle(handle);
                          pushToast(
                            now ? `Ahora sigues a @${handle}.` : `Dejaste de seguir a @${handle}.`,
                            "default",
                          );
                        }}
                        onCopy={(p) =>
                          copyPostPickToJournal(p, {
                            dataset,
                            sealPickToJournal,
                            recordSocialPostCopy,
                            pushToast,
                          })
                        }
                        onCopyToParlay={(p) =>
                          copyPostPickToParlay(p, {
                            dataset,
                            addPickToParlay,
                            pushToast,
                          })
                        }
                        onShare={(p) => shareSocialPost(p, pushToast)}
                        toggleSocialLike={toggleSocialLike}
                        addSocialComment={addSocialComment}
                        onDeleteComment={deleteSocialComment}
                        onToggleCommentHelpful={toggleSocialCommentHelpful}
                        onLoadAllComments={loadAllPostComments}
                        onDeletePost={deleteSocialPost}
                        onOpenReport={setReportTarget}
                        onNavigate={navigateTo}
                        goProfile={goProfile}
                      />
                    ))}
                  </div>
                ) : (
                  <p
                    className="m-0 rounded-2xl p-3.5 text-xs leading-relaxed"
                    style={{ background: "var(--pl-surface)", color: "var(--pl-text-muted)" }}
                  >
                    Aún no hay opiniones publicadas para este partido. Sé el primero en compartir tu
                    lectura.
                  </p>
                )}

                <form onSubmit={handlePublishDebate} noValidate className="space-y-2 pt-2 hairline-t">
                  <label
                    htmlFor="studio-debate-input"
                    className="text-xs font-bold block"
                  >
                    Tu opinión sobre {matchLabelShort}
                  </label>
                  <textarea
                    id="studio-debate-input"
                    rows={2}
                    maxLength={SOCIAL_POST_MAX_CHARS}
                    value={debateBody}
                    onChange={(e) => {
                      setDebateBody(e.target.value);
                      if (debateError) setDebateError("");
                    }}
                    placeholder="¿Qué ves en este partido?"
                    className="glass-input w-full p-2.5 text-xs resize-none"
                  />
                  {debateError ? (
                    <p
                      role="alert"
                      className="m-0 text-xs font-semibold"
                      style={{ color: "var(--pl-danger)" }}
                    >
                      {debateError}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {debateBody.length >= Math.round(SOCIAL_POST_MAX_CHARS * 0.7) ? (
                        <span className="pl-com-char-count num">
                          {debateBody.length}/{SOCIAL_POST_MAX_CHARS}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="submit"
                      className="pl-btn-primary text-xs min-h-11 px-3.5 inline-flex items-center gap-1.5"
                    >
                      <MaestroIcon name="users" size={12} />
                      <span>Publicar opinión</span>
                    </button>
                  </div>
                </form>
                <SocialReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
              </aside>
            }
          />
            </Suspense>
          ) : null}
        </MatchTabPanel>
          </section>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
