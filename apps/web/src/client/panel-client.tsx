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
  Badge,
  Button,
  ToggleGroup,
  ToggleGroupItem,
} from "@pitchlab/ui";
import type { SnapshotEnvelope } from "../server/snapshots.js";
import type { ProductLeague } from "../server/snapshots.js";

const leagueTabClass =
  "lchip league-tab bg-card pl-2 text-muted-foreground hover:border-input hover:bg-card hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:bg-accent aria-[current=page]:text-foreground disabled:opacity-[0.55]";
const upcomingLeagueBadgeClass = "h-5 text-[11px]";

const PANEL_LEAGUE_LABELS: Record<string, string> = {
  "liga-mx": "Liga MX",
  "premier-league": "Premier League",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  nfl: "NFL",
};

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
  const [skipTrace, setSkipTrace] = useState<boolean>(Boolean(initialGameId));
  const [selectedMatch, setSelectedMatch] = useState<MatchAnalysis | null>(
    () => {
      if (!initialGameId) return null;
      return games.find((g) => g.id === initialGameId) ?? null;
    },
  );

  useEffect(() => {
    setActiveDay("all");
  }, [league]);

  useEffect(() => {
    if (initialGameId) {
      const found = games.find((g) => g.id === initialGameId) ?? null;
      setSkipTrace(true);
      setSelectedMatch(found);
    }
  }, [initialGameId, games]);

  const handleSelectMatch = useCallback(
    (match: MatchAnalysis) => {
      const key = `${league}:${match.id}`;
      const alreadySeen = seenGamesRef.current.has(key);
      seenGamesRef.current.add(key);
      setSkipTrace(alreadySeen);
      setSelectedMatch(match);
      if (typeof window !== "undefined") {
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

  return (
    <>
      <a className="skip" href="#games">
        Saltar a los partidos
      </a>

      <header className="app-header panel-header">
        <div className="wrap">
          <a className="logo" href="/" aria-label="PitchLab · Inicio">
            <BrandLogo variant="horizontal" width={148} height={29} />
          </a>
          <div className="right">
            <Button
              variant="ghost"
              className="method hidden md:inline-flex"
              render={<a href="/#como" />}
              nativeButton={false}
            >
              Cómo funciona
            </Button>
            <ThemeToggle />
            <Button variant="ghost" data-logout="" onClick={handleLogout}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      <nav className="lswitch" aria-label="Ligas">
        <div className="wrap" id="lswitch">
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
            <LeagueBadge league="liga-mx" size={26} />
            Liga MX
            {!leagueAvailability["liga-mx"] ? (
              <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
            ) : null}
          </Button>

          <Button
            variant="outline"
            shape="pill"
            className={leagueTabClass}
            type="button"
            data-league="premier-league"
            aria-current={league === "premier-league" ? "page" : undefined}
            onClick={() => router.push("/app/premier-league")}
          >
            <LeagueBadge league="premier-league" size={26} />
            Premier
          </Button>

          <Button
            variant="outline"
            shape="pill"
            className={leagueTabClass}
            type="button"
            data-league="laliga"
            disabled={!leagueAvailability["laliga"]}
            aria-current={league === "laliga" ? "page" : undefined}
            onClick={() => router.push("/app/laliga")}
          >
            <LeagueBadge league="laliga" size={26} />
            LaLiga
            {!leagueAvailability["laliga"] ? <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge> : null}
          </Button>

          <Button
            variant="outline"
            shape="pill"
            className={leagueTabClass}
            type="button"
            data-league="bundesliga"
            disabled={!leagueAvailability.bundesliga}
            aria-current={league === "bundesliga" ? "page" : undefined}
            onClick={() => router.push("/app/bundesliga")}
          >
            <LeagueBadge league="bundesliga" label="Bundesliga" size={26} />
            Bundesliga
            {!leagueAvailability.bundesliga ? <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge> : null}
          </Button>

          <Button
            variant="outline"
            shape="pill"
            className={leagueTabClass}
            type="button"
            data-league="serie-a"
            disabled={!leagueAvailability["serie-a"]}
            aria-current={league === "serie-a" ? "page" : undefined}
            onClick={() => router.push("/app/serie-a")}
          >
            <LeagueBadge league="serie-a" label="Serie A" size={26} />
            Serie A
            {!leagueAvailability["serie-a"] ? <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge> : null}
          </Button>

          <Button
            variant="outline"
            shape="pill"
            className={leagueTabClass}
            type="button"
            data-league="ligue-1"
            disabled={!leagueAvailability["ligue-1"]}
            aria-current={league === "ligue-1" ? "page" : undefined}
            onClick={() => router.push("/app/ligue-1")}
          >
            <LeagueBadge league="ligue-1" label="Ligue 1" size={26} />
            Ligue 1
            {!leagueAvailability["ligue-1"] ? <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge> : null}
          </Button>

          <Button
            variant="outline"
            shape="pill"
            className={leagueTabClass}
            type="button"
            data-league="nfl"
            aria-current={league === "nfl" ? "page" : undefined}
            onClick={() => router.push("/app/nfl")}
          >
            <LeagueBadge league="nfl" size={26} />
            NFL
          </Button>

          <Button
            variant="outline"
            shape="pill"
            className={leagueTabClass}
            type="button"
            data-league="nhl"
            disabled
          >
            <LeagueBadge league="nhl" size={26} />
            NHL
            <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
          </Button>

          <Button
            variant="outline"
            shape="pill"
            className={leagueTabClass}
            type="button"
            data-league="mlb"
            disabled
          >
            <LeagueBadge league="mlb" size={26} />
            MLB
            <Badge variant="pill" className={upcomingLeagueBadgeClass}>Pronto</Badge>
          </Button>
        </div>
      </nav>

      <main id="main">
        <section className="lhead">
          <div className="wrap" id="lhead">
            <LeagueBadge league={league} size={56} />
            <div>
              <h1 className="h1" id="panel-league-name">
                {snapshot?.leagueLabel ?? PANEL_LEAGUE_LABELS[league] ?? "Liga"}
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
          <ToggleGroup
            className="wrap w-full"
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
              return (
                <ToggleGroupItem key={d.id} value={d.id} className="day-chip" data-day={d.id}>
                  {d.label} <span className="count">{count}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </nav>

        {envelope.state !== "error" && games.length > 0 ? (
          <div className="wrap">
            <BestPicks matches={games} onSelect={handleSelectMatch} />
          </div>
        ) : null}

        <div className="wrap" id="games" tabIndex={-1}>
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
        {snapshot?.standings && snapshot.standings.length > 0 ? (
          <div className="wrap">
            <StandingsTable rows={snapshot.standings} league={league} />
          </div>
        ) : null}
      </main>

      <AnalysisDialog
        match={selectedMatch}
        open={selectedMatch !== null}
        onClose={handleCloseModal}
        skipTrace={skipTrace}
      />
    </>
  );
}
