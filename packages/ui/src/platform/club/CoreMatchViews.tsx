"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  isNationalCompetition,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
} from "@pitchlab/contracts";
import {
  LeagueBadge,
  ProbSplit,
  TeamBadge,
  parseUserOdds,
} from "../../sports";
import {
  decimalToAmericanInt,
  formatOddsValue,
  getSessionWatermark,
  isPreGameIntelUnlocked,
} from "../access-guard";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
  StackedAvatars,
} from "../components/MaestroPrimitives";
import { MatchList } from "../components/MatchList";
import { PlLeagueSelect } from "../components/PlSelect";
import { MultiPickRow } from "../components/MatchTicketCard";
import { ConfidenceChip } from "../components/ConfidenceChip";
import { groupMatchesByDayAndLeague } from "./home/home-model";
import { CortexAnalysisCard, type CortexSectionView } from "./match/CortexAnalysisCard";
import { MatchContextPanel } from "./match/MatchContextPanel";
import { MatchMoneyPanel } from "./match/MatchMoneyPanel";
import { MatchNumbersPanel } from "./match/MatchNumbersPanel";
import { MatchTabPanel, MatchTabs, useMatchUrlTab } from "./match/MatchTabs";
import { PreMatchModule } from "./match/PreMatchModule";
import {
  SportOutlookCard,
  platformGameToSportOutlook,
} from "./match/sport-outlook";
import { FollowControl, LiveMatchPanel } from "../live/LiveMatchCenter";
import { PicksFinderClubView } from "./PicksFinderView";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import {
  usePlatform,
} from "../platform-provider";
import {
  SocialReportDialog,
  ownIdentityFor,
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

export type LeagueHubSectionKey = "partidos" | "tabla" | "noticias" | "equipos";

const LEAGUE_SECTIONS: ReadonlyArray<{ key: LeagueHubSectionKey; label: string }> = [
  { key: "partidos", label: "Partidos" },
  { key: "tabla", label: "Tabla de posiciones" },
  { key: "noticias", label: "Noticias" },
  { key: "equipos", label: "Equipos" },
];

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
  if (v === "tabla" || v === "posiciones" || v === "standings") return "tabla";
  if (v === "noticias" || v === "news") return "noticias";
  if (v === "equipos" || v === "selecciones" || v === "teams") return "equipos";
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
      href: `/app/${league}/teams/${leaderSlug}`,
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
        href: `/app/${league}/games/${g.id}`,
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
        badge: g.confidenceScore ? `Conf. ${g.confidenceScore}` : g.round,
        team: {
          slug: g.home.slug,
          name: g.home.name,
          logoUrl: g.home.logoUrl,
        },
        href: `/app/${league}/games/${g.id}`,
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
        href: `/app/${league}/games/${g.id}`,
        ctaLabel: "Ver resultado",
      });
    }
  }

  return items;
}

/** El Inicio del Club vive en `home/HomeClubView`; se conserva el nombre anterior.
 */
export { HomeClubView as JornadaClubView } from "./home/HomeClubView";

/** /app/picks: buscador de todas las selecciones (ver PicksFinderView). */
export function MultiPicksClubView(): React.JSX.Element {
  return <PicksFinderClubView />;
}

export function LeagueHubClubView({
  leagueId,
  initialNews,
  initialSection = "partidos",
}: {
  leagueId: LeagueId;
  initialNews?: readonly LeagueNewsItem[];
  initialSection?: LeagueHubSectionKey;
}): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, upgradeHref, navigateTo } = usePlatform();
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [section, setSection] = useState<LeagueHubSectionKey>(initialSection);
  const [teamQuery, setTeamQuery] = useState<string>("");
  const [newsCategory, setNewsCategory] = useState<LeagueNewsCategory | "all">("all");
  const [selectedNewsItem, setSelectedNewsItem] = useState<LeagueNewsItem | null>(null);
  const [loadedNewsSummary, setLoadedNewsSummary] = useState<LeagueNewsArticleSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [isFavLeague, setIsFavLeague] = useState<boolean>(false);
  const newsSummaryCacheRef = useRef<Map<string, LeagueNewsArticleSummary>>(new Map());
  const summaryAbortRef = useRef<AbortController | null>(null);
  const newsDialogTitleId = useId();
  const sectionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelPartidosRef = useRef<HTMLDivElement | null>(null);
  const panelTablaRef = useRef<HTMLDivElement | null>(null);
  const panelNoticiasRef = useRef<HTMLDivElement | null>(null);
  const panelEquiposRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("pl-fav-leagues");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setIsFavLeague(parsed.includes(leagueId));
      }
    } catch (err) {
      void err;
    }
  }, [leagueId]);

  const toggleLeagueFavorite = () => {
    try {
      const raw = window.localStorage.getItem("pl-fav-leagues");
      const prev: string[] = raw ? JSON.parse(raw) : [];
      const next = prev.includes(leagueId) ? prev.filter((x) => x !== leagueId) : [...prev, leagueId];
      window.localStorage.setItem("pl-fav-leagues", JSON.stringify(next));
      setIsFavLeague(next.includes(leagueId));
    } catch (err) {
      void err;
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("vista") ??
      new URLSearchParams(window.location.search).get("tab");
    if (raw) {
      setSection(normalizeLeagueSection(raw));
    }
  }, [leagueId]);

  useEffect(() => {
    const map: Array<[React.RefObject<HTMLDivElement | null>, LeagueHubSectionKey]> = [
      [panelPartidosRef, "partidos"],
      [panelTablaRef, "tabla"],
      [panelNoticiasRef, "noticias"],
      [panelEquiposRef, "equipos"],
    ];
    const cleanups: Array<() => void> = [];
    for (const [ref, key] of map) {
      const el = ref.current;
      if (!el) continue;
      const handler = () => setSection(key);
      el.addEventListener("beforematch", handler);
      cleanups.push(() => el.removeEventListener("beforematch", handler));
    }
    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const selectSection = (next: LeagueHubSectionKey) => {
    setSection(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("vista", next);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  };

  const leagueSummary =
    dataset.leagues.find((l) => l.league === leagueId) ?? dataset.leagues[0]!;
  const isNational = isNationalCompetition(leagueSummary.league);
  const leagueGames = useMemo(
    () => dataset.games.filter((g) => g.league === leagueSummary.league),
    [dataset.games, leagueSummary.league],
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

  const directoryTeams = useMemo(() => {
    const directoryFromDataset = (dataset.teams ?? []).filter(
      (t) => t.league === leagueSummary.league,
    );
    if (directoryFromDataset.length > 0) return directoryFromDataset;
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
            href: `/app/${leagueSummary.league}/teams/${side.slug}`,
          });
        }
      }
    }
    return [...fallbackMap.values()].sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
  }, [dataset.teams, leagueSummary.league, leagueGames]);

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

  useEffect(() => () => summaryAbortRef.current?.abort(), []);

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
  const leader = leagueSummary.standings[0];
  const leagueHasDraw = sportHasDraw(leagueSummary.sport);
  const sportBreadcrumbLabel =
    leagueSummary.sport === "basketball"
      ? "Basquetbol"
      : leagueSummary.sport === "american-football"
        ? "Fútbol americano"
        : leagueSummary.sport === "ice-hockey"
          ? "Hockey"
          : isNational
            ? "Selecciones"
            : "Fútbol";

  const totalLeagueGames = Math.max(
    1,
    leagueSummary.finishedCount + leagueSummary.upcomingCount,
  );

  const featuredGame = useMemo<PlatformGame | null>(() => {
    const open = leagueGames
      .filter((g) => g.status !== "FT")
      .slice()
      .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
    if (open[0]) return open[0];
    return leagueGames[leagueGames.length - 1] ?? null;
  }, [leagueGames]);

  const recentFormBySlug = useMemo(() => {
    const map = new Map<string, Array<"G" | "E" | "P">>();
    const ftSorted = leagueGames
      .filter((g) => g.status === "FT" && g.score !== undefined)
      .slice()
      .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
    for (const g of ftSorted) {
      const sh = g.score!.home;
      const sa = g.score!.away;
      const hOut: "G" | "E" | "P" = sh > sa ? "G" : sh < sa ? "P" : "E";
      const aOut: "G" | "E" | "P" = sa > sh ? "G" : sa < sh ? "P" : "E";
      const hArr = map.get(g.home.slug) ?? [];
      hArr.push(hOut);
      map.set(g.home.slug, hArr.slice(-5));
      const aArr = map.get(g.away.slug) ?? [];
      aArr.push(aOut);
      map.set(g.away.slug, aArr.slice(-5));
    }
    return map;
  }, [leagueGames]);

  const handleSectionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = LEAGUE_SECTIONS[(idx + 1) % LEAGUE_SECTIONS.length]!;
      selectSection(next.key);
      sectionRefs.current[(idx + 1) % LEAGUE_SECTIONS.length]?.focus();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prevIdx = (idx - 1 + LEAGUE_SECTIONS.length) % LEAGUE_SECTIONS.length;
      const prev = LEAGUE_SECTIONS[prevIdx]!;
      selectSection(prev.key);
      sectionRefs.current[prevIdx]?.focus();
    }
  };

  return (
    <AtmosphereStage activePath={hubPath}>
      <ClubWorkspaceShell activePath={hubPath}>
        {/* Ruta de navegación de la competición */}
        <nav
          aria-label="Ruta de la competición"
          className="flex flex-wrap items-center gap-1.5 text-xs"
          style={{ color: "var(--pl-text-muted)" }}
        >
          <a
            href="/app"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/app");
            }}
            className="pl-team-link font-semibold"
            style={{ color: "var(--pl-brand)" }}
          >
            Partidos
          </a>
          <span aria-hidden="true">›</span>
          <span>{sportBreadcrumbLabel}</span>
          <span aria-hidden="true">›</span>
          <span className="truncate" style={{ color: "var(--pl-text-secondary)" }}>
            {leagueSummary.label}
          </span>
        </nav>

        {/* Tarjeta Hero de Competición a ancho completo + Barra de progreso de temporada */}
        <section className="glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-4 relative overflow-hidden">
          <LensGlowOrbs subtle />

          <div className="flex flex-wrap items-start justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4 min-w-0">
              <CrestPedestal size="lg">
                <LeagueBadge
                  league={leagueSummary.league}
                  label={leagueSummary.label}
                  logoUrl={leagueSummary.logoUrl}
                  size={44}
                />
              </CrestPedestal>
              <div className="space-y-1.5 min-w-0">
                <h1 id="panel-league-name" className="m-0 text-2xl sm:text-3xl font-extrabold truncate">
                  {leagueSummary.label}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                    {sportBreadcrumbLabel}
                  </span>
                  {leagueSummary.season ? (
                    <span className="pl-pill num text-[11px] font-bold">{leagueSummary.season}</span>
                  ) : null}
                  {leagueSummary.roundLabel ? (
                    <span className="pl-pill pl-pill--brand text-[11px] font-bold">
                      {leagueSummary.roundLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs num relative z-10">
              <button
                type="button"
                aria-pressed={isFavLeague}
                onClick={toggleLeagueFavorite}
                className={`pl-btn-primary text-xs min-h-11 px-4 inline-flex items-center gap-1.5 font-bold ${isFavLeague ? "" : "pl-btn-glass"}`.trim()}
              >
                <span aria-hidden="true">{isFavLeague ? "★" : "☆"}</span>
                <span>{isFavLeague ? "En Favoritos" : "Favorito"}</span>
              </button>
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-1.5"
                data-jump-standings=""
                onClick={() => selectSection("tabla")}
              >
                <MaestroIcon name="trophy" size={12} />
                <span>
                  {leader
                    ? `Tabla · 1.º ${leader.shortName || leader.name}`
                    : "Ver tabla"}
                </span>
              </button>
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-1.5"
                data-jump-news=""
                onClick={() => selectSection("noticias")}
              >
                <MaestroIcon name="bolt" size={12} />
                <span>Noticias ({newsItems.length})</span>
              </button>
            </div>
          </div>

          {/* Barra inferior de progreso de la jornada / temporada */}
          <div className="pl-season-progress relative z-10">
            <progress
              className="pl-season-progress-bar"
              max={totalLeagueGames}
              value={leagueSummary.finishedCount}
              aria-label={`Avance de partidos en ${leagueSummary.label}: ${leagueSummary.finishedCount} finalizados de ${totalLeagueGames}`}
            />
            <div className="flex items-center justify-between gap-2 text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
              <span>{leagueSummary.finishedCount} auditados FT</span>
              <span>{leagueSummary.upcomingCount} por jugar</span>
            </div>
          </div>
        </section>

        {/* Diseño de 2 columnas estilo Hub Deportivo (DOM: main primero para accesibilidad/móvil, side a la izquierda en >= 1024px) */}
        <div className="pl-league-2col">
          <div className="pl-league-main space-y-4 min-w-0">
            {/* Barra de secciones de la liga + indicadores honestos Pronto */}
            <nav
              aria-label={`Secciones de ${leagueSummary.label}`}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div
                role="tablist"
                aria-label={`Navegar en ${leagueSummary.label}`}
                className="pl-match-tabs pl-league-tabs"
              >
                {LEAGUE_SECTIONS.map((tabDef, index) => {
                  const isSelected = section === tabDef.key;
                  const badgeCount =
                    tabDef.key === "partidos"
                      ? filteredGames.length
                      : tabDef.key === "tabla"
                        ? leagueSummary.standings.length > 0
                          ? leagueSummary.standings.length
                          : undefined
                        : tabDef.key === "noticias"
                          ? newsItems.length
                          : directoryTeams.length;
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
                      className="pl-match-tab"
                      onClick={() => selectSection(tabDef.key)}
                      onKeyDown={(e) => handleSectionKeyDown(e, index)}
                    >
                      <span>{tabDef.key === "equipos" && isNational ? "Selecciones" : tabDef.label}</span>
                      {badgeCount !== undefined ? (
                        <span className="pl-match-tab-count num">{badgeCount}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="hidden sm:flex items-center gap-1.5">
                <span className="pl-soon-pill">Eliminatorias · Pronto</span>
                <span className="pl-soon-pill">Líderes · Pronto</span>
              </div>
            </nav>

        {/* Sección 1: Partidos */}
        <div
          ref={panelPartidosRef}
          role="tabpanel"
          id="pl-league-panel-partidos"
          aria-labelledby="pl-league-tab-partidos"
          className="pl-match-panel"
          {...(section !== "partidos"
            ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
            : {})}
        >
          <div className="pl-match-panel-body">
            {/* Chips de filtro por día */}
            <div
              id="day-chips"
              className="seg-well"
              role="group"
              aria-label="Filtrar partidos por día"
            >
              {dayOptions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="day-chip seg-btn"
                  aria-pressed={dayFilter === d.id}
                  onClick={() => setDayFilter(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {upcoming.length > 0 ? (
              <section className="space-y-3">
                <h2 className="m-0 text-lg font-extrabold">
                  Próximos encuentros ({upcoming.length})
                </h2>
                <MatchList groups={upcomingGroups} hideLeagueHeader />
              </section>
            ) : finished.length > 0 && isNational ? (
              <section
                className="glass-card glass-ring rounded-2xl p-4 text-xs"
                style={{ color: "var(--pl-text-secondary)" }}
              >
                Sin partidos próximos en el calendario actual de {leagueSummary.label}. Mostrando
                resultados oficiales recientes del torneo.
              </section>
            ) : null}

            {finished.length > 0 ? (
              <section className="space-y-3">
                <h2 className="m-0 text-lg font-extrabold">
                  Resultados cerrados FT ({finished.length})
                </h2>
                <MatchList groups={finishedGroups} hideLeagueHeader />
              </section>
            ) : (
              <section className="glass-card glass-ring rounded-2xl p-4 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Aún no hay marcadores cerrados (FT) registrados en este corte de la jornada.
              </section>
            )}
          </div>
        </div>

        {/* Sección 2: Tabla de Posiciones enriquecida con Últimas 5 (G/E/P) */}
        <div
          ref={panelTablaRef}
          role="tabpanel"
          id="pl-league-panel-tabla"
          aria-labelledby="pl-league-tab-tabla"
          className="pl-match-panel"
          {...(section !== "tabla"
            ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
            : {})}
        >
          <div className="pl-match-panel-body">
            {leagueSummary.standings.length > 0 ? (
              <section className="standings-block glass-card glass-ring rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-lg font-extrabold">
                    Tabla de Posiciones · {leagueSummary.label}
                  </h2>
                  <span className="pl-pill num text-xs">
                    {leagueSummary.standings.length} {isNational ? "selecciones" : "clubes"}
                  </span>
                </div>
                <div
                  className="pl-table-region"
                  tabIndex={0}
                  role="region"
                  aria-label={`Tabla de posiciones de ${leagueSummary.label}`}
                >
                  <table className="standings w-full text-left border-collapse text-sm">
                    <thead>
                      <tr
                        className="hairline-b text-xs"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        <th scope="col" className="py-2 pr-3">
                          Pos.
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          {isNational ? "Selección" : "Club"}
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          PJ
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          G
                        </th>
                        {leagueHasDraw ? (
                          <th scope="col" className="py-2 px-2 text-right">
                            E
                          </th>
                        ) : null}
                        <th scope="col" className="py-2 px-2 text-right">
                          P
                        </th>
                        <th scope="col" className="py-2 px-2 text-right">
                          DG
                        </th>
                        <th scope="col" className="py-2 px-2 text-center hidden sm:table-cell">
                          Últimas 5
                        </th>
                        <th scope="col" className="py-2 pl-2 text-right">
                          Pts
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leagueSummary.standings.map((row, idx) => {
                        const slug = row.teamId.includes(".")
                          ? row.teamId.split(".")[1]!
                          : row.teamId;
                        const dg = row.goalsFor - row.goalsAgainst;
                        const form = recentFormBySlug.get(slug) ?? [];
                        return (
                          <tr key={row.teamId} className="hairline-b">
                            <td className="py-2.5 pr-3 num font-bold">{idx + 1}</td>
                            <td className="py-2.5 pr-3">
                              <a
                                href={`/app/${leagueSummary.league}/teams/${slug}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigateTo(`/app/${leagueSummary.league}/teams/${slug}`);
                                }}
                                className="pl-team-link flex items-center gap-2 font-semibold min-h-11 py-1"
                                title={`Ver perfil de ${row.name}`}
                              >
                                <TeamBadge
                                  league={leagueSummary.league}
                                  slug={slug}
                                  name={row.name}
                                  logoUrl={row.logoUrl}
                                  size={20}
                                />
                                <span>{row.name}</span>
                              </a>
                            </td>
                            <td className="py-2.5 px-2 text-right num">{row.played}</td>
                            <td className="py-2.5 px-2 text-right num">{row.won}</td>
                            {leagueHasDraw ? (
                              <td className="py-2.5 px-2 text-right num">{row.drawn}</td>
                            ) : null}
                            <td className="py-2.5 px-2 text-right num">{row.lost}</td>
                            <td className="py-2.5 px-2 text-right num">
                              {dg > 0 ? `+${dg}` : dg}
                            </td>
                            <td className="py-2.5 px-2 hidden sm:table-cell">
                              {form.length > 0 ? (
                                <span
                                  className="pl-form justify-center"
                                  aria-label={`Últimos resultados de ${row.name}: ${form.join("-")}`}
                                >
                                  {form.map((code, fIdx) => (
                                    <span
                                      key={`${code}-${fIdx}`}
                                      className={`pl-form-dot is-${code}`}
                                      aria-hidden="true"
                                    >
                                      {code}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="block text-center text-xs" style={{ color: "var(--pl-text-muted)" }}>
                                  —
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pl-2 text-right num font-extrabold">
                              {row.points}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section className="standings-block glass-card glass-ring rounded-2xl p-5 space-y-2">
                <h2 className="m-0 text-lg font-extrabold">
                  Tabla de Posiciones · {leagueSummary.label}
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  La clasificación actualizada aún no está disponible en el corte vigente de esta
                  competición.
                </p>
              </section>
            )}
          </div>
        </div>

        {/* Sección 3: Noticias verificadas de la liga */}
        <div
          ref={panelNoticiasRef}
          role="tabpanel"
          id="pl-league-panel-noticias"
          aria-labelledby="pl-league-tab-noticias"
          className="pl-match-panel"
          {...(section !== "noticias"
            ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
            : {})}
        >
          <div className="pl-match-panel-body">
            <section
              className="glass-card glass-ring rounded-2xl p-5 space-y-4"
              aria-labelledby="league-news-heading"
              data-league-news=""
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 id="league-news-heading" className="m-0 text-lg font-extrabold">
                    Noticias y novedades · {leagueSummary.label}
                  </h2>
                  <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
                    Titulares actualizados de la liga, parte médico, pulso de mercado y claves del modelo.
                  </p>
                </div>
                <span className="pl-pill pl-pill--brand num text-xs">
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
                      className="pl-astro-status-btn"
                      aria-pressed={newsCategory === cat.key}
                      onClick={() => setNewsCategory(cat.key)}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {filteredNews.length === 0 ? (
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Aún no hay novedades publicadas en este corte de {leagueSummary.label}.
                </p>
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
                            logoUrl={item.team.logoUrl}
                            size={24}
                          />
                        ) : (
                          <LeagueBadge
                            league={leagueSummary.league}
                            label={leagueSummary.label}
                            logoUrl={leagueSummary.logoUrl}
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
                              className="pl-btn-glass text-xs min-h-9 px-3 inline-flex items-center gap-1.5 no-underline"
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
                              className="pl-btn-glass text-xs min-h-9 px-3 inline-flex items-center gap-1.5"
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
        </div>

        {/* Sección 4: Equipos de la liga */}
        <div
          ref={panelEquiposRef}
          role="tabpanel"
          id="pl-league-panel-equipos"
          aria-labelledby="pl-league-tab-equipos"
          className="pl-match-panel"
          {...(section !== "equipos"
            ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
            : {})}
        >
          <div className="pl-match-panel-body">
            {directoryTeams.length > 0 ? (
              <section
                className="glass-card glass-ring rounded-2xl p-5 space-y-3"
                aria-labelledby="league-clubs-directory-heading"
                data-league-teams-directory=""
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="league-clubs-directory-heading" className="m-0 text-base sm:text-lg font-extrabold">
                    {isNational
                      ? `Perfiles de selecciones · ${leagueSummary.label}`
                      : `Perfiles de equipos · ${leagueSummary.label}`}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {directoryTeams.length > 24 ? (
                      <input
                        type="search"
                        value={teamQuery}
                        onChange={(e) => setTeamQuery(e.target.value)}
                        placeholder="Filtrar selección..."
                        aria-label={`Filtrar selecciones en ${leagueSummary.label}`}
                        className="glass-input px-3 py-1.5 text-xs min-h-9"
                      />
                    ) : null}
                    <span className="pl-pill num text-xs">
                      {directoryTeams.length} {isNational ? "selecciones" : "equipos"}
                    </span>
                  </div>
                </div>
                <div className={directoryTeams.length > 24 ? "pl-league-directory-scroll" : undefined}>
                  <div className="pl-league-directory-grid">
                    {directoryTeams
                      .filter((teamItem) => {
                        const q = teamQuery
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .trim()
                          .toLowerCase();
                        if (!q) return true;
                        const norm = (s: string) =>
                          s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                        return norm(teamItem.name).includes(q) || norm(teamItem.shortName).includes(q);
                      })
                      .map((teamItem) => (
                        <a
                          key={teamItem.slug}
                          href={teamItem.href}
                          onClick={(e) => {
                            e.preventDefault();
                            navigateTo(teamItem.href);
                          }}
                          className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center justify-start gap-2 no-underline min-w-0"
                        >
                          <TeamBadge
                            league={leagueSummary.league}
                            slug={teamItem.slug}
                            name={teamItem.name}
                            size={20}
                          />
                          <span className="truncate">{teamItem.shortName}</span>
                        </a>
                      ))}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
          </div>

          {/* Riel izquierdo en escritorio (>= 1024px): Partido Destacado + Próximamente */}
          <aside className="pl-league-side space-y-4 min-w-0" aria-label={`Resumen destacado de ${leagueSummary.label}`}>
            {featuredGame ? (
              <section
                className="glass-card glass-ring rounded-2xl p-4 space-y-3.5"
                data-league-featured-match={featuredGame.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="m-0 text-sm font-extrabold">Destacado</h2>
                  {featuredGame.status !== "FT" ? (
                    <ConfidenceChip game={featuredGame} size="sm" />
                  ) : (
                    <span className="pl-pill text-[11px] num">Final FT</span>
                  )}
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-center">
                  <a
                    href={`/app/${leagueSummary.league}/teams/${featuredGame.home.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(`/app/${leagueSummary.league}/teams/${featuredGame.home.slug}`);
                    }}
                    className="flex flex-col items-center gap-1.5 min-w-0 no-underline"
                    style={{ color: "var(--pl-text)" }}
                  >
                    <TeamBadge
                      league={leagueSummary.league}
                      slug={featuredGame.home.slug}
                      name={featuredGame.home.name}
                      logoUrl={featuredGame.home.logoUrl}
                      size={40}
                    />
                    <strong className="text-xs font-extrabold truncate max-w-full">
                      {featuredGame.home.shortName || featuredGame.home.name}
                    </strong>
                    {featuredGame.home.record ? (
                      <span className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
                        {featuredGame.home.record}
                      </span>
                    ) : null}
                  </a>

                  <div className="num px-1">
                    {featuredGame.status === "FT" && featuredGame.score ? (
                      <strong className="block text-xl font-extrabold">
                        {featuredGame.score.home} – {featuredGame.score.away}
                      </strong>
                    ) : (
                      <strong className="block text-base font-extrabold">
                        {featuredGame.kickoffLocal}
                      </strong>
                    )}
                    <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                      {shortDateLabel(featuredGame.dayId)}
                    </span>
                  </div>

                  <a
                    href={`/app/${leagueSummary.league}/teams/${featuredGame.away.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(`/app/${leagueSummary.league}/teams/${featuredGame.away.slug}`);
                    }}
                    className="flex flex-col items-center gap-1.5 min-w-0 no-underline"
                    style={{ color: "var(--pl-text)" }}
                  >
                    <TeamBadge
                      league={leagueSummary.league}
                      slug={featuredGame.away.slug}
                      name={featuredGame.away.name}
                      logoUrl={featuredGame.away.logoUrl}
                      size={40}
                    />
                    <strong className="text-xs font-extrabold truncate max-w-full">
                      {featuredGame.away.shortName || featuredGame.away.name}
                    </strong>
                    {featuredGame.away.record ? (
                      <span className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
                        {featuredGame.away.record}
                      </span>
                    ) : null}
                  </a>
                </div>

                {featuredGame.x12 &&
                featuredGame.hasForecast !== false &&
                (featuredGame.status === "FT" || isPreGameIntelUnlocked(featuredGame, viewerRole)) ? (
                  <div className="pl-reg-odds-card">
                    <div className="pl-reg-odds-head">
                      <span className="text-[11px] font-bold">
                        {leagueHasDraw ? "Tiempo reglamentario" : "Ganador"}
                      </span>
                      <span className="text-[11px] font-semibold" style={{ color: "var(--pl-brand)" }}>
                        Momio justo
                      </span>
                    </div>
                    <div
                      className="pl-reg-odds-grid num"
                      style={{
                        gridTemplateColumns: leagueHasDraw
                          ? "repeat(3, minmax(0, 1fr))"
                          : "repeat(2, minmax(0, 1fr))",
                      }}
                    >
                      <div
                        className={`pl-reg-odds-cell ${featuredGame.x12[0] >= Math.max(featuredGame.x12[1], featuredGame.x12[2]) ? "is-lead" : ""}`.trim()}
                      >
                        <span className="pl-reg-odds-code">1</span>
                        <strong className="pl-reg-odds-val">
                          {formatOddsValue(1 / Math.max(featuredGame.x12[0], 0.01), oddsFormat)}
                        </strong>
                      </div>
                      {leagueHasDraw ? (
                        <div
                          className={`pl-reg-odds-cell ${featuredGame.x12[1] >= Math.max(featuredGame.x12[0], featuredGame.x12[2]) ? "is-lead" : ""}`.trim()}
                        >
                          <span className="pl-reg-odds-code">X</span>
                          <strong className="pl-reg-odds-val">
                            {formatOddsValue(1 / Math.max(featuredGame.x12[1], 0.01), oddsFormat)}
                          </strong>
                        </div>
                      ) : null}
                      <div
                        className={`pl-reg-odds-cell ${featuredGame.x12[2] >= Math.max(featuredGame.x12[0], featuredGame.x12[1]) ? "is-lead" : ""}`.trim()}
                      >
                        <span className="pl-reg-odds-code">2</span>
                        <strong className="pl-reg-odds-val">
                          {formatOddsValue(1 / Math.max(featuredGame.x12[2], 0.01), oddsFormat)}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : featuredGame.status !== "FT" ? (
                  <div className="rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs" style={{ background: "var(--pl-surface-elevated)" }}>
                    <span style={{ color: "var(--pl-text-muted)" }}>Pronóstico Pase Ultra</span>
                    <a
                      href={upgradeHref}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(upgradeHref);
                      }}
                      className="font-bold no-underline"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      Activar →
                    </a>
                  </div>
                ) : null}

                <a
                  href={`/app/${leagueSummary.league}/games/${featuredGame.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(`/app/${leagueSummary.league}/games/${featuredGame.id}`);
                  }}
                  className="pl-btn-glass w-full min-h-11 text-xs font-bold inline-flex items-center justify-center gap-1.5 no-underline"
                >
                  <span>Ver partido completo</span>
                  <MaestroIcon name="arrowRight" size={13} />
                </a>
              </section>
            ) : null}

            <section className="glass-card glass-ring rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                  Módulos en camino
                </strong>
                <span className="pl-soon-pill">Pronto</span>
              </div>
              <ul className="m-0 p-0 list-none space-y-2 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                <li className="flex items-center justify-between gap-2">
                  <span>Cuadro interactivo de eliminatorias</span>
                  <span className="pl-soon-pill">Pronto</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Equipo ideal y líderes de la jornada</span>
                  <span className="pl-soon-pill">Pronto</span>
                </li>
              </ul>
            </section>
          </aside>
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
                  className="pl-btn-glass px-2.5 min-h-9 shrink-0 inline-flex items-center justify-center"
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
                    logoUrl={selectedNewsItem.team.logoUrl}
                    size={32}
                  />
                ) : (
                  <LeagueBadge
                    league={leagueSummary.league}
                    label={leagueSummary.label}
                    logoUrl={leagueSummary.logoUrl}
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
                    className="pl-btn-primary text-xs min-h-10 px-4 inline-flex items-center gap-1.5 no-underline"
                  >
                    <span>{selectedNewsItem.ctaLabel ?? "Ver detalle en PitchLab"}</span>
                    <MaestroIcon name="arrowRight" size={12} />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={closeNewsModal}
                  className="pl-btn-glass text-xs min-h-10 px-4"
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
  /** Pestaña inicial resuelta en servidor desde `?tab=` para compartir enlaces. */
  initialTab?: MatchTabKey;
}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    viewerIdentity,
    hasAccountSessionAuth,
    oddsFormat,
    setSelectedTipsterPickId,
    socialPosts,
    publishSocialPost,
    addSocialComment,
    deleteSocialComment,
    toggleSocialCommentHelpful,
    loadAllPostComments,
    deleteSocialPost,
    toggleSocialLike,
    loadMatchSocialPosts,
    sealPickToJournal,
    recordSocialPostCopy,
    addPickToParlay,
    parlaySummary,
    upgradeHref,
    journal,
    openComposer,
    navigateTo,
    pushToast,
  } = usePlatform();

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

  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const hasForecast =
    game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const overtimeFactor = game.factors.find((f) => /tiempo extra/i.test(f.label));
  const flow = game.preGame.moneyFlow;
  const isFinished = game.status === "FT" && game.score !== undefined;
  const intelUnlocked = isPreGameIntelUnlocked(game, viewerRole);

  const studioPath = `/app/${game.league}/games/${game.id}`;
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
      engineName: "PitchLab Geodesic v2.0",
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

  return (
    <AtmosphereStage activePath={studioPath}>
      <ClubWorkspaceShell activePath={studioPath}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Ruta del partido"
            className="flex flex-wrap items-center gap-1.5 text-xs min-w-0"
            style={{ color: "var(--pl-text-muted)" }}
          >
            <a
              href={`/app/${game.league}`}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(`/app/${game.league}`);
              }}
              className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-1.5 no-underline"
            >
              <MaestroIcon name="arrowLeft" size={13} />
              <span>Volver a {game.leagueLabel}</span>
            </a>
            <span className="hidden sm:inline" aria-hidden="true">›</span>
            <span className="hidden sm:inline truncate" style={{ color: "var(--pl-text-secondary)" }}>
              {game.home.shortName} – {game.away.shortName}
            </span>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <span className="pl-soon-pill hidden sm:inline-flex">Comparar · Pronto</span>
            {isFinished ? null : <FollowControl gameId={game.id} />}
          </div>
        </div>

        {/* Cabecera Hero Horizontal de Radiografía del Partido */}
        <section
          className="glass-lens glass-ring glass-ring--featured rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3 sm:space-y-4 relative overflow-hidden"
          data-match-studio={game.id}
        >
          {/* Marcador horizontal centrado de 3 columnas */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:gap-5 items-center relative z-10">
            <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0 text-right">
              <div className="min-w-0">
                <h1 className="m-0 text-sm sm:text-xl font-extrabold truncate leading-tight">
                  <a
                    href={`/app/${game.league}/teams/${game.home.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(`/app/${game.league}/teams/${game.home.slug}`);
                    }}
                    className="pl-team-link"
                    title={`Ver perfil de ${game.home.name}`}
                  >
                    {game.home.name}
                  </a>
                </h1>
                {game.home.record ? (
                  <span className="block text-[11px] truncate" style={{ color: "var(--pl-text-muted)" }}>
                    {game.home.record}
                  </span>
                ) : null}
              </div>
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                logoUrl={game.home.logoUrl}
                size={40}
              />
            </div>

            <div className="text-center px-1.5 min-w-0">
              {isFinished ? (
                <strong className="num text-xl sm:text-3xl font-extrabold block leading-tight">
                  {game.score?.home} – {game.score?.away}
                </strong>
              ) : !hasForecast || !game.projection ? (
                <strong
                  className="text-xs sm:text-base font-extrabold block"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  Sin pronóstico
                </strong>
              ) : intelUnlocked ? (
                <strong
                  className="num text-base sm:text-2xl font-extrabold block leading-tight"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Proy. {game.projection.home.toFixed(unit.decimals)}–{game.projection.away.toFixed(unit.decimals)}
                </strong>
              ) : (
                <span className="pl-pill inline-flex items-center gap-1 text-[11px]">
                  <MaestroIcon name="lock" size={11} />
                  <span>Ultra</span>
                </span>
              )}
              <span
                className="text-[11px] num block leading-tight mt-0.5"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {!hasForecast || !game.projection
                  ? "Sin pronóstico publicado"
                  : intelUnlocked || isFinished
                    ? `${unit.plural === "puntos" ? "Puntos" : "Goles"} esperados: ${game.projection.total.toFixed(unit.decimals)}`
                    : "Pase PitchLab Ultra"}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 min-w-0 text-left">
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                logoUrl={game.away.logoUrl}
                size={40}
              />
              <div className="min-w-0">
                <h2 className="m-0 text-sm sm:text-xl font-extrabold truncate leading-tight">
                  <a
                    href={`/app/${game.league}/teams/${game.away.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(`/app/${game.league}/teams/${game.away.slug}`);
                    }}
                    className="pl-team-link"
                    title={`Ver perfil de ${game.away.name}`}
                  >
                    {game.away.name}
                  </a>
                </h2>
                {game.away.record ? (
                  <span className="block text-[11px] truncate" style={{ color: "var(--pl-text-muted)" }}>
                    {game.away.record}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {hasForecast && game.x12 ? (
            <div className="relative z-10">
              <ProbSplit
                probabilities={hasDraw ? game.x12 : [game.x12[0], game.x12[2]]}
                labels={
                  hasDraw
                    ? [game.home.shortName, "Empate", game.away.shortName]
                    : [game.home.shortName, game.away.shortName]
                }
                showLabels
              />
            </div>
          ) : (
            <div
              className="relative z-10 rounded-xl px-3 py-2 text-xs"
              style={{
                background: "var(--pl-surface-elevated)",
                color: "var(--pl-text-muted)",
              }}
              data-empty-forecast=""
            >
              Este snapshot aún no incluye pronóstico ni confianza publicados para este partido.
            </div>
          )}

          {/* Barra inferior centrada de metadatos: fecha, liga, sede, confianza y tiempo extra */}
          <div
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pt-2 hairline-t text-[11px] sm:text-xs relative z-10"
            style={{ color: "var(--pl-text-muted)" }}
          >
            <span className="inline-flex items-center gap-1.5 num">
              <MaestroIcon name="calendar" size={12} />
              <span>
                {isFinished
                  ? `Finalizado FT · ${game.dayLabel}`
                  : `${game.dayLabel} · ${game.kickoffLocal}`}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 min-w-0">
              <LeagueBadge
                league={game.league}
                label={game.leagueLabel}
                logoUrl={game.leagueLogoUrl}
                size={15}
              />
              <span id="modal-league" className="font-semibold truncate" style={{ color: "var(--pl-text-secondary)" }}>
                {[game.leagueLabel, game.round].filter(Boolean).join(" · ")}
              </span>
            </span>

            {game.venue ? (
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <MaestroIcon name="pin" size={12} />
                <span className="truncate">{game.venue}</span>
              </span>
            ) : null}

            {isFinished ? null : <ConfidenceChip game={game} size="sm" />}

            {overtimeFactor && hasForecast ? (
              <span
                className="pl-pill pl-pill--wrap text-[11px] inline-flex items-center justify-center gap-1 max-w-full"
                data-overtime-pill=""
                title={overtimeFactor.sub ?? undefined}
              >
                <span>
                  {overtimeFactor.label}: {overtimeFactor.value}
                  {overtimeFactor.sub ? ` · ${overtimeFactor.sub}` : ""}
                </span>
              </span>
            ) : null}
          </div>
        </section>

        {/* Cuerpo de 2 columnas en escritorio (>= 1024px): main primero en DOM para orden accesible y prioridad móvil */}
        <div className="pl-studio-2col">
          <div className="pl-studio-main space-y-4 min-w-0">

        {/* Navegación accesible en 5 pestañas sincronizada con ?tab= */}
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

        {/* Pestaña 1: Resumen (Picks, pulso de mercado, puente a Análisis IA, Pre-Match, panorama y factores) */}
        <MatchTabPanel idPrefix="pl-match" tabKey="resumen" active={activeTab}>
          <div className="pl-resumen-top">
            {/* Izquierda: Pronóstico / Picks del partido */}
            <section className="pl-resumen-picks-col space-y-3.5 min-w-0" data-picks="">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-lg font-extrabold">Pronóstico del partido</h2>
                {viewerRole === "tipster" || viewerRole === "admin" ? (
                  <span
                    className="text-xs font-semibold inline-flex items-center gap-1"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    <MaestroIcon name="crown" size={13} />
                    <span>Elige cualquiera como tu Pick abierto semanal</span>
                  </span>
                ) : null}
              </div>

              {game.picks.length === 0 ? (
                <div
                  className="glass-card glass-ring rounded-2xl p-4 text-sm"
                  style={{ color: "var(--pl-text-muted)" }}
                  data-empty-forecast=""
                >
                  Aún no hay picks publicados para este partido porque el snapshot no incluye pronóstico ni probabilidades.
                </div>
              ) : (
                <div
                  className="pl-resumen-picks-grid"
                  data-odd-picks={game.picks.length > 1 && game.picks.length % 2 === 1 ? "true" : undefined}
                >
                  {game.picks.map((pk) => (
                    <div key={pk.id} className="pl-resumen-pick-cell space-y-1.5 min-w-0">
                      <MultiPickRow pick={pk} gameStatus={game.status} />
                      {(viewerRole === "tipster" || viewerRole === "admin") &&
                      game.status !== "FT" ? (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="pl-btn-glass text-xs min-h-9 px-3 inline-flex items-center gap-1"
                            onClick={() => {
                              setSelectedTipsterPickId(pk.id);
                              pushToast(
                                `«${pk.label}» asignado como tu Pick abierto semanal en Portal Tipster.`,
                                "success",
                              );
                            }}
                          >
                            <MaestroIcon name="crown" size={12} />
                            <span>Usar como mi Pick abierto semanal</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Derecha: Lectura rápida de Cortex IA + Acceso directo a ¿Dónde está el dinero? y Números */}
            <aside className="pl-resumen-side-col" aria-label="Lectura rápida de IA y pulso de mercado">
              <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-extrabold">
                    <MaestroIcon name="sparkles" size={14} style={{ color: "var(--pl-brand)" }} />
                    <span>Cortex IA</span>
                  </span>
                  <span className="pl-pill pl-pill--brand text-[11px]">{mainEngineName}</span>
                </div>
                <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                  {!intelUnlocked
                    ? "Consulta el pronóstico estructurado de Cortex IA, proyección exacta y claves tácticas con Pase PitchLab Ultra."
                    : cortexHeadline?.trim() ||
                      cortexSections?.find((sec) => sec.key === "lectura")?.text ||
                      cortexSynthesisOverride ||
                      game.preGame.cortexSynthesis}
                </p>
                <button
                  type="button"
                  className="pl-btn-glass text-xs min-h-10 px-3 w-full justify-between"
                  onClick={() => setActiveTab("ia")}
                >
                  <span>Abrir Análisis IA completo</span>
                  <MaestroIcon name="arrowRight" size={13} />
                </button>
              </div>

              <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-extrabold">
                    <MaestroIcon name="activity" size={14} style={{ color: "var(--pl-brand)" }} />
                    <span>Mercado y líneas</span>
                  </span>
                  <span className="pl-pill text-[11px] num">
                    {flow ? `${flow.homeShare} % / ${flow.awayShare} %` : "Modelo"}
                  </span>
                </div>
                <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
                  {flow
                    ? flow.sharpNote
                    : "Contrasta los momios justos del modelo con las cuotas capturadas y explora el flujo del mercado."}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-10 px-3 justify-between"
                    onClick={() => setActiveTab("dinero")}
                  >
                    <span>¿Dónde está el dinero?</span>
                    <MaestroIcon name="arrowRight" size={12} />
                  </button>
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-10 px-3 justify-between"
                    onClick={() => setActiveTab("numeros")}
                  >
                    <span>Ver números</span>
                    <MaestroIcon name="arrowRight" size={12} />
                  </button>
                </div>
              </div>
            </aside>
          </div>

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
                  Señales cuantitativas que explican la probabilidad y confianza del modelo.
                </p>
              </div>
              {intelUnlocked && game.confidenceDetail?.reasons.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {game.confidenceDetail.reasons.map((reason) => (
                    <span key={reason} className="pl-pill text-[11px]">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}
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
          <CortexAnalysisCard
            game={game}
            synthesis={
              cortexSections?.find((sec) => sec.key === "lectura")?.text ??
              cortexSynthesisOverride ??
              game.preGame.cortexSynthesis
            }
            unlocked={intelUnlocked}
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
                game.preGame.tacticalKeys.length > 0 ||
                (game.confidenceDetail?.reasons.length ?? 0) > 0) ? (
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

                  {(game.confidenceDetail?.reasons.length ?? 0) > 0 ? (
                    <div className="space-y-1.5 pt-2 hairline-t">
                      <h3 className="pl-cortex-label">Qué tan firme es</h3>
                      <ul className="pl-cortex-list text-xs">
                        {game.confidenceDetail!.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null
            }
          />
        </MatchTabPanel>

        {/* Pestaña 3: Números esperados, mercados y simulador */}
        <MatchTabPanel idPrefix="pl-match" tabKey="numeros" active={activeTab}>
          <MatchNumbersPanel
            game={game}
            markets={activeMarkets}
            oddsFormat={oddsFormat}
            watermark={getSessionWatermark(viewerRole, viewerIdentity)}
            unlocked={intelUnlocked}
            isFinished={isFinished}
            canSeal={viewerRole !== "visitor"}
            outlook={detail?.outlook ?? null}
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
        </MatchTabPanel>

        {/* Pestaña 4: ¿Dónde está el dinero? (flujo de mercado vs. modelo + comparativa de cuotas) */}
        <MatchTabPanel idPrefix="pl-match" tabKey="dinero" active={activeTab}>
          <MatchMoneyPanel
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
        </MatchTabPanel>

        {/* Pestaña 5: Contexto (equipos, sede/H2H, bajas + opiniones lado a lado y tabla) */}
        <MatchTabPanel idPrefix="pl-match" tabKey="contexto" active={activeTab}>
          <MatchContextPanel
            game={game}
            standings={
              dataset.leagues.find((l) => l.league === game.league)?.standings ?? []
            }
            unlocked={intelUnlocked}
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
        </MatchTabPanel>
          </div>

          {/* Riel lateral izquierdo en escritorio (>= 1024px): Tiempo reglamentario 1·X·2 + Match Center En Vivo + Pizarra 2D Pronto */}
          <aside className="pl-studio-side space-y-4 min-w-0" aria-label="Momios rápidos y pulso en directo">
            {hasForecast && game.x12 ? (
              <section className="glass-card glass-ring rounded-2xl p-4 space-y-3" data-studio-reg-odds="">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold">
                    {hasDraw ? "Tiempo reglamentario" : "Ganador del partido"}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: "var(--pl-brand)" }}>
                    Momio justo PitchLab
                  </span>
                </div>

                {intelUnlocked || isFinished ? (
                  <div
                    className="pl-reg-odds-grid num"
                    style={{
                      gridTemplateColumns: hasDraw
                        ? "repeat(3, minmax(0, 1fr))"
                        : "repeat(2, minmax(0, 1fr))",
                    }}
                  >
                    <div
                      className={`pl-reg-odds-cell ${game.x12[0] >= Math.max(game.x12[1], game.x12[2]) ? "is-lead" : ""}`.trim()}
                    >
                      <span className="pl-reg-odds-code">1</span>
                      <strong className="pl-reg-odds-val">
                        {formatOddsValue(1 / Math.max(game.x12[0], 0.01), oddsFormat)}
                      </strong>
                    </div>
                    {hasDraw ? (
                      <div
                        className={`pl-reg-odds-cell ${game.x12[1] >= Math.max(game.x12[0], game.x12[2]) ? "is-lead" : ""}`.trim()}
                      >
                        <span className="pl-reg-odds-code">X</span>
                        <strong className="pl-reg-odds-val">
                          {formatOddsValue(1 / Math.max(game.x12[1], 0.01), oddsFormat)}
                        </strong>
                      </div>
                    ) : null}
                    <div
                      className={`pl-reg-odds-cell ${game.x12[2] >= Math.max(game.x12[0], game.x12[1]) ? "is-lead" : ""}`.trim()}
                    >
                      <span className="pl-reg-odds-code">2</span>
                      <strong className="pl-reg-odds-val">
                        {formatOddsValue(1 / Math.max(game.x12[2], 0.01), oddsFormat)}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Activa tu Pase Ultra para ver los momios justos sin vig y comparar 9 casas.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTab("dinero")}
                  className="pl-btn-glass w-full min-h-10 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <span>Cuotas adicionales y 9 casas</span>
                  <MaestroIcon name="chevronDown" size={12} />
                </button>
              </section>
            ) : null}

            <LiveMatchPanel game={game} />

            <section className="glass-card glass-ring rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs font-extrabold">Pizarra táctica 2D y Mapa de calor</strong>
                <span className="pl-soon-pill">Pronto</span>
              </div>
              <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
                Posicionamiento medio, red de pases y mapa de disparos verificados llegarán próximamente a esta ficha.
              </p>
            </section>
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
