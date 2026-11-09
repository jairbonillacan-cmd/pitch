"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MatchAnalysis } from "@pitchlab/contracts";
import { getMascotPath } from "@pitchlab/sports-assets";
import {
  BrandLogo,
  ThemeToggle,
  LeagueBadge,
  Freshness,
  MatchCard,
  AnalysisDialog,
  EmptyState,
  ErrorState,
  StandingsTable,
  BestPicks,
  ResultsSection,
  Badge,
  Button,
  Icon,
  ToggleGroup,
  ToggleGroupItem,
} from "@pitchlab/ui";
import type { SnapshotEnvelope } from "../server/snapshots.js";
import type { ProductLeague } from "../server/snapshots.js";

const leagueTabClass =
  "lchip league-tab bg-card pl-2 text-muted-foreground hover:border-input hover:bg-card hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:bg-surface-active aria-[current=page]:text-foreground disabled:opacity-[0.55]";
const upcomingLeagueBadgeClass = "l-soon h-5 text-[11px]";

const PANEL_LEAGUE_LABELS: Record<string, string> = {
  "liga-mx": "Liga MX",
  "premier-league": "Premier League",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  nfl: "NFL",
};

type SportFilter = "all" | "football" | "american-football" | "soon";
type PanelSectionId = "sec-picks" | "sec-results" | "games" | "sec-standings";

const QUICK_LEAGUE_ITEMS: ReadonlyArray<{
  id: ProductLeague;
  label: string;
  sport: "football" | "american-football";
}> = [
  { id: "premier-league", label: "Premier League", sport: "football" },
  { id: "liga-mx", label: "Liga MX", sport: "football" },
  { id: "nfl", label: "NFL", sport: "american-football" },
  { id: "laliga", label: "LaLiga", sport: "football" },
  { id: "bundesliga", label: "Bundesliga", sport: "football" },
  { id: "serie-a", label: "Serie A", sport: "football" },
  { id: "ligue-1", label: "Ligue 1", sport: "football" },
];

export function PanelClient({
  league,
  envelope,
  leagueAvailability,
  initialGameId,
}: {
  league: ProductLeague;
  envelope: SnapshotEnvelope;
  leagueAvailability: Record<ProductLeague, boolean>;
  initialGameId?: string;
}): React.JSX.Element {
  const router = useRouter();
  const snapshot = envelope.data;
  const games = snapshot?.games ?? [];
  const seenGamesRef = useRef<Set<string>>(new Set());

  const [activeDay, setActiveDay] = useState<string>("all");
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [showSoonMobile, setShowSoonMobile] = useState<boolean>(false);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [quickLeagueOpen, setQuickLeagueOpen] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<PanelSectionId>("sec-picks");
  const [skipTrace, setSkipTrace] = useState<boolean>(Boolean(initialGameId));
  const [selectedMatch, setSelectedMatch] = useState<MatchAnalysis | null>(
    () => {
      if (!initialGameId) return null;
      return games.find((g) => g.id === initialGameId) ?? null;
    },
  );

  const upcomingWithPicks = useMemo(
    () => games.filter((g) => g.status !== "FT" && g.picks && g.picks.length > 0),
    [games],
  );
  const finishedLeagueGames = useMemo(
    () => games.filter((g) => g.status === "FT" && g.score !== undefined),
    [games],
  );
  const hasPicks = envelope.state !== "error" && upcomingWithPicks.length > 0;
  const hasResults =
    envelope.state !== "error" && finishedLeagueGames.length > 0;
  const resultsCount = finishedLeagueGames.length;
  const hasStandings = Boolean(snapshot?.standings && snapshot.standings.length > 0);
  const activeLeagueCount = useMemo(
    () => Object.values(leagueAvailability).filter(Boolean).length,
    [leagueAvailability],
  );

  useEffect(() => {
    setActiveDay("all");
    setQuickLeagueOpen(false);
  }, [league]);

  useEffect(() => {
    if (!hasPicks && activeSection === "sec-picks") {
      setActiveSection(hasResults ? "sec-results" : "games");
    }
  }, [hasPicks, hasResults, activeSection]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const isScrolled = y > 130;
      setScrolled(isScrolled);
      if (!isScrolled) {
        setQuickLeagueOpen(false);
      }

      const candidates: PanelSectionId[] = [
        ...(hasPicks ? (["sec-picks"] as const) : []),
        ...(hasResults ? (["sec-results"] as const) : []),
        "games",
        ...(hasStandings ? (["sec-standings"] as const) : []),
      ];
      let current: PanelSectionId = candidates[0] ?? "games";
      for (const id of candidates) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180) {
            current = id;
          }
        }
      }
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasPicks, hasResults, hasStandings]);

  useEffect(() => {
    if (!quickLeagueOpen) return;
    const onDocClick = () => setQuickLeagueOpen(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuickLeagueOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [quickLeagueOpen]);

  const scrollToSection = useCallback((sectionId: PanelSectionId) => {
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (initialGameId) {
      const found = games.find((g) => g.id === initialGameId) ?? null;
      setSkipTrace(true);
      setSelectedMatch(found);
    }
  }, [initialGameId, games]);

  const handleSelectMatch = useCallback(
    (match: MatchAnalysis) => {
      const key = `${match.league}:${match.id}`;
      const alreadySeen = seenGamesRef.current.has(key);
      seenGamesRef.current.add(key);
      setSkipTrace(alreadySeen);
      setSelectedMatch(match);
      if (typeof window !== "undefined" && match.league === league) {
        window.history.pushState(
          null,
          "",
          `/app/${league}/games/${encodeURIComponent(match.id)}`,
        );
      }
    },
    [league],
  );

  const handleCloseModal = useCallback(() => {
    setSelectedMatch(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/app/${league}`);
    }
  }, [league]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/beta/logout", { method: "POST" });
    } catch (err) {
      void err;
    }
    router.push("/");
  }, [router]);

  const filteredGames = useMemo(
    () =>
      activeDay === "all"
        ? games
        : games.filter((g) => g.day === activeDay),
    [games, activeDay],
  );

  const dayGroups = useMemo(() => {
    const groups = new Map<string, MatchAnalysis[]>();
    for (const g of filteredGames) {
      const list = groups.get(g.day) ?? [];
      list.push(g);
      groups.set(g.day, list);
    }
    return Array.from(groups.entries());
  }, [filteredGames]);

  const days = snapshot?.days ?? [
    {
      id: "all",
      label: league === "nfl" ? "Toda la semana" : "Toda la jornada",
    },
  ];

  const leagueMascot = league;
  const activeLeagueLabel =
    snapshot?.leagueLabel ?? PANEL_LEAGUE_LABELS[league] ?? "Liga";
  const showFootball = sportFilter === "all" || sportFilter === "football";
  const showAmericanFootball =
    sportFilter === "all" || sportFilter === "american-football";
  const showSoonSport = sportFilter === "all" || sportFilter === "soon";
  const expandUpcomingMobile = showSoonMobile || sportFilter === "soon";

  return (
    <>
      <a className="skip" href="#games">
        Saltar a los partidos
      </a>

      <header
        className={`app-header panel-header ${scrolled ? "is-scrolled" : ""}`.trim()}
      >
        <div className="wrap">
          <a
            className="logo"
            href="/app"
            aria-label="PitchLab · Inicio del panel"
            onClick={(event) => {
              event.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
              router.push("/app");
            }}
          >
            <span className="logo-full">
              <BrandLogo variant="horizontal" width={148} height={29} />
            </span>
            <span className="logo-compact">
              <BrandLogo variant="compact" width={124} height={29} />
            </span>
            <span className="logo-iso">
              <BrandLogo variant="isotype" width={28} height={28} />
            </span>
          </a>

          <div
            className="header-context-wrap"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="cut-divider" aria-hidden="true" />
            <button
              className="header-league-pill"
              type="button"
              aria-expanded={quickLeagueOpen}
              aria-haspopup="true"
              onClick={() => setQuickLeagueOpen((prev) => !prev)}
            >
              <LeagueBadge league={league} size={20} />
              <span className="pill-title">{activeLeagueLabel}</span>
              {snapshot?.roundLabel ? (
                <span className="round-tag">· {snapshot.roundLabel}</span>
              ) : null}
              <svg
                className="chev"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div
              className={`quick-league-popover ${quickLeagueOpen ? "open" : ""}`.trim()}
              role="region"
              aria-label="Cambio rápido de competición"
            >
              <div className="quick-league-head">
                <span className="eyebrow">Cambiar de competición</span>
                <span className="muted caption">{activeLeagueCount} activas</span>
              </div>
              {QUICK_LEAGUE_ITEMS.map((item) => {
                const available = Boolean(leagueAvailability[item.id]);
                const isCurrent = league === item.id;
                return (
                  <button
                    key={item.id}
                    className={`quick-league-item ${isCurrent ? "active" : ""}`.trim()}
                    type="button"
                    disabled={!available}
                    onClick={() => {
                      setQuickLeagueOpen(false);
                      router.push(`/app/${item.id}`);
                    }}
                  >
                    <LeagueBadge league={item.id} label={item.label} size={22} />
                    <span>{item.label}</span>
                    <span className="cnt">
                      {isCurrent && games.length > 0
                        ? `${games.length} partidos`
                        : available
                          ? "Disponible"
                          : "Pronto"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <nav className="header-sections" aria-label="Secciones de la jornada">
            {hasPicks ? (
              <button
                className={`hsec-link ${activeSection === "sec-picks" ? "active" : ""}`.trim()}
                type="button"
                onClick={() => scrollToSection("sec-picks")}
              >
                <Icon name="trend" className="icon-16" />
                Mejores picks
              </button>
            ) : null}
            {hasResults ? (
              <button
                className={`hsec-link ${activeSection === "sec-results" ? "active" : ""}`.trim()}
                type="button"
                onClick={() => scrollToSection("sec-results")}
              >
                <Icon name="check" className="icon-16" />
                Resultados
                <span className="hsec-count">{resultsCount}</span>
              </button>
            ) : null}
            <button
              className={`hsec-link ${activeSection === "games" ? "active" : ""}`.trim()}
              type="button"
              onClick={() => scrollToSection("games")}
            >
              <Icon name="games" className="icon-16" />
              Partidos
              <span className="hsec-count">{games.length}</span>
            </button>
            {hasStandings ? (
              <button
                className={`hsec-link ${activeSection === "sec-standings" ? "active" : ""}`.trim()}
                type="button"
                onClick={() => scrollToSection("sec-standings")}
              >
                <Icon name="competition" className="icon-16" />
                Clasificación
                <span className="hsec-count">{snapshot?.standings?.length ?? 0}</span>
              </button>
            ) : null}
          </nav>

          <div className="right">
            <span className="session-pill">
              <span className="dot pulse-dot" aria-hidden="true" />
              Beta cerrada
            </span>
            <ThemeToggle shape="pill" />
            <Button
              variant="ghost"
              shape="pill"
              className="btn-logout"
              data-logout=""
              onClick={handleLogout}
            >
              Salir
            </Button>
          </div>
        </div>
      </header>

      <nav className="lswitch" aria-label="Ligas">
        <div className="wrap lswitch-inner" id="lswitch">
          <div className="sport-bar">
            <div className="sport-pills" role="group" aria-label="Filtrar por deporte">
              <button
                className="sport-pill"
                type="button"
                aria-pressed={sportFilter === "all"}
                onClick={() => setSportFilter("all")}
              >
                <span className="lbl-desktop">Todos los deportes</span>
                <span className="lbl-mobile">Todos</span>
              </button>
              <button
                className="sport-pill"
                type="button"
                aria-pressed={sportFilter === "football"}
                onClick={() => setSportFilter("football")}
              >
                <Icon name="soccer" className="icon-16" />
                <span className="lbl-desktop">Fútbol (6)</span>
                <span className="lbl-mobile">Fútbol</span>
              </button>
              <button
                className="sport-pill"
                type="button"
                aria-pressed={sportFilter === "american-football"}
                onClick={() => setSportFilter("american-football")}
              >
                <Icon name="football" className="icon-16" />
                <span className="lbl-desktop">Fútbol Americano (1)</span>
                <span className="lbl-mobile">NFL</span>
              </button>
              <button
                className="sport-pill"
                type="button"
                aria-pressed={sportFilter === "soon"}
                onClick={() => setSportFilter("soon")}
              >
                <span className="lbl-desktop">Próximamente (2)</span>
                <span className="lbl-mobile">Pronto</span>
              </button>
            </div>

            <div className="sport-meta">
              <span className="dot" aria-hidden="true" />
              <span>{activeLeagueCount} ligas activas hoy · más en preparación</span>
            </div>
          </div>

          <div
            className={`leagues-strip ${expandUpcomingMobile ? "show-soon-mobile" : ""}`.trim()}
          >
            {showFootball ? (
              <>
                <Button
                  variant="outline"
                  shape="pill"
                  className={leagueTabClass}
                  type="button"
                  data-league="premier-league"
                  aria-current={league === "premier-league" ? "page" : undefined}
                  onClick={() => router.push("/app/premier-league")}
                >
                  <LeagueBadge league="premier-league" size={24} />
                  <span className="l-name">Premier</span>
                  {league === "premier-league" && games.length > 0 ? (
                    <span className="l-count">{games.length}</span>
                  ) : null}
                </Button>

                <Button
                  variant="outline"
                  shape="pill"
                  className={leagueTabClass}
                  type="button"
                  data-league="liga-mx"
                  disabled={!leagueAvailability["liga-mx"]}
                  aria-current={league === "liga-mx" ? "page" : undefined}
                  onClick={() => router.push("/app/liga-mx")}
                >
                  <LeagueBadge league="liga-mx" size={24} />
                  <span className="l-name">Liga MX</span>
                  {!leagueAvailability["liga-mx"] ? (
                    <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
                  ) : league === "liga-mx" && games.length > 0 ? (
                    <span className="l-count">{games.length}</span>
                  ) : null}
                </Button>
              </>
            ) : null}

            {showAmericanFootball ? (
              <>
                {sportFilter === "all" ? (
                  <span className="sport-group-sep" aria-hidden="true">
                    NFL
                  </span>
                ) : null}
                <Button
                  variant="outline"
                  shape="pill"
                  className={`${leagueTabClass} span-full-mobile`}
                  type="button"
                  data-league="nfl"
                  aria-current={league === "nfl" ? "page" : undefined}
                  onClick={() => router.push("/app/nfl")}
                >
                  <LeagueBadge league="nfl" size={24} />
                  <span className="l-name">NFL</span>
                  {league === "nfl" && games.length > 0 ? (
                    <span className="l-count">{games.length}</span>
                  ) : null}
                </Button>
              </>
            ) : null}

            {sportFilter !== "american-football" ? (
              <button
                className="mobile-soon-toggle"
                type="button"
                aria-expanded={expandUpcomingMobile}
                onClick={() => setShowSoonMobile((prev) => !prev)}
              >
                <span>
                  {expandUpcomingMobile
                    ? "Ocultar ligas en preparación"
                    : "Ver 6 ligas en preparación (LaLiga, Serie A, NHL…)"}
                </span>
                <span aria-hidden="true">{expandUpcomingMobile ? "▴" : "▾"}</span>
              </button>
            ) : null}

            {showFootball ? (
              <>
                {sportFilter === "all" ? (
                  <span className="sport-group-sep is-upcoming" aria-hidden="true">
                    Europa
                  </span>
                ) : null}
                <Button
                  variant="outline"
                  shape="pill"
                  className={`${leagueTabClass} ${!leagueAvailability.laliga ? "is-upcoming" : ""}`.trim()}
                  type="button"
                  data-league="laliga"
                  disabled={!leagueAvailability["laliga"]}
                  aria-current={league === "laliga" ? "page" : undefined}
                  onClick={() => router.push("/app/laliga")}
                >
                  <LeagueBadge league="laliga" size={24} />
                  <span className="l-name">LaLiga</span>
                  {!leagueAvailability["laliga"] ? (
                    <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
                  ) : null}
                </Button>

                <Button
                  variant="outline"
                  shape="pill"
                  className={`${leagueTabClass} ${!leagueAvailability.bundesliga ? "is-upcoming" : ""}`.trim()}
                  type="button"
                  data-league="bundesliga"
                  disabled={!leagueAvailability.bundesliga}
                  aria-current={league === "bundesliga" ? "page" : undefined}
                  onClick={() => router.push("/app/bundesliga")}
                >
                  <LeagueBadge league="bundesliga" label="Bundesliga" size={24} />
                  <span className="l-name">Bundesliga</span>
                  {!leagueAvailability.bundesliga ? (
                    <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
                  ) : null}
                </Button>

                <Button
                  variant="outline"
                  shape="pill"
                  className={`${leagueTabClass} ${!leagueAvailability["serie-a"] ? "is-upcoming" : ""}`.trim()}
                  type="button"
                  data-league="serie-a"
                  disabled={!leagueAvailability["serie-a"]}
                  aria-current={league === "serie-a" ? "page" : undefined}
                  onClick={() => router.push("/app/serie-a")}
                >
                  <LeagueBadge league="serie-a" label="Serie A" size={24} />
                  <span className="l-name">Serie A</span>
                  {!leagueAvailability["serie-a"] ? (
                    <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
                  ) : null}
                </Button>

                <Button
                  variant="outline"
                  shape="pill"
                  className={`${leagueTabClass} ${!leagueAvailability["ligue-1"] ? "is-upcoming" : ""}`.trim()}
                  type="button"
                  data-league="ligue-1"
                  disabled={!leagueAvailability["ligue-1"]}
                  aria-current={league === "ligue-1" ? "page" : undefined}
                  onClick={() => router.push("/app/ligue-1")}
                >
                  <LeagueBadge league="ligue-1" label="Ligue 1" size={24} />
                  <span className="l-name">Ligue 1</span>
                  {!leagueAvailability["ligue-1"] ? (
                    <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
                  ) : null}
                </Button>
              </>
            ) : null}

            {showSoonSport ? (
              <>
                {sportFilter === "all" ? (
                  <span className="sport-group-sep is-upcoming" aria-hidden="true">
                    Más deportes
                  </span>
                ) : null}
                <Button
                  variant="outline"
                  shape="pill"
                  className={`${leagueTabClass} is-upcoming`}
                  type="button"
                  data-league="nhl"
                  disabled
                >
                  <LeagueBadge league="nhl" size={24} />
                  <span className="l-name">NHL</span>
                  <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
                </Button>

                <Button
                  variant="outline"
                  shape="pill"
                  className={`${leagueTabClass} is-upcoming`}
                  type="button"
                  data-league="mlb"
                  disabled
                >
                  <LeagueBadge league="mlb" size={24} />
                  <span className="l-name">MLB</span>
                  <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </nav>

      <main id="main" className="panel-page-main">
        <section className="lhead">
          <div className="wrap" id="lhead">
            <LeagueBadge league={league} size={56} />
            <div>
              <h1 className="h1" id="panel-league-name">
                {activeLeagueLabel}
              </h1>
              <div className="meta">
                <span className="secondary" id="panel-league-round">
                  {snapshot?.season ?? "2026"} ·{" "}
                  {snapshot?.roundLabel ?? "Jornada"}
                </span>
                {snapshot?.generatedAt ? (
                  <Freshness generatedAt={snapshot.generatedAt} />
                ) : null}
                <span className="tag tag-model">
                  <span className="dot" />
                  Beta cerrada
                </span>
              </div>
            </div>
            <div className="pic mascot" aria-hidden="true">
              <img
                src={getMascotPath(leagueMascot)}
                alt=""
                width={170}
                height={170}
              />
            </div>
          </div>
        </section>

        <nav className="days" aria-label="Filtrar por día">
          <div className="wrap days-bar">
            <ToggleGroup
              className="day-chips-row w-full"
              id="day-chips"
              aria-label="Día"
              value={[activeDay]}
              onValueChange={(value) => {
                // Siempre hay un día elegido: volver a pulsar el activo no lo deselecciona.
                if (value.length > 0) setActiveDay(String(value[value.length - 1]));
              }}
            >
              {days.map((d) => {
                const count =
                  d.id === "all"
                    ? games.length
                    : games.filter((g) => g.day === d.id).length;
                const shortLabel =
                  d.id === "all" ? "Todo" : d.label.split(" ")[0] ?? d.label;
                return (
                  <ToggleGroupItem
                    key={d.id}
                    value={d.id}
                    className="day-chip"
                    data-day={d.id}
                  >
                    <span className="d-full">{d.label}</span>
                    <span className="d-short" aria-hidden="true">
                      {shortLabel}
                    </span>
                    <span className="count">{count}</span>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>

            <div className="days-jumps" role="group" aria-label="Ir a sección">
              {hasPicks ? (
                <button
                  className={`jump-chip ${activeSection === "sec-picks" ? "active" : ""}`.trim()}
                  type="button"
                  onClick={() => scrollToSection("sec-picks")}
                >
                  <Icon name="trend" className="icon-16" />
                  Picks
                </button>
              ) : null}
              {hasResults ? (
                <button
                  className={`jump-chip ${activeSection === "sec-results" ? "active" : ""}`.trim()}
                  type="button"
                  onClick={() => scrollToSection("sec-results")}
                >
                  <Icon name="check" className="icon-16" />
                  Resultados
                </button>
              ) : null}
              <button
                className={`jump-chip ${activeSection === "games" ? "active" : ""}`.trim()}
                type="button"
                onClick={() => scrollToSection("games")}
              >
                <Icon name="games" className="icon-16" />
                Partidos
              </button>
              {hasStandings ? (
                <button
                  className={`jump-chip ${activeSection === "sec-standings" ? "active" : ""}`.trim()}
                  type="button"
                  onClick={() => scrollToSection("sec-standings")}
                >
                  <Icon name="competition" className="icon-16" />
                  Tabla
                </button>
              ) : null}
            </div>
          </div>
        </nav>

        {hasPicks ? (
          <div className="wrap panel-section" id="sec-picks">
            <BestPicks matches={games} onSelect={handleSelectMatch} />
          </div>
        ) : null}

        {hasResults ? (
          <div className="wrap panel-section" id="sec-results">
            <ResultsSection
              matches={
                activeDay === "all"
                  ? games
                  : filteredGames.some((g) => g.status === "FT")
                    ? filteredGames
                    : games
              }
              leagueLabel={activeLeagueLabel}
              onSelect={handleSelectMatch}
            />
          </div>
        ) : null}

        <div className="wrap panel-section" id="games" tabIndex={-1}>
          {envelope.state === "error" ? (
            <ErrorState
              message={
                envelope.error?.message ??
                "No pudimos cargar los datos de la jornada."
              }
              code={envelope.error?.code ?? "UPSTREAM"}
              onRetry={() => router.refresh()}
            />
          ) : dayGroups.length === 0 ? (
            <EmptyState
              message={
                games.length === 0
                  ? "Esta liga estará disponible pronto con datos verificados."
                  : "No hay partidos este día."
              }
              actionLabel={
                games.length === 0
                  ? "Ir a Premier League"
                  : "Ver toda la jornada"
              }
              onAction={() => {
                if (games.length === 0) {
                  router.push("/app/premier-league");
                } else {
                  setActiveDay("all");
                }
              }}
            />
          ) : (
            dayGroups.map(([dayId, list]) => (
              <section
                className="day"
                key={dayId}
                aria-labelledby={`d-${dayId}`}
              >
                <h2 id={`d-${dayId}`}>{list[0]?.dayLabel ?? dayId}</h2>
                <ul className="cards">
                  {list.map((match) => (
                    <li key={match.id}>
                      <MatchCard
                        match={match}
                        onSelect={handleSelectMatch}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
        {hasStandings && snapshot?.standings ? (
          <div className="wrap panel-section" id="sec-standings">
            <StandingsTable rows={snapshot.standings} league={league} />
          </div>
        ) : null}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Navegación móvil del panel">
        {hasPicks ? (
          <button
            className={`mnav-btn ${activeSection === "sec-picks" ? "active" : ""}`.trim()}
            type="button"
            onClick={() => scrollToSection("sec-picks")}
          >
            <Icon name="trend" className="icon" />
            <span>Picks</span>
          </button>
        ) : null}
        {hasResults ? (
          <button
            className={`mnav-btn ${activeSection === "sec-results" ? "active" : ""}`.trim()}
            type="button"
            onClick={() => scrollToSection("sec-results")}
          >
            <Icon name="check" className="icon" />
            <span>Resultados</span>
          </button>
        ) : null}
        <button
          className={`mnav-btn ${activeSection === "games" ? "active" : ""}`.trim()}
          type="button"
          onClick={() => scrollToSection("games")}
        >
          <Icon name="games" className="icon" />
          <span>Partidos</span>
        </button>
        {hasStandings ? (
          <button
            className={`mnav-btn ${activeSection === "sec-standings" ? "active" : ""}`.trim()}
            type="button"
            onClick={() => scrollToSection("sec-standings")}
          >
            <Icon name="competition" className="icon" />
            <span>Tabla</span>
          </button>
        ) : null}
        <button
          className="mnav-btn"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (scrolled) {
              setQuickLeagueOpen(true);
            } else {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        >
          <Icon name="soccer" className="icon" />
          <span>Ligas</span>
        </button>
      </nav>

      <AnalysisDialog
        match={selectedMatch}
        open={selectedMatch !== null}
        onClose={handleCloseModal}
        skipTrace={skipTrace}
      />
    </>
  );
}
